// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../abstract/ReentrancyGuard.sol";
import "../../abstract/RegistryAware.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IRamm.sol";
import "../../interfaces/ITokenController.sol";
import "../../libraries/Math.sol";
import "../../libraries/SafeUintCast.sol";

contract Ramm is IRamm, RegistryAware, ReentrancyGuard {
  using SafeUintCast for uint;
  using Math for uint;

  /* ========== STATE VARIABLES ========== */

  // master + mapping + oz reentrancy guard
  uint[3] internal _unused;

  Slot0 public slot0;
  Slot1 public slot1;

  // one slot per array item
  Observation[3] public observations;

  // circuit breakers slot
  uint96 public ethReleased;
  uint32 public ethLimit;
  uint96 public nxmReleased;
  uint32 public nxmLimit;

  /* ========== IMMUTABLES ========== */

  uint internal immutable INITIAL_SPOT_PRICE_B;
  IPool public immutable pool;
  ITokenController public immutable tokenController;

  /* ========== CONSTANTS ========== */

  uint public constant LIQ_SPEED_PERIOD = 1 days;
  uint public constant RATCHET_PERIOD = 1 days;
  uint public constant RATCHET_DENOMINATOR = 10_000;
  uint public constant PRICE_BUFFER = 100;
  uint public constant PRICE_BUFFER_DENOMINATOR = 10_000;
  uint public constant GRANULARITY = 3;
  uint public constant PERIOD_SIZE = 3 days;

  uint public constant FAST_LIQUIDITY_SPEED = 1_500 ether;
  uint public constant TARGET_LIQUIDITY = 5_000 ether;
  uint public constant LIQ_SPEED_A = 100 ether;
  uint public constant LIQ_SPEED_B = 100 ether;
  uint public constant NORMAL_RATCHET_SPEED = 400;
  uint public constant FAST_RATCHET_SPEED = 5_000;

  uint internal constant INITIAL_LIQUIDITY = 5_000 ether;
  uint internal constant INITIAL_BUDGET = 43_835 ether;

  // circuit breakers
  uint internal constant INITIAL_ETH_LIMIT = 22_000;
  uint internal constant INITIAL_NXM_LIMIT = 250_000;

  /* ========== CONSTRUCTOR ========== */

  constructor(address _registry, uint initialSpotPriceB) RegistryAware(_registry) {
    INITIAL_SPOT_PRICE_B = initialSpotPriceB;
    pool = IPool(fetch(C_POOL));
    tokenController = ITokenController(fetch(C_TOKEN_CONTROLLER));
  }

  function loadState() public view returns (State memory) {
    return State(
      slot0.nxmReserveA,
      slot0.nxmReserveB,
      slot1.ethReserve,
      slot1.budget,
      slot1.budget == 0 ? NORMAL_RATCHET_SPEED : FAST_RATCHET_SPEED,
      slot1.updatedAt
    );
  }

  function storeState(State memory state) internal {

    // slot 0
    slot0.nxmReserveA = state.nxmA.toUint128();
    slot0.nxmReserveB = state.nxmB.toUint128();

    // slot 1
    slot1.ethReserve = state.eth.toUint128();
    slot1.budget = state.budget.toUint88();
    slot1.updatedAt = state.timestamp.toUint32();
  }

  function ratchetSpeedB() external view returns (uint) {
    return slot1.budget == 0 ? NORMAL_RATCHET_SPEED : FAST_RATCHET_SPEED;
  }

  /**
   * @notice Swaps nxmIn tokens for ETH or ETH sent for NXM tokens
   * @param nxmIn The amount of NXM tokens to swap (set to 0 when swapping ETH for NXM)
   * @param minAmountOut The minimum amount to receive in the swap (reverts with InsufficientAmountOut if not met)
   * @param deadline The deadline for the swap to be executed (reverts with SwapExpired if deadline is surpassed)
   * @return amountOut The amount received in the swap
   */
  function swap(
    uint nxmIn,
    uint minAmountOut,
    uint deadline
  ) external payable nonReentrant whenNotPaused(PAUSE_RAMM) returns (uint) {

    if (msg.value > 0 && nxmIn > 0) {
      revert OneInputOnly();
    }

    if (msg.value == 0 && nxmIn == 0) {
      revert OneInputRequired();
    }

    if (block.timestamp > deadline) {
      revert SwapExpired(deadline, block.timestamp);
    }

    Context memory context = Context(
      pool.getPoolValueInEth(), // capital
      tokenController.totalSupply(), // supply
      pool.getMCR() // mcr
    );

    State memory initialState = loadState();

    uint amountOut = msg.value > 0
      ? swapEthForNxm(msg.value, minAmountOut, context, initialState)
      : swapNxmForEth(nxmIn, minAmountOut, context, initialState);

    if (msg.value > 0) {
      nxmReleased = (nxmReleased + amountOut).toUint96();
      if (nxmLimit > 0 && nxmReleased > uint(nxmLimit) * 1 ether) {
        revert NxmCircuitBreakerHit();
      }
    } else {
      ethReleased = (ethReleased + amountOut).toUint96();
      if (ethLimit > 0 && ethReleased > uint(ethLimit) * 1 ether) {
        revert EthCircuitBreakerHit();
      }
    }

    pool.updateMCRInternal(false);

    return amountOut;
  }

  /**
   * @dev should only be called by swap
   */
  function swapEthForNxm(
    uint ethIn,
    uint minAmountOut,
    Context memory context,
    State memory initialState
  ) internal returns (uint nxmOut) {

    Observation[3] memory _observations = observations;

    // current state
    (
      State memory state,
      uint injected,
      uint extracted
    ) = _getReserves(initialState, context, block.timestamp);
    _observations = _updateTwap(initialState, _observations, context, block.timestamp);

    {
      uint k = state.eth * state.nxmA;
      uint newEth = state.eth + ethIn;
      uint newNxmA = k / newEth;
      uint newNxmB = state.nxmB * newEth / state.eth;

      nxmOut = state.nxmA - newNxmA;

      if (nxmOut < minAmountOut) {
        revert InsufficientAmountOut(nxmOut, minAmountOut);
      }

      // edge case: below goes over bv due to eth-dai price changing

      state.nxmA = newNxmA;
      state.nxmB = newNxmB;
      state.eth = newEth;
      state.timestamp = block.timestamp;
    }

    storeState(state);

    if (injected > 0) {
      emit EthInjected(injected);
    }

    if (extracted > 0) {
      emit EthExtracted(extracted);
    }

    for (uint i = 0; i < _observations.length; i++) {
      observations[i] = _observations[i];
    }

    // transfer assets
    (bool ok,) = address(pool).call{value: msg.value}("");
    if (ok != true) {
      revert EthTransferFailed();
    }

    tokenController.mint(msg.sender, nxmOut);

    emit EthSwappedForNxm(msg.sender, ethIn, nxmOut);

    return nxmOut;
  }

  /**
   * @dev should only be called by swap
   */
  function swapNxmForEth(
    uint nxmIn,
    uint minAmountOut,
    Context memory context,
    State memory initialState
  ) internal returns (uint ethOut) {

    if (block.timestamp <= tokenController.token().isLockedForMV(msg.sender)) {
      revert LockedForVoting();
    }

    Observation[3] memory _observations = observations;

    // current state
    (
      State memory state,
      uint injected,
      uint extracted
    ) = _getReserves(initialState, context, block.timestamp);
    _observations = _updateTwap(initialState, _observations, context, block.timestamp);

    {
      uint k = state.eth * state.nxmB;
      uint newNxmB = state.nxmB + nxmIn;
      uint newEth = k / newNxmB;
      uint newNxmA = state.nxmA * newEth / state.eth;

      ethOut = state.eth - newEth;

      if (ethOut < minAmountOut) {
        revert InsufficientAmountOut(ethOut, minAmountOut);
      }

      if (context.capital - ethOut < context.mcr) {
        revert NoSwapsInBufferZone();
      }

      // update storage
      state.nxmA = newNxmA;
      state.nxmB = newNxmB;
      state.eth = newEth;
      state.timestamp = block.timestamp;
    }

    storeState(state);

    if (injected > 0) {
      emit EthInjected(injected);
    }

    if (extracted > 0) {
      emit EthExtracted(extracted);
    }

    for (uint i = 0; i < _observations.length; i++) {
      observations[i] = _observations[i];
    }

    tokenController.burnFrom(msg.sender, nxmIn);
    pool.sendEth(payable(msg.sender), ethOut);

    emit NxmSwappedForEth(msg.sender, nxmIn, ethOut);

    return ethOut;
  }

  /**
   * @notice Sets the budget to 0
   * @dev Can only be called by governance
   */
  function removeBudget() external onlyContracts(C_GOVERNOR) {
    slot1.budget = 0;
    emit BudgetRemoved();
  }

  function setCircuitBreakerLimits(
    uint _ethLimit,
    uint _nxmLimit
  ) external onlyContracts(C_GOVERNOR) {
    ethLimit = _ethLimit.toUint32();
    nxmLimit = _nxmLimit.toUint32();
  }

  /* ============== VIEWS ============= */

  /**
   * @notice Retrieves the current reserves of the RAMM contract
   * @return _ethReserve The current ETH reserve
   * @return nxmA The current NXM buy price
   * @return nxmB The current NXM sell price
   * @return _budget The current ETH budget used for injection
   */
  function getReserves() external view returns (uint _ethReserve, uint nxmA, uint nxmB, uint _budget) {
    Context memory context = Context(
      pool.getPoolValueInEth(), // capital
      tokenController.totalSupply(), // supply
      pool.getMCR() // mcr
    );
    (
      State memory state,
      /* injected */,
      /* extracted */
    ) = _getReserves(loadState(), context, block.timestamp);

    return (state.eth, state.nxmA, state.nxmB, state.budget);
  }

  function calculateInjected(
    uint eth,
    uint budget,
    Context memory context,
    uint elapsed
  ) internal pure returns (uint) {

    uint timeLeftOnBudget = budget * LIQ_SPEED_PERIOD / FAST_LIQUIDITY_SPEED;
    uint maxToInject = (context.capital > context.mcr + TARGET_LIQUIDITY)
      ? Math.min(TARGET_LIQUIDITY - eth, context.capital - context.mcr - TARGET_LIQUIDITY)
      : 0;

    if (elapsed <= timeLeftOnBudget) {
      return Math.min(elapsed * FAST_LIQUIDITY_SPEED / LIQ_SPEED_PERIOD, maxToInject);
    }

    uint injectedFast = timeLeftOnBudget * FAST_LIQUIDITY_SPEED / LIQ_SPEED_PERIOD;
    uint injectedSlow = (elapsed - timeLeftOnBudget) * LIQ_SPEED_B / LIQ_SPEED_PERIOD;

    return Math.min(maxToInject, injectedFast + injectedSlow);
  }

  function adjustEth(
    uint eth,
    uint budget,
    Context memory context,
    uint elapsed
  ) internal pure returns (uint /* new eth */, uint /* new budget */, uint injected, uint extracted) {

    if (eth < TARGET_LIQUIDITY) {
      injected = calculateInjected(eth, budget, context, elapsed);
      eth += injected;
      budget = budget > injected ? budget - injected : 0;
    } else {
      extracted = Math.min((elapsed * LIQ_SPEED_A) / LIQ_SPEED_PERIOD, eth - TARGET_LIQUIDITY);
      eth -= extracted;
    }

    return (eth, budget, injected, extracted);
  }

  function calculateNxm(
    State memory state,
    uint eth,
    uint elapsed,
    Context memory context,
    bool isAbove
  ) internal pure returns (uint) {

    uint stateNxm = isAbove ? state.nxmA : state.nxmB;
    uint nxm = stateNxm * eth / state.eth;

    uint buffer = isAbove ? PRICE_BUFFER_DENOMINATOR + PRICE_BUFFER : PRICE_BUFFER_DENOMINATOR - PRICE_BUFFER;
    uint bufferedCapital = context.capital * buffer / PRICE_BUFFER_DENOMINATOR;

    if (isAbove) {

      // ratchet above
      // cap*n*(1+r) > e*sup
      // cap*n + cap*n*r > e*sup
      //   ? set n(new) = n(BV)
      //   : set n(new) = n(R)

      return bufferedCapital * nxm + bufferedCapital * nxm * elapsed * NORMAL_RATCHET_SPEED / RATCHET_PERIOD / RATCHET_DENOMINATOR > eth * context.supply
        ? eth * context.supply / bufferedCapital // bv
        : eth * nxm / (eth - context.capital * nxm * elapsed * NORMAL_RATCHET_SPEED / context.supply / RATCHET_PERIOD / RATCHET_DENOMINATOR); // ratchet
    }

    // ratchet below
    // check if we should be using the ratchet or the book value price using:
    // Nbv > Nr <=>
    // ... <=>
    // cap*n < e*sup + cap*n*r
    //   ? set n(new) = n(BV)
    //   : set n(new) = n(R)

    return bufferedCapital * nxm < eth * context.supply + context.capital * nxm * elapsed * state.ratchetSpeedB / RATCHET_PERIOD / RATCHET_DENOMINATOR
      ? eth * context.supply / bufferedCapital // bv
      : eth * nxm / (eth + context.capital * nxm * elapsed * state.ratchetSpeedB/ context.supply / RATCHET_PERIOD / RATCHET_DENOMINATOR); // ratchet
  }

  function _getReserves(
    State memory state,
    Context memory context,
    uint currentTimestamp
  ) public pure returns (State memory /* new state */, uint injected, uint extracted) {

    uint eth = state.eth;
    uint budget = state.budget;
    uint elapsed = currentTimestamp - state.timestamp;

    (eth, budget, injected, extracted) = adjustEth(eth, budget, context, elapsed);

    uint nxmA = calculateNxm(state, eth, elapsed, context, true);
    uint nxmB = calculateNxm(state, eth, elapsed, context, false);

    return (
      State(nxmA, nxmB, eth, budget, state.ratchetSpeedB, currentTimestamp),
      injected,
      extracted
    );
  }

  /**
   * @notice Retrieves the current NXM spot prices
   * @return spotPriceA The current NXM buy price
   * @return spotPriceB The current NXM sell price
   */
  function getSpotPrices() external view returns (uint spotPriceA, uint spotPriceB) {

    Context memory context = Context(
      pool.getPoolValueInEth(), // capital
      tokenController.totalSupply(), // supply
      pool.getMCR() // mcr
    );

    (
      State memory state,
      /* injected */,
      /* extracted */
    ) = _getReserves(loadState(), context, block.timestamp);

    return (
      1 ether * state.eth / state.nxmA,
      1 ether * state.eth / state.nxmB
    );
  }

  /**
   * @notice Retrieves the current NXM book value
   * @return bookValue the current NXM book value
   */
  function getBookValue() external view returns (uint bookValue) {
    uint capital = pool.getPoolValueInEth();
    uint supply = tokenController.totalSupply();
    return 1 ether * capital / supply;
  }

  /* ========== ORACLE ========== */

  function observationIndexOf(uint timestamp) internal pure returns (uint index) {
    return timestamp.divCeil(PERIOD_SIZE) % GRANULARITY;
  }

  function calculateTimeOnRatchetAndBV(
    State memory previousState,
    uint timeElapsed,
    uint stateRatchetSpeedB,
    uint supply,
    uint capital,
    bool isAbove
  ) internal pure returns (uint timeOnRatchet, uint timeOnBV) {

    // Formula to find out how much time it takes for ratchet price to hit BV + buffer
    //
    // above:
    // inner = (eth * supply) - (buffer * capital * nxm)
    //
    // below:
    // inner = (buffer * capital * nxm) - (eth * supply)
    //
    // [inner * denom * period] / (capital * nxm * speed)

    uint prevNxm = isAbove ? previousState.nxmA : previousState.nxmB;
    uint currentRatchetSpeed = isAbove ? NORMAL_RATCHET_SPEED : stateRatchetSpeedB;
    uint bufferMultiplier = isAbove
      ? (PRICE_BUFFER_DENOMINATOR + PRICE_BUFFER)
      : (PRICE_BUFFER_DENOMINATOR - PRICE_BUFFER);

    uint inner;
    {
      uint ethTerm = previousState.eth * supply;
      uint nxmTerm = bufferMultiplier * capital * prevNxm / PRICE_BUFFER_DENOMINATOR;

      uint innerLeft = isAbove ? ethTerm : nxmTerm;
      uint innerRight = isAbove ? nxmTerm : ethTerm;
      inner = innerLeft > innerRight ? innerLeft - innerRight : 0;
    }

    uint maxTimeOnRatchet = inner != 0
      ? (inner * RATCHET_DENOMINATOR * RATCHET_PERIOD) / (capital * prevNxm * currentRatchetSpeed)
      : 0;

    timeOnRatchet = Math.min(timeElapsed, maxTimeOnRatchet);
    timeOnBV = timeElapsed - timeOnRatchet;

    return (timeOnRatchet, timeOnBV);
  }

  function calculatePriceCumulative(
    State memory previousState,
    State memory state,
    uint timeElapsed,
    uint capital,
    uint supply,
    bool isAbove
  ) internal pure returns (uint) {

    // average price
    // pe - previous eth
    // pn - previous nxm
    // ce - current eth
    // cn - current nxm
    //
    // P = (pe / pn + ce / cn) / 2
    //   = (pe * cn + ce * pn) / (2 * pn * cn)
    //
    // cumulative price = P * time_on_ratchet
    //  = (pe * cn + ce * pn) * time_on_ratchet / (2 * pn * cn)

    // cumulative price on bv +- buffer
    // (time_total - time_on_ratchet) * bv * buffer

    uint cumulativePrice = 0;
    (uint timeOnRatchet, uint timeOnBV) = calculateTimeOnRatchetAndBV(
      previousState,
      timeElapsed,
      state.ratchetSpeedB,
      supply,
      capital,
      isAbove
    );

    if (timeOnRatchet != 0) {
      uint prevNxm = isAbove ? previousState.nxmA : previousState.nxmB;
      uint currentNxm = isAbove ? state.nxmA : state.nxmB;
      cumulativePrice += 1 ether * (previousState.eth * currentNxm + state.eth * prevNxm) * timeOnRatchet / (prevNxm * currentNxm * 2);
    }

    if (timeOnBV != 0) {
      uint bufferMultiplier = isAbove ? (PRICE_BUFFER_DENOMINATOR + PRICE_BUFFER) : (PRICE_BUFFER_DENOMINATOR - PRICE_BUFFER);
      cumulativePrice += 1 ether * timeOnBV * capital * bufferMultiplier / (supply * PRICE_BUFFER_DENOMINATOR);
    }

    return cumulativePrice;
  }

  function getObservation(
    State memory previousState,
    State memory state,
    Observation memory previousObservation,
    uint capital,
    uint supply
  ) public pure returns (Observation memory) {

    uint timeElapsed = state.timestamp - previousState.timestamp;

    uint priceCumulativeAbove = calculatePriceCumulative(
      previousState,
      state,
      timeElapsed,
      capital,
      supply,
      true
    );

    uint priceCumulativeBelow = calculatePriceCumulative(
      previousState,
      state,
      timeElapsed,
      capital,
      supply,
      false
    );

    return Observation(
      state.timestamp.toUint32(),
      // casting unsafely to allow overflow
      uint112(priceCumulativeAbove + previousObservation.priceCumulativeAbove),
      uint112(priceCumulativeBelow + previousObservation.priceCumulativeBelow)
    );
  }

  function getInitialObservations(
    uint initialPriceA,
    uint initialPriceB,
    uint timestamp
  ) public pure returns (Observation[3] memory initialObservations) {

    uint priceCumulativeAbove;
    uint priceCumulativeBelow;
    uint endIdx = timestamp.divCeil(PERIOD_SIZE);
    uint previousTimestamp = (endIdx - 11) * PERIOD_SIZE; // 27 days | 3 days | until the deployments

    for (uint idx = endIdx - 2; idx <= endIdx; idx++) {
      uint observationTimestamp = Math.min(timestamp, idx * PERIOD_SIZE);
      uint observationIndex = idx % GRANULARITY;
      uint timeElapsed = observationTimestamp - previousTimestamp;

      priceCumulativeAbove += initialPriceA * timeElapsed;
      priceCumulativeBelow += initialPriceB * timeElapsed;

      initialObservations[observationIndex] = Observation(
        observationTimestamp.toUint32(),
        uint112(priceCumulativeAbove),
        uint112(priceCumulativeBelow)
      );
      previousTimestamp = observationTimestamp;
    }

    return initialObservations;
  }

  /**
   * @notice Updates the Time-Weighted Average Price (TWAP) by registering new price observations
   */
  function updateTwap() external whenNotPaused(PAUSE_RAMM) {
    State memory initialState = loadState();

    if (initialState.timestamp == block.timestamp) {
      // already updated
      return;
    }

    Context memory context = Context(
      pool.getPoolValueInEth(), // capital
      tokenController.totalSupply(), // supply
      pool.getMCR() // mcr
    );

    Observation[3] memory _observations = observations;

    // current state
    (
      State memory state,
      uint injected,
      uint extracted
    ) = _getReserves(initialState, context, block.timestamp);
    _observations = _updateTwap(initialState, _observations, context, block.timestamp);

    for (uint i = 0; i < _observations.length; i++) {
      observations[i] = _observations[i];
      emit ObservationUpdated(
        observations[i].timestamp,
        observations[i].priceCumulativeAbove,
        observations[i].priceCumulativeBelow
      );
    }

    storeState(state);

    if (injected > 0) {
      emit EthInjected(injected);
    }
    if (extracted > 0) {
      emit EthExtracted(extracted);
    }
  }

  function _updateTwap(
    State memory initialState,
    Observation[3] memory _observations,
    Context memory context,
    uint currentStateTimestamp
  ) public pure returns (Observation[3] memory) {
    uint endIdx = currentStateTimestamp.divCeil(PERIOD_SIZE);

    State memory previousState = initialState;
    Observation memory previousObservation = _observations[observationIndexOf(initialState.timestamp)];
    Observation[3] memory newObservations;

    for (uint idx = endIdx - 2; idx <= endIdx; idx++) {
      uint observationTimestamp = Math.min(currentStateTimestamp, idx * PERIOD_SIZE);
      uint observationIndex = idx % GRANULARITY;

      if (observationTimestamp <= previousState.timestamp) {
        newObservations[observationIndex] = Observation(
          _observations[observationIndex].timestamp,
          _observations[observationIndex].priceCumulativeAbove,
          _observations[observationIndex].priceCumulativeBelow
        );
        continue;
      }

      (
        State memory state,
      /* injected */,
      /* extracted */
      ) = _getReserves(previousState, context, observationTimestamp);

      newObservations[observationIndex] = getObservation(
        previousState,
        state,
        previousObservation,
        context.capital,
        context.supply
      );

      previousState = state;
      previousObservation = newObservations[observationIndex];
    }

    return newObservations;
  }

  function getInternalPriceAndUpdateTwap() external whenNotPaused(PAUSE_RAMM) returns (uint internalPrice) {

    Context memory context = Context(
      pool.getPoolValueInEth(), // capital
      tokenController.totalSupply(), // supply
      pool.getMCR() // mcr
    );

    State memory initialState = loadState();
    Observation[3] memory _observations = observations;

    // current state
    (
      State memory state,
      uint injected,
      uint extracted
    ) = _getReserves(initialState, context, block.timestamp);
    _observations = _updateTwap(initialState, _observations, context, block.timestamp);

    // sstore observations and state
    for (uint i = 0; i < _observations.length; i++) {
      observations[i] = _observations[i];
      emit ObservationUpdated(
        observations[i].timestamp,
        observations[i].priceCumulativeAbove,
        observations[i].priceCumulativeBelow
      );
    }

    storeState(state);

    if (injected > 0) {
      emit EthInjected(injected);
    }
    if (extracted > 0) {
      emit EthExtracted(extracted);
    }

    return _getInternalPrice(state, _observations, context.capital, context.supply, block.timestamp);
  }

  function _getInternalPrice(
    State memory state,
    Observation[3] memory _observations,
    uint capital,
    uint supply,
    uint timestamp
  ) public pure returns (uint) {

    uint currentIdx = observationIndexOf(timestamp);
    // index of first observation in window = current - 2
    // adding 1 and applying modulo gives the same result avoiding underflow
    Observation memory firstObservation = _observations[(currentIdx + 1) % GRANULARITY];
    Observation memory currentObservation = _observations[currentIdx];

    uint spotPriceA = 1 ether * state.eth / state.nxmA;
    uint spotPriceB = 1 ether * state.eth / state.nxmB;
    uint internalPrice;

    // underflow is desired
    unchecked {
      uint elapsed = timestamp - firstObservation.timestamp;
      uint averagePriceA = uint(currentObservation.priceCumulativeAbove - firstObservation.priceCumulativeAbove) / elapsed;
      uint averagePriceB = uint(currentObservation.priceCumulativeBelow - firstObservation.priceCumulativeBelow) / elapsed;

      // keeping min/max inside unchecked scope to avoid stack too deep error
      uint priceA = Math.min(averagePriceA, spotPriceA);
      uint priceB = Math.max(averagePriceB, spotPriceB);
      internalPrice = priceA + priceB - 1 ether * capital / supply;
    }

    uint maxPrice = 3 * 1 ether * capital / supply; // 300% BV
    uint minPrice = 35 * 1 ether * capital / supply / 100; // 35% BV
    internalPrice = Math.max(Math.min(internalPrice, maxPrice), minPrice);

    return internalPrice;
  }

  function getInternalPrice() external view returns (uint internalPrice) {

    Context memory context = Context(
      pool.getPoolValueInEth(), // capital
      tokenController.totalSupply(), // supply
      pool.getMCR() // mcr
    );

    State memory initialState = loadState();
    Observation[3] memory _observations = observations;

    (
      State memory state,
      /* injected */,
      /* extracted */
    ) = _getReserves(initialState, context, block.timestamp);

    _observations = _updateTwap(initialState, _observations, context, block.timestamp);

    return _getInternalPrice(state, _observations, context.capital, context.supply, block.timestamp);
  }

  /* ========== DEPENDENCIES ========== */

  function initialize() external onlyContracts(C_GOVERNOR) {
    _initialize();
  }

  function _initialize() internal {

    if (slot1.updatedAt != 0) {
      // already initialized
      return;
    }

    uint capital = pool.getPoolValueInEth();
    uint supply = tokenController.totalSupply();

    uint bondingCurvePrice = pool.getTokenPrice();
    uint initialPriceA = bondingCurvePrice + 1 ether * capital * PRICE_BUFFER / PRICE_BUFFER_DENOMINATOR / supply;
    uint initialPriceB = 1 ether * capital * (PRICE_BUFFER_DENOMINATOR - PRICE_BUFFER) / PRICE_BUFFER_DENOMINATOR / supply;

    uint128 nxmReserveA = (INITIAL_LIQUIDITY * 1 ether / initialPriceA).toUint128();
    uint128 nxmReserveB = (INITIAL_LIQUIDITY * 1 ether / INITIAL_SPOT_PRICE_B).toUint128();
    uint128 ethReserve = INITIAL_LIQUIDITY.toUint128();
    uint88 budget = INITIAL_BUDGET.toUint88();
    uint _ratchetSpeedB = FAST_RATCHET_SPEED;
    uint32 updatedAt = block.timestamp.toUint32();

    ethLimit = INITIAL_ETH_LIMIT.toUint32();
    nxmLimit = INITIAL_NXM_LIMIT.toUint32();

    State memory state = State(
      nxmReserveA,
      nxmReserveB,
      ethReserve,
      budget,
      _ratchetSpeedB,
      updatedAt
    );

    storeState(state);

    Observation[3] memory _observations = getInitialObservations(initialPriceA, initialPriceB, updatedAt);

    for (uint i = 0; i < _observations.length; i++) {
      observations[i] = _observations[i];
    }
  }
}

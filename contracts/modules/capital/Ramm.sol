// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/IMCR.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IRamm.sol";
import "../../interfaces/ITokenController.sol";
import "../../libraries/Math.sol";
import "../../libraries/SafeUintCast.sol";

contract Ramm is IRamm, MasterAwareV2 {
  using SafeUintCast for uint;
  using Math for uint;

  /* ========== STATE VARIABLES ========== */

  Slot0 public slot0;
  Slot1 public slot1;

  // slot 2 & 3
  // 160 * 3 = 480 bits
  Observation[3] public observations;
  uint32 public ratchetSpeed;

  /* ========== CONSTANTS ========== */

  uint public constant LIQ_SPEED_PERIOD = 1 days;
  uint public constant RATCHET_PERIOD = 1 days;
  uint public constant RATCHET_DENOMINATOR = 10_000;
  uint public constant PRICE_BUFFER = 100;
  uint public constant PRICE_BUFFER_DENOMINATOR = 10_000;
  uint public constant GRANULARITY = 2;
  uint public constant PERIOD_SIZE = 86_400; // day

  uint public constant FAST_LIQUIDITY_SPEED = 1_500 ether;
  uint public constant TARGET_LIQUIDITY = 5_000 ether;
  uint public constant LIQ_SPEED_A = 100 ether;
  uint public constant LIQ_SPEED_B = 100 ether;
  uint public constant FAST_RATCHET_SPEED = 5_000;
  uint public constant NORMAL_RATCHET_SPEED = 400;
  uint public constant INITIAL_LIQUIDITY = 5_000 ether;
  uint public constant INITIAL_BUDGET = 43_835 ether;

  /* ========== IMMUTABLES ========== */

  uint public immutable SPOT_PRICE_A;
  uint public immutable SPOT_PRICE_B;

  /* ========== CONSTRUCTOR ========== */

  constructor(uint spotPriceA, uint spotPriceB) {
    SPOT_PRICE_A = spotPriceA;
    SPOT_PRICE_B = spotPriceB;
  }

  function loadState() public view returns (State memory) {
    return State(
      slot0.nxmReserveA,
      slot0.nxmReserveB,
      slot1.ethReserve,
      slot1.budget,
      ratchetSpeed,
      slot1.updatedAt
    );
  }

  function storeState(State memory state) internal {

    if (state.budget == 0) {
      state.ratchetSpeed = NORMAL_RATCHET_SPEED.toUint32();
    }

    // slot 0
    slot0.nxmReserveA = state.nxmA.toUint128();
    slot0.nxmReserveB = state.nxmB.toUint128();
    // slot 1
    slot1.ethReserve = state.eth.toUint128();
    slot1.budget = state.budget.toUint96();
    slot1.updatedAt = state.timestamp.toUint32();
    // ratchetSpeed
    ratchetSpeed = state.ratchetSpeed.toUint32();
  }

  function swap(uint nxmIn, uint minAmountOut, uint deadline) external payable {

    if (msg.value > 0 && nxmIn > 0) {
      revert OneInputOnly();
    }
    if (msg.value == 0 && nxmIn == 0) {
      revert OneInputRequired();
    }
    if (block.timestamp > deadline) {
      revert SwapExpired(deadline, block.timestamp);
    }

    msg.value > 0
      ? swapEthForNxm(msg.value, minAmountOut)
      : swapNxmForEth(nxmIn, minAmountOut);
  }

  function swapEthForNxm(uint ethIn, uint minAmountOut) internal returns (uint /*nxmOut*/) {

    uint capital = pool().getPoolValueInEth();
    uint supply = tokenController().totalSupply();
    uint mcrValue = mcr().getMCR();

    State memory initialState = loadState();
    Observation[3] memory _observations = observations;

    // current state
    State memory state = _getReserves(initialState, capital, supply, mcrValue, block.timestamp);
    _observations = _updateTwap(initialState, _observations, block.timestamp, capital, supply, mcrValue);

    uint nxmA = state.nxmA;
    uint nxmB = state.nxmB;
    uint eth = state.eth;
    uint k = eth * nxmA;

    eth = eth + ethIn;
    nxmA = k / eth;
    nxmB = nxmB * eth / state.eth;

    uint nxmOut = state.nxmA - nxmA;

    if (nxmOut < minAmountOut) {
      revert InsufficientAmountOut(nxmOut, minAmountOut);
    }

    // edge case: bellow goes over bv due to eth-dai price changing

    state.nxmA = nxmA;
    state.nxmB = nxmB;
    state.eth = eth;
    state.timestamp = block.timestamp;

    storeState(state);

    for (uint i = 0; i < _observations.length; i++) {
      observations[i] = _observations[i];
    }

    // transfer assets
    (bool ok,) = address(pool()).call{value: msg.value}("");
    if (ok != true) {
      revert EthTransferFailed();
    }
    tokenController().mint(msg.sender, nxmOut);

    return nxmOut;
  }

  function swapNxmForEth(uint nxmIn, uint minAmountOut) internal returns (uint ethOut) {

    uint capital = pool().getPoolValueInEth();
    uint supply = tokenController().totalSupply();
    uint mcrValue = mcr().getMCR();

    State memory initialState = loadState();
    Observation[3] memory _observations = observations;

    // current state
    State memory state = _getReserves(initialState, capital, supply, mcrValue, block.timestamp);
    _observations = _updateTwap(initialState, _observations, block.timestamp, capital, supply, mcrValue);

    {
      uint nxmA = state.nxmA;
      uint nxmB = state.nxmB;
      uint eth = state.eth;
      uint k = eth * nxmB;

      nxmB = nxmB + nxmIn;
      eth = k / nxmB;
      nxmA = nxmA * eth / state.eth;

      ethOut = state.eth - eth;

      if (ethOut < minAmountOut) {
        revert InsufficientAmountOut(ethOut, minAmountOut);
      }

      if (capital - ethOut < mcrValue) {
        revert NoSwapsInBufferZone();
      }

      // update storage
      state.nxmA = nxmA;
      state.nxmB = nxmB;
      state.eth = eth;
      state.timestamp = block.timestamp;
    }

    storeState(state);

    for (uint i = 0; i < _observations.length; i++) {
      observations[i] = _observations[i];
    }

    tokenController().burnFrom(msg.sender, nxmIn);
    // TODO: use a custom function instead of sendPayout
    pool().sendPayout(0, payable(msg.sender), ethOut);

    return ethOut;
  }

  function removeBudget() external onlyGovernance {
    slot1.budget = 0;
  }

  /* ============== VIEWS ============= */

  function getReserves() external view returns (uint _ethReserve, uint nxmA, uint nxmB, uint _budget) {
    uint capital = pool().getPoolValueInEth();
    uint supply = tokenController().totalSupply();
    uint mcrValue = mcr().getMCR();
    State memory state = _getReserves(loadState(), capital, supply, mcrValue, block.timestamp);
    return (state.eth, state.nxmA, state.nxmB, state.budget);
  }

  function _getReserves(
    State memory state,
    uint capital,
    uint supply,
    uint mcrValue,
    uint currentTimestamp
  ) public pure returns (State memory /* new state */) {

    uint eth = state.eth;
    uint budget = state.budget;
    uint elapsed = currentTimestamp - state.timestamp;

    if (eth < TARGET_LIQUIDITY) {
      // inject eth
      uint timeLeftOnBudget = budget * LIQ_SPEED_PERIOD / FAST_LIQUIDITY_SPEED;
      uint maxToInject;
      uint injected;

      if (capital <= mcrValue + TARGET_LIQUIDITY) {
        maxToInject = 0;
      } else {
        maxToInject = Math.min(TARGET_LIQUIDITY - eth, capital - mcrValue - TARGET_LIQUIDITY);
      }

      if (elapsed <= timeLeftOnBudget) {
        injected = Math.min(elapsed * FAST_LIQUIDITY_SPEED / LIQ_SPEED_PERIOD, maxToInject);
      } else {
        uint injectedFast = timeLeftOnBudget * FAST_LIQUIDITY_SPEED / LIQ_SPEED_PERIOD;
        uint injectedSlow = (elapsed - timeLeftOnBudget) * LIQ_SPEED_B * 1 ether / LIQ_SPEED_PERIOD;
        injected = Math.min(maxToInject, injectedFast + injectedSlow);
      }

      eth += injected;
      budget = budget > injected ? budget - injected : 0;

    } else {
      // extract eth
      eth -= Math.min(
        elapsed * LIQ_SPEED_A * 1 ether / LIQ_SPEED_PERIOD,
        eth - TARGET_LIQUIDITY // diff to target
      );
    }

    // price_initial = eth / nxm
    // price_final = eth_new / nxm_new
    // price_final = eth_new /(nxm * eth / stateEthReserve)
    // nxm_new = nxm * eth / stateEthReserve
    uint nxmA = state.nxmA * eth / state.eth;
    uint nxmB = state.nxmB * eth / state.eth;

    // apply ratchet above
    {
      // if cap*n*(1+r) > e*sup
      // if cap*n + cap*n*r > e*sup
      //   set n(new) = n(BV)
      // else
      //   set n(new) = n(R)
      uint r = elapsed * state.ratchetSpeed;
      uint bufferedCapitalA = capital * (PRICE_BUFFER_DENOMINATOR + PRICE_BUFFER) / PRICE_BUFFER_DENOMINATOR;

      if (bufferedCapitalA * nxmA + bufferedCapitalA * nxmA * r / RATCHET_PERIOD / RATCHET_DENOMINATOR > eth * supply) {
        // use bv
        nxmA = eth * supply / bufferedCapitalA;
      } else {
        // use ratchet
        nxmA = eth * nxmA / (eth - (r * capital * nxmA / supply / RATCHET_PERIOD / RATCHET_DENOMINATOR));
      }
    }

    // apply ratchet below
    {
      // check if we should be using the ratchet or the book value price using:
      // Nbv > Nr <=>
      // ... <=>
      // cap * n < e * sup + r * cap * n
      uint bufferedCapitalB = capital * (PRICE_BUFFER_DENOMINATOR - PRICE_BUFFER) / PRICE_BUFFER_DENOMINATOR;

      if (
        bufferedCapitalB * nxmB < eth * supply + nxmB * capital * elapsed * state.ratchetSpeed / RATCHET_PERIOD / RATCHET_DENOMINATOR
      ) {
        // use bv
        nxmB = eth * supply / bufferedCapitalB;
      } else {
        // use ratchet
        nxmB = eth * nxmB / (eth + (nxmB * elapsed * state.ratchetSpeed * capital / supply / RATCHET_PERIOD / RATCHET_DENOMINATOR));
      }
    }

    return State(nxmA, nxmB, eth, budget, state.ratchetSpeed, currentTimestamp);
  }

  function getSpotPrices() external view returns (uint spotPriceA, uint spotPriceB) {

    uint capital = pool().getPoolValueInEth();
    uint supply = tokenController().totalSupply();
    uint mcrValue = mcr().getMCR();

    State memory state = _getReserves(loadState(), capital, supply, mcrValue, block.timestamp);

    return (
      1 ether * state.eth / state.nxmA,
      1 ether * state.eth / state.nxmB
    );
  }

  function getBookValue() external view returns (uint bookValue) {
    uint capital = pool().getPoolValueInEth();
    uint supply = tokenController().totalSupply();
    return 1 ether * capital / supply;
  }

  /* ========== ORACLE ========== */

  function observationIndexOf(uint timestamp) internal pure returns (uint index) {
    return timestamp.divCeil(PERIOD_SIZE) % GRANULARITY;
  }

  function getObservation(
    State memory previousState,
    State memory state,
    Observation memory previousObservation,
    uint capital,
    uint supply
  ) public pure returns (Observation memory) {

    // Formula to find out how much time it takes for ratchet price to hit BV + buffer
    //
    // for above:
    // [(eth * supply - buffer * capital * nxm) * denom * period] / (capital * nxm * speed)
    //
    // for below:
    // [(buffer * capital * nxm - eth * supply) * denom * period] / (capital * nxm * speed)

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

    uint priceCumulativeAbove = previousObservation.priceCumulativeAbove;
    uint priceCumulativeBelow = previousObservation.priceCumulativeBelow;
    uint timeElapsed = state.timestamp - previousState.timestamp;

    { // above
      uint timeOnRatchet;
      {
        uint innerLeft = previousState.eth * supply;
        uint innerRight = (PRICE_BUFFER_DENOMINATOR + PRICE_BUFFER) * capital * previousState.nxmA / PRICE_BUFFER_DENOMINATOR;
        uint inner = innerLeft > innerRight ? innerLeft - innerRight : 0;
        uint maxTimeOnRatchet = inner != 0
          ? inner * RATCHET_DENOMINATOR * RATCHET_PERIOD / capital / previousState.nxmA / state.ratchetSpeed
          : 0;
        timeOnRatchet = Math.min(timeElapsed, maxTimeOnRatchet);
      }

      // on ratchet
      if (timeOnRatchet != 0) {

        // cumulative price above
        priceCumulativeAbove += (previousState.eth * state.nxmA + state.eth * previousState.nxmA) * timeOnRatchet / previousState.nxmA / state.nxmA / 2;
      }

      // on bv
      uint timeOnBV = timeElapsed - timeOnRatchet;

      if (timeOnBV != 0) {
        priceCumulativeAbove += timeOnBV * capital * (PRICE_BUFFER_DENOMINATOR + PRICE_BUFFER) / supply / PRICE_BUFFER_DENOMINATOR;
      }
    }

    { // below
      uint timeOnRatchet;
      {
        uint innerLeft = (PRICE_BUFFER_DENOMINATOR - PRICE_BUFFER) * capital * previousState.nxmB / PRICE_BUFFER_DENOMINATOR;
        uint innerRight = previousState.eth * supply;
        uint inner = innerLeft > innerRight ? innerLeft - innerRight : 0;
        uint maxTimeOnRatchet = inner != 0
          ? inner * RATCHET_DENOMINATOR * RATCHET_PERIOD / capital / previousState.nxmA / state.ratchetSpeed
          : 0;
        timeOnRatchet = Math.min(timeElapsed, maxTimeOnRatchet);
      }

      // on ratchet
      if (timeOnRatchet != 0) {
        // cumulative price below
        priceCumulativeBelow += (previousState.eth * state.nxmB + state.eth * previousState.nxmB) * timeOnRatchet / previousState.nxmB / state.nxmB / 2;
      }

      // on bv
      uint timeOnBV = timeElapsed - timeOnRatchet;

      if (timeOnBV != 0) {
        priceCumulativeBelow += timeOnBV * capital * (PRICE_BUFFER_DENOMINATOR - PRICE_BUFFER) / supply / PRICE_BUFFER_DENOMINATOR;
      }
    }

    return Observation(
      previousState.timestamp.toUint32(),
      // casting unsafely to allow overflow
      uint64(priceCumulativeAbove),
      uint64(priceCumulativeBelow)
    );
  }

  function getInitialObservations(
    State memory initialState,
    uint timestamp
  ) public pure returns (Observation[3] memory initialObservations) {

    uint priceCumulativeAbove;
    uint priceCumulativeBelow;
    uint endIdx = timestamp.divCeil(PERIOD_SIZE);
    uint previousTimestamp = (endIdx - 11) * PERIOD_SIZE; // 9 days | 1 day | until the update

    for (uint idx = endIdx - 2; idx <= endIdx; idx++) {
      uint observationTimestamp = Math.min(timestamp, idx * PERIOD_SIZE);
      uint observationIndex = idx % GRANULARITY;
      uint timeElapsed = observationTimestamp - previousTimestamp;

      priceCumulativeAbove += 1 ether * initialState.eth * timeElapsed / initialState.nxmA / 1e9;
      priceCumulativeBelow += 1 ether * initialState.eth * timeElapsed / initialState.nxmB / 1e9;

      initialObservations[observationIndex] = Observation(
        observationTimestamp.toUint32(),
        uint64(priceCumulativeAbove),
        uint64(priceCumulativeBelow)
      );
      previousTimestamp = observationTimestamp;
    }

    return initialObservations;
  }

  function updateTwap() external {
    uint capital = pool().getPoolValueInEth();
    uint supply = tokenController().totalSupply();
    uint mcrValue = mcr().getMCR();

    State memory initialState = loadState();
    Observation[3] memory _observations = observations;

    // current state
    State memory state = _getReserves(initialState, capital, supply, mcrValue, block.timestamp);
    _observations = _updateTwap(initialState, _observations, block.timestamp, capital, supply, mcrValue);

    for (uint i = 0; i < _observations.length; i++) {
      observations[i] = _observations[i];
    }

    storeState(state);
  }

  function _updateTwap(
    State memory initialState,
    Observation[3] memory _observations,
    uint currentStateTimestamp,
    uint capital,
    uint supply,
    uint mcrValue
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

      State memory state = _getReserves(previousState, capital, supply, mcrValue, observationTimestamp);

      newObservations[observationIndex] = getObservation(
        previousState,
        state,
        previousObservation,
        capital,
        supply
      );

      previousState = state;
      previousObservation = newObservations[observationIndex];
    }

    return newObservations;
  }

  function getInternalPriceAndUpdateTwap() external returns (uint internalPrice) {

    uint capital = pool().getPoolValueInEth();
    uint supply = tokenController().totalSupply();
    uint mcrValue = mcr().getMCR();

    State memory initialState = loadState();
    Observation[3] memory _observations = observations;

    // current state
    State memory state = _getReserves(initialState, capital, supply, mcrValue, block.timestamp);
    _observations = _updateTwap(initialState, _observations, block.timestamp, capital, supply, mcrValue);

    // sstore observations and state
    for (uint i = 0; i < _observations.length; i++) {
      observations[i] = _observations[i];
    }

    storeState(state);

    uint currentIdx = observationIndexOf(block.timestamp);
    // index of first observation in window = current - 2
    // adding 1 and applying modulo gives the same result avoiding underflow
    uint previousIdx = (currentIdx + 1) % GRANULARITY;

    Observation memory firstObservation = _observations[previousIdx];
    Observation memory currentObservation = _observations[currentIdx];

    uint elapsed = block.timestamp - firstObservation.timestamp;

    uint spotPriceA = 1 ether * state.eth / state.nxmA;
    uint spotPriceB = 1 ether * state.eth / state.nxmB;

    uint priceA;
    uint priceB;

    // underflow is desired
    unchecked {
      uint averagePriceA = (currentObservation.priceCumulativeAbove - firstObservation.priceCumulativeAbove) / elapsed;
      uint averagePriceB = (currentObservation.priceCumulativeBelow - firstObservation.priceCumulativeBelow) / elapsed;

      // keeping min/max inside unchecked scope to avoid stack too deep error
      priceA = Math.min(averagePriceA, spotPriceA);
      priceB = Math.max(averagePriceB, spotPriceB);
    }

    return priceA - priceB - 1 ether * capital / supply;
  }

  /* ========== DEPENDENCIES ========== */

  function pool() internal view returns (IPool) {
    return IPool(internalContracts[uint(ID.P1)]);
  }

  function mcr() internal view returns (IMCR) {
    return IMCR(internalContracts[uint(ID.MC)]);
  }

  function tokenController() internal view returns (ITokenController) {
    return ITokenController(internalContracts[uint(ID.TC)]);
  }

  function changeDependentContractAddress() external override {
    internalContracts[uint(ID.P1)] = master.getLatestAddress("P1");
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
    internalContracts[uint(ID.MC)] = master.getLatestAddress("MC");
    initialize();
  }

  function initialize() internal {

    if (slot1.updatedAt != 0) {
      // already initialized
      return;
    }

    uint128 nxmReserveA = (INITIAL_LIQUIDITY * 1 ether / SPOT_PRICE_A).toUint128();
    uint128 nxmReserveB = (INITIAL_LIQUIDITY * 1 ether / SPOT_PRICE_B).toUint128();
    uint128 ethReserve = INITIAL_LIQUIDITY.toUint128();
    uint96 budget = INITIAL_BUDGET.toUint96();
    uint32 updatedAt = block.timestamp.toUint32();

    ratchetSpeed = FAST_RATCHET_SPEED.toUint32();

    State memory state = State(
      nxmReserveA,
      nxmReserveB,
      ethReserve,
      budget,
      ratchetSpeed,
      updatedAt
    );

    storeState(state);

    Observation[3] memory _observations = getInitialObservations(state, updatedAt);

    for (uint i = 0; i < _observations.length; i++) {
      observations[i] = _observations[i];
    }
  }
}

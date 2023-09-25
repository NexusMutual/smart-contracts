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
  using RammLib for Observation;
  using RammLib for State;

  /* ========== STATE VARIABLES ========== */

  Slot0 public slot0;
  Slot1 public slot1;

  // slot 2 & 3
  // 160 * 3 = 480 bits
  Observation[3] public observations;
  uint32 private _reserved; // leftover bits in slot 3

  /* ========== FUNCTIONS ========== */

  uint public constant LIQ_SPEED_PERIOD = 1 days;
  uint public constant RATCHET_PERIOD = 1 days;
  uint public constant RATCHET_DENOMINATOR = 10_000;
  uint public constant PRICE_BUFFER = 100;
  uint public constant PRICE_BUFFER_DENOMINATOR = 10_000;
  uint public constant GRANULARITY = 2;
  uint public constant PERIOD_SIZE = 86_400; // day

  /* =========== IMMUTABLES ========== */

  uint public immutable FAST_LIQUIDITY_SPEED;
  uint public immutable TARGET_LIQUIDITY;
  uint public immutable LIQ_SPEED_A;
  uint public immutable LIQ_SPEED_B;
  uint public immutable RATCHET_SPEED_A;
  uint public immutable RATCHET_SPEED_B;

  /* ========== CONSTRUCTOR ========== */

  constructor(
    uint _targetLiquidity,
    uint _fastLiquiditySpeed,
    uint _liquiditySpeedA,
    uint _liquiditySpeedB,
    uint _ratchetSpeedA,
    uint _ratchetSpeedB
  ) {
    TARGET_LIQUIDITY = _targetLiquidity;
    FAST_LIQUIDITY_SPEED = _fastLiquiditySpeed;
    LIQ_SPEED_A = _liquiditySpeedA;
    LIQ_SPEED_B = _liquiditySpeedB;
    RATCHET_SPEED_A = _ratchetSpeedA;
    RATCHET_SPEED_B = _ratchetSpeedB;
  }

  function loadState() internal view returns (State memory) {
    return State(slot0.nxmReserveA,
      slot0.nxmReserveB,
      slot1.ethReserve,
      slot1.budget,
      slot1.updatedAt
    );
  }

  function storeState(State memory state) internal {
    // slot 0
    slot0.nxmReserveA = state.nxmA.toUint128();
    slot0.nxmReserveB = state.nxmB.toUint128();
    // slot 1
    slot1.ethReserve = state.eth.toUint128();
    slot1.budget = state.budget.toUint96();
    slot1.updatedAt = state.timestamp.toUint32();
  }

  function cloneObservations(Observation[3] memory src) internal pure returns (Observation[3] memory) {
    return [src[0].clone(), src[1].clone(), src[2].clone()];
  }

  // TODO: add minOut and deadline parameters
  function swap(uint nxmIn) external payable {

    require(msg.value == 0 || nxmIn == 0, "ONE_INPUT_ONLY");
    require(msg.value > 0 || nxmIn > 0, "ONE_INPUT_REQUIRED");

    msg.value > 0
      ? swapEthForNxm(msg.value)
      : swapNxmForEth(nxmIn);
  }

  function swapEthForNxm(uint ethIn) internal returns (uint /*nxmOut*/) {

    uint capital = pool().getPoolValueInEth();
    uint supply = tokenController().totalSupply();

    State memory initialState = loadState();
    Observation[3] memory _observations = observations;

    // current state
    State memory state = _getReserves(initialState, capital, supply, block.timestamp);
    _observations = updateTwap(initialState, _observations, block.timestamp, capital, supply);

    uint nxmA = state.nxmA;
    uint nxmB = state.nxmB;
    uint eth = state.eth;
    uint k = eth * nxmA;

    eth = eth + ethIn;
    nxmA = k / eth;
    nxmB = nxmB * eth / state.eth;

    uint nxmOut = nxmA - state.nxmA;

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
    require(ok, "ETH_TRANSFER_FAILED");
    tokenController().mint(msg.sender, nxmOut);

    return nxmOut;
  }

  function swapNxmForEth(uint nxmIn) internal returns (uint /*ethOut*/) {

    uint capital = pool().getPoolValueInEth();
    uint supply = tokenController().totalSupply();
    uint mcrETH = mcr().getMCR();

    State memory initialState = loadState();
    Observation[3] memory _observations = observations;

    // current state
    State memory state = _getReserves(initialState, capital, supply, block.timestamp);
    _observations = updateTwap(initialState, _observations, block.timestamp, capital, supply);

    uint nxmA = state.nxmA;
    uint nxmB = state.nxmB;
    uint eth = state.eth;
    uint k = eth * nxmB;

    nxmB = nxmB + nxmIn;
    eth = k / nxmB;
    nxmA = nxmA * eth / state.eth;

    uint ethOut = state.eth - eth;

    // TODO add buffer into calculation
    require(capital - ethOut >= mcrETH, "NO_SWAPS_IN_BUFFER_ZONE");

    // update storage
    state.nxmA = nxmA;
    state.nxmB = nxmB;
    state.eth = eth;
    state.timestamp = block.timestamp;

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
    State memory state = _getReserves(loadState(), capital, supply, block.timestamp);
    return (state.eth, state.nxmA, state.nxmB, state.budget);
  }

  function _getReserves(
    State memory state,
    uint capital,
    uint supply,
    uint currentTimestamp
  ) public pure returns (State memory /* new state */) {

    uint eth = state.eth;
    uint budget = state.budget;

    uint elapsed = currentTimestamp - state.timestamp;

    if (eth < TARGET_LIQUIDITY) {
      // inject eth
      uint timeLeftOnBudget = budget * LIQ_SPEED_PERIOD / FAST_LIQUIDITY_SPEED;
      uint maxToInject = TARGET_LIQUIDITY - eth;
      uint injected;

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
      uint r = elapsed * RATCHET_SPEED_A;
      uint bufferedCapitalA = capital * (PRICE_BUFFER_DENOMINATOR + PRICE_BUFFER) / PRICE_BUFFER_DENOMINATOR;

      if (bufferedCapitalA * nxmA + bufferedCapitalA * nxmA * r / RATCHET_PERIOD / RATCHET_DENOMINATOR > eth * supply) {
        // use bv
        nxmA = eth * supply / bufferedCapitalA;
      } else {
        // use ratchet
        uint nr_denom_addend = r * capital * nxmA / supply / RATCHET_PERIOD / RATCHET_DENOMINATOR;
        nxmA = eth * nxmA / (eth - nr_denom_addend);
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
        bufferedCapitalB * nxmB < eth * supply + nxmB * capital * elapsed * RATCHET_SPEED_A / RATCHET_PERIOD / RATCHET_DENOMINATOR
      ) {
        // use bv
        nxmB = eth * supply / bufferedCapitalB;
      } else {
        // use ratchet
        uint nr_denom_addend = nxmB * elapsed * RATCHET_SPEED_A * capital / supply / RATCHET_PERIOD / RATCHET_DENOMINATOR;
        nxmB = eth * nxmB / (eth + nr_denom_addend);
      }
    }

    return State(nxmA, nxmB, eth, budget, currentTimestamp);
  }

  function getSpotPrices() external view returns (uint spotPriceA, uint spotPriceB) {

    uint capital = pool().getPoolValueInEth();
    uint supply = tokenController().totalSupply();

    State memory state = _getReserves(loadState(), capital, supply, block.timestamp);

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

    { // above
      uint timeOnRatchet;
      uint inner;
      {
        uint innerLeft = previousState.eth * supply;
        uint innerRight = (PRICE_BUFFER_DENOMINATOR + PRICE_BUFFER) * capital * previousState.nxmA / PRICE_BUFFER_DENOMINATOR;
        inner = innerLeft > innerRight ? innerLeft - innerRight : 0;
      }

      // on ratchet
      if (inner != 0) {
        timeOnRatchet = inner * RATCHET_DENOMINATOR * RATCHET_PERIOD / capital / previousState.nxmA / state.ratchetSpeed;

        // cumulative price above
        priceCumulativeAbove += (previousState.eth * state.nxmA + state.eth * previousState.nxmA) * timeOnRatchet / previousState.nxmA / state.nxmA / 2;
      }

      // on bv
      uint timeOnBV = state.timestamp - previousState.timestamp - timeOnRatchet;
      priceCumulativeAbove += timeOnBV * capital * (PRICE_BUFFER_DENOMINATOR + PRICE_BUFFER) / supply / PRICE_BUFFER_DENOMINATOR;
    }

    { // below
      uint timeOnRatchet;
      uint inner;
      {
        uint innerLeft = (PRICE_BUFFER_DENOMINATOR - PRICE_BUFFER) * capital * previousState.nxmB / PRICE_BUFFER_DENOMINATOR;
        uint innerRight = previousState.eth * supply;
        inner = innerLeft > innerRight ? innerLeft - innerRight : 0;
      }

      // on ratchet
      if (inner != 0) {
        timeOnRatchet = inner * RATCHET_DENOMINATOR * RATCHET_PERIOD / capital / previousState.nxmB / state.ratchetSpeed;

        // cumulative price below
        priceCumulativeBelow += (previousState.eth * state.nxmB + state.eth * previousState.nxmB) * timeOnRatchet / previousState.nxmB / state.nxmB / 2;
      }

      // on bv
      uint timeOnBV = state.timestamp - previousState.timestamp - timeOnRatchet;
      priceCumulativeBelow += timeOnBV * capital * (PRICE_BUFFER_DENOMINATOR - PRICE_BUFFER) / supply / PRICE_BUFFER_DENOMINATOR;
    }

    return Observation(
      previousState.timestamp.toUint32(),
      // casting unsafely to allow overflow
      uint64(priceCumulativeAbove),
      uint64(priceCumulativeBelow)
    );
  }

  function updateTwap(
    State memory initialState,
    Observation[3] memory _observations,
    uint currentStateTimestamp,
    uint capital,
    uint supply
  ) public pure returns (Observation[3] memory) {

    uint oldestObservationIndex = observationIndexOf(initialState.timestamp);
    uint endIdx = currentStateTimestamp.divCeil(PERIOD_SIZE);

    State memory previousState = initialState;
    Observation memory previousObservation = _observations[oldestObservationIndex];
    Observation[3] memory newObservations;

    for (uint idx = endIdx - 2; idx <= endIdx; idx++) {
      uint observationTimestamp = Math.min(currentStateTimestamp, idx * PERIOD_SIZE);
      uint observationIndex = idx % GRANULARITY;

      if (observationTimestamp <= previousState.timestamp) {
        newObservations[observationIndex] = _observations[observationIndex].clone();
        continue;
      }

      State memory state = _getReserves(previousState, capital, supply, observationTimestamp);

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

  function getInternalPrice() external returns (uint price) {

    uint capital = pool().getPoolValueInEth();
    uint supply = tokenController().totalSupply();

    State memory initialState = loadState();
    Observation[3] memory _observations = observations;

    // current state
    State memory state = _getReserves(initialState, capital, supply, block.timestamp);
    _observations = updateTwap(initialState, _observations, block.timestamp, capital, supply);

    uint currentIdx = observationIndexOf(block.timestamp);
    // index of first observation in window = current - 2
    // adding 1 and applying modulo gives the same result avoiding underflow
    uint previousIdx = (currentIdx + 1) % GRANULARITY;

    Observation memory firstObservation = _observations[previousIdx];
    Observation memory currentObservation = _observations[currentIdx];


    uint elapsed = block.timestamp - firstObservation.timestamp;

    uint priceA;
    uint priceB;

    {
      // priceA
      uint spotPriceA = 1 ether * state.eth / state.nxmA;
      uint averagePriceA;

      // underflow is desired
      unchecked {
        averagePriceA = (currentObservation.priceCumulativeAbove - firstObservation.priceCumulativeAbove) / elapsed;
      }

      priceA = Math.min(averagePriceA, spotPriceA);
    }

    {
      //  priceB
      uint spotPriceB = 1 ether * state.eth / state.nxmB;
      uint averagePriceB;

      // underflow is desired
      unchecked {
        averagePriceB = (currentObservation.priceCumulativeBelow - firstObservation.priceCumulativeBelow) / elapsed;
      }

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

    require(slot1.updatedAt == 0, "ALREADY_INITIALIZED");

    // TODO: hardcode the initial values - this is a proxy and there's no other way to pass them
    uint spotPriceA;
    uint spotPriceB;
    uint initialLiquidity;
    uint initialBudget;

    slot1.updatedAt = block.timestamp.toUint32();
    slot1.ethReserve = initialLiquidity.toUint128();
    slot1.budget = initialBudget.toUint96();

    slot0.nxmReserveA = (initialLiquidity * 1 ether / spotPriceA).toUint128();
    slot0.nxmReserveB = (initialLiquidity * 1 ether / spotPriceB).toUint128();
  }
}

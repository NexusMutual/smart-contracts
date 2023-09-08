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

  /* ========== STATE VARIABLES ========== */

  // slot 0
  uint128 public nxmReserveA;
  uint128 public nxmReserveB;

  // slot 1
  uint128 public ethReserve;
  uint96 public budget;
  uint32 public lastUpdateTimestamp;

  // slot 2 & 3
  // 160 * 3 = 480 bits
  Observation[3] public observations;
  uint32 private _reserved; // slot leftover

  /* ========== FUNCTIONS ========== */

  uint public constant LIQ_SPEED_PERIOD = 1 days;
  uint public constant RATCHET_PERIOD = 1 days;
  uint public constant RATCHET_DENOMINATOR = 10_000;
  uint public constant PRICE_BUFFER = 100;
  uint public constant PRICE_BUFFER_DENOMINATOR = 10_000;
  uint public constant WINDOW_SIZE = 172_800; // 2 days
  uint public constant GRANULARITY = 2;
  uint public constant PERIOD_SIZE = 86_400; // day

  /* =========== IMMUTABLES ========== */

  uint public immutable FAST_LIQUIDITY_SPEED;
  uint public immutable FAST_RATCHET_SPEED;
  uint public immutable TARGET_LIQUIDITY;
  uint public immutable LIQ_SPEED_A;
  uint public immutable LIQ_SPEED_B;
  uint public immutable RATCHET_SPEED_A;
  uint public immutable RATCHET_SPEED_B;

  /* ========== CONSTRUCTOR ========== */

  constructor(
    uint _targetLiquidity,
    uint _fastLiquiditySpeed,
    uint _fastRatchetSpeed,
    uint _liquiditySpeedA,
    uint _liquiditySpeedB,
    uint _ratchetSpeedA,
    uint _ratchetSpeedB
  ) {
    TARGET_LIQUIDITY = _targetLiquidity;
    FAST_LIQUIDITY_SPEED = _fastLiquiditySpeed;
    FAST_RATCHET_SPEED = _fastRatchetSpeed;
    LIQ_SPEED_A = _liquiditySpeedA;
    LIQ_SPEED_B = _liquiditySpeedB;
    RATCHET_SPEED_A = _ratchetSpeedA;
    RATCHET_SPEED_B = _ratchetSpeedB;
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

    (uint ethReserveBefore, uint nxmA, uint nxmB, uint _budget) = getReserves(capital, supply, block.timestamp);
    updateTwap(capital, supply);

    uint k = ethReserveBefore * nxmA;
    uint ethReserveAfter = (ethReserveBefore + ethIn).toUint112();

    // update storage
    // edge case: bellow goes over bv due to eth-dai price changing
    nxmReserveA = (k / ethReserveAfter).toUint96();
    nxmReserveB = (nxmB * ethReserveAfter / ethReserveBefore).toUint96();
    ethReserve = ethReserveAfter.toUint112();
    budget = _budget.toUint80();
    lastUpdateTimestamp = uint32(block.timestamp);
    uint nxmOut = nxmA - nxmReserveA;

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

    (uint ethReserveBefore, uint nxmA, uint nxmB, uint _budget) = getReserves(capital, supply, block.timestamp);
    updateTwap(capital, supply);

    uint k = ethReserveBefore * nxmB;
    uint ethReserveAfter = k / nxmReserveB;
    uint ethOut = ethReserveBefore - ethReserveAfter;

    // TODO add buffer into calculation
    require(capital - ethOut >= mcrETH, "NO_SWAPS_IN_BUFFER_ZONE");

    // update storage
    nxmReserveA = (nxmA * ethReserveAfter / ethReserveBefore).toUint96();
    nxmReserveB = (nxmB + nxmIn).toUint96();
    ethReserve = ethReserveAfter.toUint112();
    budget = _budget.toUint80();
    lastUpdateTimestamp = uint32(block.timestamp);

    tokenController().burnFrom(msg.sender, nxmIn);
    // TODO: use a custom function instead of sendPayout
    pool().sendPayout(0, payable(msg.sender), ethOut);

    return ethOut;
  }

  function removeBudget() external onlyGovernance {
    budget = 0;
  }

  /* ============== VIEWS ============= */

  function getReserves(
    uint capital,
    uint supply,
    uint timestamp
  ) public view returns (uint _ethReserve, uint nxmA, uint nxmB, uint _budget) {

    _ethReserve = ethReserve;
    _budget = budget;
    uint elapsed = timestamp - lastUpdateTimestamp;
    uint timeLeftOnBudget = _budget * LIQ_SPEED_PERIOD / FAST_LIQUIDITY_SPEED;

    if (_ethReserve < TARGET_LIQUIDITY) {
      // inject eth
      uint maxInjectedAmount = TARGET_LIQUIDITY - _ethReserve;
      uint injectedAmount;

      if (elapsed <= timeLeftOnBudget) {

        injectedAmount = Math.min(
          elapsed * FAST_LIQUIDITY_SPEED / LIQ_SPEED_PERIOD,
          maxInjectedAmount
        );

        _budget -= injectedAmount;

      } else {

        uint injectedAmountOnBudget = timeLeftOnBudget * FAST_LIQUIDITY_SPEED / LIQ_SPEED_PERIOD;
        _budget = maxInjectedAmount < injectedAmountOnBudget ? _budget - maxInjectedAmount : 0;

        uint injectedAmountWoBudget = (elapsed - timeLeftOnBudget) * LIQ_SPEED_B * 1 ether / LIQ_SPEED_PERIOD;
        injectedAmount = Math.min(maxInjectedAmount, injectedAmountOnBudget + injectedAmountWoBudget);
      }

      _ethReserve += injectedAmount;

    } else {
      // extract eth
      uint extractedAmount = Math.min(
        elapsed * LIQ_SPEED_A * 1 ether / LIQ_SPEED_PERIOD,
        _ethReserve - TARGET_LIQUIDITY // diff to target
      );

      _ethReserve -= extractedAmount;
    }

    // pi = eth / nxm
    // pf = eth_new / nxm_new
    // pf = eth_new /(nxm * _ethReserve / ethReserve)
    // nxm_new = nxm * _ethReserve / ethReserve
    nxmA = nxmReserveA * _ethReserve / ethReserve;
    nxmB = nxmReserveB * _ethReserve / ethReserve;

    // apply ratchet above
    {
      // if cap*n*(1+r) > e*sup
      // if cap*n + cap*n*r > e*sup
      //   set n(new) = n(BV)
      // else
      //   set n(new) = n(R)
      uint r = elapsed * RATCHET_SPEED_A;
      uint bufferedCapitalA = capital * (PRICE_BUFFER_DENOMINATOR + PRICE_BUFFER) / PRICE_BUFFER_DENOMINATOR;

      if (bufferedCapitalA * nxmA + bufferedCapitalA * nxmA * r / RATCHET_PERIOD / RATCHET_DENOMINATOR > _ethReserve * supply) {
        // use bv
        nxmA = _ethReserve * supply / bufferedCapitalA;
      } else {
        // use ratchet
        uint nr_denom_addend = r * capital * nxmA / supply / RATCHET_PERIOD / RATCHET_DENOMINATOR;
        nxmA = _ethReserve * nxmA / (_ethReserve - nr_denom_addend);
      }
    }

    // apply ratchet below
    {
      // check if we should be using the ratchet or the book value price using:
      // Nbv > Nr <=>
      // ... <=>
      // cap * n < e * sup + r * cap * n
      uint bufferedCapitalB = capital * (PRICE_BUFFER_DENOMINATOR - PRICE_BUFFER) / PRICE_BUFFER_DENOMINATOR;
      uint r;

      if (elapsed <= timeLeftOnBudget) {
        r = elapsed * FAST_RATCHET_SPEED;
      } else {
        r = (elapsed - timeLeftOnBudget) * RATCHET_SPEED_A + timeLeftOnBudget * FAST_RATCHET_SPEED;
      }

      if (
        bufferedCapitalB * nxmB < _ethReserve * supply + nxmB * capital * r / RATCHET_PERIOD / RATCHET_DENOMINATOR
      ) {
        nxmB = _ethReserve * supply / bufferedCapitalB;
      } else {
        uint nr_denom_addend = nxmB * r * capital / supply / RATCHET_PERIOD / RATCHET_DENOMINATOR;
        nxmB = _ethReserve * nxmB / (_ethReserve + nr_denom_addend);
      }
    }

    return (_ethReserve, nxmA, nxmB, _budget);
  }

  function getSpotPrices() external view returns (uint spotPriceA, uint spotPriceB) {
    uint capital = pool().getPoolValueInEth();
    uint supply = tokenController().totalSupply();
    (uint _ethReserve, uint nxmA, uint nxmB, /* budget */) = getReserves(capital, supply, block.timestamp);
    return (1 ether * _ethReserve / nxmA, 1 ether * _ethReserve / nxmB);
  }

  function getBookValue() external view returns (uint bookValue) {
    uint capital = pool().getPoolValueInEth();
    uint supply = tokenController().totalSupply();
    return 1 ether * capital / supply;
  }

  /* ========== ORACLE ========== */

  function observationIndexOf(uint timestamp) internal pure returns (uint index) {
    return timestamp / PERIOD_SIZE % GRANULARITY;
  }

  function getFirstObservationInWindow() internal view returns (Observation memory firstObservation) {
    uint firstObservationStartTimestamp = (block.timestamp / PERIOD_SIZE - 2) * PERIOD_SIZE;
    uint firstObservationIndex = observationIndexOf(firstObservationStartTimestamp);
    firstObservation = observations[firstObservationIndex];

    // is the read observation stale?
    if (firstObservationStartTimestamp > firstObservation.timestamp) {
      uint lastObservationIndex = observationIndexOf(lastUpdateTimestamp);
      firstObservation = observations[lastObservationIndex];
    }
  }

  function calculateCumulativePrice(
    CumulativePriceCalculationProps memory props,
    uint bookValue
  ) internal view returns (uint priceCumulativeAbove, uint priceCumulativeBelow) {

    uint lastObservationIndex = observationIndexOf(props.observationTimestamp);
    Observation memory lastObservation = observations[lastObservationIndex];
    CumulativePriceCalculationTimes memory times;

    uint spotPriceAbove = props.previousEthReserve / props.previousNxmA;
    uint spotPriceBelow = props.previousEthReserve / props.previousNxmB;

    times.secondsUntilBVAbove = (spotPriceAbove / bookValue - 1) * RATCHET_PERIOD / props.ratchetSpeedA / RATCHET_PERIOD;
    times.secondsUntilBVBelow = (1 - spotPriceBelow / bookValue) * RATCHET_PERIOD / props.ratchetSpeedB / RATCHET_PERIOD;

    times.timeElapsed = props.observationTimestamp - props.previousTimestamp;
    times.bvTimeBelow = times.timeElapsed > times.secondsUntilBVBelow ? times.timeElapsed - times.secondsUntilBVBelow : 0;
    times.bvTimeAbove = times.timeElapsed > times.secondsUntilBVAbove ? times.timeElapsed - times.secondsUntilBVAbove : 0;
    times.ratchetTimeBelow = times.timeElapsed - times.bvTimeBelow;
    times.ratchetTimeAbove = times.timeElapsed - times.bvTimeAbove;

    priceCumulativeAbove = lastObservation.priceCumulativeAbove
      + (spotPriceAbove + props.currentEthReserve / props.currentNxmA) * times.ratchetTimeAbove / 2
      + props.currentEthReserve / props.currentNxmB * times.bvTimeAbove;

    priceCumulativeBelow = lastObservation.priceCumulativeBelow
      + (spotPriceBelow + props.currentEthReserve / props.currentNxmB) * times.ratchetTimeBelow / 2
      + props.currentEthReserve / props.currentNxmB * times.bvTimeBelow;
  }

  function updateTwap(uint capital, uint supply) internal {
    /*
    bookValue = capacity / supply
    currentSpotPrice = currentEthReserve / currentNxmReserve
    prevSpotPrice = prevEthReserve / prevNxmReserve
    ratchetSpeed is x% perDat of bookValue
    prevSpotPrice / bookvalue -> 1.50; / above
    abs(1 - 1.5) * RATCHET_PERIOD / ratchetSpeed / RATCHET_DENOMINATOR -> number of seconds for spot till bv reach
    */
    CumulativePriceCalculationProps memory calculationProps;
    calculationProps.previousEthReserve = ethReserve;
    calculationProps.previousNxmA = nxmReserveA;
    calculationProps.previousNxmB = nxmReserveB;
    calculationProps.previousTimestamp = lastUpdateTimestamp;
    calculationProps.ratchetSpeedA = RATCHET_SPEED_A;
    calculationProps.ratchetSpeedB = RATCHET_SPEED_B;
    uint observationIndex;
    uint missingPeriods = Math.min((block.timestamp - calculationProps.previousTimestamp) / PERIOD_SIZE, 2);

    for (uint i = missingPeriods; i > 0; i--) {
      // 1st second of the period
      uint observationTimestamp = (block.timestamp / PERIOD_SIZE - i) * PERIOD_SIZE;
      calculationProps.observationTimestamp = observationTimestamp;
      observationIndex = observationIndexOf(observationTimestamp);

      // TODO: capital and supply could have changed
      (
        calculationProps.currentEthReserve,
        calculationProps.currentNxmA,
        calculationProps.currentNxmB,
      ) = getReserves(capital, supply, observationTimestamp);

      (
        uint _priceCumulativeAbove,
        uint _priceCumulativeBelow
      ) = calculateCumulativePrice(calculationProps, 1 ether * capital / supply);

      // uint64 cast overflow is desired
      observations[observationIndex].priceCumulativeAbove = uint64(_priceCumulativeAbove);
      observations[observationIndex].priceCumulativeBelow = uint64(_priceCumulativeBelow);
      observations[observationIndex].timestamp = uint32(observationTimestamp);

      calculationProps.previousTimestamp = observationTimestamp;
      calculationProps.previousEthReserve = calculationProps.currentEthReserve;
      calculationProps.previousNxmA = calculationProps.currentNxmA;
      calculationProps.previousNxmB = calculationProps.currentNxmB;
    }

    calculationProps.observationTimestamp = block.timestamp;
    (
      calculationProps.currentEthReserve,
      calculationProps.currentNxmA,
      calculationProps.currentNxmB,
    ) = getReserves(capital, supply, block.timestamp);

    (
      uint priceCumulativeAbove,
      uint priceCumulativeBelow
    ) = calculateCumulativePrice(calculationProps, 1 ether * capital / supply);

    observationIndex = observationIndexOf(block.timestamp);
    // uint64 cast overflow is desired
    observations[observationIndex].priceCumulativeAbove = uint64(priceCumulativeAbove);
    observations[observationIndex].priceCumulativeBelow = uint64(priceCumulativeBelow);
    observations[observationIndex].timestamp = uint32(block.timestamp);
  }

  function getInternalPrice() external view returns (uint price) {
    Observation memory firstObservation = getFirstObservationInWindow();
    CumulativePriceCalculationProps memory calculationProps;

    calculationProps.previousEthReserve = ethReserve;
    calculationProps.previousNxmA = nxmReserveA;
    calculationProps.previousNxmB = nxmReserveB;
    calculationProps.previousTimestamp = lastUpdateTimestamp;
    calculationProps.observationTimestamp = block.timestamp;
    calculationProps.ratchetSpeedA = RATCHET_SPEED_A;
    calculationProps.ratchetSpeedB = RATCHET_SPEED_B;

    uint capital = pool().getPoolValueInEth();
    uint supply = tokenController().totalSupply();

    (
      calculationProps.currentEthReserve,
      calculationProps.currentNxmA,
      calculationProps.currentNxmB,
    ) = getReserves(capital, supply, block.timestamp);

    //   10    11    12    13    14    15    16    17
    //   |-----|x----|--y--|-----|-----|--y--|-----|
    //      0     1     2     0     1     2     0

    (
      uint currentPriceCumulativeAbove,
      uint currentPriceCumulativeBelow
    ) = calculateCumulativePrice(calculationProps, 1 ether * capital / supply);

    uint timeElapsed = block.timestamp - firstObservation.timestamp;

    uint twapPriceAbove = (currentPriceCumulativeAbove - firstObservation.priceCumulativeAbove) / timeElapsed;
    uint twapPricBelow = (currentPriceCumulativeBelow - firstObservation.priceCumulativeBelow) / timeElapsed;

    uint spotPriceAbove = calculationProps.currentEthReserve / calculationProps.currentNxmA;
    uint spotPriceBelow = calculationProps.currentEthReserve / calculationProps.currentNxmB;

    uint priceAbove = Math.min(twapPriceAbove, spotPriceAbove);
    uint priceBelow = Math.max(twapPricBelow, spotPriceBelow);

    uint bookValue = 1 ether * capital / supply;
    return priceAbove - priceBelow - bookValue;
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

    if (lastUpdateTimestamp == 0) {
      initialize();
    }
  }

  function initialize() internal {

    require(lastUpdateTimestamp == 0, "ALREADY_INITIALIZED");

    // TODO: hardcode the initial values - this is a proxy and there's no other way to pass them
    uint spotPriceA;
    uint spotPriceB;
    uint initialLiquidity;
    uint initialBudget;

    lastUpdateTimestamp = uint32(block.timestamp);
    ethReserve = initialLiquidity.toUint112();
    budget = initialBudget.toUint80();

    nxmReserveA = (initialLiquidity * 1 ether / spotPriceA).toUint96();
    nxmReserveB = (initialLiquidity * 1 ether / spotPriceB).toUint96();
  }
}

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
  Pool public a;
  Pool public b;

  // slot 1 & 2
  // 3 * 160 + 32 = 512 bits
  Observation[3] public observations;
  uint32 public lastSwapTimestamp;

  // slot 3
  uint80 public budget;
  uint112 public ethReserve;
  // 64 bits left

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

  uint public immutable fastLiquiditySpeed;
  uint public immutable targetLiquidity;

  /* ========== CONSTRUCTOR ========== */

  // TODO: all in-memory variables, immutables and constants should use uint256

  constructor(uint _targetLiquidity, uint _fastLiquiditySpeed) {
    targetLiquidity = _targetLiquidity;
    fastLiquiditySpeed = _fastLiquiditySpeed;
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
    a.nxmReserve = (k / ethReserveAfter).toUint96();
    b.nxmReserve = (nxmB * ethReserveAfter / ethReserveBefore).toUint96();
    ethReserve = ethReserveAfter.toUint112();
    budget = _budget.toUint80();
    lastSwapTimestamp = uint32(block.timestamp);
    uint nxmOut = nxmA - a.nxmReserve;

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
    uint ethReserveAfter = k / b.nxmReserve;
    uint ethOut = ethReserveBefore - ethReserveAfter;

    // TODO add buffer into calculation
    require(capital - ethOut >= mcrETH, "NO_SWAPS_IN_BUFFER_ZONE");

    // update storage
    a.nxmReserve = (nxmA * ethReserveAfter / ethReserveBefore).toUint96();
    b.nxmReserve = (nxmB + nxmIn).toUint96();
    ethReserve = ethReserveAfter.toUint112();
    budget = _budget.toUint80();
    lastSwapTimestamp = uint32(block.timestamp);

    tokenController().burnFrom(msg.sender, nxmIn);
    // TODO: use a custom function instead of sendPayout
    pool().sendPayout(0, payable(msg.sender), ethOut);

    return ethOut;
  }

  /* ============== VIEWS ============= */

  function getReserves(
    uint capital,
    uint supply,
    uint timestamp
  ) public view returns (uint _ethReserve, uint nxmA, uint nxmB, uint _budget) {

    _ethReserve = ethReserve;
    _budget = budget;
    uint elapsed = timestamp - lastSwapTimestamp;

    if (_ethReserve < targetLiquidity) {
      // inject eth
      uint timeLeftOnBudget = _budget * LIQ_SPEED_PERIOD / fastLiquiditySpeed;
      uint maxInjectedAmount = targetLiquidity - _ethReserve;
      uint injectedAmount;

      if (elapsed <= timeLeftOnBudget) {

        injectedAmount = Math.min(
          elapsed * fastLiquiditySpeed / LIQ_SPEED_PERIOD,
          maxInjectedAmount
        );

        _budget -= injectedAmount;

      } else {

        uint injectedAmountOnBudget = timeLeftOnBudget * fastLiquiditySpeed / LIQ_SPEED_PERIOD;
        _budget = maxInjectedAmount < injectedAmountOnBudget ? _budget - maxInjectedAmount : 0;

        uint injectedAmountWoBudget = (elapsed - timeLeftOnBudget) * b.liquiditySpeed * 1 ether / LIQ_SPEED_PERIOD;
        injectedAmount = Math.min(maxInjectedAmount, injectedAmountOnBudget + injectedAmountWoBudget);
      }

      _ethReserve += injectedAmount;

    } else {
      // extract eth
      uint extractedAmount = Math.min(
        elapsed * a.liquiditySpeed * 1 ether / LIQ_SPEED_PERIOD,
        _ethReserve - targetLiquidity // diff to target
      );

      _ethReserve -= extractedAmount;
    }

    // pi = eth / nxm
    // pf = eth_new / nxm_new
    // pf = eth_new /(nxm * _ethReserve / ethReserve)
    // nxm_new = nxm * _ethReserve / ethReserve
    nxmA = a.nxmReserve * _ethReserve / ethReserve;
    nxmB = b.nxmReserve * _ethReserve / ethReserve;

    // apply ratchet above
    {
      // if cap*n*(1+r) > e*sup
      // if cap*n + cap*n*r > e*sup
      //   set n(new) = n(BV)
      // else
      //   set n(new) = n(R)
      uint r = elapsed * a.ratchetSpeed;
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

      if (
        bufferedCapitalB * nxmB < _ethReserve * supply + nxmB * capital * elapsed * b.ratchetSpeed / RATCHET_PERIOD / RATCHET_DENOMINATOR
      ) {
        nxmB = _ethReserve * supply / bufferedCapitalB;
      } else {
        uint nr_denom_addend = nxmB * elapsed * b.ratchetSpeed * capital / supply / RATCHET_PERIOD / RATCHET_DENOMINATOR;
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
    return capital / supply;
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
      uint lastObservationIndex = observationIndexOf(lastSwapTimestamp);
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
    calculationProps.previousNxmA = a.nxmReserve;
    calculationProps.previousNxmB = b.nxmReserve;
    calculationProps.previousTimestamp = lastSwapTimestamp;
    calculationProps.ratchetSpeedA = a.ratchetSpeed;
    calculationProps.ratchetSpeedB = b.ratchetSpeed;
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
      ) = calculateCumulativePrice(calculationProps, capital / supply);

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

    (uint priceCumulativeAbove, uint priceCumulativeBelow) = calculateCumulativePrice(calculationProps, capital / supply);

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
    calculationProps.previousNxmA = a.nxmReserve;
    calculationProps.previousNxmB = b.nxmReserve;
    calculationProps.previousTimestamp = lastSwapTimestamp;
    calculationProps.observationTimestamp = block.timestamp;
    calculationProps.ratchetSpeedA = a.ratchetSpeed;
    calculationProps.ratchetSpeedB = b.ratchetSpeed;

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

    (uint currentPriceCumulativeAbove, uint currentPriceCumulativeBelow) = calculateCumulativePrice(calculationProps, capital / supply);

    uint timeElapsed = block.timestamp - firstObservation.timestamp;

    uint twapPriceAbove = (currentPriceCumulativeAbove - firstObservation.priceCumulativeAbove) / timeElapsed;
    uint twapPricBelow = (currentPriceCumulativeBelow - firstObservation.priceCumulativeBelow) / timeElapsed;

    uint spotPriceAbove = calculationProps.currentEthReserve / calculationProps.currentNxmA;
    uint spotPriceBelow = calculationProps.currentEthReserve / calculationProps.currentNxmB;

    uint priceAbove = Math.min(twapPriceAbove, spotPriceAbove);
    uint priceBelow = Math.max(twapPricBelow, spotPriceBelow);

    uint bookValue = capital / supply;
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

    if (lastSwapTimestamp == 0) {
      initialize();
    }
  }

  function initialize() internal {

    require(lastSwapTimestamp == 0, "ALREADY_INITIALIZED");

    // TODO: hardcode the initial values - this is a proxy and there's no other way to pass them
    uint liqSpeedOut;
    uint liqSpeedIn;
    uint ratchetSpeedA;
    uint ratchetSpeedB;
    uint spotPriceA;
    uint spotPriceB;
    uint initialLiquidity;
    uint initialBudget;

    lastSwapTimestamp = uint32(block.timestamp);
    ethReserve = initialLiquidity.toUint112();
    budget = initialBudget.toUint80();

    a.nxmReserve = (initialLiquidity * 1 ether / spotPriceA).toUint96();
    a.liquiditySpeed = liqSpeedOut.toUint16();
    a.ratchetSpeed = ratchetSpeedA.toUint16();

    b.nxmReserve = (initialLiquidity * 1 ether / spotPriceB).toUint96();
    b.liquiditySpeed = liqSpeedIn.toUint16();
    b.ratchetSpeed = ratchetSpeedB.toUint16();
  }
}

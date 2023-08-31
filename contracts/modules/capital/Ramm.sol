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

  function swapEthForNxm(uint ethIn) internal returns (uint nxmOut) {
    (uint _liquidity, uint nxmA, uint nxmB, uint _budget) = getReserves(block.timestamp);
    update();

    uint k = _liquidity * nxmA;
    ethReserve = (_liquidity + ethIn).toUint112();

    // edge case: bellow goes over bv due to eth-dai price changing
    a.nxmReserve = uint96(k / ethReserve);
    b.nxmReserve = uint96(nxmB * ethReserve / _liquidity);
    budget = _budget;
    lastSwapTimestamp = block.timestamp;
    nxmOut = nxmA - a.nxmReserve;

    // transfer assets
    (bool ok,) = address(pool()).call{value: msg.value}("");
    require(ok, "CAPITAL_POOL_TRANSFER_FAILED");
    tokenController().mint(msg.sender, nxmOut);
  }

  function swapNxmForEth(uint nxmIn) internal returns (uint ethOut) {

    (uint _liquidity, uint nxmA, uint nxmB, uint _budget) = getReserves(block.timestamp);
    update();

    uint k = _liquidity * nxmB;
    b.nxmReserve = uint96(nxmB + nxmIn);
    a.nxmReserve = uint96(nxmB + nxmIn);

    ethReserve = k / b.nxmReserve;

    a.nxmReserve = uint96(nxmA * ethReserve / _liquidity);
    budget = _budget;
    lastSwapTimestamp = block.timestamp;
    ethOut = _liquidity - ethReserve;

    tokenController().burnFrom(msg.sender, nxmIn);
    // TODO: don't use hardcoded ETH in the payout
    pool().sendPayout(0, payable(msg.sender), ethOut);

    uint mcrETH = mcr().getMCR();
    uint _capacity = pool().getPoolValueInEth();

    // TODO add buffer into calculation
    if (_capacity < mcrETH) {
      revert("NO_SWAPS_IN_BUFFER_ZONE");
    }

  }

  /* ============== VIEWS ============= */

  function getReserves(uint timestamp) public view returns (uint currentLiquidity, uint nxmA, uint nxmB, uint currentBudget) {
    uint capital = pool().getPoolValueInEth();
    uint supply = tokenController().totalSupply();
    uint mcrEth = mcr().getMCR();

    // TODO: add buffer to calculation
    require(capital > mcrEth, "Insufficient capital to calculate new reserves");

    uint _liquidity = ethReserve;
    uint _budget = budget;
    uint elapsed = timestamp - lastSwapTimestamp;

    if (_liquidity < targetLiquidity) {
      // inject eth
      uint timeLeftOnBudget = _budget * LIQ_SPEED_PERIOD / fastLiquiditySpeed;
      uint maxInjectedAmount = targetLiquidity - _liquidity;
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

      _liquidity += injectedAmount;

    } else {
      // extract eth
      uint extractedAmount = Math.min(
        elapsed * a.liquiditySpeed * 1 ether / LIQ_SPEED_PERIOD,
        _liquidity - targetLiquidity // diff to target
      );

      _liquidity -= extractedAmount;
    }

    // pi = eth / nxm
    // pf = eth_new / nxm_new
    // pf = eth_new /(nxm * _liquidity / ethReserve)
    // nxm_new = nxm * _liquidity / ethReserve
    nxmA = a.nxmReserve * _liquidity / ethReserve;
    nxmB = b.nxmReserve * _liquidity / ethReserve;

    // apply ratchet above
    {
      // if cap*n*(1+r) > e*sup
      // if cap*n + cap*n*r > e*sup
      //   set n(new) = n(BV)
      // else
      //   set n(new) = n(R)
      uint r = elapsed * a.ratchetSpeed;
      uint bufferedCapitalA = capital * (PRICE_BUFFER_DENOMINATOR + PRICE_BUFFER) / PRICE_BUFFER_DENOMINATOR;

      if (bufferedCapitalA * nxmA + bufferedCapitalA * nxmA * r / RATCHET_PERIOD / RATCHET_DENOMINATOR > _liquidity * supply) {
        // use bv
        nxmA = _liquidity * supply / bufferedCapitalA;
      } else {
        // use ratchet
        uint nr_denom_addend = r * capital * nxmA / supply / RATCHET_PERIOD / RATCHET_DENOMINATOR;
        nxmA = _liquidity * nxmA / (_liquidity - nr_denom_addend);
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
        bufferedCapitalB * nxmB < _liquidity * supply + nxmB * capital * elapsed * b.ratchetSpeed / RATCHET_PERIOD / RATCHET_DENOMINATOR
      ) {
        nxmB = _liquidity * supply / bufferedCapitalB;
      } else {
        uint nr_denom_addend = nxmB * elapsed * b.ratchetSpeed * capital / supply / RATCHET_PERIOD / RATCHET_DENOMINATOR;
        nxmB = _liquidity * nxmB / (_liquidity + nr_denom_addend);
      }
    }

    return (_liquidity, nxmA, nxmB, _budget);
  }

  function getSpotPrices() external view returns (uint spotPriceA, uint spotPriceB) {
    (uint _liquidity, uint nxmA, uint nxmB,) = getReserves(block.timestamp);
    return (1 ether * _liquidity / nxmA, 1 ether * _liquidity / nxmB);
  }

  function getBookValue() public view returns (uint bookValue) {
    uint capital = pool().getPoolValueInEth();
    uint supply = tokenController().totalSupply();

    return capital / supply;
  }

  /* ========== ORACLE ========== */

  function observationIndexOf(uint timestamp) public pure returns (uint8 index) {
    uint epochPeriod = timestamp / PERIOD_SIZE;
    return uint8(epochPeriod % GRANULARITY);
  }

  function getLatestObservationInWindow() private view returns (Observation storage lastObservation) {
    uint lastObservationIndex = observationIndexOf(lastSwapTimestamp);
    return observations[lastObservationIndex];
  }

  function getFirstObservationInWindow() internal view returns (Observation memory firstObservation) {
    uint firstObservationStartTimestamp = (block.timestamp / PERIOD_SIZE - 2) * PERIOD_SIZE;
    uint firstObservationIndex = observationIndexOf(firstObservationStartTimestamp);
    firstObservation = observations[firstObservationIndex];

    if (firstObservationStartTimestamp > firstObservation.timestamp) {
      firstObservation = getLatestObservationInWindow();
    }
  }

//  local variables use uint
//  asign uint to storage variables when using them


  function calculateCumulativePrice(CumulativePriceCalculationProps memory props) internal view returns (uint priceCumulativeAbove, uint priceCumulativeBelow) {
    uint bookValue = getBookValue();
    uint lastObservationIndex = observationIndexOf(props.currentTimestamp);
    Observation memory lastObservation = observations[lastObservationIndex];
    CumulativePriceCalculationTimes memory times;

    uint spotPriceAbove = props.previousEthReserve / props.previousNxmA;
    uint spotPriceBelow = props.previousEthReserve / props.previousNxmB;

    times.secondsUntilBVAbove = (spotPriceAbove / bookValue - 1) * RATCHET_PERIOD / props.ratchetSpeedA / RATCHET_PERIOD;
    times.secondsUntilBVBelow = (1 - spotPriceBelow / bookValue) * RATCHET_PERIOD / props.ratchetSpeedB / RATCHET_PERIOD;

    times.timeElapsed = props.currentTimestamp - props.previousTimestamp;
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

  function update() internal {
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
      calculationProps.currentTimestamp = (block.timestamp / PERIOD_SIZE - i) * PERIOD_SIZE;
      observationIndex = observationIndexOf(calculationProps.currentTimestamp);
      (
        calculationProps.currentEthReserve,
        calculationProps.currentNxmA,
        calculationProps.currentNxmB,
      ) = getReserves(calculationProps.currentTimestamp);

      (
        uint _priceCumulativeAbove,
        uint _priceCumulativeBelow
      ) = calculateCumulativePrice(calculationProps);

      observations[observationIndex].priceCumulativeAbove = uint64(_priceCumulativeAbove % (2 ** 64));
      observations[observationIndex].priceCumulativeBelow = uint64(_priceCumulativeBelow % (2 ** 64));
      observations[observationIndex].timestamp = uint32(calculationProps.currentTimestamp);

      calculationProps.previousTimestamp = calculationProps.currentTimestamp;
      calculationProps.previousEthReserve = calculationProps.currentEthReserve;
      calculationProps.previousNxmA = calculationProps.currentNxmA;
      calculationProps.previousNxmB = calculationProps.currentNxmB;
    }

    calculationProps.currentTimestamp = block.timestamp;
    observationIndex = observationIndexOf(block.timestamp);
    (
      calculationProps.currentEthReserve,
      calculationProps.currentNxmA,
      calculationProps.currentNxmB,
    ) = getReserves(block.timestamp);

    (uint priceCumulativeAbove, uint priceCumulativeBelow) = calculateCumulativePrice(calculationProps);

    observations[observationIndex].priceCumulativeAbove = uint64(priceCumulativeAbove % (2 ** 64));
    observations[observationIndex].priceCumulativeBelow = uint64(priceCumulativeBelow % (2 ** 64));
    observations[observationIndex].timestamp = uint32(block.timestamp);
  }

  function internalPrice() external view returns (uint price) {
    Observation memory firstObservation = getFirstObservationInWindow();
    CumulativePriceCalculationProps memory calculationProps;

    calculationProps.previousEthReserve = ethReserve;
    calculationProps.previousNxmA = a.nxmReserve;
    calculationProps.previousNxmB = b.nxmReserve;
    calculationProps.previousTimestamp = lastSwapTimestamp;
    calculationProps.currentTimestamp = block.timestamp;
    calculationProps.ratchetSpeedA = a.ratchetSpeed;
    calculationProps.ratchetSpeedB = b.ratchetSpeed;

    (
      calculationProps.currentEthReserve,
      calculationProps.currentNxmA,
      calculationProps.currentNxmB,
    ) = getReserves(block.timestamp);

    //   10    11    12    13    14    15    16    17
    //   |-----|x----|--y--|-----|-----|--y--|-----|
    //      0     1     2     0     1     2     0

    (uint currentPriceCumulativeAbove, uint currentPriceCumulativeBelow) = calculateCumulativePrice(calculationProps);

    uint timeElapsed = block.timestamp - firstObservation.timestamp;

    uint twapPriceAbove = (currentPriceCumulativeAbove - firstObservation.priceCumulativeAbove) / timeElapsed;
    uint twapPricBelow = (currentPriceCumulativeBelow - firstObservation.priceCumulativeBelow) / timeElapsed;

    uint spotPriceAbove = calculationProps.currentEthReserve / calculationProps.currentNxmA;
    uint spotPriceBelow = calculationProps.currentEthReserve / calculationProps.currentNxmB;

    uint priceAbove = Math.min(twapPriceAbove, spotPriceAbove);
    uint priceBelow = Math.max(twapPricBelow, spotPriceBelow);

    uint bookValue = getBookValue();
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

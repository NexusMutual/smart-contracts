// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/IRamm.sol";
import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/IMCR.sol";
import "../../libraries/Math.sol";

contract Ramm is IRamm, MasterAwareV2 {
  Pool public a;
  Pool public b;
  /* ========== STATE VARIABLES ========== */

  uint public ethReserve;
  uint public lastSwapTimestamp;
  uint public budget;
  Observation[8] public aboveObservations;
  Observation[8] public belowObservations;

  /* ========== CONSTANTS ========== */

  uint public constant LIQ_SPEED_PERIOD = 1 days;
  uint public constant RATCHET_PERIOD = 1 days;
  uint public constant RATCHET_DENOMINATOR = 10_000;
  uint public constant PRICE_BUFFER = 100;
  uint public constant PRICE_BUFFER_DENOMINATOR = 10_000;


  /* =========== IMMUTABLES ========== */

  uint public immutable aggressiveLiquiditySpeed;
  uint public immutable targetLiquidity;
  uint public immutable periodSize;
  uint8 public immutable granularity;
  uint public immutable windowSize;

  /* ========== CONSTRUCTOR ========== */

  constructor(
  uint _targetLiquidity,
  uint _liquidity,
  uint _budget,
  uint _aggressiveLiquiditySpeed,
  uint liqSpeedOut,
  uint liqSpeedIn,
  uint ratchetSpeedA,
  uint ratchetSpeedB,
  uint spotPriceA,
  uint spotPriceB
  ) {
    targetLiquidity = _targetLiquidity;
    aggressiveLiquiditySpeed = _aggressiveLiquiditySpeed;

    windowSize = 14400; // 4 hours
    granularity = 8;
    periodSize = 1800; // windowSize / granularity;

    ethReserve = _liquidity;
    budget = _budget;
    lastSwapTimestamp = block.timestamp;

    a.nxmReserve = uint96(_liquidity * 1 ether / spotPriceA);
    a.liquiditySpeed  = uint16(liqSpeedOut);
    a.ratchetSpeed  = uint16(ratchetSpeedA);

    b.nxmReserve = uint96(_liquidity * 1 ether / spotPriceB);
    b.liquiditySpeed  = uint16(liqSpeedIn);
    b.ratchetSpeed  = uint16(ratchetSpeedB);
  }

  function swap(uint nxmIn) external payable {

    require(msg.value == 0 || nxmIn == 0, "ONE_INPUT_ONLY");
    require(msg.value > 0 || nxmIn > 0, "ONE_INPUT_REQUIRED");

    msg.value > 0
    ? swapEthForNxm(msg.value)
    : swapNxmForEth(nxmIn);
  }

  function swapEthForNxm(uint ethIn) internal returns (uint nxmOut) {
    (uint _liquidity, uint96 nxmA, uint96 nxmB, uint _budget) = getReserves();
    uint k = _liquidity * nxmA;
    ethReserve = _liquidity + ethIn;

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
    update(true, _liquidity, nxmA, nxmB);
  }

  function swapNxmForEth(uint nxmIn) internal returns (uint ethOut) {

    (uint _liquidity, uint96 nxmA, uint96 nxmB, uint _budget) = getReserves();

    uint k = _liquidity * nxmB;
    b.nxmReserve = uint96(nxmB  + nxmIn);
    a.nxmReserve = uint96(nxmB  + nxmIn);

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

    update(false, _liquidity, nxmA, nxmB);
  }

  function addBudget(uint amount) external override onlyGovernance {
    budget += amount;
  }

  /* ============== VIEWS ============= */

  function getReserves() public view returns (uint currentLiquidity, uint96 nxmA, uint96 nxmB, uint currentBudget) {
    uint capital = pool().getPoolValueInEth();
    uint supply = tokenController().totalSupply();
    uint mcrEth = mcr().getMCR();

    // TODO: add buffer to calculation
    require(capital > mcrEth, "Insufficient capital to calculate new reserves");

    uint _liquidity = ethReserve;
    uint _budget = budget;
    uint elapsed = block.timestamp - lastSwapTimestamp;

    if (_liquidity < targetLiquidity) {
      // inject eth
      uint timeLeftOnBudget = _budget * LIQ_SPEED_PERIOD / aggressiveLiquiditySpeed;
      uint maxInjectedAmount = targetLiquidity - _liquidity;
      uint injectedAmount;

      if (elapsed <= timeLeftOnBudget) {

        injectedAmount = Math.min(
          elapsed * aggressiveLiquiditySpeed / LIQ_SPEED_PERIOD,
          maxInjectedAmount
        );

        _budget -= injectedAmount;

      } else {

        uint injectedAmountOnBudget = timeLeftOnBudget * aggressiveLiquiditySpeed / LIQ_SPEED_PERIOD;
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
    nxmA = uint96(a.nxmReserve * _liquidity / ethReserve);
    nxmB = uint96(b.nxmReserve * _liquidity / ethReserve);

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
        nxmA = uint96(_liquidity * supply / bufferedCapitalA);
      } else {
        // use ratchet
        uint nr_denom_addend = r * capital * nxmA / supply / RATCHET_PERIOD / RATCHET_DENOMINATOR;
        nxmA = uint96(_liquidity * nxmA / (_liquidity - nr_denom_addend));
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
        nxmB = uint96(_liquidity * supply / bufferedCapitalB);
      } else {
        uint nr_denom_addend = nxmB * elapsed * b.ratchetSpeed * capital / supply / RATCHET_PERIOD / RATCHET_DENOMINATOR;
        nxmB = uint96(_liquidity * nxmB / (_liquidity + nr_denom_addend));
      }
    }

    return (_liquidity, nxmA, nxmB, _budget);
  }

  function getSpotPrices() external view returns (uint spotPriceA, uint spotPriceB) {
    (uint _liquidity, uint nxmA, uint nxmB, ) = getReserves();
    return (1 ether * _liquidity / nxmA, 1 ether * _liquidity / nxmB);
  }

  /* ========== ORACLE ========== */

  function currentBlockTimestamp() internal view returns (uint32) {
    return uint32(block.timestamp % 2 ** 32);
  }

  function observationIndexOf(uint timestamp) public view returns (uint8 index) {
    uint epochPeriod = timestamp / periodSize;
    return uint8(epochPeriod % granularity);
  }

  function getLatestObservationInWindow(bool above) private view returns (Observation storage lastObservation) {
    Observation[8] storage observations = above ? aboveObservations : belowObservations;

    uint8 lastObservationIndex = observationIndexOf(block.timestamp - periodSize);

    lastObservation = observations[lastObservationIndex];
    uint epochStartTimestamp = (block.timestamp / periodSize - 1) * periodSize;
    if (lastObservation.timestamp > epochStartTimestamp) {
      return lastObservation;
    }
    for (uint i = 0; i < granularity; i++) {
      if (observations[i].timestamp > lastObservation.timestamp) {
        lastObservation = observations[i];
      }
    }
  }


  function currentCumulativePrice(
    bool above,
    uint _ethReserve,
    uint96 _nxmA,
    uint96 _nxmB
  ) internal view returns (uint priceCumulative) {
    uint32 blockTimestamp = currentBlockTimestamp();
    Observation storage lastObservation = getLatestObservationInWindow(above);
    uint96 nxmReserve = above ? _nxmA : _nxmB;

    // subtraction overflow is desired
    uint32 timeElapsed = blockTimestamp - lastObservation.timestamp;

    if (lastObservation.timestamp == blockTimestamp) {
      return lastObservation.priceCumulative;
    }
    priceCumulative = lastObservation.priceCumulative + (_ethReserve / nxmReserve) * timeElapsed;
  }


  function update(
    bool above,
    uint _ethReserve,
    uint96 _nxmA,
    uint96 _nxmB
  ) internal {
    uint8 observationIndex = observationIndexOf(block.timestamp);
    Observation storage observation = above ? aboveObservations[observationIndex] : belowObservations[observationIndex];

    // we only want to commit updates once per period (i.e. windowSize / granularity)
    uint timeElapsed = block.timestamp - observation.timestamp;
    if (timeElapsed > periodSize) {
      uint priceCumulative = currentCumulativePrice(above, _ethReserve, _nxmA, _nxmB);
      observation.timestamp = currentBlockTimestamp();
      observation.priceCumulative = uint80(priceCumulative);
    }
  }

  function consult(
    bool above,
    uint _ethReserve,
    uint96 _nxmA,
    uint96 _nxmB,
    uint amount
  ) external view returns (uint amountOut) {
    Observation storage lastObservation = getLatestObservationInWindow(above);

    uint timeElapsed = block.timestamp - lastObservation.timestamp;
    require(timeElapsed <= windowSize, 'Missing historical observation');
    require(timeElapsed >= windowSize - periodSize * 2, 'Unexpected time elapsed');

    uint priceCumulative = currentCumulativePrice(above, _ethReserve, _nxmA, _nxmB);
    return computeAmountOut(lastObservation.priceCumulative, priceCumulative, timeElapsed, amount);
  }

  function computeAmountOut(
    uint priceCumulativeStart,
    uint priceCumulativeEnd,
    uint timeElapsed,
    uint amountIn
  ) private pure returns (uint amountOut) {
    uint priceAverage = (priceCumulativeEnd - priceCumulativeStart) / timeElapsed;
    return priceAverage * amountIn;
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
  }
}

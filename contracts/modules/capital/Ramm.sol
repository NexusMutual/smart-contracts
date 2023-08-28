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

  /* ========== STATE VARIABLES ========== */

  Pool public a;
  Pool public b;
  uint public lastSwapTimestamp;
  uint public ethReserve;
  uint public budget;
  Observation[3] public observations;

  /* ========== CONSTANTS ========== */

  uint public constant LIQ_SPEED_PERIOD = 1 days;
  uint public constant RATCHET_PERIOD = 1 days;
  uint public constant RATCHET_DENOMINATOR = 10_000;
  uint public constant PRICE_BUFFER = 100;
  uint public constant PRICE_BUFFER_DENOMINATOR = 10_000;
  uint public constant WINDOW_SIZE = 172_800; // 2 days
  uint public constant GRANULARITY = 2;
  uint public constant PERIOD_SIZE = 86_400; // day


  /* =========== IMMUTABLES ========== */

  uint public immutable aggressiveLiquiditySpeed;
  uint public immutable targetLiquidity;

  /* ========== CONSTRUCTOR ========== */

  // TODO: all in-memory variables, immutables and constants should use uint256

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
    (uint _liquidity, uint nxmA, uint nxmB, uint _budget) = getReserves();
    update(_liquidity, nxmA, nxmB);
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
  }

  function swapNxmForEth(uint nxmIn) internal returns (uint ethOut) {

    (uint _liquidity, uint nxmA, uint nxmB, uint _budget) = getReserves();
    update(_liquidity, nxmA, nxmB);

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

  }

  function addBudget(uint amount) external override onlyGovernance {
    budget += amount;
  }

  /* ============== VIEWS ============= */

  function getReserves() public view returns (uint currentLiquidity, uint nxmA, uint nxmB, uint currentBudget) {
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
    (uint _liquidity, uint nxmA, uint nxmB, ) = getReserves();
    return (1 ether * _liquidity / nxmA, 1 ether * _liquidity / nxmB);
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

//  local variables use uint
//  asign uint to storage variables when using them


  function calculateCumulativePrice(
    uint _oldEthReserve,
    uint _newEthReserve,
    uint nxmA,
    uint nxmB,
    uint _lastSwapTimestamp,
    uint rachetSpeed,
    uint timestamp
  ) internal pure returns (uint priceCumulativeAbove, uint priceCumulativeBelow) {

    // depending if it's injection or extraction this can be negative or positive number
    uint ratchetSeconds = (_newEthReserve - _oldEthReserve) / rachetSpeed;
    uint bvSeconds;

    if (ratchetSeconds > 0) {
      bvSeconds = timestamp - _lastSwapTimestamp - ratchetSeconds;
    } else {
      bvSeconds = timestamp - _lastSwapTimestamp + ratchetSeconds;
    }

    priceCumulativeAbove = (ratchetSeconds * _oldEthReserve + rachetSpeed * (ratchetSeconds * (ratchetSeconds + 1) / 2)) / nxmA + (_newEthReserve / nxmA) * bvSeconds;
    priceCumulativeBelow = (ratchetSeconds * _oldEthReserve + rachetSpeed * (ratchetSeconds * (ratchetSeconds + 1) / 2)) / nxmB + (_newEthReserve / nxmB) * bvSeconds;
  }

  function update(uint _latestEthReserve, uint nxmA, uint nxmB) internal {
    uint _ethReserve = ethReserve;
    uint _lastSwapTimestamp = lastSwapTimestamp;
    uint missingPeriods = Math.max((block.timestamp - _lastSwapTimestamp) / PERIOD_SIZE, 2);
    uint rachetSpeed = _latestEthReserve > _ethReserve ? b.ratchetSpeed : a.ratchetSpeed;

    for (uint i = missingPeriods; i > 0 ; i--) {
      uint timestamp = (block.timestamp / PERIOD_SIZE - i) * PERIOD_SIZE;
      uint previousObservationIndex = observationIndexOf(timestamp);
      uint _newEthReserve = _ethReserve + (timestamp - _lastSwapTimestamp) * rachetSpeed;

      if (_latestEthReserve > _ethReserve && _newEthReserve > _latestEthReserve) {
        _newEthReserve = _lastSwapTimestamp;
      }

      if (_latestEthReserve < _ethReserve && _newEthReserve < _latestEthReserve) {
        _newEthReserve = _lastSwapTimestamp;
      }

      (uint _priceCumulativeAbove, uint _priceCumulativeBelow) = calculateCumulativePrice(
        _ethReserve,
        _newEthReserve,
        nxmA,
        nxmB,
        _lastSwapTimestamp,
        rachetSpeed,
        timestamp
      );

      observations[previousObservationIndex].priceCumulativeAbove = uint64(_priceCumulativeAbove % (2 ** 64));
      observations[previousObservationIndex].priceCumulativeBelow = uint64(_priceCumulativeBelow % (2 ** 64));
      observations[previousObservationIndex].timestamp = uint32(timestamp);
      _lastSwapTimestamp = timestamp;
      _ethReserve = _newEthReserve;
    }

    (uint priceCumulativeAbove, uint priceCumulativeBelow) = calculateCumulativePrice(
      _ethReserve,
      _latestEthReserve,
      nxmA,
      nxmB,
      _lastSwapTimestamp,
      rachetSpeed,
      block.timestamp
    );

    uint observationIndex = observationIndexOf(block.timestamp);
    observations[observationIndex].priceCumulativeAbove = uint64(priceCumulativeAbove % (2 ** 64));
    observations[observationIndex].priceCumulativeBelow = uint64(priceCumulativeBelow % (2 ** 64));
    observations[observationIndex].timestamp = uint32(block.timestamp);
  }

//  function consult(
//    bool above,
//    uint _ethReserve,
//    uint96 _nxmA,
//    uint96 _nxmB,
//    uint amount
//  ) external view returns (uint amountOut) {
//    // TODO: use the latest one from the previous
//    uint previousObservationIndex = observationIndexOf(block.timestamp - PERIOD_SIZE);
//    Observation memory previousObservation = observations[previousObservationIndex];
//    uint epochStartTimestamp = (block.timestamp / PERIOD_SIZE - 1) * PERIOD_SIZE;
//
//    //   10    11    12    13    14    15    16    17
//    //   |-----|-----|--x--|-----|-----|--y--|-----|
//    //      0     1     2     0     1     2     0
//
//    if (epochStartTimestamp > previousObservationIndex) {
//      (uint _oldEthReserve, uint _oldNxmA, uint _oldNxmB) = getReserves();
//      (uint previousPriceCumulativeAbove, uint previousPriceCumulativeBelow) = calculateCumulativePrice(
//        _oldEthReserve,
//        _oldNxmA,
//        _oldNxmB,
//        previousEpochStart
//      );
//      uint priceCumulative = calculateCumulativePrice(_ethReserve, _nxmA, _nxmB, epochStartTimestamp);
//    }
//
//    uint priceCumulative = calculateCumulativePrice(_ethReserve, _nxmA, _nxmB, block.timestamp);
//    return (priceCumulative - lastObservation.priceCumulative) / timeElapsed;
//  }

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

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


  // Parameters configurable through governance.
  Configuration public config;
  Pool public a;
  Pool public b;
  /* ========== STATE VARIABLES ========== */

  uint public liquidity;
  uint public lastSwapTimestamp;
  uint public budget;
  uint public twapDuration;
  uint public oracleBuffer;

  /* ========== CONSTANTS ========== */

  uint public constant LIQ_SPEED_PERIOD = 1 days;
  uint public constant RATCHET_PERIOD = 1 days;
  uint public constant RATCHET_DENOMINATOR = 10_000;
  uint public constant PRICE_BUFFER = 100;
  uint public constant PRICE_BUFFER_DENOMINATOR = 10_000;

  /* ========== CONSTRUCTOR ========== */

  constructor(
  Configuration memory _config,
  uint _liquidity,
  uint _budget,
  uint liqSpeedOut,
  uint liqSpeedIn,
  uint ratchetSpeedA,
  uint ratchetSpeedB,
  uint spotPriceA,
  uint spotPriceB
  ) {
    config = _config;

    liquidity = _liquidity;
    budget = _budget;
    lastSwapTimestamp = block.timestamp;

    a.nxm = _liquidity * 1 ether / spotPriceA;
    a.liquiditySpeed  = liqSpeedOut;
    a.ratchetSpeed  = ratchetSpeedA;

    b.nxm = _liquidity * 1 ether / spotPriceB;
    b.liquiditySpeed  = liqSpeedIn;
    b.ratchetSpeed  = ratchetSpeedB;
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
    uint k = _liquidity * nxmA;
    liquidity = _liquidity + ethIn;

    // edge case: bellow goes over bv due to eth-dai price changing
    a.nxm = k / liquidity;
    b.nxm = nxmB * liquidity / _liquidity;
    budget = _budget;
    lastSwapTimestamp = block.timestamp;
    nxmOut = nxmA - a.nxm;

    // transfer assets
    (bool ok,) = address(pool()).call{value: msg.value}("");
    require(ok, "CAPITAL_POOL_TRANSFER_FAILED");
    tokenController().mint(msg.sender, nxmOut);
  }

  function swapNxmForEth(uint nxmIn) internal returns (uint ethOut) {

    (uint _liquidity, uint nxmA, uint nxmB, uint _budget) = getReserves();

    uint k = _liquidity * nxmB;
    b.nxm = nxmB  + nxmIn;
    a.nxm = nxmB  + nxmIn;

    liquidity = k / b.nxm;

    a.nxm = nxmA * liquidity / _liquidity;
    budget = _budget;
    lastSwapTimestamp = block.timestamp;
    ethOut = _liquidity - liquidity;

    tokenController().burnFrom(msg.sender, nxmIn);
     // TODO: don't use hardcoded ETH in the payout
     pool().sendPayout(0, payable(msg.sender), ethOut);

    uint mcrETH = mcr().getMCR();
    uint _capacity = pool().getPoolValueInEth();

    // TODO add buffer into calculation
    if (_capacity < mcrETH) {
      revert("NO_SWAPS_IN_BUFFER_ZONE");
    }

    return ethOut;
  }

  function updateUintParameters(
    UintParams[] calldata paramNames,
    uint[] calldata values
  ) external override onlyGovernance {
    Configuration memory newConfig = config;
    for (uint i = 0; i < paramNames.length; i++) {
      if (paramNames[i] == UintParams.targetLiquidity) {
        newConfig.targetLiquidity = uint(values[i]);
        continue;
      }
      if (paramNames[i] == UintParams.twapDuration) {
        newConfig.twapDuration = uint(values[i]);
        continue;
      }
      if (paramNames[i] == UintParams.aggressiveLiqSpeed) {
        newConfig.aggressiveLiqSpeed = uint(values[i]);
        continue;
      }
      if (paramNames[i] == UintParams.oracleBuffer) {
        newConfig.oracleBuffer = uint(values[i]);
        continue;
      }
    }
    config = newConfig;
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

    uint _liquidity = liquidity;
    uint _budget = budget;
    uint elapsed = block.timestamp - lastSwapTimestamp;

    if (_liquidity < config.targetLiquidity) {
      // inject liquidity
      uint timeLeftOnBudget = _budget * LIQ_SPEED_PERIOD / config.aggressiveLiqSpeed;
      uint maxInjectedAmount = config.targetLiquidity - _liquidity;
      uint injectedAmount;

      if (elapsed <= timeLeftOnBudget) {

        injectedAmount = Math.min(
          elapsed * config.aggressiveLiqSpeed / LIQ_SPEED_PERIOD,
          maxInjectedAmount
        );

        _budget -= injectedAmount;

      } else {

        uint injectedAmountOnBudget = timeLeftOnBudget * config.aggressiveLiqSpeed / LIQ_SPEED_PERIOD;
        _budget = maxInjectedAmount < injectedAmountOnBudget ? _budget - maxInjectedAmount : 0;

        uint injectedAmountWoBudget = (elapsed - timeLeftOnBudget) * b.liquiditySpeed / LIQ_SPEED_PERIOD;
        injectedAmount = Math.min(maxInjectedAmount, injectedAmountOnBudget + injectedAmountWoBudget);
      }

      _liquidity += injectedAmount;

    } else {
      // extract liquidity
      uint extractedAmount = Math.min(
        elapsed * a.liquiditySpeed / LIQ_SPEED_PERIOD,
        _liquidity - config.targetLiquidity // diff to target
      );

      _liquidity -= extractedAmount;
    }

    // pi = eth / nxm
    // pf = eth_new / nxm_new
    // pf = eth_new /(nxm * _liquidity / liquidity)
    // nxm_new = nxm * _liquidity / liquidity
    nxmA = a.nxm * _liquidity / liquidity;
    nxmB = b.nxm * _liquidity / liquidity;

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

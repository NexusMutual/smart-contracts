// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "forge-std/console.sol";
import "../../libraries/Math.sol";
import "./CapitalPool.sol";
import "./NXM.sol";

contract Ramm {

  struct Pool {
    uint eth;
    uint nxm;
    uint targetLiquidity;
    uint liquiditySpeed;
    uint ratchetSpeed;
    uint lastSwapTimestamp;
  }

  Pool public a;
  Pool public b;

  NXM public nxm;
  CapitalPool public capitalPool;

  uint public constant LIQUIDITY_SPEED_PERIOD = 1 days;
  uint public constant RATCHET_PERIOD = 1 days;
  uint public constant RATCHET_DENOMINATOR = 10_000;

  uint public constant liqZone = 1_000 ether;
  uint public constant gapZone = 1_000 ether;
  uint public constant prcZone = 1_000 ether;
  uint public constant lowZone = 1_000 ether;

  constructor (NXM _nxm, CapitalPool _capitalPool) {
    // middle price: 0.015 ether
    uint price_a = 0.02 ether;
    uint price_b = 0.01 ether;

    a.eth = 2500 ether;
    a.nxm = a.eth * 1 ether / price_a;
    a.targetLiquidity = 2500 ether;
    a.liquiditySpeed = 100 ether;
    a.ratchetSpeed = 400;
    a.lastSwapTimestamp = block.timestamp;

    b.eth = 2500 ether;
    b.nxm = b.eth * 1 ether / price_b;
    b.targetLiquidity = 2500 ether;
    b.liquiditySpeed = 100 ether;
    b.ratchetSpeed = 400;
    b.lastSwapTimestamp = block.timestamp;

    nxm = _nxm;
    capitalPool = _capitalPool;
  }

  function getPriceTarget(uint capital, uint mcr) public view returns (uint) {

    uint limit = mcr + lowZone;

    if (capital < limit) {
      revert("MOVING_TARGET_NOT_IMPLEMENTED");
    }

    limit += prcZone;

    if (capital < limit) {
      revert("PRICE_TRANSITION_NOT_IMPLEMENTED");
    }

    // book value
    return capital / nxm.totalSupply();
  }

  function swap(uint nxmIn) external payable {

    require(msg.value == 0 || nxmIn == 0, "ONE_INPUT_ONLY");

    msg.value > 0
      ? swapEthForNxm(msg.value, msg.sender)
      : swapNxmForEth(nxmIn, msg.sender);
  }

  function swapEthForNxm(uint ethIn, address to) internal returns (uint /*nxmOut*/) {

    uint capital = capitalPool.getPoolValueInEth();
    uint mcr = capitalPool.mcr();

    uint elapsed = block.timestamp - a.lastSwapTimestamp;
    uint maxExtractedAmount = elapsed * a.liquiditySpeed / LIQUIDITY_SPEED_PERIOD;
    uint extractedAmount = Math.min(
      maxExtractedAmount,
      a.eth > a.targetLiquidity ? a.eth - a.targetLiquidity : 0 // extraLiquidity
    );

    uint ethReserve = a.eth - extractedAmount;

    uint r = getPriceTarget(capital, mcr) * elapsed * a.ratchetSpeed / RATCHET_PERIOD / RATCHET_DENOMINATOR;
    uint nxmReserve = ethReserve * a.nxm / (ethReserve - r * a.nxm);

    uint ethReserveNew = ethReserve + ethIn;
    uint nxmReserveNew = (ethReserve * nxmReserve) / ethReserveNew;

    uint nxmOut = nxmReserve - nxmReserveNew;

    a.nxm = nxmReserveNew;
    a.eth = ethReserveNew;
    a.lastSwapTimestamp = block.timestamp;

    // todo: update b pool

    nxm.mint(to, nxmOut);

    // send eth to capital pool
    (bool ok,) = address(capitalPool).call{value: msg.value}("");
    require(ok, "CAPITAL_POOL_TRANSFER_FAILED");

    return nxmOut;
  }

  function swapNxmForEth(uint nxmIn, address to) internal returns (uint ethOut) {

    uint capital = capitalPool.getPoolValueInEth();
    uint mcr = capitalPool.mcr();

    uint elapsed = block.timestamp - b.lastSwapTimestamp;
    uint maxInjectedAmount = elapsed * b.liquiditySpeed / LIQUIDITY_SPEED_PERIOD;
    uint injectedAmount = Math.min(
      maxInjectedAmount,
      b.targetLiquidity - b.eth // missingLiquidity
    );
  }

}

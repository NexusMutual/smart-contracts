// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "forge-std/console.sol";
import "solmate/src/utils/LibString.sol";

import "../../libraries/Math.sol";
import "./CapitalPool.sol";
import "./NXM.sol";

  function format(uint n, uint decimals) pure returns (string memory) {
    string memory result;
    uint decimalsUsed = 0;
    uint fraction = n % 10 ** decimals;
    bool rightmost = true;

    while (decimalsUsed++ < decimals) {
      uint digit = fraction % 10;
      rightmost = rightmost && digit == 0;
      fraction /= 10;

      if (rightmost && digit == 0 && decimalsUsed != decimals) {
        continue;
      }

      result = string(abi.encodePacked(digit + 48, result));
    }

    return string(abi.encodePacked(LibString.toString(n / 10 ** decimals), ".", result));
  }

  function format(uint n) pure returns (string memory) {
    return format(n, 18);
  }

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
    // middle price: 0.02 ether
    // bv          : 0.0214 ether
    uint price_a = 0.03 ether;
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

  function getPriceTarget(uint capital, uint mcr, uint supply) public pure returns (uint) {

    uint limit = mcr + lowZone;

    if (capital < limit) {
      revert("MOVING_TARGET_NOT_IMPLEMENTED");
    }

    limit += prcZone;

    if (capital < limit) {
      revert("PRICE_TRANSITION_NOT_IMPLEMENTED");
    }

    return 1e18 * capital / supply;
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
    uint supply = nxm.totalSupply();

    uint elapsed = block.timestamp - a.lastSwapTimestamp;
    uint maxExtractedAmount = elapsed * a.liquiditySpeed / LIQUIDITY_SPEED_PERIOD;
    uint extractedAmount = Math.min(
      maxExtractedAmount,
      a.eth > a.targetLiquidity ? a.eth - a.targetLiquidity : 0 // extraLiquidity
    );

    console.log("BV: %s", format(1e18 * capital / supply));
    uint r = getPriceTarget(capital, mcr, supply) * elapsed * a.ratchetSpeed;
    uint ethReserve = a.eth - extractedAmount;
    uint nxmReserve;

    {
      bool useRatchet = capital * a.nxm + b.nxm * capital * r / RATCHET_PERIOD / RATCHET_DENOMINATOR / 1e18 > ethReserve * supply;
      nxmReserve = useRatchet
        ? ethReserve * a.nxm / (ethReserve - b.nxm * capital * r / supply / RATCHET_PERIOD / RATCHET_DENOMINATOR / 1e18)
        : ethReserve * supply / capital;
    }

    console.log("Initial nxm reserve: %s NXM", format(a.nxm));
    console.log("Ratchet nxm reserve: %s NXM", format(nxmReserve));

    uint nxmOut;
    {
      uint ethReserveNew = ethReserve + ethIn;
      uint nxmReserveNew = (ethReserve * nxmReserve) / ethReserveNew;
      nxmOut = nxmReserve - nxmReserveNew;

      a.nxm = nxmReserveNew;
      a.eth = ethReserveNew;
      a.lastSwapTimestamp = block.timestamp;
    }

    // todo: update b pool

    // transfer assets
    (bool ok,) = address(capitalPool).call{value: msg.value}("");
    require(ok, "CAPITAL_POOL_TRANSFER_FAILED");
    nxm.mint(to, nxmOut);

    return nxmOut;
  }

  function swapNxmForEth(uint nxmIn, address to) internal returns (uint /*ethOut*/) {

    uint capital = capitalPool.getPoolValueInEth();
    uint mcr = capitalPool.mcr();
    uint supply = nxm.totalSupply();

    uint elapsed = block.timestamp - b.lastSwapTimestamp;
    uint injectedAmount = Math.min(
      elapsed * b.liquiditySpeed / LIQUIDITY_SPEED_PERIOD,
      b.targetLiquidity - b.eth // diff to target
    );

    console.log("Injected amount: %s ETH", format(injectedAmount));

    console.log("BV: %s", format(1e18 * capital / supply));
    uint R = getPriceTarget(capital, mcr, supply) * elapsed * b.ratchetSpeed;
    uint ethReserve = b.eth + injectedAmount;
    bool useRatchet = capital * b.nxm > ethReserve * supply + b.nxm * capital * elapsed * b.ratchetSpeed / RATCHET_PERIOD / RATCHET_DENOMINATOR;

    uint nxmReserve = useRatchet
      ? ethReserve * b.nxm / (ethReserve + R * b.nxm * capital / supply / RATCHET_PERIOD / RATCHET_DENOMINATOR / 1e18)
      : ethReserve * supply / capital;

    console.log("Initial nxm reserve: %s NXM", format(b.nxm));
    console.log("Ratchet nxm reserve: %s NXM", format(nxmReserve));

    uint ethOut;
    {
      uint nxmReserveNew = nxmReserve + nxmIn;
      uint ethReserveNew = (ethReserve * nxmReserve) / nxmReserveNew;
      ethOut = ethReserve - ethReserveNew;

      b.nxm = nxmReserveNew;
      b.eth = ethReserveNew;
      b.lastSwapTimestamp = block.timestamp;
    }

    // todo: update a pool

    // transfer assets
    nxm.burn(msg.sender, nxmIn);
    capitalPool.sendEth(payable(to), ethOut);

    return ethOut;
  }

  function getSpotPriceB() external view returns (uint /*ethPerNxm*/) {
    uint capital = capitalPool.getPoolValueInEth();
    uint mcr = capitalPool.mcr();
    uint supply = nxm.totalSupply();

    uint elapsed = block.timestamp - b.lastSwapTimestamp;
    uint injectedAmount = Math.min(
      elapsed * b.liquiditySpeed / LIQUIDITY_SPEED_PERIOD,
      b.targetLiquidity - b.eth // missingLiquidity
    );

    uint ethReserve = b.eth + injectedAmount;
    uint target = getPriceTarget(capital, mcr, supply);
    uint nxmReserve;

    // TODO: might need `nxm_l` instead of `b.nxm` due to injected liquidity

    // check if we should be using the ratchet or the book value price using:
    // Nbv > Nr <=>
    // ... <=>
    // cap * n < e * sup + r * cap * n
    if (
      capital * b.nxm < ethReserve * supply + b.nxm * capital * elapsed * b.ratchetSpeed / RATCHET_PERIOD / RATCHET_DENOMINATOR
    ) {
      nxmReserve = ethReserve * supply / capital;
    } else {
      uint r = elapsed * b.ratchetSpeed;
      uint nr_denom_addend = b.nxm * r * target / RATCHET_PERIOD / RATCHET_DENOMINATOR / 1e18;
      nxmReserve = ethReserve * b.nxm / (ethReserve + nr_denom_addend);
    }

    console.log("BV          : %s ETH/NXM", format(1e18 * capital / supply));

    return 1 ether * ethReserve / nxmReserve;
  }

}

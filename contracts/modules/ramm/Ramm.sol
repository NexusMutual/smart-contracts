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
    uint nxm;
    uint liqSpeed;
    uint ratchetSpeed;
  }

  Pool public a;
  Pool public b;

  uint public eth;
  uint public targetLiquidity;
  uint public lastSwapTimestamp;
  uint public budget;
  uint public aggressiveLiqSpeed;

  NXM public nxm;
  CapitalPool public capitalPool;

  uint public constant LIQ_SPEED_PERIOD = 1 days;
  uint public constant RATCHET_PERIOD = 1 days;
  uint public constant RATCHET_DENOMINATOR = 10_000;
  uint public constant BUFFER_ZONE = 1_000 ether;
  uint public constant PRICE_BUFFER = 100;
  uint public constant PRICE_BUFFER_DENOMINATOR = 10_000;

  constructor (NXM _nxm, CapitalPool _capitalPool) {
    // middle price: 0.02 ether
    // bv          : 0.0214 ether
    uint price_a = 0.03 ether;
    uint price_b = 0.01 ether;

    eth = 2000 ether;
    targetLiquidity = 2500 ether;
    lastSwapTimestamp = block.timestamp;

    budget = 250 ether;
    aggressiveLiqSpeed = 200 ether;

    a.nxm = eth * 1 ether / price_a;
    a.liqSpeed = 100 ether;
    a.ratchetSpeed = 400;

    b.nxm = eth * 1 ether / price_b;
    b.liqSpeed = 100 ether;
    b.ratchetSpeed = 400;

    nxm = _nxm;
    capitalPool = _capitalPool;
  }

  function swap(uint nxmIn) external payable {

    require(msg.value == 0 || nxmIn == 0, "ONE_INPUT_ONLY");
    require(msg.value > 0 || nxmIn > 0, "ONE_INPUT_REQUIRED");

    msg.value > 0
      ? swapEthForNxm(msg.value, msg.sender)
      : swapNxmForEth(nxmIn, msg.sender);
  }

  function swapEthForNxm(uint ethIn, address to) internal returns (uint nxmOut) {
    (uint eth_new, uint nxm_a, uint nxm_b, uint new_budget) = getReserves();
    uint k = eth_new * nxm_a;
    eth = eth_new + ethIn;

    b.nxm = nxm_b * eth / eth_new;
    a.nxm = k / eth;
    budget = new_budget;
    lastSwapTimestamp = block.timestamp;
    nxmOut = nxm_a - a.nxm;

    console.log("SWAP %s ETH for: %s NXM", format(ethIn), format(nxmOut));

    nxm.mint(to, nxmOut);
    payable(capitalPool).transfer(msg.value);
    /*
    uint capital = capitalPool.getPoolValueInEth();
    uint mcr = capitalPool.mcr();
    uint supply = nxm.totalSupply();

    uint elapsed = block.timestamp - lastSwapTimestamp;
    uint maxExtractedAmount = elapsed * a.liqSpeed / LIQ_SPEED_PERIOD;
    uint extractedAmount = Math.min(
      maxExtractedAmount,
      eth > a.targetLiquidity ? eth - a.targetLiquidity : 0 // extraLiquidity
    );

    console.log("BV: %s", format(1e18 * capital / supply));
    uint r = 1e18 * capital / supply * elapsed * a.ratchetSpeed;
    uint ethReserve = eth - extractedAmount;
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
      eth = ethReserveNew;
      lastSwapTimestamp = block.timestamp;
    }

    // todo: update b pool

    // transfer assets
    (bool ok,) = address(capitalPool).call{value: msg.value}("");
    require(ok, "CAPITAL_POOL_TRANSFER_FAILED");
    nxm.mint(to, nxmOut);

    return nxmOut;
    */

//    return 0;
  }

  function getReserves() public view returns (uint eth_new, uint nxm_a, uint nxm_b, uint new_budget) {
    uint capital = capitalPool.getPoolValueInEth();
    uint supply = nxm.totalSupply();

    // uint mcr = capitalPool.mcr();
    // TODO: check for capital > mcr + buffer
    // oracle

    eth_new = eth;
    new_budget = budget;
    uint elapsed = block.timestamp - lastSwapTimestamp;

    if (eth_new < targetLiquidity) {
      // inject liquidity
      uint timeLeftOnBudget = budget * LIQ_SPEED_PERIOD / aggressiveLiqSpeed;
      uint maxInjectedAmount = targetLiquidity - eth_new;
      uint injectedAmount;

      if (elapsed <= timeLeftOnBudget) {

        injectedAmount = Math.min(
          elapsed * aggressiveLiqSpeed / LIQ_SPEED_PERIOD,
          maxInjectedAmount
        );

        new_budget -= injectedAmount;

      } else {

        uint injectedAmountOnBudget = timeLeftOnBudget * aggressiveLiqSpeed / LIQ_SPEED_PERIOD;
        new_budget = maxInjectedAmount < injectedAmountOnBudget ? new_budget - maxInjectedAmount : 0;

        uint injectedAmountWoBudget = (elapsed - timeLeftOnBudget) * b.liqSpeed / LIQ_SPEED_PERIOD;
        injectedAmount = Math.min(maxInjectedAmount, injectedAmountOnBudget + injectedAmountWoBudget);
      }

      if (injectedAmount > 0) {
        console.log("Injected amount: %s ETH", format(injectedAmount));
      }

      eth_new += injectedAmount;

    } else {
      // extract liquidity
      uint extractedAmount = Math.min(
        elapsed * a.liqSpeed / LIQ_SPEED_PERIOD,
        eth_new - targetLiquidity // diff to target
      );

      if (extractedAmount > 0) {
        console.log("Extracted amount: %s ETH", format(extractedAmount));
      }

      eth_new -= extractedAmount;
    }

    // pi = eth / nxm
    // pf = eth_new / nxm_new
    // pf = eth_new /(nxm * eth_new / eth)
    // nxm_new = nxm * eth_new / eth
    nxm_a = a.nxm * eth_new / eth;
    nxm_b = b.nxm * eth_new / eth;

    // apply ratchet above
    {
      // if cap*n*(1+r) > e*sup
      // if cap*n + cap*n*r > e*sup
      //   set n(new) = n(BV)
      // else
      //   set n(new) = n(R)
      uint r = elapsed * a.ratchetSpeed;
      uint bufferedCapitalA = capital * (PRICE_BUFFER_DENOMINATOR + PRICE_BUFFER) / PRICE_BUFFER_DENOMINATOR;

      if (bufferedCapitalA * nxm_a + capital * nxm_a * r / RATCHET_PERIOD / RATCHET_DENOMINATOR > eth_new * supply) {
        // use bv
        nxm_a = eth_new * supply / bufferedCapitalA;
      } else {
        // use ratchet
        uint nr_denom_addend = r * capital * nxm_a / supply / RATCHET_PERIOD / RATCHET_DENOMINATOR;
        nxm_a = eth_new * nxm_a / (eth_new - nr_denom_addend);
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
        bufferedCapitalB * nxm_b < eth_new * supply + nxm_b * capital * elapsed * b.ratchetSpeed / RATCHET_PERIOD / RATCHET_DENOMINATOR
      ) {
        nxm_b = eth_new * supply / bufferedCapitalB;
      } else {
        uint nr_denom_addend = nxm_b * elapsed * b.ratchetSpeed * capital / supply / RATCHET_PERIOD / RATCHET_DENOMINATOR;
        nxm_b = eth_new * nxm_b / (eth_new + nr_denom_addend);
      }
    }

    console.log("ETHLIQ: %s ETH", format(eth_new));
    console.log("BUDGET: %s ETH", format(new_budget));

    return (eth_new, nxm_a, nxm_b, new_budget);
  }

  function swapNxmForEth(uint nxmIn, address to) internal returns (uint ethOut) {
    uint capital = capitalPool.getPoolValueInEth();
    uint mcr = capitalPool.mcr();

    if (capital < mcr + BUFFER_ZONE) {
      revert("NO_SWAPS_IN_BUFFER_ZONE");
    }

    (uint eth_new, uint nxm_a, uint nxm_b, uint new_budget) = getReserves();
    uint k = eth_new * nxm_b;
    b.nxm = nxm_b  + nxmIn;
    a.nxm = nxm_b  + nxmIn;

    eth = k / b.nxm;

    a.nxm = nxm_a * eth_new / eth;
    budget = new_budget;
    lastSwapTimestamp = block.timestamp;
    ethOut = eth_new - eth;

    console.log("SWAP %s NXM for: %s ETH", format(nxmIn), format(ethOut));
    nxm.burn(msg.sender, nxmIn);
    capitalPool.sendEth(payable(to), ethOut);


//
//    uint elapsed = block.timestamp - lastSwapTimestamp;
//    uint injectedAmount = Math.min(
//      elapsed * b.liqSpeed / LIQ_SPEED_PERIOD,
//      targetLiquidity - eth // diff to target
//    );
//
//    console.log("Injected amount: %s ETH", format(injectedAmount));
//    console.log("BV: %s", format(1e18 * capital / supply));
//
//    uint ethReserve = eth + injectedAmount;
//    uint target = 1e18 * capital / supply;
//    uint nxmReserve;
//
//    // check if we should be using the ratchet or the book value price using:
//    // Nbv > Nr <=>
//    // ... <=>
//    // cap * n < e * sup + r * cap * n
//    if (
//      capital * b.nxm < ethReserve * supply + b.nxm * capital * elapsed * b.ratchetSpeed / RATCHET_PERIOD / RATCHET_DENOMINATOR
//    ) {
//      nxmReserve = ethReserve * supply / capital;
//    } else {
//      uint r = elapsed * b.ratchetSpeed;
//      uint nr_denom_addend = b.nxm * r * target / RATCHET_PERIOD / RATCHET_DENOMINATOR / 1e18;
//      nxmReserve = ethReserve * b.nxm / (ethReserve + nr_denom_addend);
//    }
//
//    uint ethOut;
//    {
//      uint nxmReserveNew = nxmReserve + nxmIn;
//      uint ethReserveNew = (ethReserve * nxmReserve) / nxmReserveNew;
//      ethOut = ethReserve - ethReserveNew;
//
//      b.nxm = nxmReserveNew;
//      eth = ethReserveNew;
//      lastSwapTimestamp = block.timestamp;
//    }
//
//    // todo: update a pool
//
//    // transfer assets
    return ethOut;
  }

  function getSpotPriceA() external view returns (uint /*ethPerNxm*/) {
    (uint eth_new, uint nxm_a, /*uint nxm_b*/, /*uint new_budget*/) = getReserves();
    return 1 ether * eth_new / nxm_a;
  }

  function getSpotPriceB() external view returns (uint /*ethPerNxm*/) {
    (uint eth_new, /*uint nxm_a*/, uint nxm_b, /*uint new_budget*/) = getReserves();
    return 1 ether * eth_new / nxm_b;
  }
}

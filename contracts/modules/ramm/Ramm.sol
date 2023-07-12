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
    console.log("Spot Price A before swap    : %s ETH/NXM", format(1 ether * eth_new / nxm_a));
    console.log("Spot Price B before swap    : %s ETH/NXM", format(1 ether * eth_new / nxm_b));
    uint k = eth_new * nxm_a;
    eth = eth_new + ethIn;

    // edge case: bellow goes over bv due to eth-dai price changing
    a.nxm = k / eth;
    b.nxm = nxm_b * eth / eth_new;
    budget = new_budget;
    lastSwapTimestamp = block.timestamp;
    nxmOut = nxm_a - a.nxm;

    console.log("Swap                        : %s ETH for %s NXM", format(ethIn), format(nxmOut));

    // transfer assets
    uint cap_before = capitalPool.getPoolValueInEth();
    uint sup_before = nxm.totalSupply();
    uint bv_before = 1e18 * cap_before / sup_before;

    console.log("BV Before                   : %s", format(bv_before));
    console.log("Capital Pool Capacity Before: %s ETH", format(cap_before));
    console.log("Supply Before               : %s NXM", format(sup_before));

    (bool ok,) = address(capitalPool).call{value: msg.value}("");
    require(ok, "CAPITAL_POOL_TRANSFER_FAILED");
    nxm.mint(to, nxmOut);


    uint cap_after = capitalPool.getPoolValueInEth();
    uint sup_after = nxm.totalSupply();
    uint bv_after = 1e18 * cap_after / sup_after;

    console.log("Capital Pool Capacity After : %s ETH", format(cap_after));
    console.log("Supply After                : %s NXM", format(sup_after));
    console.log("BV After                    : %s", format(bv_after));

    console.log("Spot Price A after swap     : %s ETH/NXM", format(1 ether * eth / a.nxm));
    console.log("Spot Price B after swap     : %s ETH/NXM", format(1 ether * eth / b.nxm));

    return nxmOut;
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
        console.log("Injected amount             : %s ETH", format(injectedAmount));
      }

      eth_new += injectedAmount;

    } else {
      // extract liquidity
      uint extractedAmount = Math.min(
        elapsed * a.liqSpeed / LIQ_SPEED_PERIOD,
        eth_new - targetLiquidity // diff to target
      );

      if (extractedAmount > 0) {
        console.log("Extracted amount            : %s ETH", format(extractedAmount));
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

    console.log("ETH liquidity               : %s ETH", format(eth_new));
    console.log("Budget                      : %s ETH", format(new_budget));

    return (eth_new, nxm_a, nxm_b, new_budget);
  }

  function swapNxmForEth(uint nxmIn, address to) internal returns (uint ethOut) {

    (uint eth_new, uint nxm_a, uint nxm_b, uint new_budget) = getReserves();

    console.log("SPOT PRICE A BEFORE SWAP:  %s ETH/NXM", format(1 ether * eth_new / nxm_a));
    console.log("SPOT PRICE B BEFORE SWAP:  %s ETH/NXM", format(1 ether * eth_new / nxm_b));

    uint k = eth_new * nxm_b;
    b.nxm = nxm_b  + nxmIn;
    a.nxm = nxm_b  + nxmIn;

    eth = k / b.nxm;

    a.nxm = nxm_a * eth / eth_new;
    budget = new_budget;
    lastSwapTimestamp = block.timestamp;
    ethOut = eth_new - eth;

    console.log("SWAP                        : %s NXM for %s ETH", format(nxmIn), format(ethOut));
    uint cap_before = capitalPool.getPoolValueInEth();
    uint sup_before = nxm.totalSupply();
    uint bv_before = 1e18 * cap_before / sup_before;

    console.log("Capital Pool Capacity Before: %s ETH", format(cap_before));
    console.log("Supply Before               : %s NXM", format(sup_before));
    console.log("BV Before                   : %s", format(bv_before));

    nxm.burn(msg.sender, nxmIn);
    capitalPool.sendEth(payable(to), ethOut);

    uint mcr = capitalPool.mcr();
    uint cap_after = capitalPool.getPoolValueInEth();
    uint sup_after = nxm.totalSupply();
    uint bv_after = 1e18 * cap_after / sup_after;

    if (cap_after < mcr + BUFFER_ZONE) {
      revert("NO_SWAPS_IN_BUFFER_ZONE");
    }

    console.log("Capital Pool Capacity After : %s ETH", format(cap_after));
    console.log("Supply After                : %s NXM", format(sup_after));
    console.log("BV After                    : %s", format(bv_after));

    console.log("Spot Price A after swap     : %s ETH/NXM", format(1 ether * eth / a.nxm));
    console.log("Spot Price B after swap     : %s ETH/NXM", format(1 ether * eth / b.nxm));

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

  function getSpotPrices() external view returns (uint /*ethPerNxm*/, uint) {
    (uint eth_new, uint nxm_a, uint nxm_b, /*uint new_budget*/) = getReserves();
    return (1 ether * eth_new / nxm_a, 1 ether * eth_new / nxm_b);
  }
}

// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "forge-std/Test.sol";
import "./Ramm.sol";

contract RammTest is Test {

  CapitalPool public capitalPool;
  Ramm public ramm;
  NXM public nxm;

  function setUp() public {
    uint poolBalanceETH = 142_500 ether;
    uint poolBalanceDAI = 5_000_000 ether;
    uint daiRate = 1 ether / 2000;

    uint mcr = 100_000 ether;

    nxm = new NXM();
    capitalPool = new CapitalPool{value: poolBalanceETH}(poolBalanceDAI, daiRate, mcr);
    ramm = new Ramm(nxm, capitalPool);
  }

  function testBuy100() public {
    console.log("Pool value: %s ETH", capitalPool.getPoolValueInEth() / 1e18);
    console.log("NXM Supply: %s NXM", nxm.totalSupply() / 1e18);

    uint nxmBefore = nxm.balanceOf(address(this));
    ramm.swap{value: 100 ether}(0);
    uint nxmAfter = nxm.balanceOf(address(this));

    console.log("NXM before:", nxmBefore / 1e18);
    console.log("NXM after:", nxmAfter / 1e18);
    console.log("Average price per nxm: %s wei", (1e18 * 100 ether / (nxmAfter - nxmBefore)));
  }

  function testBuy50x2() public {
    console.log("Pool value: %s ETH", capitalPool.getPoolValueInEth() / 1e18);
    console.log("NXM Supply: %s NXM", nxm.totalSupply() / 1e18);

    uint nxmBefore = nxm.balanceOf(address(this));
    ramm.swap{value: 50 ether}(0);
    ramm.swap{value: 50 ether}(0);
    uint nxmAfter = nxm.balanceOf(address(this));

    console.log("NXM before:", nxmBefore / 1e18);
    console.log("NXM after:", nxmAfter / 1e18);
    console.log("Average price per nxm: %s wei", (1e18 * 100 ether / (nxmAfter - nxmBefore)));
  }

  function testSell4000() public {
    console.log("Pool value: %s ETH", capitalPool.getPoolValueInEth() / 1e18);
    console.log("NXM Supply: %s NXM", nxm.totalSupply() / 1e18);

    uint nxmOut = 4000 ether;

    uint ethBefore = address(1337).balance;
    vm.prank(address(1337));
    ramm.swap(nxmOut);
    uint ethAfter = address(1337).balance;

    console.log("ETH before:", ethBefore / 1e18);
    console.log("ETH after:", ethAfter / 1e18);
    console.log("Average price per nxm: %s wei", (1e18 * (ethAfter - ethBefore) / 4000 ether));
  }

}

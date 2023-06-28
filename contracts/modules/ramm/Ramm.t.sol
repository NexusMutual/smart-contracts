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
    console.log("Pool value: %s ETH", format(capitalPool.getPoolValueInEth()));
    console.log("NXM Supply: %s NXM", format(nxm.totalSupply()));

    uint eth = 100 ether;

    uint nxmBefore = nxm.balanceOf(address(this));
    ramm.swap{value: eth}(0);
    uint nxmAfter = nxm.balanceOf(address(this));

    console.log("NXM before:", format(nxmBefore));
    console.log("NXM after:", format(nxmAfter));
    console.log("Average price: %s ETH/NXM", format(1e18 * eth / (nxmAfter - nxmBefore)));
  }

  function testBuy50x2() public {
    console.log("Pool value: %s ETH", format(capitalPool.getPoolValueInEth()));
    console.log("NXM Supply: %s NXM", format(nxm.totalSupply()));

    uint nxmBefore = nxm.balanceOf(address(this));
    ramm.swap{value: 50 ether}(0);
    ramm.swap{value: 50 ether}(0);
    uint nxmAfter = nxm.balanceOf(address(this));

    console.log("NXM before:", format(nxmBefore));
    console.log("NXM after:", format(nxmAfter));
    console.log("Average price: %s ETH/NXM", format(1e18 * 100 ether / (nxmAfter - nxmBefore)));
  }

  function testSell4000() public {
    console.log("Pool value: %s ETH", format(capitalPool.getPoolValueInEth()));
    console.log("NXM Supply: %s NXM", format(nxm.totalSupply()));

    uint nxmOut = 4000 ether;

    uint ethBefore = address(1337).balance;
    vm.prank(address(1337));
    ramm.swap(nxmOut);
    uint ethAfter = address(1337).balance;

    console.log("ETH before: %s", format(ethBefore));
    console.log("ETH after:  %s", format(ethAfter));
    console.log("NXM sold:   %s", format(nxmOut));

    console.log("Average price: %s ETH/NXM", format(1e18 * (ethAfter - ethBefore) / nxmOut));
  }

  function testPlayground() public {
    uint time = block.timestamp;
    for (uint i = 0; i < 10; i++) {
      console.log("--------------------");
      vm.warp(time + i * 3 days);
      console.log("***** Spot B: %s ETH/NXM", format(ramm.getSpotPriceB()));
    }
  }

}

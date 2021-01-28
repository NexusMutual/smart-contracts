/* Copyright (C) 2020 NexusMutual.io

  This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

  This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
    along with this program.  If not, see http://www.gnu.org/licenses/ */

pragma solidity ^0.5.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../abstract/MasterAware.sol";

/**
 * @dev Send assets to Pool1
 */
contract Pool2 is MasterAware {

  IERC20 public dai;

  constructor (address masterAddress, address _dai) public {
    changeMasterAddress(masterAddress);
    dai = IERC20(_dai);
  }

  function sendEther() external payable {
    // noop
  }

  // triggered after all contracts upgrade
  function changeDependentContractAddress() external {

    address poolAddress = master.getLatestAddress("P1");
    uint balance = dai.balanceOf(address(this));
    uint etherBalance = address(this).balance;

    // transfer dai
    require(dai.transfer(poolAddress, balance), "P2: failed to send DAI to P1");

    // transfer ether
    (bool ok, /* data */) = poolAddress.call.value(etherBalance)("");
    require(ok, "P2: failed to send ETH to P1");
  }

}

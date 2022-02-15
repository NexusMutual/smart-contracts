// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../abstract/MasterAware.sol";
import "../../interfaces/ITokenController.sol";

contract MMockNewContract is MasterAware {

  ITokenController tc;

  constructor() { }

  function changeDependentContractAddress() external {
    tc = ITokenController(master.getLatestAddress("TC"));
  }

  function mint(address _member, uint _amount) public {
    tc.mint(_member, _amount);
  }
}

// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/ITokenController.sol";

contract MMockNewContract is MasterAwareV2 {

  ITokenController tc;

  constructor() { }

  function changeDependentContractAddress() external {
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
  }

  function mint(address _member, uint _amount) public {
    tc.mint(_member, _amount);
  }
}

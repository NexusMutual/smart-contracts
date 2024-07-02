// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../abstract/MasterAwareV2.sol";
import "../../../interfaces/ITokenController.sol";

contract MSMockNewContract is MasterAwareV2 {

  constructor() { }

  function changeDependentContractAddress() external {
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
  }

  function mint(address _member, uint _amount) public {
    ITokenController(internalContracts[uint(ID.TC)]).mint(_member, _amount);
  }
}

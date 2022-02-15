// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../abstract/MasterAware.sol";
import "../../interfaces/ITokenController.sol";

contract MSMockGovernance is MasterAware {

  ITokenController tc;

  constructor() { }

  function changeDependentContractAddress() external {
    tc = ITokenController(master.getLatestAddress("TC"));
  }

  function upgradeMultipleContracts(
    bytes2[] memory _contractCodes,
    address payable[] memory newAddresses
  ) public {
    master.upgradeMultipleContracts(_contractCodes, newAddresses);
  }

  function removeContracts(bytes2[] memory contractCodesToRemove) public {
    master.removeContracts(contractCodesToRemove);
  }

  function updateOwnerParameters(bytes8 code, address payable val) public {
    master.updateOwnerParameters(code, val);
  }

  function addNewInternalContracts(
    bytes2[] memory _contractCodes,
    address payable[] memory newAddresses,
    uint[] memory _types
  ) public {
    master.addNewInternalContracts(_contractCodes, newAddresses, _types);
  }
}

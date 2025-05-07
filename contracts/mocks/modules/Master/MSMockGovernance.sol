// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/ITokenController.sol";
import "../../../interfaces/INXMMaster.sol";
import "../../generic/GovernanceGeneric.sol";

contract MSMockGovernance is GovernanceGeneric {

  ITokenController tc;
  INXMMaster master;

  constructor() { }

  function changeMasterAddress(address masterAddress) public {
    require(address(master) == address(0) || address(master) == msg.sender, "Master address already set");
    master = INXMMaster(masterAddress);
  }

  function changeDependentContractAddress() external {
    tc = ITokenController(master.getLatestAddress("TC"));
  }

  // function upgradeMultipleContracts(
  //   bytes2[] memory _contractCodes,
  //   address payable[] memory newAddresses
  // ) public {
  //   // master.upgradeMultipleContracts(_contractCodes, newAddresses);
  //   revert("Not implemented");
  // }

  // function removeContracts(bytes2[] memory contractCodesToRemove) public {
  //   // master.removeContracts(contractCodesToRemove);
  //   revert("Not implemented");
  // }

  // function addNewInternalContracts(
  //   bytes2[] memory _contractCodes,
  //   address payable[] memory newAddresses,
  //   uint[] memory _types
  // ) public {
  //   // master.addNewInternalContracts(_contractCodes, newAddresses, _types);
  //   revert("Not implemented");
  // }
}

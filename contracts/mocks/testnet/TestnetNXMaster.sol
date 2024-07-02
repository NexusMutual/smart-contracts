// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../modules/governance/NXMaster.sol";

contract TestnetNXMaster is NXMaster {

  address public governanceOwner;

  modifier onlyGovernanceOwner() {
    require(msg.sender == governanceOwner, "Ownable: caller is not the owner");
    _;
  }

  function initializeGovernanceOwner() public {
    if (governanceOwner != address(0)) {
      revert("Already initialized");
    }
    governanceOwner = msg.sender;
  }

  function switchGovernanceAddress(address payable newGV) external onlyGovernanceOwner {
    address currentGV = contractAddresses["GV"];
    contractAddresses["GV"] = newGV;
    contractsActive[currentGV] = false;
    contractsActive[newGV] = true;
  }
}

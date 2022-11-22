// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

import "../interfaces/INXMMaster.sol";
import "../interfaces/IMasterAwareV2.sol";
import "../interfaces/IMemberRoles.sol";

abstract contract MasterAwareV2 is IMasterAwareV2 {

  mapping(uint => address payable) internal internalContracts;

  INXMMaster public master;

  modifier onlyMember {
    require(
      IMemberRoles(internalContracts[uint(ID.MR)]).checkRole(
        msg.sender,
        uint(IMemberRoles.Role.Member)
      ),
      "Caller is not a member"
    );
    _;
  }

  modifier onlyAdvisoryBoard {
    require(
      IMemberRoles(internalContracts[uint(ID.MR)]).checkRole(
        msg.sender,
        uint(IMemberRoles.Role.AdvisoryBoard)
      ),
      "Caller is not an advisory board member"
    );
    _;
  }

  modifier onlyInternal {
    require(master.isInternal(msg.sender), "Caller is not an internal contract");
    _;
  }

  modifier onlyMaster {
    if (address(master) != address(0)) {
      require(address(master) == msg.sender, "Not master");
    }
    _;
  }

  modifier onlyGovernance {
    require(
      master.checkIsAuthToGoverned(msg.sender),
      "Caller is not authorized to govern"
    );
    _;
  }

  modifier onlyEmergencyAdmin {
    require(
      msg.sender == master.emergencyAdmin(),
      "Caller is not emergency admin"
    );
    _;
  }

  modifier whenPaused {
    require(master.isPause(), "System is not paused");
    _;
  }

  modifier whenNotPaused {
    require(!master.isPause(), "System is paused");
    _;
  }


  function getInternalContractAddress(ID id) internal view returns (address payable) {
    return internalContracts[uint(id)];
  }

  function changeMasterAddress(address masterAddress) public onlyMaster {
    master = INXMMaster(masterAddress);
  }

}

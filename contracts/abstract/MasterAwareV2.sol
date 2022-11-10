// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

import "../interfaces/INXMMaster.sol";
import "../interfaces/IMasterAwareV2.sol";
import "../interfaces/IMemberRoles.sol";

abstract contract MasterAwareV2 is IMasterAwareV2 {

  mapping(uint => address payable) internal internalContracts;

  INXMMaster public master;

  uint internal constant QD = 1 << 0;
  uint internal constant TC = 1 << 1;
  uint internal constant P1 = 1 << 2;
  uint internal constant MC = 1 << 3;
  uint internal constant GV = 1 << 4;
  uint internal constant PC = 1 << 5;
  uint internal constant MR = 1 << 6;
  uint internal constant PS = 1 << 7;
  uint internal constant GW = 1 << 8;
  uint internal constant IC = 1 << 9;
  uint internal constant CL = 1 << 10;
  uint internal constant YT = 1 << 11;
  uint internal constant AS = 1 << 12;
  uint internal constant CO = 1 << 13;
  uint internal constant CR = 1 << 14;

  function usedInternalContracts() internal pure virtual returns (uint);

  modifier onlyMember {
    require(
      IMemberRoles(getInternalContractAddress(ID.MR)).checkRole(
        msg.sender,
        uint(IMemberRoles.Role.Member)
      ),
      "Caller is not a member"
    );
    _;
  }

  modifier onlyAdvisoryBoard {
    require(
      IMemberRoles(getInternalContractAddress(ID.MR)).checkRole(
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

    uint idBitmask = 1 << uint(id);
    require((usedInternalContracts() & idBitmask) != 0, "Contract not in use");
    return internalContracts[uint(id)];
  }

  /// @dev Updates internal contract addresses to the ones stored in master. This function is
  /// automatically called by the master contract when a contract is added or upgraded.
  function changeDependentContractAddress() external virtual {

    uint bitmap = usedInternalContracts();
    uint id = 0;

    // go through each bit and load the appropriate contract
    while (bitmap > 0) {

      // if the current bit in line is 1 load the address otherwise skip it
      if (bitmap & 1 > 0) {
        internalContracts[id] = master.getLatestAddressById(id);
      }
      bitmap >>= 1;
      id++;
    }
  }

  function changeMasterAddress(address masterAddress) public onlyMaster {
    master = INXMMaster(masterAddress);
  }

}

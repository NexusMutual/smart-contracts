// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

import "../interfaces/INXMMaster.sol";
import "../interfaces/IMasterAwareV2.sol";
import "../interfaces/IMemberRoles.sol";

abstract contract MasterAwareV2 is IMasterAwareV2 {

  mapping(uint => address payable) internal internalContracts;

  INXMMaster public master;

  uint internal constant QD = 1 << 0;
  uint internal constant TD = 1 << 1;
  uint internal constant CD = 1 << 2;
  uint internal constant PD = 1 << 3;
  uint internal constant QT = 1 << 4;
  uint internal constant TF = 1 << 5;
  uint internal constant TC = 1 << 6;
  uint internal constant CL = 1 << 7;
  uint internal constant CR = 1 << 8;
  uint internal constant P1 = 1 << 9;
  uint internal constant P2 = 1 << 10;
  uint internal constant MC = 1 << 11;
  uint internal constant GV = 1 << 12;
  uint internal constant PC = 1 << 13;
  uint internal constant MR = 1 << 14;
  uint internal constant PS = 1 << 15;
  uint internal constant GW = 1 << 16;
  uint internal constant IC = 1 << 17;
  uint internal constant AS = 1 << 18;
  uint internal constant CO = 1 << 18;


  function addressOf(uint id) internal view returns (address payable) {
    require((usedInternalContracts() & id) != 0, "Contract not in use");
    return internalContracts[id];
  }

  function usedInternalContracts() internal pure virtual returns (uint);

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

  function changeDependentContractAddress() external virtual {

    uint bitmap = usedInternalContracts();
    // master.getInternalContractAddresses();
  }

  function changeMasterAddress(address masterAddress) public onlyMaster {
    master = INXMMaster(masterAddress);
  }

}

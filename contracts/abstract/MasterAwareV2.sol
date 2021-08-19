// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../interfaces/INXMMaster.sol";

abstract contract MasterAwareV2 {

  mapping(uint => address payable) internal internalContracts;

  INXMMaster public master;

  // [todo] Are there any missing contracts here?
  enum ID {GW, GV, MR, CL, CR, MC, P1, QT, TF, PC, PS, TC, IC, AS}

  modifier onlyMember {
    require(master.isMember(msg.sender), "Caller is not a member");
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

  function changeDependentContractAddress() external virtual;

  function changeMasterAddress(address masterAddress) public onlyMaster {
    master = INXMMaster(masterAddress);
  }

}

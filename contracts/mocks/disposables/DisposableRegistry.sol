// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../modules/governance/Registry.sol";

contract DisposableRegistry is Registry {

  constructor(
    address _verifyingAddress,
    address _master
  ) Registry(_verifyingAddress, _master) { }

  function setGovernor(address _governor) external {
    contracts[C_GOVERNOR] = Contract({ addr: _governor, isProxy: true });
    contractIndexes[_governor] = C_GOVERNOR;
  }

  function replaceGovernor(bytes32 _salt, address _governorImplementation) external {
    delete contracts[C_GOVERNOR];
    delete contractIndexes[contracts[C_GOVERNOR].addr];
    _deployContract(C_GOVERNOR, _salt, _governorImplementation);
  }

  function addMembers(address[] calldata _members) external {
    for (uint i = 0; i < _members.length; i++) {
      address member = _members[i];
      uint memberId = ++membersMeta.lastMemberId;
      ++membersMeta.memberCount;
      memberIds[member] = memberId;
      members[memberId] = member;
    }
  }

  function addAdvisoryBoardMembers(address[] calldata abMembers) external {

    uint count = abMembers.length;
    require(count == ADVISORY_BOARD_SEATS, 'Registry: Invalid advisory board count');

    for (uint i = 0; i < count; i++) {
      address member = abMembers[i];
      uint memberId = memberIds[member];
      require(memberId != 0, NotMember());

      uint seat = i + 1;
      require(seatToMember[seat] == 0, 'Registry: AB seat already taken');

      memberToSeat[memberIds[member]] = seat;
      seatToMember[seat] = memberId;
    }
  }

  function addEmergencyAdmins(address[] calldata emergencyAdmins) external {
    for (uint i = 0; i < emergencyAdmins.length; i++) {
      isEmergencyAdmin[emergencyAdmins[i]] = true;
    }
  }

}

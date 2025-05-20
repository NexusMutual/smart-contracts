// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

interface IRegistry {

  struct Contract {
    address addr;
    bool isProxy;
  }

  struct SystemPause {
    uint48 config;
    uint48 proposedConfig;
    address proposer;
  }

  struct MembersMeta {
    uint48 memberCount;
    uint48 lastMemberId;
  }

  // joined: MembershipChanged(memberId, address(0), current)
  // swapped: MembershipChanged(memberId, previous, current)
  // left: MembershipChanged(memberId, current, address(0))
  event MembershipChanged(uint indexed memberId, address indexed previous, address indexed current);

  error ContractAlreadyExists();
  error InvalidContractIndex();
  error ContractDoesNotExist();
  error ContractIsNotProxy();
  error NotEmergencyAdmin();
  error ProposerCannotEnablePause();
  error PauseConfigMismatch();
  error NotMember();
  error AlreadyMember();
  error NotAdvisoryBoardMember();
  error AlreadyAdvisoryBoardMember();
  error AdvisoryBoardMemberCannotLeave();

}

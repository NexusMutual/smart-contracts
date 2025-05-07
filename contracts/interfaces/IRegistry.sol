// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.0;

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
    address kycAuthAddress;
  }

  /* == EMERGENCY PAUSE == */
  function setEmergencyAdmin(address _emergencyAdmin, bool enabled) external;
  function proposePauseConfig(uint config) external;
  function confirmPauseConfig(uint config) external;
  function getSystemPause() external view returns (SystemPause memory);
  function getPauseConfig() external view returns (uint config);
  function isPaused(uint mask) external view returns (bool);
  function isEmergencyAdmin(address member) external view returns (bool);

  /* == MEMBERSHIP AND AB MANAGEMENT == */
  function isMember(address member) external view returns (bool);
  function getMemberId(address member) external view returns (uint);
  function getMemberCount() external view returns (uint);

  function isAdvisoryBoardMember(address member) external view returns (bool);
  function getAdvisoryBoardSeat(address member) external view returns (uint);
  function swapAdvisoryBoardMember(uint from, uint to) external;

  function join(address member, bytes memory signature) external;
  function switchTo(address to) external;
  function switchFor(address from, address to) external;
  function leave() external;

  /* == CONTRACT MANAGEMENT == */
  function isValidContractIndex(uint index) external pure returns (bool);
  function deployContract(uint index, bytes32 salt, address implementation) external;
  function addContract(uint index, address contractAddress, bool isProxy) external;
  function upgradeContract(uint index, address implementation) external;
  function removeContract(uint index) external;
  function getContractAddressByIndex(uint index) external view returns (address payable);
  function getContractTypeByIndex(uint index) external view returns (bool isProxy);
  function getContractIndexByAddress(address contractAddress) external view returns (uint);
  function getContracts(uint[] memory indexes) external view returns (Contract[] memory);

  /* == MIGRATIONS == */
  function migrateMembers(address[] calldata membersToMigrate) external;
  function migrateAdvisoryBoardMembers(address[] calldata abMembers) external;

  // joined: MembershipChanged(memberId, address(0), current)
  // swapped: MembershipChanged(memberId, previous, current)
  // left: MembershipChanged(memberId, current, address(0))
  event MembershipChanged(uint indexed memberId, address indexed previous, address indexed current);
  event AdvisoryBoardMemberSwapped(uint indexed seat, uint indexed from, uint indexed to);

  error ContractAlreadyExists();
  error InvalidContractIndex();
  error InvalidContractAddress();
  error ContractDoesNotExist();
  error ContractIsNotProxy();

  error OnlyEmergencyAdmin();
  error ProposerCannotEnablePause();
  error PauseConfigMismatch();

  error InvalidSignature();
  error NotMember();
  error AlreadyMember();
  error NotAdvisoryBoardMember();
  error AlreadyAdvisoryBoardMember();
  error AdvisoryBoardMemberCannotLeave();
  error InvalidSeat();

  error OnlyGovernance();
  error NotProxyOwner();

}

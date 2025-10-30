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

  /* == MEMBERSHIP MANAGEMENT == */
  function isMember(address member) external view returns (bool);
  function getMemberId(address member) external view returns (uint);
  function getMemberAddress(uint memberId) external view returns (address);
  function getMemberCount() external view returns (uint);
  function getLastMemberId() external view returns (uint);
  function join(address member, bytes memory signature) external payable;
  function switchTo(address to) external;
  function switchFor(address from, address to) external;
  function leave() external;
  function setKycAuthAddress(address kycAuthAddress) external;
  function getKycAuthAddress() external view returns (address);

  /* == ADVISORY BOARD MANAGEMENT == */
  function isAdvisoryBoardMember(address member) external view returns (bool);
  function isAdvisoryBoardMemberById(uint memberId) external view returns (bool);
  function getAdvisoryBoardSeat(address member) external view returns (uint);
  function getMemberAddressBySeat(uint seat) external view returns (address);
  function swapAdvisoryBoardMember(uint from, uint to) external;

  /* == CONTRACT MANAGEMENT == */
  function isValidContractIndex(uint index) external pure returns (bool);
  function isProxyContract(uint index) external view returns (bool);
  function getContractAddressByIndex(uint index) external view returns (address payable);
  function getContractIndexByAddress(address contractAddress) external view returns (uint);
  function getContracts(uint[] memory indexes) external view returns (Contract[] memory);
  function deployContract(uint index, bytes32 salt, address implementation) external;
  function addContract(uint index, address contractAddress, bool isProxy) external;
  function upgradeContract(uint index, address implementation) external;
  function removeContract(uint index) external;

  /* == MIGRATIONS == */
  function migrateMembers(address[] calldata membersToMigrate) external;
  function migrateAdvisoryBoardMembers(address[] calldata abMembers) external;

  // joined: MembershipChanged(memberId, address(0), current)
  // swapped: MembershipChanged(memberId, previous, current)
  // left: MembershipChanged(memberId, current, address(0))
  event MembershipChanged(uint indexed memberId, address indexed previous, address indexed current);
  event AdvisoryBoardMemberSwapped(uint indexed seat, uint indexed from, uint indexed to);

  event ContractDeployed(uint indexed index, address indexed proxy, address implementation);
  event ContractUpgraded(uint indexed index, address indexed proxy, address implementation);
  event ContractAdded(uint indexed index, address indexed contractAddress, bool isProxy);
  event ContractRemoved(uint indexed index, address indexed contractAddress, bool isProxy);

  event EmergencyAdminSet(address indexed emergencyAdmin, bool enabled);
  event PauseConfigProposed(uint config, address indexed proposer);
  event PauseConfigConfirmed(uint config, address indexed confirmer);

  error ContractAlreadyExists();
  error InvalidContractIndex();
  error InvalidContractAddress();
  error ContractDoesNotExist();
  error ContractIsNotProxy();

  error OnlyEmergencyAdmin();
  error ProposerCannotConfirmPause();
  error PauseConfigMismatch();
  error NoConfigProposed();
  error Paused(uint currentState, uint checks);

  error NotMember();
  error AlreadyMember();
  error AddressAlreadyUsedForJoining();
  error InvalidJoinFee();
  error InvalidSignature();
  error FeeTransferFailed();

  error NotAdvisoryBoardMember();
  error AlreadyAdvisoryBoardMember();
  error AdvisoryBoardMemberCannotLeave();
  error InvalidSeat();

  error OnlyGovernor();
  error NotProxyOwner();
  error NotMemberRoles();

}

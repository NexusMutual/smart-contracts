// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../interfaces/IRegistry.sol";
import "./UpgradeableProxy.sol";

contract Registry is IRegistry {

  // contracts

  // index = 1 << code
  mapping(uint index => address contractAddress) internal contractAddresses;
  mapping(address contractAddress => uint index) internal contractIndexes;

  // pause

  uint constant PAUSE_GLOBAL = 1; // 0b0000000000000001
  uint constant PAUSE_RAMM = 2;   // 0b0000000000000010
  uint constant PAUSE_X = 4;      // 0b0000000000000100
  uint constant PAUSE_Y = 8;      // 0b0000000000001000

  struct SystemPause {
    uint config;
    uint proposedConfig;
    address proposer;
  }

  mapping(address => bool) isEmergencyAdmin; // 1 slot
  SystemPause internal systemPause; // 3 slots

  function proposePauseConfig(uint config) external {
    require(isEmergencyAdmin[msg.sender], NotEmergencyAdmin());
    systemPause.proposedConfig = config;
    systemPause.proposer = msg.sender;
  }

  function confirmPauseConfig(uint config) external {
    require(isEmergencyAdmin[msg.sender], NotEmergencyAdmin());
    require(systemPause.proposer != msg.sender, ProposerCannotEnablePause());
    require(systemPause.proposedConfig == config, PauseConfigMismatch());
    systemPause.config = config;
    delete systemPause.proposedConfig;
    delete systemPause.proposer;
  }

  function setEmergencyAdmin(address _emergencyAdmin, bool enabled) external onlyGovernance {
    isEmergencyAdmin[_emergencyAdmin] = enabled;
    // emit event
  }

  function getPauseConfig() external view returns (SystemPause memory pauseConfig) {
    return systemPause;
  }

  function isPaused(uint mask) external view returns (bool) {
    uint config = systemPause.config;
    return (PAUSE_GLOBAL & config) != 0 || (config & mask) != 0;
  }

  // membership

  uint public memberCount;
  uint public lastMemberId;

  /// WITHOUT DESIGNATED ROLES

  mapping(uint memberId => address member) internal members;
  mapping(address member => uint memberId) internal memberIds;
  mapping(uint memberId => bool isAdvisoryBoardMember) public isAdvisoryBoardMember;

  function isMember(address member) external view returns (bool) {
    return memberIds[member] != 0;
  }

  function getMemberId(address member) external view returns (uint) {
    return memberIds[member];
  }

  function swapAdvisoryBoardMember(uint from, uint to) external onlyGovernance {
    require(from != 0, NotMember());
    require(to != 0, NotMember());
    require(members[to] != address(0), NotMember());
    require(isAdvisoryBoardMember[from], NotAdvisoryBoardMember());
    require(!isAdvisoryBoardMember[to], AlreadyAdvisoryBoardMember());
    isAdvisoryBoardMember[from] = false;
    isAdvisoryBoardMember[to] = true;
  }

  function join(address member, bytes32 signature) external {
    require(memberIds[member] == 0, AlreadyMember());
    uint memberId = ++lastMemberId;
    memberIds[member] = memberId;
    members[memberId] = member;
    // todo:
    // TC.addToWhitelist(member)
  }

  function swap(address to) external {
    require(memberIds[to] == 0, AlreadyMember());
    uint memberId = memberIds[msg.sender];
    members[memberId] = to;
    memberIds[to] = memberId;
    delete memberIds[msg.sender];
    // todo:
    // TC.removeFromWhitelist(msg.sender)
    // TC.addToWhitelist(to)
    // TK.transferFrom(msg.sender, to)
  }

  function leave() external {

    uint memberId = memberIds[msg.sender];
    require(memberId != 0, NotMember());
    require(!isAdvisoryBoardMember[memberId], AdvisoryBoardMemberCannotLeave());
    // todo:
    // address[] memory pools = TC.getManagerStakingPools(memberId)
    // require(pools.length == 0, StakingPoolManagersCannotLeave());

    delete members[memberId];
    delete memberIds[msg.sender];

    // todo:
    // TC.removeFromWhitelist(msg.sender)
    // TK.burnFrom(msg.sender)
  }

  /// WITH DESIGNATED ROLES

  struct AddressInfo {
    uint32 id;     // member id
    uint8 role;    // role id
  }

  struct MemberRole {
    uint32 id;
    uint8 role;
    address addr;
  }

  mapping(uint id => mapping(uint role => address)) internal roleAddresses;
  mapping(address => AddressInfo) internal addressToInfo;
  mapping(uint id => mapping(uint role => address nominee)) internal roleOffers;

  /* == MEMBER MANAGEMENT == */

  function getAddress(uint id, uint role) external view returns (address) {
    return roleAddresses[id][role];
  }

  function getMemberAddresses(uint id) external view returns (MemberRole[] memory memberRoles) {
    memberRoles = new MemberRole[](256);

    for (uint role = 1; role <= 256; role++) {
      AddressInfo memory info = addressToInfo[roleAddresses[id][role]];
      memberRoles[role - 1] = MemberRole({
        id: info.id,
        role: info.role,
        addr: roleAddresses[id][role]
      });
    }

    return memberRoles;
  }

  function nominateAddress(uint role, address nominee) external {
    AddressInfo memory info = addressToInfo[msg.sender];
    require(info.id != 0, NotMember());
    require(info.role == 1, NotMainAddress());

    require(role > 0 && role <= 256, InvalidRole());
    roleOffers[info.id][role] = nominee;
  }

  function acceptNomination(uint memberId, uint role) external {

    require(memberId != 0, InvalidMemberId());
    require(role > 0 && role <= 256, InvalidRole());

    address nominee = roleOffers[memberId][role];
    require(nominee == msg.sender, NotNominee());

    roleAddresses[memberId][role] = nominee;
    addressToInfo[nominee] = AddressInfo({ id: memberId, role: role });

    delete roleOffers[memberId][role];
  }

  function getMember(address addr) external view returns (uint id, uint role) {
    AddressInfo memory info = addressToInfo[addr];
    return (info.id, info.role);
  }

  /* == CONTRACT MANAGEMENT == */

  function addContract(uint code, bytes32 salt, address implementation) external {
    require(contractAddresses[1 << code] == address(0), ContractAlreadyExists());
    UpgradeableProxy proxy = new UpgradeableProxy{salt: bytes32(salt)}();
    proxy.upgradeTo(implementation);
    contractAddresses[1 << code] = address(proxy);
    contractIndexes[address(proxy)] = 1 << code;
  }

  function upgradeContract(uint code, address implementation) external {
    require(code <= uint(type(Contract).max), InvalidContractCode());
    address contractAddress = contractAddresses[1 << code];
    require(contractAddress != address(0), ContractDoesNotExist());
    UpgradeableProxy proxy = UpgradeableProxy(payable(contractAddress));
    proxy.upgradeTo(implementation);
  }

  function deprecateContract(uint code) external {
    require(code <= uint(type(Contract).max), InvalidContractCode());
    address contractAddress = contractAddresses[1 << code];
    require(contractAddress != address(0), ContractDoesNotExist());
    contractIndexes[contractAddress] = 0;
    contractAddresses[1 << code] = address(0);
  }

  function getContractByCode(uint code) external view returns (address) {
    require(code <= uint(type(Contract).max), InvalidContractCode());
    return contractAddresses[1 << code];
  }

  function getContractsByCode(uint[] memory codes) external view returns (address[] memory addresses) {
    addresses = new address[](codes.length);
    for (uint i = 0; i < codes.length; i++) {
      require(codes[i] <= uint(type(Contract).max), InvalidContractCode());
      addresses[i] = contractAddresses[1 << codes[i]];
    }
  }

  function isInternalContract(address contractAddress) external view returns (bool) {
    return contractIndexes[contractAddress] != 0;
  }

}

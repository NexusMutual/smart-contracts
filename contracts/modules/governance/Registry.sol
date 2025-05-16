// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../interfaces/IRegistry.sol";
import "./UpgradeableProxy.sol";

contract Registry is IRegistry {

  struct SystemPause {
    // could consider switching to uint48
    uint config;
    uint proposedConfig;
    address proposer;
  }

  // index = 1 << code
  mapping(uint index => address contractAddress) internal contractAddresses;
  mapping(address contractAddress => uint index) internal contractIndexes;

  // consider changing to uint32 or similar
  // could shove into a struct
  uint public memberCount;
  uint public lastMemberId;

  mapping(uint memberId => address member) internal members;
  mapping(address member => uint memberId) internal memberIds;
  mapping(bytes32 signature => bool used) internal usedSignatures;
  mapping(uint memberId => bool isAdvisoryBoardMember) public isAdvisoryBoardMember;

  mapping(address => bool) isEmergencyAdmin; // 1 slot
  SystemPause internal systemPause; // 3 slots

  uint constant PAUSE_GLOBAL = 1; // 0b0000000000000001
  uint constant PAUSE_RAMM = 2;   // 0b0000000000000010
  uint constant PAUSE_X = 4;      // 0b0000000000000100
  uint constant PAUSE_Y = 8;      // 0b0000000000001000

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

  function getSystemPause() external view returns (SystemPause memory) {
    return systemPause;
  }

  function getPauseConfig() external view returns (uint config) {
    return systemPause.config;
  }

  function isPaused(uint mask) external view returns (bool) {
    uint config = systemPause.config;
    return (PAUSE_GLOBAL & config) != 0 || (config & mask) != 0;
  }

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
    // validate signature
    // mark signature as used
    // TC.addToWhitelist(member)
  }

  function swap(address to) external {
    uint memberId = memberIds[msg.sender];
    require(memberId != 0, NotMember());
    require(memberIds[to] == 0, AlreadyMember());

    delete memberIds[msg.sender];
    memberIds[to] = memberId;
    members[memberId] = to;

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
    // uint balance = TK.balanceOf(msg.sender)
    // TK.burnFrom(msg.sender, balance) // or revert?
  }

  /* == CONTRACT MANAGEMENT == */

  function addContract(uint code, bytes32 salt, address implementation) external {
    require(code <= type(uint8).max, InvalidContractCode());
    require(contractAddresses[1 << code] == address(0), ContractAlreadyExists());
    UpgradeableProxy proxy = new UpgradeableProxy{salt: bytes32(salt)}();
    proxy.upgradeTo(implementation);
    contractAddresses[1 << code] = address(proxy);
    contractIndexes[address(proxy)] = 1 << code;
  }

  function upgradeContract(uint code, address implementation) external {
    require(code <= type(uint8).max, InvalidContractCode());
    address contractAddress = contractAddresses[1 << code];
    require(contractAddress != address(0), ContractDoesNotExist());
    UpgradeableProxy proxy = UpgradeableProxy(payable(contractAddress));
    proxy.upgradeTo(implementation);
  }

  function deprecateContract(uint code) external {
    require(code <= type(uint8).max, InvalidContractCode());
    address contractAddress = contractAddresses[1 << code];
    require(contractAddress != address(0), ContractDoesNotExist());
    contractIndexes[contractAddress] = 0;
    contractAddresses[1 << code] = address(0);
  }

  function getContractByCode(uint code) external view returns (address) {
    require(code <= type(uint8).max, InvalidContractCode());
    return contractAddresses[1 << code];
  }

  function getContractsByCode(uint[] memory codes) external view returns (address[] memory addresses) {
    addresses = new address[](codes.length);
    for (uint i = 0; i < codes.length; i++) {
      require(codes[i] <= type(uint8).max, InvalidContractCode());
      addresses[i] = contractAddresses[1 << codes[i]];
    }
  }

  function isInternalContract(address contractAddress) external view returns (bool) {
    return contractIndexes[contractAddress] != 0;
  }

}

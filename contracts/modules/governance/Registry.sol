// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../abstract/EIP712.sol";
import "../../interfaces/IRegistry.sol";
import "./UpgradeableProxy.sol";

contract Registry is IRegistry, EIP712 {

  // contracts
  mapping(uint index => Contract) internal contracts;
  mapping(address contractAddress => uint index) internal contractIndexes;

  // membership
  MembersMeta internal membersMeta; // 1 slot
  mapping(uint memberId => address member) internal members;
  mapping(address member => uint memberId) internal memberIds;
  mapping(address member => bool used) internal wasAddressUsedForJoining;
  mapping(uint memberId => bool isAdvisoryBoardMember) public isAdvisoryBoardMember;

  bytes32 private constant JOIN_TYPEHASH = keccak256("Join(address member)");

  // emergency pause
  mapping(address => bool) public isEmergencyAdmin;
  SystemPause internal systemPause; // 3 slots

  modifier onlyMember() {
    require(memberIds[msg.sender] != 0, NotMember());
    _;
  }

  modifier onlyGovernance() {
    // todo: check msg.sender is Governor contract
    _;
  }

  modifier onlyEmergencyAdmin() {
    require(isEmergencyAdmin[msg.sender], NotEmergencyAdmin());
    _;
  }

  constructor(address _verifyingAddress) EIP712("NexusMutualRegistry", "1.0.0", _verifyingAddress) {}

  /* == EMERGENCY PAUSE == */

  function setEmergencyAdmin(address _emergencyAdmin, bool enabled) external onlyGovernance {
    isEmergencyAdmin[_emergencyAdmin] = enabled;
    // emit event
  }

  function proposePauseConfig(uint config) external onlyEmergencyAdmin {
    systemPause.proposedConfig = uint48(config);
    systemPause.proposer = msg.sender;
  }

  function confirmPauseConfig(uint config) external onlyEmergencyAdmin {
    require(systemPause.proposer != msg.sender, ProposerCannotEnablePause());
    require(systemPause.proposedConfig == uint48(config), PauseConfigMismatch());
    systemPause.config = uint48(config);
    delete systemPause.proposedConfig;
    delete systemPause.proposer;
  }

  function getSystemPause() external view returns (SystemPause memory) {
    return systemPause;
  }

  function getPauseConfig() external view returns (uint config) {
    return systemPause.config;
  }

  function isPaused(uint mask) external view returns (bool) {
    uint config = systemPause.config;
    // also checks for global pause
    return (config & 1) != 0 || (config & mask) != 0;
  }

  /* == MEMBERSHIP MANAGEMENT == */

  function isMember(address member) external view returns (bool) {
    return memberIds[member] != 0;
  }

  function getMemberId(address member) external view returns (uint) {
    return memberIds[member];
  }

  function getMemberCount() external view returns (uint) {
    return membersMeta.memberCount;
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

    bytes32 structHash = abi.encode(JOIN_TYPEHASH, member);
    address recoveredSigner = recoverSigner(structHash, signature);
    require(membersMeta.kycAuthAddress == recoveredSigner, InvalidSignature());
    wasAddressUsedForJoining[member] = true;

    uint memberId = ++membersMeta.lastMemberId;
    ++membersMeta.memberCount;
    memberIds[member] = memberId;
    members[memberId] = member;

    emit MembershipChanged(memberId, address(0), member);

    // todo:
    // TC.addToWhitelist(member)
  }

  function swap(address to) external {
    uint memberId = memberIds[msg.sender];
    require(memberId != 0, NotMember());
    require(memberIds[to] == 0, AlreadyMember());

    delete memberIds[msg.sender];
    memberIds[to] = memberId;
    members[memberId] = to;

    emit MembershipChanged(memberId, msg.sender, to);

    // todo:
    // TC.removeFromWhitelist(msg.sender)
    // TC.addToWhitelist(to)
    // TK.transferFrom(msg.sender, to)
  }

  function leave() external {

    uint memberId = memberIds[msg.sender];
    require(memberId != 0, NotMember());
    require(!isAdvisoryBoardMember[memberId], AdvisoryBoardMemberCannotLeave());

    emit MembershipChanged(memberId, msg.sender, address(0));

    // todo:
    // address[] memory pools = TC.getManagerStakingPools(memberId)
    // require(pools.length == 0, StakingPoolManagersCannotLeave());

    delete members[memberId];
    delete memberIds[msg.sender];
    --membersMeta.memberCount;

    // todo:
    // TC.removeFromWhitelist(msg.sender)
    // uint balance = TK.balanceOf(msg.sender)
    // TK.burnFrom(msg.sender, balance) // or revert?
  }

  function migrateMembers (address[] membersToMigrate) external {
    uint count = membersToMigrate.length;
    for (uint i = 0; i < count; i++) {
      address member = membersToMigrate[i];

      if (memberIds[member] != 0) {
        uint memberId = ++membersMeta.lastMemberId;
        ++membersMeta.memberCount;
        memberIds[member] = memberId;
        members[memberId] = member;
      }
    }
  }

  // TODO: add only governance
  function setKycAuthAddress(address _kycAuthAddress) external {
    membersMeta.kycAuthAddress = _kycAuthAddress;
  }

  /* == CONTRACT MANAGEMENT == */

  function isValidContractIndex(uint index) public pure returns (bool) {
    // cheap validation that only one bit is set (i.e. it's a power of two)
    unchecked { return index & (index - 1) == 0 && index > 0; }
  }

  function deployContract(uint index, bytes32 salt, address implementation) external {
    require(isValidContractIndex(index), InvalidContractIndex());
    require(contracts[index].addr == address(0), ContractAlreadyExists());
    UpgradeableProxy proxy = new UpgradeableProxy{salt: bytes32(salt)}();
    proxy.upgradeTo(implementation);
    contracts[index] = Contract({ addr: address(proxy), isProxy: true });
    contractIndexes[address(proxy)] = index;
  }

  function addContract(uint index, address contractAddress, bool isProxy) external {
    require(isValidContractIndex(index), InvalidContractIndex());
    require(contracts[index].addr == address(0), ContractAlreadyExists());
    contracts[index] = Contract({addr: contractAddress, isProxy: isProxy});
    contractIndexes[contractAddress] = index;
  }

  function upgradeContract(uint index, address implementation) external {
    Contract memory _contract = contracts[index];
    require(_contract.addr != address(0), ContractDoesNotExist());
    require(_contract.isProxy, ContractIsNotProxy());
    UpgradeableProxy proxy = UpgradeableProxy(payable(_contract.addr));
    proxy.upgradeTo(implementation);
  }

  // consider marking as deprecated instead
  function removeContract(uint index) external {
    address contractAddress = contracts[index].addr;
    require(contractAddress != address(0), ContractDoesNotExist());
    contractIndexes[contractAddress] = 0;
    delete contracts[index];
  }

  function getContractAddressByIndex(uint index) external view returns (address) {
    require(isValidContractIndex(index), InvalidContractIndex());
    return contracts[index].addr;
  }

  function getContractTypeByIndex(uint index) external view returns (bool isProxy) {
    require(isValidContractIndex(index), InvalidContractIndex());
    return contracts[index].isProxy;
  }

  function getContractIndexByAddress(address contractAddress) external view returns (uint) {
    return contractIndexes[contractAddress];
  }

  function getContracts(uint[] memory indexes) external view returns (Contract[] memory _contracts) {
    _contracts = new Contract[](indexes.length);
    for (uint i = 0; i < indexes.length; i++) {
      require(isValidContractIndex(indexes[i]), InvalidContractIndex());
      _contracts[i] = contracts[indexes[i]];
    }
  }

}

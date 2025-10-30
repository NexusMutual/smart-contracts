// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../abstract/EIP712.sol";
import "../../abstract/RegistryAware.sol";
import "../../interfaces/INXMMaster.sol";
import "../../interfaces/IRegistry.sol";
import "../../interfaces/ITokenController.sol";
import "../../libraries/SafeUintCast.sol";
import "./UpgradeableProxy.sol";

contract Registry is IRegistry, EIP712 {
  using SafeUintCast for uint;

  // contracts
  mapping(uint index => Contract) internal contracts;
  mapping(address contractAddress => uint index) internal contractIndexes;

  // membership
  MembersMeta internal membersMeta; // 1 slot
  mapping(uint memberId => address member) internal members;
  mapping(address member => uint memberId) internal memberIds;
  mapping(address member => bool used) internal wasAddressUsedForJoining;

  // advisory board seat assignment
  mapping(uint seat => uint memberId) internal seatToMember;
  mapping(uint memberId => uint seat) internal memberToSeat;

  // emergency pause
  mapping(address => bool) public isEmergencyAdmin;
  SystemPause internal systemPause; // 3 slots

  modifier onlyGovernor() {
    address governor = contracts[C_GOVERNOR].addr;
    require(msg.sender == governor, OnlyGovernor());
    _;
  }

  modifier onlyEmergencyAdmin() {
    require(isEmergencyAdmin[msg.sender], OnlyEmergencyAdmin());
    _;
  }

  modifier whenNotPaused(uint mask) {
    uint config = systemPause.config;
    uint maskWithGlobal = mask | PAUSE_GLOBAL;
    require(config & maskWithGlobal == 0, Paused(config, mask));
    _;
  }

  uint public constant ADVISORY_BOARD_SEATS = 5;
  uint public constant JOIN_FEE = 0.002 ether; // no more, no less
  bytes32 private constant JOIN_TYPEHASH = keccak256("Join(address member)");

  INXMMaster public immutable master;

  constructor(
    address _verifyingAddress,
    address _master
  ) EIP712("NexusMutualRegistry", "1.0.0", _verifyingAddress) {
    master = INXMMaster(_master);
  }

  /* == EMERGENCY PAUSE == */

  function setEmergencyAdmin(address _emergencyAdmin, bool enabled) external onlyGovernor {
    isEmergencyAdmin[_emergencyAdmin] = enabled;
    emit EmergencyAdminSet(_emergencyAdmin, enabled);
  }

  function proposePauseConfig(uint config) external onlyEmergencyAdmin {
    systemPause.proposedConfig = config.toUint48();
    systemPause.proposer = msg.sender;
    emit PauseConfigProposed(config, msg.sender);
  }

  function confirmPauseConfig(uint config) external onlyEmergencyAdmin {
    require(systemPause.proposer != address(0), NoConfigProposed());
    require(systemPause.proposer != msg.sender, ProposerCannotConfirmPause());
    require(systemPause.proposedConfig == uint48(config), PauseConfigMismatch());
    systemPause.config = uint48(config);
    delete systemPause.proposedConfig;
    delete systemPause.proposer;
    emit PauseConfigConfirmed(config, msg.sender);
  }

  function getSystemPause() external view returns (SystemPause memory) {
    return systemPause;
  }

  function getPauseConfig() external view returns (uint config) {
    return systemPause.config;
  }

  function isPaused(uint mask) external view returns (bool) {
    uint maskWithGlobal = mask | PAUSE_GLOBAL;
    return systemPause.config & maskWithGlobal != 0;
  }

  /* == MEMBERSHIP MANAGEMENT == */

  function isMember(address member) external view returns (bool) {
    return memberIds[member] != 0;
  }

  function getMemberId(address member) external view returns (uint) {
    return memberIds[member];
  }

  function getMemberAddress(uint memberId) external view returns (address) {
    return members[memberId];
  }

  function getMemberCount() external view returns (uint) {
    return membersMeta.memberCount;
  }

  function getLastMemberId() external view returns (uint) {
    return membersMeta.lastMemberId;
  }

  function join(address member, bytes memory signature) external payable whenNotPaused(PAUSE_MEMBERSHIP) {
    require(memberIds[member] == 0, AlreadyMember());
    require(wasAddressUsedForJoining[member] == false, AddressAlreadyUsedForJoining());
    require(msg.value == JOIN_FEE, InvalidJoinFee());

    (bool success, ) = payable(contracts[C_POOL].addr).call{value: JOIN_FEE}("");
    require(success, FeeTransferFailed());

    bytes memory message = abi.encode(JOIN_TYPEHASH, member);
    address signer = recoverSigner(message, signature);
    require(membersMeta.kycAuthAddress == signer, InvalidSignature());
    wasAddressUsedForJoining[member] = true;

    uint memberId = ++membersMeta.lastMemberId;
    ++membersMeta.memberCount;
    memberIds[member] = memberId;
    members[memberId] = member;

    ITokenController(contracts[C_TOKEN_CONTROLLER].addr).addToWhitelist(member);

    emit MembershipChanged(memberId, address(0), member);
  }

  function switchTo(address to) external whenNotPaused(PAUSE_MEMBERSHIP) {
    _switch(msg.sender, to, true);
  }

  function switchFor(address from, address to) external whenNotPaused(PAUSE_MEMBERSHIP) {
    require(master.getLatestAddress("MR") == msg.sender, NotMemberRoles());
    _switch(from, to, false);
  }

  function _switch(address from, address to, bool includeNxmTokens) internal {
    uint memberId = memberIds[from];
    require(memberId != 0, NotMember());
    require(memberIds[to] == 0, AlreadyMember());

    delete memberIds[from];
    memberIds[to] = memberId;
    members[memberId] = to;

    ITokenController(contracts[C_TOKEN_CONTROLLER].addr).switchMembership(from, to, includeNxmTokens);

    emit MembershipChanged(memberId, from, to);
  }

  function leave() external whenNotPaused(PAUSE_MEMBERSHIP) {

    uint memberId = memberIds[msg.sender];
    require(memberId != 0, NotMember());
    require(memberToSeat[memberId] == 0, AdvisoryBoardMemberCannotLeave());

    delete members[memberId];
    delete memberIds[msg.sender];
    --membersMeta.memberCount;

    ITokenController(contracts[C_TOKEN_CONTROLLER].addr).removeFromWhitelist(msg.sender);

    emit MembershipChanged(memberId, msg.sender, address(0));
  }

  function setKycAuthAddress(address _kycAuthAddress) external onlyGovernor {
    membersMeta.kycAuthAddress = _kycAuthAddress;
  }

  function getKycAuthAddress() external view returns (address) {
    return membersMeta.kycAuthAddress;
  }

  /* == ADVISORY BOARD MANAGEMENT == */
  function isAdvisoryBoardMember(address member) external view returns (bool) {
    uint memberId = memberIds[member];
    return memberToSeat[memberId] != 0;
  }

  function isAdvisoryBoardMemberById(uint memberId) external view returns (bool) {
    return memberToSeat[memberId] != 0;
  }

  function getAdvisoryBoardSeat(address member) external view returns (uint) {
    uint memberId = memberIds[member];
    uint seat = memberToSeat[memberId];
    require(seat != 0, NotAdvisoryBoardMember());
    return seat;
  }

  function getMemberIdBySeat(uint seat) external view returns (uint) {
    require(seat != 0 && seat <= ADVISORY_BOARD_SEATS, InvalidSeat());
    return seatToMember[seat];
  }

  function getMemberAddressBySeat(uint seat) external view returns (address) {
    require(seat != 0 && seat <= ADVISORY_BOARD_SEATS, InvalidSeat());
    return members[seatToMember[seat]];
  }

  function swapAdvisoryBoardMember(uint from, uint to) external onlyGovernor {
    require(from != 0, NotMember());
    require(to != 0, NotMember());
    require(members[to] != address(0), NotMember());

    require(memberToSeat[from] != 0, NotAdvisoryBoardMember());
    require(memberToSeat[to] == 0, AlreadyAdvisoryBoardMember());

    uint seat = memberToSeat[from];
    memberToSeat[from] = 0;
    memberToSeat[to] = seat;
    seatToMember[seat] = to;

    emit AdvisoryBoardMemberSwapped(seat, from, to);
  }

  /* == CONTRACT MANAGEMENT == */

  function isValidContractIndex(uint index) public pure returns (bool) {
    // cheap validation that only one bit is set (i.e. it's a power of two)
    unchecked { return index & (index - 1) == 0 && index > 0; }
  }

  function isProxyContract(uint index) external view returns (bool) {
    require(isValidContractIndex(index), InvalidContractIndex());
    Contract memory contractDetails = contracts[index];
    require(contractDetails.addr != address(0), ContractDoesNotExist());
    return contractDetails.isProxy;
  }

  function getContractAddressByIndex(uint index) external view returns (address payable) {
    require(isValidContractIndex(index), InvalidContractIndex());
    address addr = contracts[index].addr;
    require(addr != address(0), ContractDoesNotExist());
    return payable(addr);
  }

  function getContractIndexByAddress(address contractAddress) external view returns (uint) {
    require(contractAddress != address(0), InvalidContractAddress());
    uint idx = contractIndexes[contractAddress];
    require(idx != 0, ContractDoesNotExist());
    return idx;
  }

  function getContracts(uint[] memory indexes) external view returns (Contract[] memory _contracts) {
    _contracts = new Contract[](indexes.length);
    for (uint i = 0; i < indexes.length; i++) {
      require(isValidContractIndex(indexes[i]), InvalidContractIndex());
      _contracts[i] = contracts[indexes[i]];
    }
  }

  function deployContract(uint index, bytes32 salt, address implementation) external onlyGovernor {
    _deployContract(index, salt, implementation);
  }

  function _deployContract(uint index, bytes32 salt, address implementation) internal {
    require(isValidContractIndex(index), InvalidContractIndex());
    require(contracts[index].addr == address(0), ContractAlreadyExists());

    UpgradeableProxy proxy = new UpgradeableProxy{salt: bytes32(salt)}();
    proxy.upgradeTo(implementation);

    contracts[index] = Contract({ addr: address(proxy), isProxy: true });
    contractIndexes[address(proxy)] = index;

    emit ContractDeployed(index, address(proxy), implementation);
  }

  function upgradeContract(uint index, address implementation) external onlyGovernor {
    Contract memory _contract = contracts[index];
    require(_contract.addr != address(0), ContractDoesNotExist());
    require(_contract.isProxy, ContractIsNotProxy());

    UpgradeableProxy proxy = UpgradeableProxy(payable(_contract.addr));
    proxy.upgradeTo(implementation);

    emit ContractUpgraded(index, address(proxy), implementation);
  }

  function addContract(uint index, address contractAddress, bool isProxy) external onlyGovernor {
    _addContract(index, contractAddress, isProxy);
  }

  function _addContract(uint index, address contractAddress, bool isProxy) internal {
    require(isValidContractIndex(index), InvalidContractIndex());
    require(contractAddress != address(0), InvalidContractAddress());
    require(contracts[index].addr == address(0), ContractAlreadyExists());
    require(!isProxy || UpgradeableProxy(payable(contractAddress)).proxyOwner() == address(this), NotProxyOwner());

    contracts[index] = Contract({addr: contractAddress, isProxy: isProxy});
    contractIndexes[contractAddress] = index;

    emit ContractAdded(index, contractAddress, isProxy);
  }

  function removeContract(uint index) external onlyGovernor {
    Contract memory _contract = contracts[index];
    require(_contract.addr != address(0), ContractDoesNotExist());

    contractIndexes[_contract.addr] = 0;
    delete contracts[index];

    emit ContractRemoved(index, _contract.addr, _contract.isProxy);
  }

  function migrate(
    address governorImplementation,
    address coverNFT,
    address stakingNFT,
    address stakingPoolFactory,
    address token,
    bytes32 governorSalt,
    bytes32 poolSalt,
    bytes32 swapOperatorSalt,
    bytes32 assessmentSalt,
    bytes32 claimsSalt
  ) external {

    require(contracts[C_REGISTRY].addr == address(0), 'Registry: Already migrated');
    require(master.getLatestAddress("GV") == msg.sender, 'Registry: Not Governance');

    // all codes: SP CO AS CP CI ST TC RA PC P1 MR MC GV LO MS
    // copy over: SP CO    CP    ST TC RA                LO
    // drop:                              PC    MR MC       MS
    // redeploy:        AS    CI             P1       GV
    // add new:                                                SO

    // registry is marked as non proxy because registry is not its own owner
    _addContract(C_REGISTRY, address(this), false);

    _addContract(C_TOKEN, token, false);
    _addContract(C_COVER_NFT, coverNFT, false);
    _addContract(C_STAKING_NFT, stakingNFT, false);
    _addContract(C_STAKING_POOL_FACTORY, stakingPoolFactory, false);

    _addContract(C_STAKING_PRODUCTS, master.getLatestAddress("SP"), true);
    _addContract(C_COVER, master.getLatestAddress("CO"), true);
    _addContract(C_COVER_PRODUCTS, master.getLatestAddress("CP"), true);
    _addContract(C_SAFE_TRACKER, master.getLatestAddress("ST"), true);
    _addContract(C_TOKEN_CONTROLLER, master.getLatestAddress("TC"), true);
    _addContract(C_RAMM, master.getLatestAddress("RA"), true);
    _addContract(C_LIMIT_ORDERS, master.getLatestAddress("LO"), true);

    _deployContract(C_GOVERNOR, governorSalt, governorImplementation);
    _deployContract(C_POOL, poolSalt, address(0));
    _deployContract(C_SWAP_OPERATOR, swapOperatorSalt, address(0));
    _deployContract(C_ASSESSMENTS, assessmentSalt, address(0));
    _deployContract(C_CLAIMS, claimsSalt, address(0));
  }

  function migrateMembers(address[] calldata membersToMigrate) external {

    require(master.getLatestAddress("MR") == msg.sender, 'Registry: Not MemberRoles');

    uint count = membersToMigrate.length;

    for (uint i = 0; i < count; i++) {
      address member = membersToMigrate[i];

      if (memberIds[member] != 0) {
        continue;
      }

      uint memberId = ++membersMeta.lastMemberId;
      ++membersMeta.memberCount;
      memberIds[member] = memberId;
      members[memberId] = member;

      emit MembershipChanged(memberId, address(0), member);
    }
  }

  function migrateAdvisoryBoardMembers(address[] calldata abMembers) external {

    require(master.getLatestAddress("MR") == msg.sender, 'Registry: Not MemberRoles');

    uint count = abMembers.length;
    require(count == ADVISORY_BOARD_SEATS, 'Registry: Invalid advisory board count');

    for (uint i = 0; i < count; i++) {
      address member = abMembers[i];
      uint memberId = memberIds[member];
      require(memberId != 0, NotMember());

      uint seat = i + 1;
      require(seatToMember[seat] == 0, 'Registry: AB seat already taken');

      memberToSeat[memberId] = seat;
      seatToMember[seat] = memberId;
    }
  }

}

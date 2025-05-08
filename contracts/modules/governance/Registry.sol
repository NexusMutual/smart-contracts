// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/IRegistry.sol";
import "./external/OwnedUpgradeabilityProxy.sol";

contract Registry is IRegistry {

  error ContractAlreadyExists();
  error InvalidContractCode();

  event Joined(address indexed member);
  event Left(address indexed member);
  event Swapped(address indexed previous, address indexed current);

  // index = 1 << code
  mapping(uint index => address contractAddress) internal contractAddresses;
  // reverse mapping
  mapping(address contractAddress => uint index) internal contractIndexes;

  // add ABs
  // add Members
  // add Pause (bitmap?)

  /* == CONTRACT MANAGEMENT == */

  function addContract(uint code, bytes32 salt, address implementation) external {
    require(contractAddresses[1 << code] == address(0), ContractAlreadyExists());

    address maxAddress = address(type(uint160).max); // using max address for a static bytecode hash
    OwnedUpgradeabilityProxy proxy = new OwnedUpgradeabilityProxy{salt: bytes32(salt)}(maxAddress);
    proxy.upgradeTo(implementation);

    contractAddresses[1 << code] = address(proxy);
    contractIndexes[address(proxy)] = 1 << code;
  }

  function upgradeContract(uint code, address implementation) external {
    require(code <= uint(type(Contract).max), InvalidContractCode());
    address contractAddress = contractAddresses[1 << code];
    OwnedUpgradeabilityProxy proxy = OwnedUpgradeabilityProxy(payable(contractAddress));
    proxy.upgradeTo(implementation);
  }

  function deprecateContract(uint code) external {
    require(code <= uint(type(Contract).max), InvalidContractCode());
    address contractAddress = contractAddresses[1 << code];
    contractIndexes[contractAddress] = 0;
    contractAddresses[code] = address(0);
  }

  /* == MEMBERSHIP MANAGEMENT == */
  // TODO: implement EIP712 signing instead

  function join(address _address, uint nonce, bytes calldata signature) public override payable {

    require(_address != address(0), UserAddressCantBeZero());
    require(!master.isPause(), Paused());
    require(!isMember(_address), AddressIsAlreadyMember());
    require(msg.value == JOINING_FEE, TransactionValueDifferentFromJoiningFee());

    // reconstruct the original message hash
    bytes32 messageHash = keccak256(abi.encode(MEMBERSHIP_APPROVAL, nonce, _address, block.chainid));

    // verify if the message hash hasn't been used before
    require(usedMessageHashes[messageHash] == false, SignatureAlreadyUsed());

    // mark it as used to avoid reuse after switching by membership
    usedMessageHashes[messageHash] = true;

    bytes32 ethSignedMessageHash = ECDSA.toEthSignedMessageHash(messageHash);
    address recoveredAddress = ECDSA.recover(ethSignedMessageHash, signature);
    require(recoveredAddress == kycAuthAddress, InvalidSignature());

    // whitelist the address
    tokenController().addToWhitelist(_address);
    _updateRole(_address, uint(Role.Member), true);

    // transfer the joining fee to the pool
    (bool ok, /* data */) = address(pool()).call{value: JOINING_FEE}("");
    require(ok, TransferToPoolFailed());

    emit Joined(_address);
  }

  /// Withdraws membership
  ///
  /// @dev Burns the user's NXM balance and removes them from the member list
  function leave() public whenNotPaused {

    ITokenController _tokenController = tokenController();

    require(isMember(msg.sender), OnlyMember());
    require(block.timestamp > token.isLockedForMV(msg.sender), LockedForVoting());
    require(tokenController().isStakingPoolManager(msg.sender) == false, CantBeStakingPoolManager());

    require(_tokenController.tokensLocked(msg.sender, "CLA") == 0, HasNXMStakedInClaimAssessmentV1());
    require(_tokenController.getPendingRewards(msg.sender) == 0, MemberHasPendingRewardsInTokenController());

    (uint96 stakeAmount, ,) = assessment().stakeOf(msg.sender);
    require(stakeAmount == 0, MemberHasAssessmentStake());

    _tokenController.burnFrom(msg.sender, token.balanceOf(msg.sender));
    _updateRole(msg.sender, uint(Role.Member), false);
    _tokenController.removeFromWhitelist(msg.sender); // need clarification on whitelist

    emit Left(msg.sender);
  }

  function swap(address to) external override {

    require(!master.isPause(), Paused());
    require(isMember(msg.sender), OnlyMember());
    require(!isMember(to), NewAddressIsAlreadyMember());
    require(block.timestamp > token.isLockedForMV(msg.sender), LockedForVoting());

    ITokenController _tokenController = tokenController();

    require(_tokenController.tokensLocked(msg.sender, "CLA") == 0, HasNXMStakedInClaimAssessmentV1());
    require(_tokenController.getPendingRewards(msg.sender) == 0, MemberHasPendingRewardsInTokenController());

    (uint96 stakeAmount, ,) = assessment().stakeOf(msg.sender);
    require(stakeAmount == 0, MemberHasAssessmentStake());

    _tokenController.addToWhitelist(to);
    _updateRole(msg.sender, uint(Role.Member), false);
    _updateRole(to, uint(Role.Member), true);

    _tokenController.removeFromWhitelist(msg.sender);

    token.transferFrom(msg.sender, to, token.balanceOf(msg.sender));
    tokenController().transferStakingPoolsOwnership(msg.sender, to);

    emit Swapped(msg.sender, to);
  }

  /* == GETTERS == */

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

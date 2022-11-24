// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/utils/cryptography/ECDSA.sol";

import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/IQuotationData.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IStakingPool.sol";
import "./external/Governed.sol";

contract MemberRoles is IMemberRoles, Governed, MasterAwareV2 {

  struct MemberRoleDetails {
    uint memberCounter;
    mapping(address => bool) memberActive;
    address[] memberAddress;
    address authorized;
  }

  ITokenController public _unused0;
  address payable public _unused1;
  address public kycAuthAddress;
  address internal _unused2;
  address internal _unused3;
  address internal _unused4;
  address public _unused5;

  MemberRoleDetails[] internal memberRoleData;
  bool internal _unused6;
  uint public maxABCount;
  bool public launched;
  uint public launchedOn;

  mapping(address => address payable) public _unused7;
  mapping(address => bool) public _unused8;
  mapping(bytes32 => bool) public usedMessageHashes;

  // Prefixes for ECDSA signatures' scope
  bytes32 public constant MEMBERSHIP_APPROVAL = bytes32('MEMBERSHIP_APPROVAL');
  uint public constant joiningFee = 0.002 ether;

  modifier checkRoleAuthority(uint _memberRoleId) {
    if (memberRoleData[_memberRoleId].authorized != address(0)) {
      require(msg.sender == memberRoleData[_memberRoleId].authorized);
    }
    else {
      require(master.checkIsAuthToGoverned(msg.sender), "Not Authorized");
    }
    _;
  }

  /// Replaces an advisory board member with another.
  ///
  /// @param _newABAddress  The address of new advisory board member
  /// @param _removeAB      The advisory board member to be removed
  function swapABMember(
    address _newABAddress,
    address _removeAB
  ) external checkRoleAuthority(uint(Role.AdvisoryBoard)) {
    _updateRole(_newABAddress, uint(Role.AdvisoryBoard), true);
    _updateRole(_removeAB, uint(Role.AdvisoryBoard), false);
  }

  /// Changes the maximum number of advisory board members.
  ///
  /// @param _val  The new maximum number of advisory board members.
  function changeMaxABCount(uint _val) external onlyGovernance {
    maxABCount = _val;
  }

  /// Sets the address of kyc notarising address.
  ///
  /// @param _add is the new address
  function setKycAuthAddress(address _add) external onlyGovernance {
    kycAuthAddress = _add;
  }

  /* ========== DEPENDENCIES ========== */

  function pool() internal view returns (IPool) {
    return IPool(internalContracts[uint(ID.P1)]);
  }

  function tokenController() internal view returns (ITokenController) {
    return ITokenController(internalContracts[uint(ID.TC)]);
  }

  // TODO: make immutable?
  function token() internal view returns (INXMToken) {
    return INXMToken(internalContracts[uint(ID.TK)]);
  }

  function cover() internal view returns (ICover) {
    return ICover(internalContracts[uint(ID.CO)]);
  }

  /// Updates contracts dependencies.
  ///
  /// @dev Iupgradable Interface to update dependent contract address
  function changeDependentContractAddress() public override {
    // qd storage variable was renamed to kycAuthAddress hence this check handles the migration
    // 0x1776651F58a17a50098d31ba3C3cD259C1903f7A is the address of QuotationData

    if (kycAuthAddress == 0x1776651F58a17a50098d31ba3C3cD259C1903f7A) {
      kycAuthAddress = IQuotationData(0x1776651F58a17a50098d31ba3C3cD259C1903f7A).kycAuthAddress();
    }

    internalContracts[uint(ID.TK)] = payable(master.tokenAddress());
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
    internalContracts[uint(ID.P1)] = master.getLatestAddress("P1");
    internalContracts[uint(ID.CO)] = master.getLatestAddress("CO");
  }

  /// Adds a new member role.
  ///
  /// @param _roleName         New role name.
  /// @param _roleDescription  New description hash.
  /// @param _authorized       Authorized member against every role id.
  function addRole(
    bytes32 _roleName,
    string memory _roleDescription,
    address _authorized
  ) public onlyGovernance {
    _addRole(_roleName, _roleDescription, _authorized);
  }

  /// Assign or Delete a member from a specific role.
  ///
  /// @param _memberAddress  Address of the scoped member.
  /// @param _roleId         The role id to update.
  /// @param _active         True if we want to assign this role to member or false otherwise.
  function updateRole(
    address _memberAddress,
    uint _roleId,
    bool _active
  ) public checkRoleAuthority(_roleId) {
    _updateRole(_memberAddress, _roleId, _active);
  }

  /// Finalises the sign up process by allowing the user to pay the joining fee and marks the
  /// address as a member.
  ///
  /// @dev A signature is required to verify if the address was approved. It is verified against
  /// the address and a nonce (incremented if a new signature is required for the same address).
  ///
  /// @param _userAddress  The address of the user for whom the joining fee is paid.
  /// @param nonce        Signers nonce. Increments if new signature needed for the same address
  /// @param  signature   The signed message hash
  function join(
    address _userAddress,
    uint nonce,
    bytes calldata signature
  ) public override payable {
    require(_userAddress != address(0), "MemberRoles: Address 0 cannot be used");
    require(!master.isPause(), "MemberRoles: Emergency pause applied");
    require(!isMember(_userAddress), "MemberRoles: This address is already a member");
    require(
      msg.value == joiningFee,
      "MemberRoles: The transaction value should equal to the joining fee"
    );

    // Reconstruct the original message hash.
    bytes32 messageHash = keccak256(abi.encode(MEMBERSHIP_APPROVAL, nonce, _userAddress, block.chainid));

    // Verify if the message hash hasn't been used before. If it has, it means that the nonce for
    // the given _userAddress needs to be higher and the signature should use the first available
    // one.
    require(
      usedMessageHashes[messageHash] == false,
      "MemberRoles: Signature already used"
    );

    // Mark it as used to avoid whitelisting an unbounded number of addresses when combining this
    // function with the switchMembership function.
    usedMessageHashes[messageHash] = true;

    // Signatures are obtained by signing the hash of the messageHash prefixed with
    // "\x19Ethereum Signed Message:\n32". This gives us the actual hash that was signed off chain.
    bytes32 ethSignedMessageHash = ECDSA.toEthSignedMessageHash(messageHash);

    // Verify the signature to see if membership has been approved.
    address recoveredAddress = ECDSA.recover(ethSignedMessageHash, signature);
    require(recoveredAddress == kycAuthAddress, "MemberRoles: Signature is invalid");

    // Whitelist the address.
    tokenController().addToWhitelist(_userAddress);
    _updateRole(_userAddress, uint(Role.Member), true);

    // Transfer the joining fee to the pool.
    (bool ok, /* data */) = address(pool()).call{value: joiningFee}("");
    require(ok, "MemberRoles: The joining fee transfer to the pool failed");

    emit MemberJoined(_userAddress, nonce);
  }

  /// Withdraws membership
  function withdrawMembership() public {

    INXMToken _token = token();
    ITokenController _tokenController = tokenController();
    require(!master.isPause() && isMember(msg.sender));
    // No locked tokens for Member/Governance voting
    require(block.timestamp > _token.isLockedForMV(msg.sender));

    _tokenController.burnFrom(msg.sender, _token.balanceOf(msg.sender));
    _updateRole(msg.sender, uint(Role.Member), false);
    _tokenController.removeFromWhitelist(msg.sender); // need clarification on whitelist

  }

  /// Switches membership from the sender's address to a new address.
  /// @param newAddress  The new address where membership will be switched to.
  function switchMembership(address newAddress) external override {
    _switchMembership(msg.sender, newAddress);
    INXMToken _token = token();
    _token.transferFrom(msg.sender, newAddress, _token.balanceOf(msg.sender));
  }

  /// Switches the membership from the sender's address to the new address and transfers the
  /// sender's assets in a single transaction.
  ///
  /// @param newAddress           Address of user to forward membership.
  /// @param coverIds             Array of cover ids to transfer to the new address.
  /// @param stakingPools         Array of staking pool addresses where the user has LP tokens.
  /// @param stakingPoolTokenIds  Arrays of token ids each belonging to each staking pool given
  ///                             through stakingPool parameter.
  function switchMembershipAndAssets(
    address newAddress,
    uint[] calldata coverIds,
    uint[] calldata stakingPools,
    uint[][] calldata stakingPoolTokenIds
  ) external override {
    _switchMembership(msg.sender, newAddress);
    INXMToken _token = token();
    _token.transferFrom(msg.sender, newAddress, _token.balanceOf(msg.sender));

    ICover _cover = cover();
    // Transfer the cover NFTs to the new address, if any were given
    _cover.transferCovers(msg.sender, newAddress, coverIds);

    // Transfer the staking deposits to the new address
    for (uint256 i = 0; i < stakingPools.length; i++) {
      IStakingPool stakingPool = _cover.stakingPool(stakingPools[i]);
      stakingPool.operatorTransfer(msg.sender, newAddress, stakingPoolTokenIds[i]);
    }

  }

  function switchMembershipOf(address member, address newAddress) external override onlyInternal {
    _switchMembership(member, newAddress);
  }

  function isMember(address member) public view returns (bool) {
    return checkRole(member, uint(IMemberRoles.Role.Member));
  }

  function _switchMembership(address currentAddress, address newAddress) internal {
    require(!master.isPause(), "System is paused");
    require(isMember(currentAddress), "The current address is not a member");
    require(!isMember(newAddress), "The new address is already a member");
    // No locked tokens for Governance voting
    require(block.timestamp > token().isLockedForMV(currentAddress), "Locked for governance voting");

    ITokenController _tokenController = tokenController();
    _tokenController.addToWhitelist(newAddress);
    _updateRole(currentAddress, uint(Role.Member), false);
    _updateRole(newAddress, uint(Role.Member), true);

    if (checkRole(currentAddress, uint(Role.AdvisoryBoard))) {
      _updateRole(currentAddress, uint(Role.AdvisoryBoard), false);
      _updateRole(newAddress, uint(Role.AdvisoryBoard), true);
    }

    _tokenController.removeFromWhitelist(currentAddress);

    emit switchedMembership(currentAddress, newAddress, block.timestamp);
  }

  /// Returns the number of member roles.
  function totalRoles() public override view returns (uint256) {//solhint-disable-line
    return memberRoleData.length;
  }

  /// Changes the member address who holds the authority to add or delete any member from specific
  /// role.
  ///
  /// @param _roleId         The role id to update its authorized address.
  /// @param _newAuthorized  The new authorized address against role id.
  function changeAuthorized(
    uint _roleId,
    address _newAuthorized
  ) public override checkRoleAuthority(_roleId) {//solhint-disable-line
    memberRoleData[_roleId].authorized = _newAuthorized;
  }

  /// Gets the member addresses assigned by a specific role.
  ///
  /// @param _memberRoleId  Member role id.
  /// @return roleId        Role id.
  /// @return memberArray   Member addresses of specified role id.
  function members(
    uint _memberRoleId
  ) public override view returns (uint, address[] memory memberArray) {//solhint-disable-line
    uint length = memberRoleData[_memberRoleId].memberAddress.length;
    uint i;
    uint j = 0;
    memberArray = new address[](memberRoleData[_memberRoleId].memberCounter);
    for (i = 0; i < length; i++) {
      address member = memberRoleData[_memberRoleId].memberAddress[i];
      if (memberRoleData[_memberRoleId].memberActive[member] && !_checkMemberInArray(member, memberArray)) {//solhint-disable-line
        memberArray[j] = member;
        j++;
      }
    }

    return (_memberRoleId, memberArray);
  }

  /// Gets all members' length
  ///
  /// @param _memberRoleId                                 The member role id
  ///
  /// @return memberRoleData[_memberRoleId].memberCounter  Total number of members with the given
  /// role id.
  function numberOfMembers(
    uint _memberRoleId
  ) public override view returns (uint) {//solhint-disable-line
    return memberRoleData[_memberRoleId].memberCounter;
  }

  /// Returns the member address who holds the right to add or remove any member from specific role.
  function authorized(
    uint _memberRoleId
  ) public override view returns (address) {//solhint-disable-line
    return memberRoleData[_memberRoleId].authorized;
  }

  /// Returns all role ids that have been assigned to a member so far.
  function roles(
    address _memberAddress
  ) public override view returns (uint[] memory) {//solhint-disable-line
    uint length = memberRoleData.length;
    uint[] memory assignedRoles = new uint[](length);
    uint counter = 0;
    for (uint i = 1; i < length; i++) {
      if (memberRoleData[i].memberActive[_memberAddress]) {
        assignedRoles[counter] = i;
        counter++;
      }
    }
    return assignedRoles;
  }

  /// Returns true if the given role id is assigned to a member.
  ///
  /// @param _memberAddress  Address of member.
  /// @param _roleId         The role id for which member address is checked against.
  function checkRole(
    address _memberAddress,
    uint _roleId
  ) public override view returns (bool) {//solhint-disable-line
    if (_roleId == uint(Role.UnAssigned))
      return true;
    else
      if (memberRoleData[_roleId].memberActive[_memberAddress]) //solhint-disable-line
        return true;
      else
        return false;
  }

  /// Returns the total number of members assigned against each role id.
  ///
  /// @return totalMembers  Total number of members for each particular role id
  function getMemberLengthForAllRoles() public override view returns (
    uint[] memory totalMembers
  ) {//solhint-disable-line
    totalMembers = new uint[](memberRoleData.length);
    for (uint i = 0; i < memberRoleData.length; i++) {
      totalMembers[i] = numberOfMembers(i);
    }
  }

  /// Update the member roles
  ///
  /// @param _memberAddress in concern
  /// @param _roleId the id of role
  /// @param _active if active is true, add the member, else remove it
  function _updateRole(address _memberAddress,
    uint _roleId,
    bool _active) internal {
    // require(_roleId != uint(Role.TokenHolder), "Membership to Token holder is detected automatically");
    if (_active) {
      require(!memberRoleData[_roleId].memberActive[_memberAddress]);
      memberRoleData[_roleId].memberCounter = memberRoleData[_roleId].memberCounter + 1;
      memberRoleData[_roleId].memberActive[_memberAddress] = true;
      memberRoleData[_roleId].memberAddress.push(_memberAddress);
    } else {
      require(memberRoleData[_roleId].memberActive[_memberAddress]);
      memberRoleData[_roleId].memberCounter = memberRoleData[_roleId].memberCounter - 1;
      delete memberRoleData[_roleId].memberActive[_memberAddress];
    }
  }

  /// Adds a new member role.
  ///
  /// @param _roleName         New role name.
  /// @param _roleDescription  New description hash.
  /// @param _authorized       Authorized member against every role id.
  function _addRole(
    bytes32 _roleName,
    string memory _roleDescription,
    address _authorized
  ) internal {
    emit MemberRole(memberRoleData.length, _roleName, _roleDescription);
    MemberRoleDetails storage newMemberRoleData = memberRoleData.push();
    newMemberRoleData.memberCounter = 0;
    newMemberRoleData.memberAddress = new address[](0);
    newMemberRoleData.authorized = _authorized;
  }

  /// Checks if a member address is in the given members array.
  ///
  /// @param _memberAddress  The address that's checked against memberArray.
  /// @param memberArray     Array of member addresses.
  /// @return memberExists   True if the member exists.
  function _checkMemberInArray(
    address _memberAddress,
    address[] memory memberArray
  )
  internal
  pure
  returns (bool memberExists)
  {
    uint i;
    for (i = 0; i < memberArray.length; i++) {
      if (memberArray[i] == _memberAddress) {
        memberExists = true;
        break;
      }
    }
  }

  /// Returns the member address and it's status for a given role and address index.
  ///
  /// @param _memberRoleId  The role id of the member.
  /// @param index          The index of the member in the memberAddress list.
  function memberAtIndex(
    uint _memberRoleId,
    uint index
  ) external override view returns (address, bool) {
    address memberAddress = memberRoleData[_memberRoleId].memberAddress[index];
    return (memberAddress, memberRoleData[_memberRoleId].memberActive[memberAddress]);
  }

  /// Returns the total number of addresses asigned to a given role.
  ///
  /// @param _memberRoleId  The role id for which the total address count is requested.
  function membersLength(
    uint _memberRoleId
  ) external override view returns (uint) {
    return memberRoleData[_memberRoleId].memberAddress.length;
  }
}

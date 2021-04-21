/* Copyright (C) 2020 NexusMutual.io

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see http://www.gnu.org/licenses/ */

pragma solidity ^0.5.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../abstract/Iupgradable.sol";
import "../../interfaces/IPooledStaking.sol";
import "../claims/ClaimsData.sol";
import "./NXMToken.sol";
import "./external/LockHandler.sol";

contract TokenController is LockHandler, Iupgradable {
  using SafeMath for uint256;

  struct CoverInfo {
    uint16 claimCount;
    bool hasOpenClaim;
    bool hasAcceptedClaim;
    // note: still 224 bits available here, can be used later
  }

  NXMToken public token;
  IPooledStaking public pooledStaking;

  uint public minCALockTime;
  uint public claimSubmissionGracePeriod;

  // coverId => CoverInfo
  mapping(uint => CoverInfo) public coverInfo;

  event Locked(address indexed _of, bytes32 indexed _reason, uint256 _amount, uint256 _validity);

  event Unlocked(address indexed _of, bytes32 indexed _reason, uint256 _amount);

  event Burned(address indexed member, bytes32 lockedUnder, uint256 amount);

  modifier onlyGovernance {
    require(msg.sender == ms.getLatestAddress("GV"), "TokenController: Caller is not governance");
    _;
  }

  /**
  * @dev Just for interface
  */
  function changeDependentContractAddress() public {
    token = NXMToken(ms.tokenAddress());
    pooledStaking = IPooledStaking(ms.getLatestAddress("PS"));
  }

  function markCoverClaimOpen(uint coverId) external onlyInternal {

    CoverInfo storage info = coverInfo[coverId];

    uint16 claimCount;
    bool hasOpenClaim;
    bool hasAcceptedClaim;

    // reads all of them using a single SLOAD
    (claimCount, hasOpenClaim, hasAcceptedClaim) = (info.claimCount, info.hasOpenClaim, info.hasAcceptedClaim);

    // no safemath for uint16 but should be safe from
    // overflows as there're max 2 claims per cover
    claimCount = claimCount + 1;

    require(claimCount <= 2, "TokenController: Max claim count exceeded");
    require(hasOpenClaim == false, "TokenController: Cover already has an open claim");
    require(hasAcceptedClaim == false, "TokenController: Cover already has accepted claims");

    // should use a single SSTORE for both
    (info.claimCount, info.hasOpenClaim) = (claimCount, true);
  }

  /**
   * @param coverId cover id (careful, not claim id!)
   * @param isAccepted claim verdict
   */
  function markCoverClaimClosed(uint coverId, bool isAccepted) external onlyInternal {

    CoverInfo storage info = coverInfo[coverId];
    require(info.hasOpenClaim == true, "TokenController: Cover claim is not marked as open");

    // should use a single SSTORE for both
    (info.hasOpenClaim, info.hasAcceptedClaim) = (false, isAccepted);
  }

  /**
   * @dev to change the operator address
   * @param _newOperator is the new address of operator
   */
  function changeOperator(address _newOperator) public onlyInternal {
    token.changeOperator(_newOperator);
  }

  /**
   * @dev Proxies token transfer through this contract to allow staking when members are locked for voting
   * @param _from   Source address
   * @param _to     Destination address
   * @param _value  Amount to transfer
   */
  function operatorTransfer(address _from, address _to, uint _value) external onlyInternal returns (bool) {
    require(msg.sender == address(pooledStaking), "TokenController: Call is only allowed from PooledStaking address");
    token.operatorTransfer(_from, _value);
    token.transfer(_to, _value);
    return true;
  }

  /**
  * @dev Locks a specified amount of tokens,
  *    for CLA reason and for a specified time
  * @param _amount Number of tokens to be locked
  * @param _time Lock time in seconds
  */
  function lockClaimAssessmentTokens(uint256 _amount, uint256 _time) external checkPause {
    require(minCALockTime <= _time, "TokenController: Must lock for minimum time");
    require(_time <= 180 days, "TokenController: Tokens can be locked for 180 days maximum");
    // If tokens are already locked, then functions extendLock or
    // increaseClaimAssessmentLock should be used to make any changes
    _lock(msg.sender, "CLA", _amount, _time);
  }

  /**
  * @dev Locks a specified amount of tokens against an address,
  *    for a specified reason and time
  * @param _reason The reason to lock tokens
  * @param _amount Number of tokens to be locked
  * @param _time Lock time in seconds
  * @param _of address whose tokens are to be locked
  */
  function lockOf(address _of, bytes32 _reason, uint256 _amount, uint256 _time)
  public
  onlyInternal
  returns (bool)
  {
    // If tokens are already locked, then functions extendLock or
    // increaseLockAmount should be used to make any changes
    _lock(_of, _reason, _amount, _time);
    return true;
  }

  /**
  * @dev Mints and locks a specified amount of tokens against an address,
  *      for a CN reason and time
  * @param _of address whose tokens are to be locked
  * @param _reason The reason to lock tokens
  * @param _amount Number of tokens to be locked
  * @param _time Lock time in seconds
  */
  function mintCoverNote(
    address _of,
    bytes32 _reason,
    uint256 _amount,
    uint256 _time
  ) external onlyInternal {

    require(_tokensLocked(_of, _reason) == 0, "TokenController: An amount of tokens is already locked");
    require(_amount != 0, "TokenController: Amount shouldn't be zero");

    if (locked[_of][_reason].amount == 0) {
      lockReason[_of].push(_reason);
    }

    token.mint(address(this), _amount);

    uint256 lockedUntil = now.add(_time);
    locked[_of][_reason] = LockToken(_amount, lockedUntil, false);

    emit Locked(_of, _reason, _amount, lockedUntil);
  }

  /**
  * @dev Extends lock for reason CLA for a specified time
  * @param _time Lock extension time in seconds
  */
  function extendClaimAssessmentLock(uint256 _time) external checkPause {
    uint256 validity = getLockedTokensValidity(msg.sender, "CLA");
    require(validity.add(_time).sub(block.timestamp) <= 180 days, "TokenController: Tokens can be locked for 180 days maximum");
    _extendLock(msg.sender, "CLA", _time);
  }

  /**
  * @dev Extends lock for a specified reason and time
  * @param _reason The reason to lock tokens
  * @param _time Lock extension time in seconds
  */
  function extendLockOf(address _of, bytes32 _reason, uint256 _time)
  public
  onlyInternal
  returns (bool)
  {
    _extendLock(_of, _reason, _time);
    return true;
  }

  /**
  * @dev Increase number of tokens locked for a CLA reason
  * @param _amount Number of tokens to be increased
  */
  function increaseClaimAssessmentLock(uint256 _amount) external checkPause
  {
    require(_tokensLocked(msg.sender, "CLA") > 0, "TokenController: No tokens locked");
    token.operatorTransfer(msg.sender, _amount);

    locked[msg.sender]["CLA"].amount = locked[msg.sender]["CLA"].amount.add(_amount);
    emit Locked(msg.sender, "CLA", _amount, locked[msg.sender]["CLA"].validity);
  }

  /**
   * @dev burns tokens of an address
   * @param _of is the address to burn tokens of
   * @param amount is the amount to burn
   * @return the boolean status of the burning process
   */
  function burnFrom(address _of, uint amount) public onlyInternal returns (bool) {
    return token.burnFrom(_of, amount);
  }

  /**
  * @dev Burns locked tokens of a user
  * @param _of address whose tokens are to be burned
  * @param _reason lock reason for which tokens are to be burned
  * @param _amount amount of tokens to burn
  */
  function burnLockedTokens(address _of, bytes32 _reason, uint256 _amount) public onlyInternal {
    _burnLockedTokens(_of, _reason, _amount);
  }

  /**
  * @dev reduce lock duration for a specified reason and time
  * @param _of The address whose tokens are locked
  * @param _reason The reason to lock tokens
  * @param _time Lock reduction time in seconds
  */
  function reduceLock(address _of, bytes32 _reason, uint256 _time) public onlyInternal {
    _reduceLock(_of, _reason, _time);
  }

  /**
  * @dev Released locked tokens of an address locked for a specific reason
  * @param _of address whose tokens are to be released from lock
  * @param _reason reason of the lock
  * @param _amount amount of tokens to release
  */
  function releaseLockedTokens(address _of, bytes32 _reason, uint256 _amount)
  public
  onlyInternal
  {
    _releaseLockedTokens(_of, _reason, _amount);
  }

  /**
  * @dev Adds an address to whitelist maintained in the contract
  * @param _member address to add to whitelist
  */
  function addToWhitelist(address _member) public onlyInternal {
    token.addToWhiteList(_member);
  }

  /**
  * @dev Removes an address from the whitelist in the token
  * @param _member address to remove
  */
  function removeFromWhitelist(address _member) public onlyInternal {
    token.removeFromWhiteList(_member);
  }

  /**
  * @dev Mints new token for an address
  * @param _member address to reward the minted tokens
  * @param _amount number of tokens to mint
  */
  function mint(address _member, uint _amount) public onlyInternal {
    token.mint(_member, _amount);
  }

  /**
   * @dev Lock the user's tokens
   * @param _of user's address.
   */
  function lockForMemberVote(address _of, uint _days) public onlyInternal {
    token.lockForMemberVote(_of, _days);
  }

  /**
  * @dev Unlocks the withdrawable tokens against CLA of a specified address
  * @param _of Address of user, claiming back withdrawable tokens against CLA
  */
  function withdrawClaimAssessmentTokens(address _of) external checkPause {
    uint256 withdrawableTokens = _tokensUnlockable(_of, "CLA");
    if (withdrawableTokens > 0) {
      locked[_of]["CLA"].claimed = true;
      emit Unlocked(_of, "CLA", withdrawableTokens);
      token.transfer(_of, withdrawableTokens);
    }
  }

  /**
   * @dev Updates Uint Parameters of a code
   * @param code whose details we want to update
   * @param value value to set
   */
  function updateUintParameters(bytes8 code, uint value) external onlyGovernance {

    if (code == "MNCLT") {
      minCALockTime = value;
      return;
    }

    if (code == "GRACEPER") {
      claimSubmissionGracePeriod = value;
      return;
    }

    revert("TokenController: invalid param code");
  }

  function getLockReasons(address _of) external view returns (bytes32[] memory reasons) {
    return lockReason[_of];
  }

  /**
  * @dev Gets the validity of locked tokens of a specified address
  * @param _of The address to query the validity
  * @param reason reason for which tokens were locked
  */
  function getLockedTokensValidity(address _of, bytes32 reason) public view returns (uint256 validity) {
    validity = locked[_of][reason].validity;
  }

  /**
  * @dev Gets the unlockable tokens of a specified address
  * @param _of The address to query the the unlockable token count of
  */
  function getUnlockableTokens(address _of)
  public
  view
  returns (uint256 unlockableTokens)
  {
    for (uint256 i = 0; i < lockReason[_of].length; i++) {
      unlockableTokens = unlockableTokens.add(_tokensUnlockable(_of, lockReason[_of][i]));
    }
  }

  /**
  * @dev Returns tokens locked for a specified address for a
  *    specified reason
  *
  * @param _of The address whose tokens are locked
  * @param _reason The reason to query the lock tokens for
  */
  function tokensLocked(address _of, bytes32 _reason)
  public
  view
  returns (uint256 amount)
  {
    return _tokensLocked(_of, _reason);
  }

  /**
  * @dev Returns tokens locked and validity for a specified address and reason
  * @param _of The address whose tokens are locked
  * @param _reason The reason to query the lock tokens for
  */
  function tokensLockedWithValidity(address _of, bytes32 _reason)
  public
  view
  returns (uint256 amount, uint256 validity)
  {

    bool claimed = locked[_of][_reason].claimed;
    amount = locked[_of][_reason].amount;
    validity = locked[_of][_reason].validity;

    if (claimed) {
      amount = 0;
    }
  }

  /**
  * @dev Returns unlockable tokens for a specified address for a specified reason
  * @param _of The address to query the the unlockable token count of
  * @param _reason The reason to query the unlockable tokens for
  */
  function tokensUnlockable(address _of, bytes32 _reason)
  public
  view
  returns (uint256 amount)
  {
    return _tokensUnlockable(_of, _reason);
  }

  function totalSupply() public view returns (uint256)
  {
    return token.totalSupply();
  }

  /**
  * @dev Returns tokens locked for a specified address for a
  *    specified reason at a specific time
  *
  * @param _of The address whose tokens are locked
  * @param _reason The reason to query the lock tokens for
  * @param _time The timestamp to query the lock tokens for
  */
  function tokensLockedAtTime(address _of, bytes32 _reason, uint256 _time)
  public
  view
  returns (uint256 amount)
  {
    return _tokensLockedAtTime(_of, _reason, _time);
  }

  /**
  * @dev Returns the total amount of tokens held by an address:
  *   transferable + locked + staked for pooled staking - pending burns.
  *   Used by Claims and Governance in member voting to calculate the user's vote weight.
  *
  * @param _of The address to query the total balance of
  * @param _of The address to query the total balance of
  */
  function totalBalanceOf(address _of) public view returns (uint256 amount) {

    amount = token.balanceOf(_of);

    for (uint256 i = 0; i < lockReason[_of].length; i++) {
      amount = amount.add(_tokensLocked(_of, lockReason[_of][i]));
    }

    uint stakerReward = pooledStaking.stakerReward(_of);
    uint stakerDeposit = pooledStaking.stakerDeposit(_of);

    amount = amount.add(stakerDeposit).add(stakerReward);
  }

  /**
  * @dev Returns the total amount of locked and staked tokens.
  *      Used by MemberRoles to check eligibility for withdraw / switch membership.
  *      Includes tokens locked for claim assessment, tokens staked for risk assessment, and locked cover notes
  *      Does not take into account pending burns.
  * @param _of member whose locked tokens are to be calculate
  */
  function totalLockedBalance(address _of) public view returns (uint256 amount) {

    for (uint256 i = 0; i < lockReason[_of].length; i++) {
      amount = amount.add(_tokensLocked(_of, lockReason[_of][i]));
    }

    amount = amount.add(pooledStaking.stakerDeposit(_of));
  }

  /**
  * @dev Locks a specified amount of tokens against an address,
  *    for a specified reason and time
  * @param _of address whose tokens are to be locked
  * @param _reason The reason to lock tokens
  * @param _amount Number of tokens to be locked
  * @param _time Lock time in seconds
  */
  function _lock(address _of, bytes32 _reason, uint256 _amount, uint256 _time) internal {
    require(_tokensLocked(_of, _reason) == 0, "TokenController: An amount of tokens is already locked");
    require(_amount != 0, "TokenController: Amount shouldn't be zero");

    if (locked[_of][_reason].amount == 0) {
      lockReason[_of].push(_reason);
    }

    token.operatorTransfer(_of, _amount);

    uint256 validUntil = now.add(_time);
    locked[_of][_reason] = LockToken(_amount, validUntil, false);
    emit Locked(_of, _reason, _amount, validUntil);
  }

  /**
  * @dev Returns tokens locked for a specified address for a
  *    specified reason
  *
  * @param _of The address whose tokens are locked
  * @param _reason The reason to query the lock tokens for
  */
  function _tokensLocked(address _of, bytes32 _reason)
  internal
  view
  returns (uint256 amount)
  {
    if (!locked[_of][_reason].claimed) {
      amount = locked[_of][_reason].amount;
    }
  }

  /**
  * @dev Returns tokens locked for a specified address for a
  *    specified reason at a specific time
  *
  * @param _of The address whose tokens are locked
  * @param _reason The reason to query the lock tokens for
  * @param _time The timestamp to query the lock tokens for
  */
  function _tokensLockedAtTime(address _of, bytes32 _reason, uint256 _time)
  internal
  view
  returns (uint256 amount)
  {
    if (locked[_of][_reason].validity > _time) {
      amount = locked[_of][_reason].amount;
    }
  }

  /**
  * @dev Extends lock for a specified reason and time
  * @param _of The address whose tokens are locked
  * @param _reason The reason to lock tokens
  * @param _time Lock extension time in seconds
  */
  function _extendLock(address _of, bytes32 _reason, uint256 _time) internal {
    require(_tokensLocked(_of, _reason) > 0, "TokenController: No tokens locked");
    emit Unlocked(_of, _reason, locked[_of][_reason].amount);
    locked[_of][_reason].validity = locked[_of][_reason].validity.add(_time);
    emit Locked(_of, _reason, locked[_of][_reason].amount, locked[_of][_reason].validity);
  }

  /**
  * @dev reduce lock duration for a specified reason and time
  * @param _of The address whose tokens are locked
  * @param _reason The reason to lock tokens
  * @param _time Lock reduction time in seconds
  */
  function _reduceLock(address _of, bytes32 _reason, uint256 _time) internal {
    require(_tokensLocked(_of, _reason) > 0, "TokenController: No tokens locked");
    emit Unlocked(_of, _reason, locked[_of][_reason].amount);
    locked[_of][_reason].validity = locked[_of][_reason].validity.sub(_time);
    emit Locked(_of, _reason, locked[_of][_reason].amount, locked[_of][_reason].validity);
  }

  /**
  * @dev Returns unlockable tokens for a specified address for a specified reason
  * @param _of The address to query the the unlockable token count of
  * @param _reason The reason to query the unlockable tokens for
  */
  function _tokensUnlockable(address _of, bytes32 _reason) internal view returns (uint256 amount)
  {
    if (locked[_of][_reason].validity <= now && !locked[_of][_reason].claimed) {
      amount = locked[_of][_reason].amount;
    }
  }

  /**
  * @dev Burns locked tokens of a user
  * @param _of address whose tokens are to be burned
  * @param _reason lock reason for which tokens are to be burned
  * @param _amount amount of tokens to burn
  */
  function _burnLockedTokens(address _of, bytes32 _reason, uint256 _amount) internal {
    uint256 amount = _tokensLocked(_of, _reason);
    require(amount >= _amount, "TokenController: Amount exceedes locked tokens amount");

    if (amount == _amount) {
      locked[_of][_reason].claimed = true;
    }

    locked[_of][_reason].amount = locked[_of][_reason].amount.sub(_amount);

    // lock reason removal is skipped here: needs to be done from offchain

    token.burn(_amount);
    emit Burned(_of, _reason, _amount);
  }

  /**
  * @dev Released locked tokens of an address locked for a specific reason
  * @param _of address whose tokens are to be released from lock
  * @param _reason reason of the lock
  * @param _amount amount of tokens to release
  */
  function _releaseLockedTokens(address _of, bytes32 _reason, uint256 _amount) internal
  {
    uint256 amount = _tokensLocked(_of, _reason);
    require(amount >= _amount, "TokenController: Amount exceedes locked tokens amount");

    if (amount == _amount) {
      locked[_of][_reason].claimed = true;
    }

    locked[_of][_reason].amount = locked[_of][_reason].amount.sub(_amount);

    // lock reason removal is skipped here: needs to be done from offchain

    token.transfer(_of, _amount);
    emit Unlocked(_of, _reason, _amount);
  }

  function withdrawCoverNote(
    address _of,
    uint[] calldata _coverIds,
    uint[] calldata _indexes
  ) external onlyInternal {

    uint reasonCount = lockReason[_of].length;
    uint lastReasonIndex = reasonCount.sub(1, "TokenController: No locked cover notes found");
    uint totalAmount = 0;

    // The iteration is done from the last to first to prevent reason indexes from
    // changing due to the way we delete the items (copy last to current and pop last).
    // The provided indexes array must be ordered, otherwise reason index checks will fail.

    for (uint i = _coverIds.length; i > 0; i--) {

      bool hasOpenClaim = coverInfo[_coverIds[i - 1]].hasOpenClaim;
      require(hasOpenClaim == false, "TokenController: Cannot withdraw for cover with an open claim");

      // note: cover owner is implicitly checked using the reason hash
      bytes32 _reason = keccak256(abi.encodePacked("CN", _of, _coverIds[i - 1]));
      uint _reasonIndex = _indexes[i - 1];
      require(lockReason[_of][_reasonIndex] == _reason, "TokenController: Bad reason index");

      uint amount = locked[_of][_reason].amount;
      totalAmount = totalAmount.add(amount);
      delete locked[_of][_reason];

      if (lastReasonIndex != _reasonIndex) {
        lockReason[_of][_reasonIndex] = lockReason[_of][lastReasonIndex];
      }

      lockReason[_of].pop();
      emit Unlocked(_of, _reason, amount);

      if (lastReasonIndex > 0) {
        lastReasonIndex = lastReasonIndex.sub(1, "TokenController: Reason count mismatch");
      }
    }

    token.transfer(_of, totalAmount);
  }

  function removeEmptyReason(address _of, bytes32 _reason, uint _index) external {
    _removeEmptyReason(_of, _reason, _index);
  }

  function removeMultipleEmptyReasons(
    address[] calldata _members,
    bytes32[] calldata _reasons,
    uint[] calldata _indexes
  ) external {

    require(_members.length == _reasons.length, "TokenController: members and reasons array lengths differ");
    require(_reasons.length == _indexes.length, "TokenController: reasons and indexes array lengths differ");

    for (uint i = _members.length; i > 0; i--) {
      uint idx = i - 1;
      _removeEmptyReason(_members[idx], _reasons[idx], _indexes[idx]);
    }
  }

  function _removeEmptyReason(address _of, bytes32 _reason, uint _index) internal {

    uint lastReasonIndex = lockReason[_of].length.sub(1, "TokenController: lockReason is empty");

    require(lockReason[_of][_index] == _reason, "TokenController: bad reason index");
    require(locked[_of][_reason].amount == 0, "TokenController: reason amount is not zero");

    if (lastReasonIndex != _index) {
      lockReason[_of][_index] = lockReason[_of][lastReasonIndex];
    }

    lockReason[_of].pop();
  }

  function initialize() external {
    require(claimSubmissionGracePeriod == 0, "TokenController: Already initialized");
    claimSubmissionGracePeriod = 120 days;
    migrate();
  }

  function migrate() internal {

    ClaimsData cd = ClaimsData(ms.getLatestAddress("CD"));
    uint totalClaims = cd.actualClaimLength() - 1;

    // fix stuck claims 21 & 22
    cd.changeFinalVerdict(20, -1);
    cd.setClaimStatus(20, 6);
    cd.changeFinalVerdict(21, -1);
    cd.setClaimStatus(21, 6);

    // reduce claim assessment lock period for members locked for more than 180 days
    // extracted using scripts/extract-ca-locked-more-than-180.js
    address payable[3] memory members = [
      0x4a9fA34da6d2378c8f3B9F6b83532B169beaEDFc,
      0x6b5DCDA27b5c3d88e71867D6b10b35372208361F,
      0x8B6D1e5b4db5B6f9aCcc659e2b9619B0Cd90D617
    ];

    for (uint i = 0; i < members.length; i++) {
      if (locked[members[i]]["CLA"].validity > now + 180 days) {
        locked[members[i]]["CLA"].validity = now + 180 days;
      }
    }

    for (uint i = 1; i <= totalClaims; i++) {

      (/*id*/, uint status) = cd.getClaimStatusNumber(i);
      (/*id*/, uint coverId) = cd.getClaimCoverId(i);
      int8 verdict = cd.getFinalVerdict(i);

      // SLOAD
      CoverInfo memory info = coverInfo[coverId];

      info.claimCount = info.claimCount + 1;
      info.hasAcceptedClaim = (status == 14);
      info.hasOpenClaim = (verdict == 0);

      // SSTORE
      coverInfo[coverId] = info;
    }
  }

}

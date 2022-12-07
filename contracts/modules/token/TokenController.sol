// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

import "../../interfaces/IAssessment.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IGovernance.sol";
import "../../interfaces/INXMMaster.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IPooledStaking.sol";
import "../../interfaces/IQuotationData.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/ITokenController.sol";
import "../../libraries/SafeUintCast.sol";
import "../../abstract/MasterAwareV2.sol";
import "./external/LockHandler.sol";

contract TokenController is ITokenController, LockHandler, MasterAwareV2 {
  using SafeUintCast for uint;

  IQuotationData public immutable quotationData;
  address public immutable claimsReward;

  address public _unused0;
  address public _unused1;
  address public _unused2;
  address public _unused3;
  address public _unused4;

  mapping(uint => StakingPoolNXMBalances) public override stakingPoolNXMBalances;

  // coverId => CoverInfo
  mapping(uint => CoverInfo) public override coverInfo;

  constructor(address quotationDataAddress, address claimsRewardAddress) {
    quotationData = IQuotationData(quotationDataAddress);
    claimsReward = claimsRewardAddress;
  }

  function unlistClaimsReward() external {
    token().removeFromWhiteList(claimsReward);
  }

  /* ========== DEPENDENCIES ========== */

  function token() public view returns (INXMToken) {
    return INXMToken(internalContracts[uint(ID.TK)]);
  }

  function pooledStaking() internal view returns (IPooledStaking) {
    return IPooledStaking(internalContracts[uint(ID.PS)]);
  }

  function assessment() internal view returns (IAssessment) {
    return IAssessment(internalContracts[uint(ID.AS)]);
  }

  function cover() internal view returns (ICover) {
    return ICover(internalContracts[uint(ID.CO)]);
  }

  function governance() internal view returns (IGovernance) {
    return IGovernance(internalContracts[uint(ID.GV)]);
  }

  /**
  * @dev Just for interface
  */
  function changeDependentContractAddress() public override {
    internalContracts[uint(ID.TK)] = payable(master.tokenAddress());
    internalContracts[uint(ID.PS)] = master.getLatestAddress("PS");
    internalContracts[uint(ID.AS)] = master.getLatestAddress("AS");
    internalContracts[uint(ID.CO)] = master.getLatestAddress("CO");
    internalContracts[uint(ID.GV)] = master.getLatestAddress("GV");
  }

  /**
   * @dev to change the operator address
   * @param _newOperator is the new address of operator
   */
  function changeOperator(address _newOperator) public override onlyGovernance {
    token().changeOperator(_newOperator);
  }

  /**
   * @dev Proxies token transfer through this contract to allow staking when members are locked for voting
   * @param _from   Source address
   * @param _to     Destination address
   * @param _value  Amount to transfer
   */
  function operatorTransfer(
    address _from,
    address _to,
    uint _value
  ) external override onlyInternal returns (bool) {
    INXMToken _token = token();
    _token.operatorTransfer(_from, _value);
    _token.transfer(_to, _value);
    return true;
  }

  /**
   * @dev burns tokens of an address
   * @param _of is the address to burn tokens of
   * @param amount is the amount to burn
   * @return the boolean status of the burning process
   */
  function burnFrom(address _of, uint amount) public override onlyInternal returns (bool) {
    return token().burnFrom(_of, amount);
  }

  /**
  * @dev Adds an address to whitelist maintained in the contract
  * @param _member address to add to whitelist
  */
  function addToWhitelist(address _member) public virtual override onlyInternal {
    token().addToWhiteList(_member);
  }

  /**
  * @dev Removes an address from the whitelist in the token
  * @param _member address to remove
  */
  function removeFromWhitelist(address _member) public override onlyInternal {
    token().removeFromWhiteList(_member);
  }

  /**
  * @dev Mints new token for an address
  * @param _member address to reward the minted tokens
  * @param _amount number of tokens to mint
  */
  function mint(address _member, uint _amount) public override onlyInternal {
    token().mint(_member, _amount);
  }

  /**
   * @dev Lock the user's tokens
   * @param _of user's address.
   */
  function lockForMemberVote(address _of, uint _days) public override onlyInternal {
    token().lockForMemberVote(_of, _days);
  }

  /**
  * @dev Unlocks the withdrawable tokens against CLA of a specified addresses
  * @param users  Addresses of users for whom the tokens are unlocked
  */
  function withdrawClaimAssessmentTokens(address[] calldata users) external {
    for (uint256 i = 0; i < users.length; i++) {
      if (locked[users[i]]["CLA"].claimed) {
        continue;
      }
      uint256 amount = locked[users[i]]["CLA"].amount;
      if (amount > 0) {
        locked[users[i]]["CLA"].claimed = true;
        emit Unlocked(users[i], "CLA", amount);
        token().transfer(users[i], amount);
      }
    }
  }

  /**
   * @dev Updates Uint Parameters of a code
   * @param code whose details we want to update
   * @param value value to set
   */
  function updateUintParameters(bytes8 code, uint value) external view onlyGovernance {
    // silence compiler warnings
    code;
    value;
    revert("TokenController: invalid param code");
  }

  function getLockReasons(address _of) external override view returns (bytes32[] memory reasons) {
    return lockReason[_of];
  }

  function totalSupply() public override view returns (uint256) {
    return token().totalSupply();
  }

  /// Returns the base voting power not the balance. It is used in governance voting as well as in
  /// snapshot voting.
  ///
  /// @dev Caution, this function is improperly named because reconfiguring snapshot voting was
  /// not desired. It accounts for the tokens in the user's wallet as well as tokens locked in
  /// assessment and legacy staking deposits. V2 staking deposits are excluded because they are
  /// delegated to the pool managers instead.
  /// TODO: add stake pool balance for pool operators
  ///
  /// @param _of  The member address for which the base voting power is calculated.
  function totalBalanceOf(address _of) public override view returns (uint256 amount) {

    amount = token().balanceOf(_of);

    // This loop can be removed once all cover notes are withdrawn
    for (uint256 i = 0; i < lockReason[_of].length; i++) {
      amount = amount + _tokensLocked(_of, lockReason[_of][i]);
    }

    // [todo] Can be removed after PooledStaking is decommissioned
    uint stakerReward = pooledStaking().stakerReward(_of);
    uint stakerDeposit = pooledStaking().stakerDeposit(_of);

    (
      uint assessmentStake,
      /*uint104 rewardsWithdrawableFromIndex*/,
      /*uint16 fraudCount*/
    ) = assessment().stakeOf(_of);

    amount += stakerDeposit + stakerReward + assessmentStake;
  }

  /// Withdraws governance rewards for the given member address
  /// @dev This function requires a batchSize that fits in one block. It cannot be 0.
  function withdrawGovernanceRewards(
    address memberAddress,
    uint batchSize
  ) public whenNotPaused {
    uint governanceRewards = governance().claimReward(memberAddress, batchSize);
    require(governanceRewards > 0, "TokenController: No withdrawable governance rewards");
    token().transfer(memberAddress, governanceRewards);
  }

  /// Withdraws governance rewards to the destination address. It can only be called by the owner
  /// of the rewards.
  /// @dev This function requires a batchSize that fits in one block. It cannot be 0.
  function withdrawGovernanceRewardsTo(
    address destination,
    uint batchSize
  ) public whenNotPaused {
    uint governanceRewards = governance().claimReward(msg.sender, batchSize);
    require(governanceRewards > 0, "TokenController: No withdrawable governance rewards");
    token().transfer(destination, governanceRewards);
  }

  /// Function used to claim all pending rewards in one tx. It can be used to selectively withdraw
  /// rewards.
  ///
  /// @param forUser           The address for whom the governance and/or assessment rewards are
  ///                          withdrawn.
  /// @param fromGovernance    When true, governance rewards are withdrawn.
  /// @param fromAssessment    When true, assessment rewards are withdrawn.
  /// @param batchSize         The maximum number of iterations to avoid unbounded loops when
  ///                          withdrawing governance and/or assessment rewards.
  /// @param fromStakingPools  An array of structures containing staking pools, token ids and
  ///                          tranche ids. See: WithdrawFromStakingPoolParams from ITokenController
  ///                          When empty, no staking rewards are withdrawn.
  function withdrawPendingRewards(
    address forUser,
    bool fromGovernance,
    bool fromAssessment,
    uint batchSize,
    WithdrawFromStakingPoolParams[] calldata fromStakingPools
  ) external whenNotPaused {

    if (fromAssessment) {
      assessment().withdrawRewards(forUser, batchSize.toUint104());
    }

    if (fromGovernance) {
      uint governanceRewards = governance().claimReward(forUser, batchSize);
      require(governanceRewards > 0, "TokenController: No withdrawable governance rewards");
      token().transfer(forUser, governanceRewards);
    }

    for (uint i = 0; i < fromStakingPools.length; i++) {

      // TODO: external call to user-controlled address (vuln)
      IStakingPool stakingPool = IStakingPool(fromStakingPools[i].poolAddress);

      for (uint j = 0; j < fromStakingPools[i].nfts.length; j++) {
        stakingPool.withdraw(
          fromStakingPools[i].nfts[j].id,
          false, // withdrawStake
          true,  // withdrawRewards
          fromStakingPools[i].nfts[j].trancheIds
        );
      }
    }
  }

  /**
  * @dev Returns tokens locked for a specified address for a
  *    specified reason
  *
  * @param _of The address whose tokens are locked
  * @param _reason The reason to query the lock tokens for
  */
  function _tokensLocked(
    address _of,
    bytes32 _reason
  ) internal view returns (uint256 amount) {
    if (!locked[_of][_reason].claimed) {
      amount = locked[_of][_reason].amount;
    }
  }

  // Can be removed once all cover notes are withdrawn
  function getWithdrawableCoverNotes(
    address coverOwner
  ) public view returns (
    uint[] memory coverIds,
    bytes32[] memory lockReasons,
    uint withdrawableAmount
  ) {

    uint[] memory allCoverIds = quotationData.getAllCoversOfUser(coverOwner);
    uint[] memory idsQueue = new uint[](allCoverIds.length);
    bytes32[] memory lockReasonsQueue = new bytes32[](allCoverIds.length);
    uint idsQueueLength = 0;

    for (uint i = 0; i < allCoverIds.length; i++) {
      uint coverId = allCoverIds[i];
      bytes32 lockReason = keccak256(abi.encodePacked("CN", coverOwner, coverId));
      uint coverNoteAmount = _tokensLocked(coverOwner, lockReason);

      if (coverNoteAmount > 0) {
        idsQueue[idsQueueLength] = coverId;
        lockReasonsQueue[idsQueueLength] = lockReason;
        withdrawableAmount += coverNoteAmount;
        idsQueueLength++;
      }
    }

    coverIds = new uint[](idsQueueLength);
    lockReasons = new bytes32[](idsQueueLength);

    for (uint i = 0; i < idsQueueLength; i++) {
      coverIds[i] = idsQueue[i];
      lockReasons[i] = lockReasonsQueue[i];
    }
  }

  // Can be removed once all cover notes are withdrawn
  function withdrawCoverNote(
    address user,
    uint[] calldata coverIds,
    uint[] calldata indexes
  ) external override {

    uint reasonCount = lockReason[user].length;
    require(reasonCount > 0, "TokenController: No locked cover notes found");
    uint lastReasonIndex = reasonCount - 1;
    uint totalAmount = 0;

    // The iteration is done from the last to first to prevent reason indexes from
    // changing due to the way we delete the items (copy last to current and pop last).
    // The provided indexes array must be ordered, otherwise reason index checks will fail.

    for (uint i = coverIds.length; i > 0; i--) {

      // note: cover owner is implicitly checked using the reason hash
      bytes32 _reason = keccak256(abi.encodePacked("CN", user, coverIds[i - 1]));
      uint _reasonIndex = indexes[i - 1];
      require(lockReason[user][_reasonIndex] == _reason, "TokenController: Bad reason index");

      uint amount = locked[user][_reason].amount;
      totalAmount = totalAmount + amount;
      delete locked[user][_reason];

      if (lastReasonIndex != _reasonIndex) {
        lockReason[user][_reasonIndex] = lockReason[user][lastReasonIndex];
      }

      lockReason[user].pop();
      emit Unlocked(user, _reason, amount);

      if (lastReasonIndex > 0) {
        lastReasonIndex = lastReasonIndex - 1;
      }
    }

    token().transfer(user, totalAmount);
  }

  function mintStakingPoolNXMRewards(uint amount, uint poolId) external {
    require(msg.sender == address(cover().stakingPool(poolId)), "TokenController: msg.sender not staking pool");
    token().mint(address(this), amount);
    stakingPoolNXMBalances[poolId].rewards += amount.toUint128();
  }

  function burnStakingPoolNXMRewards(uint amount, uint poolId) external {
    require(msg.sender == address(cover().stakingPool(poolId)), "TokenController: msg.sender not staking pool");
    stakingPoolNXMBalances[poolId].rewards -= amount.toUint128();
    token().burn(amount);
  }

  function depositStakedNXM(address from, uint amount, uint poolId) external {
    require(msg.sender == address(cover().stakingPool(poolId)), "TokenController: msg.sender not staking pool");
    stakingPoolNXMBalances[poolId].deposits += amount.toUint128();
    token().operatorTransfer(from, amount);
  }

  function withdrawNXMStakeAndRewards(address to, uint stakeToWithdraw, uint rewardsToWithdraw, uint poolId) external {
    require(msg.sender == address(cover().stakingPool(poolId)), "TokenController: msg.sender not staking pool");
    StakingPoolNXMBalances memory poolBalances = stakingPoolNXMBalances[poolId];
    poolBalances.deposits -= stakeToWithdraw.toUint128();
    poolBalances.rewards -= rewardsToWithdraw.toUint128();
    stakingPoolNXMBalances[poolId] = poolBalances;
    token().transfer(to, stakeToWithdraw + rewardsToWithdraw);
  }

  function burnStakedNXM(uint amount, uint poolId) external {
    require(msg.sender == address(cover().stakingPool(poolId)), "TokenController: msg.sender not staking pool");
    stakingPoolNXMBalances[poolId].deposits -= amount.toUint128();
    token().burn(amount);
  }
}

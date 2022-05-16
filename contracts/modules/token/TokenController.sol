// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "../../utils/SafeUintCast.sol";
import "../../abstract/LegacyMasterAware.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IPooledStaking.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/IAssessment.sol";
import "../../interfaces/IGovernance.sol";
import "../../interfaces/IQuotationData.sol";
import "../../interfaces/INXMMaster.sol";
import "../../interfaces/IStakingPool.sol";
import "./external/LockHandler.sol";

contract TokenController is ITokenController, LockHandler, LegacyMasterAware {
  using SafeUintCast for uint;
  IQuotationData public immutable quotationData;
  address public immutable claimsReward;

  INXMToken public override token;
  IPooledStaking public pooledStaking;
  IAssessment public assessment;
  IGovernance public governance;

  // coverId => CoverInfo
  mapping(uint => CoverInfo) public override coverInfo;

  constructor(address quotationDataAddress, address claimsRewardAddress) {
    quotationData = IQuotationData(quotationDataAddress);
    claimsReward = claimsRewardAddress;
  }

  /**
  * @dev Just for interface
  */
  function changeDependentContractAddress() public {
    token = INXMToken(ms.tokenAddress());
    pooledStaking = IPooledStaking(ms.getLatestAddress("PS"));
    assessment = IAssessment(ms.getLatestAddress("AS"));
  }

  /**
   * @dev to change the operator address
   * @param _newOperator is the new address of operator
   */
  function changeOperator(address _newOperator) public override onlyInternal {
    token.changeOperator(_newOperator);
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
    token.operatorTransfer(_from, _value);
    token.transfer(_to, _value);
    return true;
  }

  /**
   * @dev burns tokens of an address
   * @param _of is the address to burn tokens of
   * @param amount is the amount to burn
   * @return the boolean status of the burning process
   */
  function burnFrom(address _of, uint amount) public override onlyInternal returns (bool) {
    // [todo] Check if conracts can call token.burnFrom directly instead of
    // calling through TokenController
    return token.burnFrom(_of, amount);
  }

  /**
  * @dev Adds an address to whitelist maintained in the contract
  * @param _member address to add to whitelist
  */
  function addToWhitelist(address _member) public virtual override onlyInternal {
    token.addToWhiteList(_member);
  }

  /**
  * @dev Removes an address from the whitelist in the token
  * @param _member address to remove
  */
  function removeFromWhitelist(address _member) public override onlyInternal {
    token.removeFromWhiteList(_member);
  }

  /**
  * @dev Mints new token for an address
  * @param _member address to reward the minted tokens
  * @param _amount number of tokens to mint
  */
  function mint(address _member, uint _amount) public override onlyInternal {
    token.mint(_member, _amount);
  }

  /**
   * @dev Lock the user's tokens
   * @param _of user's address.
   */
  function lockForMemberVote(address _of, uint _days) public override onlyInternal {
    token.lockForMemberVote(_of, _days);
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
        token.transfer(users[i], amount);
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
    return token.totalSupply();
  }

  /**
  * @dev Returns the total amount of tokens held by an address:
  *   transferable + locked + staked for pooled staking - pending burns.
  *   Used by Claims and Governance in member voting to calculate the user's vote weight.
  *
  * @param _of The address to query the total balance of
  * @param _of The address to query the total balance of
  */
  function totalBalanceOf(address _of) public override view returns (uint256 amount) {

    amount = token.balanceOf(_of);

    // This loop can be removed once all cover notes are withdrawn
    for (uint256 i = 0; i < lockReason[_of].length; i++) {
      amount = amount + _tokensLocked(_of, lockReason[_of][i]);
    }

    // [todo] Consider accounting for v2 staking pools

    // [todo] Can be removed after PooledStaking is decommissioned
    uint stakerReward = pooledStaking.stakerReward(_of);
    uint stakerDeposit = pooledStaking.stakerDeposit(_of);

    (
      uint assessmentStake,
      /*uint104 rewardsWithdrawableFromIndex*/,
      /*uint16 fraudCount*/
    ) = assessment.stakeOf(_of);

    amount += stakerDeposit + stakerReward + assessmentStake;
  }

  /// Withdraws governance rewards for the given member address
  /// @dev This function requires a batchSize that fits in one block. It cannot be 0.
  function withdrawGovernanceRewards(
    address memberAddress,
    uint batchSize
  ) public isMemberAndcheckPause {
    uint governanceRewards = governance.claimReward(memberAddress, batchSize);
    require(governanceRewards > 0, "TokenController: No withdrawable governance rewards");
    token.transfer(memberAddress, governanceRewards);
  }

  /// Withdraws governance rewards to the destination address. It can only be called by the owner
  /// of the rewards.
  /// @dev This function requires a batchSize that fits in one block. It cannot be 0.
  function withdrawGovernanceRewardsTo(
    address destination,
    uint batchSize
  ) public isMemberAndcheckPause {
    uint governanceRewards = governance.claimReward(msg.sender, batchSize);
    require(governanceRewards > 0, "TokenController: No withdrawable governance rewards");
    token.transfer(destination, governanceRewards);
  }


  /// Function used to claim all pending rewards in one tx. It can be used to selectively withdraw
  /// rewards.
  ///
  /// @param forUser          The address for whom the governance and/or assessment rewards are
  ///                         withdrawn.
  /// @param fromGovernance   When true, governance rewards are withdrawn.
  /// @param fromAssessment   When true, assessment rewards are withdrawn.
  /// @param batchSize        The maximum number of iterations to avoid unbounded loops when
  ///                         withdrawing governance and/or assessment rewards.
  /// @param stakingPools     The addresses of the staking pools that have withdrawable rewards.
  ///                         When empty, no staking rewards are withdrawn.
  /// @param stakingTokenIds  The ids of the tokens corresponding to every staking pool provided
  ///                         above which have withdrwable rewards.
  /// @param stakingTermIds   The ids of the terms corresponding to every token provided above
  ///                         which have withdrwable rewards.
  function withdrawPendingRewards(
    address forUser,
    bool fromGovernance,
    bool fromAssessment,
    uint batchSize,
    address[] calldata stakingPools,
    uint[][] calldata stakingTokenIds,
    uint[][][] calldata stakingTermIds
  ) external isMemberAndcheckPause {
    if (fromAssessment) {
      assessment.withdrawRewards(forUser, batchSize.toUint104());
    }

    if (fromGovernance) {
      uint governanceRewards = governance.claimReward(forUser, batchSize);
      require(governanceRewards > 0, "TokenController: No withdrawable governance rewards");
      require(
        token.transfer(forUser, governanceRewards),
        "TokenController: Governance rewards transfer failed"
      );
    }

    require(
      stakingPools.length == stakingTokenIds.length,
      "TokenController: Provide all withdrawable the token ids for each staking pool"
    );
    require(
      stakingTokenIds.length == stakingTokenIds.length,
      "TokenController: Provide all expired terms for every token from each staking pool"
    );
    for (uint i = 0; i < stakingPools.length; i++) {
      require(
        stakingTokenIds[i].length == stakingTermIds[i].length,
        "TokenController: Provide all expired terms for each token"
      );
      WithdrawParams[] memory withdrawParams = new WithdrawParams[](stakingTokenIds.length);
      for (uint j = 0; j < stakingTokenIds.length; j++) {
        withdrawParams[j] = WithdrawParams(
          stakingTokenIds[i][j],
          false, // withdrawStake
          true,  // withdrawRewards
          stakingTermIds[i][j]
        );
      }
      IStakingPool(stakingPools[i]).withdraw(withdrawParams);
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

    token.transfer(user, totalAmount);
  }

  function initialize() external {
    token.addToWhiteList(address(this));
    token.removeFromWhiteList(claimsReward);
  }

  event Burned(address indexed member, bytes32 lockedUnder, uint256 amount);

}

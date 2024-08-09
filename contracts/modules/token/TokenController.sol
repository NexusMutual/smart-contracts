// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/IAssessment.sol";
import "../../interfaces/IGovernance.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IPooledStaking.sol";
import "../../interfaces/IQuotationData.sol";
import "../../interfaces/IStakingNFT.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/ITokenController.sol";
import "../../libraries/SafeUintCast.sol";
import "../../libraries/StakingPoolLibrary.sol";
import "../../abstract/MasterAwareV2.sol";
import "./external/LockHandler.sol";

contract TokenController is ITokenController, LockHandler, MasterAwareV2 {
  using SafeUintCast for uint;

  address public _unused_token;
  address public _unused_pooledStaking;
  uint public _unused_minCALockTime;
  uint public _unused_claimSubmissionGracePeriod;

  // coverId => CoverInfo
  mapping(uint => CoverInfo) public override coverInfo;

  // pool id => { rewards, deposits }
  mapping(uint => StakingPoolNXMBalances) public override stakingPoolNXMBalances;

  // pool id => manager
  mapping(uint => address) internal stakingPoolManagers;

  // pool id => offer
  mapping(uint => StakingPoolOwnershipOffer) internal stakingPoolOwnershipOffers;

  // manager => pool ids
  mapping(address => uint[]) internal managerStakingPools;

  INXMToken public immutable token;
  IQuotationData public immutable quotationData;
  address public immutable claimsReward;
  address public immutable stakingPoolFactory;
  IStakingNFT public immutable stakingNFT;

  constructor(
    address quotationDataAddress,
    address claimsRewardAddress,
    address stakingPoolFactoryAddress,
    address tokenAddress,
    address stakingNFTAddress
  ) {
    quotationData = IQuotationData(quotationDataAddress);
    claimsReward = claimsRewardAddress;
    stakingPoolFactory = stakingPoolFactoryAddress;
    token = INXMToken(tokenAddress);
    stakingNFT = IStakingNFT(stakingNFTAddress);
  }

  /* ========== DEPENDENCIES ========== */

  function pooledStaking() internal view returns (IPooledStaking) {
    return IPooledStaking(internalContracts[uint(ID.PS)]);
  }

  function assessment() internal view returns (IAssessment) {
    return IAssessment(internalContracts[uint(ID.AS)]);
  }

  function governance() internal view returns (IGovernance) {
    return IGovernance(internalContracts[uint(ID.GV)]);
  }

  function pool() internal view returns (IPool) {
    return IPool(internalContracts[uint(ID.P1)]);
  }

  function stakingPool(uint poolId) internal view returns (IStakingPool) {
    return IStakingPool(_stakingPool(poolId));
  }

  function _stakingPool(uint poolId) internal view returns (address) {
    return StakingPoolLibrary.getAddress(stakingPoolFactory, poolId);
  }

  function changeDependentContractAddress() public override {

    internalContracts[uint(ID.PS)] = master.getLatestAddress("PS");
    internalContracts[uint(ID.AS)] = master.getLatestAddress("AS");
    internalContracts[uint(ID.GV)] = master.getLatestAddress("GV");
    internalContracts[uint(ID.P1)] = master.getLatestAddress("P1");
  }

  /// @dev Changes the operator address.
  /// @param _newOperator The new address of the operator.
  function changeOperator(address _newOperator) public override onlyGovernance {
    token.changeOperator(_newOperator);
  }

  /// @dev Proxies token transfer through this contract to allow staking when members are locked for voting.
  /// @param _from  The source address.
  /// @param _to    The destination address.
  /// @param _value The amount to transfer.
  function operatorTransfer(
    address _from,
    address _to,
    uint _value
  ) external override onlyInternal returns (bool) {

    token.operatorTransfer(_from, _value);
    if (_to != address(this)) {
      token.transfer(_to, _value);
    }
    return true;
  }

  /// @dev Burns tokens of an address.
  /// @param _of     The address to burn tokens of.
  /// @param amount  The amount to burn.
  /// @return        The boolean status of the burning process.
  function burnFrom(address _of, uint amount) public override onlyInternal returns (bool) {
    return token.burnFrom(_of, amount);
  }

  /// @dev Adds an address to the whitelist maintained in the contract.
  /// @param _member The address to add to the whitelist.
  function addToWhitelist(address _member) public virtual override onlyInternal {
    token.addToWhiteList(_member);
  }

  /// @dev Removes an address from the whitelist in the token.
  /// @param _member The address to remove.
  function removeFromWhitelist(address _member) public override onlyInternal {
    token.removeFromWhiteList(_member);
  }

  /// @dev Mints new tokens for an address and checks if the address is a member.
  /// @param _member The address to send the minted tokens to.
  /// @param _amount The number of tokens to mint.
  function mint(address _member, uint _amount) public override onlyInternal {
    _mint(_member, _amount);
  }

  /// @dev Internal function to mint new tokens for an address and checks if the address is a member.
  /// @dev Other internal functions in this contract should use _mint and never token.mint directly.
  /// @param _member The address to send the minted tokens to.
  /// @param _amount The number of tokens to mint.
  function _mint(address _member, uint _amount) internal {

    require(
      _member == address(this) || token.whiteListed(_member),
      "TokenController: Address is not a member"
    );
    token.mint(_member, _amount);
  }

  /// @dev Locks the user's tokens.
  /// @param _of    The user's address.
  /// @param _days  The number of days to lock the tokens.
  function lockForMemberVote(address _of, uint _days) public override onlyInternal {
    token.lockForMemberVote(_of, _days);
  }

  /// @dev Unlocks the withdrawable tokens against CLA for specified addresses.
  /// @param users The addresses of users for whom the tokens are unlocked.
  function withdrawClaimAssessmentTokens(address[] calldata users) external override whenNotPaused {

    for (uint256 i = 0; i < users.length; i++) {
      _withdrawClaimAssessmentTokensForUser(users[i]);
    }
  }

  /// @dev Internal function to withdraw claim assessment tokens for a user.
  /// @param user The user's address.
  function _withdrawClaimAssessmentTokensForUser(address user) internal whenNotPaused {

    if (!locked[user]["CLA"].claimed) {
      uint256 amount = locked[user]["CLA"].amount;
      if (amount > 0) {
        locked[user]["CLA"].claimed = true;
        emit Unlocked(user, "CLA", amount);
        token.transfer(user, amount);
      }
    }
  }

  /// @dev Updates Uint Parameters of a code.
  /// @param code   The code whose details we want to update.
  /// @param value  The value to set.
  function updateUintParameters(bytes8 code, uint value) external view onlyGovernance {
    // silence compiler warnings
    code;
    value;
    revert("TokenController: invalid param code");
  }

  /// @notice Retrieves the reasons why a user's tokens were locked.
  /// @param _of       The address of the user whose lock reasons are being retrieved.
  /// @return reasons  An array of reasons (as bytes32) for the token lock.
  function getLockReasons(address _of) external override view returns (bytes32[] memory reasons) {
    return lockReason[_of];
  }

  /// @notice Returns the total supply of the NXM token.
  /// @return The total supply of the NXM token.
  function totalSupply() public override view returns (uint256) {
    return token.totalSupply();
  }

  /// @notice Returns the base voting power. It is used in governance and snapshot voting.
  ///         Includes the delegated tokens via staking pools.
  /// @param _of  The member address for which the base voting power is calculated.
  function totalBalanceOf(address _of) public override view returns (uint) {
    return _totalBalanceOf(_of, true);
  }

  /// @notice Returns the base voting power. It is used in governance and snapshot voting.
  /// @dev    Does not include the delegated tokens via staking pools in order to act as a fallback if
  ///         voting including delegations fails for whatever reason.
  /// @param _of  The member address for which the base voting power is calculated.
  function totalBalanceOfWithoutDelegations(address _of) public override view returns (uint) {
    return _totalBalanceOf(_of, false);
  }

  function _totalBalanceOf(address _of, bool includeManagedStakingPools) internal view returns (uint) {

    uint amount = token.balanceOf(_of);

    // This loop can be removed once all cover notes are withdrawn
    for (uint256 i = 0; i < lockReason[_of].length; i++) {
      amount = amount + tokensLocked(_of, lockReason[_of][i]);
    }

    // TODO: can be removed after PooledStaking is decommissioned
    amount += pooledStaking().stakerReward(_of);
    amount += pooledStaking().stakerDeposit(_of);

    (uint assessmentStake,,) = assessment().stakeOf(_of);
    amount += assessmentStake;

    if (includeManagedStakingPools) {
      uint managedStakingPoolCount = managerStakingPools[_of].length;
      for (uint i = 0; i < managedStakingPoolCount; i++) {
        uint poolId = managerStakingPools[_of][i];
        amount += stakingPoolNXMBalances[poolId].deposits;
      }
    }

    return amount;
  }

  /// @notice Returns the NXM price in ETH. To be use by external protocols.
  /// @dev Intended for external protocols - this is a proxy and the contract address won't change
  function getTokenPrice() public override view returns (uint tokenPrice) {
    // get spot price from ramm
    return pool().getTokenPrice();
  }

  /// @notice Withdraws governance rewards for the given member address
  /// @param memberAddress  The address of the member whose governance rewards are to be withdrawn.
  /// @param batchSize      The maximum number of iterations to avoid unbounded loops when withdrawing governance rewards.
  ///                       Cannot be 0 and must fit in one block
  function withdrawGovernanceRewards(
    address memberAddress,
    uint batchSize
  ) public whenNotPaused {

    uint governanceRewards = governance().claimReward(memberAddress, batchSize);
    require(governanceRewards > 0, "TokenController: No withdrawable governance rewards");

    token.transfer(memberAddress, governanceRewards);
  }

  /// @notice Withdraws governance rewards to the destination address. It can only be called by the owner
  ///         of the rewards.
  /// @param destination  The address to which the governance rewards will be transferred.
  /// @param batchSize    The maximum number of iterations to avoid unbounded loops when withdrawing governance rewards.
  ///                     Cannot be 0 and must fit in one block
  function withdrawGovernanceRewardsTo(
    address destination,
    uint batchSize
  ) public whenNotPaused {

    uint governanceRewards = governance().claimReward(msg.sender, batchSize);
    require(governanceRewards > 0, "TokenController: No withdrawable governance rewards");

    token.transfer(destination, governanceRewards);
  }

  /// @notice Retrieves the pending rewards for a given member.
  /// @param member  The address of the member whose pending rewards are to be retrieved.
  /// @return        The total amount of pending rewards for the given member.
  function getPendingRewards(address member) public view returns (uint) {

    (uint totalPendingAmountInNXM,,) = assessment().getRewards(member);
    uint governanceRewards = governance().getPendingReward(member);

    return totalPendingAmountInNXM + governanceRewards;
  }

  /// @notice Withdraws NXM from the Nexus platform based on specified options.
  /// @dev    Ensure the NXM is available and not locked before withdrawal. Only set flags in `WithdrawNxmOptions` for
  ///         withdrawable NXM. Reverts if some of the NXM being withdrawn is locked or unavailable.
  /// @param stakingPoolDeposits        Details for withdrawing staking pools stake and rewards. Empty array to skip
  /// @param stakingPoolManagerRewards  Details for withdrawing staking pools manager rewards. Empty array to skip
  /// @param govRewardsBatchSize        The maximum number of iterations to avoid unbounded loops when withdrawing
  ///                                   governance rewards.
  /// @param withdrawAssessment         Options specifying assesment withdrawals, set flags to true to include
  ///                                   specific assesment stake or rewards withdrawal.
  function withdrawNXM(
    WithdrawAssessment calldata withdrawAssessment,
    StakingPoolDeposit[] calldata stakingPoolDeposits,
    StakingPoolManagerReward[] calldata stakingPoolManagerRewards,
    uint assessmentRewardsBatchSize,
    uint govRewardsBatchSize
  ) external whenNotPaused {

    // assessment stake
    if (withdrawAssessment.stake) {
      assessment().unstakeAllFor(msg.sender);
    }

    // assessment rewards
    if (withdrawAssessment.rewards) {
      // pass in 0 batchSize to withdraw ALL Assessment rewards
      assessment().withdrawRewards(msg.sender, assessmentRewardsBatchSize.toUint104());
    }

    // governance rewards
    uint governanceRewards = governance().claimReward(msg.sender, govRewardsBatchSize);
    if (governanceRewards > 0) {
      token.transfer(msg.sender, governanceRewards);
    }

    // staking pool rewards and stake
    for (uint i = 0; i < stakingPoolDeposits.length; i++) {
      uint tokenId = stakingPoolDeposits[i].tokenId;
      uint poolId = stakingNFT.stakingPoolOf(tokenId);
      stakingPool(poolId).withdraw(tokenId, true, true, stakingPoolDeposits[i].trancheIds);
    }

    // staking pool manager rewards    
    for (uint i = 0; i < stakingPoolManagerRewards.length; i++) {
      uint poolId = stakingPoolManagerRewards[i].poolId;
      stakingPool(poolId).withdraw(0, false, true, stakingPoolManagerRewards[i].trancheIds);
    }
  }

  /// @dev Returns tokens locked for a specified address for a specified reason
  /// @param _of      The address whose tokens are locked
  /// @param _reason  The reason to query the locked tokens for
  function tokensLocked(
    address _of,
    bytes32 _reason
  ) public view returns (uint256 amount) {

    if (!locked[_of][_reason].claimed) {
      amount = locked[_of][_reason].amount;
    }
  }

  /// @dev Can be removed once all cover notes are withdrawn
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
      uint coverNoteAmount = tokensLocked(coverOwner, lockReason);

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

  /// @dev Can be removed once all cover notes are withdrawn
  function withdrawCoverNote(
    address user,
    uint[] calldata coverIds,
    uint[] calldata indexes
  ) public whenNotPaused override {

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

  /// @notice Retrieves the manager of a specific staking pool.
  /// @param poolId  The ID of the staking pool.
  /// @return        The address of the staking pool manager.
  function getStakingPoolManager(uint poolId) external override view returns (address) {
    return stakingPoolManagers[poolId];
  }

  /// @notice Retrieves the staking pools managed by a specific manager.
  /// @param manager  The address of the manager.
  /// @return         An array of staking pool IDs managed by the specified manager.
  function getManagerStakingPools(address manager) external override view returns (uint[] memory) {
    return managerStakingPools[manager];
  }

  /// @notice Checks if a given address is a staking pool manager.
  /// @param member  The address to check.
  function isStakingPoolManager(address member) external override view returns (bool) {
    return managerStakingPools[member].length > 0;
  }

  /// @notice Retrieves the ownership offer details for a specific staking pool.
  /// @param poolId            The ID of the staking pool.
  /// @return proposedManager  The address of the proposed new manager.
  /// @return deadline         The deadline for accepting the ownership offer.
  function getStakingPoolOwnershipOffer(
    uint poolId
  ) external override view returns (address proposedManager, uint deadline) {
    return (
      stakingPoolOwnershipOffers[poolId].proposedManager,
      stakingPoolOwnershipOffers[poolId].deadline
    );
  }

  /// @notice Transfer ownership of all staking pools managed by a member to a new address.
  /// @dev    Used when switching membership.
  /// @param from  address of the member whose pools are being transferred
  /// @param to    the new address of the member
  function transferStakingPoolsOwnership(address from, address to) external override onlyInternal {

    uint stakingPoolCount = managerStakingPools[from].length;

    if (stakingPoolCount == 0) {
      return;
    }

    while (stakingPoolCount > 0) {
      // remove from old
      uint poolId = managerStakingPools[from][stakingPoolCount - 1];
      managerStakingPools[from].pop();

      // add to new and update manager
      managerStakingPools[to].push(poolId);
      stakingPoolManagers[poolId] = to;

      stakingPoolCount--;
    }
  }

  function _assignStakingPoolManager(uint poolId, address manager) internal {

    address previousManager = stakingPoolManagers[poolId];

    // remove previous manager
    if (previousManager != address(0)) {
      uint managedPoolCount = managerStakingPools[previousManager].length;

      // find staking pool id index and remove from previous manager's list
      // on-chain iteration is expensive, but we don't expect to have many pools per manager
      for (uint i = 0; i < managedPoolCount; i++) {
        if (managerStakingPools[previousManager][i] == poolId) {
          uint lastIndex = managedPoolCount - 1;
          managerStakingPools[previousManager][i] = managerStakingPools[previousManager][lastIndex];
          managerStakingPools[previousManager].pop();
          break;
        }
      }
    }

    // add staking pool id to new manager's list
    managerStakingPools[manager].push(poolId);
    stakingPoolManagers[poolId] = manager;
  }

  /// @notice Transfers the ownership of a staking pool to a new address
  /// @dev    Used by PooledStaking during the migration
  /// @param poolId       id of the staking pool
  /// @param manager      address of the new manager of the staking pool
  function assignStakingPoolManager(uint poolId, address manager) external override onlyInternal {
    _assignStakingPoolManager(poolId, manager);
  }

  /// @notice Creates a ownership transfer offer for a staking pool
  /// @dev    The offer can be accepted by the proposed manager before the deadline expires
  /// @param poolId           id of the staking pool
  /// @param proposedManager  address of the proposed manager
  /// @param deadline         timestamp after which the offer expires
  function createStakingPoolOwnershipOffer(
    uint poolId,
    address proposedManager,
    uint deadline
  ) external override {

    require(msg.sender == stakingPoolManagers[poolId], "TokenController: Caller is not staking pool manager");
    require(block.timestamp < deadline, "TokenController: Deadline cannot be in the past");

    stakingPoolOwnershipOffers[poolId] = StakingPoolOwnershipOffer(proposedManager, deadline.toUint96());
  }

  /// @notice Accepts a staking pool ownership offer
  /// @param poolId  id of the staking pool
  function acceptStakingPoolOwnershipOffer(uint poolId) external override {

    address oldManager = stakingPoolManagers[poolId];

    require(
      block.timestamp > token.isLockedForMV(oldManager),
      "TokenController: Current manager is locked for voting in governance"
    );

    require(
      msg.sender == stakingPoolOwnershipOffers[poolId].proposedManager,
      "TokenController: Caller is not the proposed manager"
    );

    require(
      stakingPoolOwnershipOffers[poolId].deadline > block.timestamp,
      "TokenController: Ownership offer has expired"
    );

    _assignStakingPoolManager(poolId, msg.sender);

    delete stakingPoolOwnershipOffers[poolId];
  }

  /// @notice Cancels a staking pool ownership offer
  /// @param poolId  id of the staking pool
  function cancelStakingPoolOwnershipOffer(uint poolId) external override {

    require(msg.sender == stakingPoolManagers[poolId], "TokenController: Caller is not staking pool manager");

    delete stakingPoolOwnershipOffers[poolId];
  }

  /// @notice Mints a specified amount of NXM rewards for a staking pool.
  /// @dev    Only callable by the staking pool associated with the given poolId
  /// @param amount  The amount of NXM to mint.
  /// @param poolId  The ID of the staking pool.
  function mintStakingPoolNXMRewards(uint amount, uint poolId) external override {

    require(msg.sender == _stakingPool(poolId), "TokenController: Caller not a staking pool");

    _mint(address(this), amount);

    stakingPoolNXMBalances[poolId].rewards += amount.toUint128();
  }

  /// @notice Burns a specified amount of NXM rewards from a staking pool.
  /// @dev    Only callable by the staking pool associated with the given poolId
  /// @param amount  The amount of NXM to burn.
  /// @param poolId  The ID of the staking pool.
  function burnStakingPoolNXMRewards(uint amount, uint poolId) external override {

    require(msg.sender == _stakingPool(poolId), "TokenController: Caller not a staking pool");

    stakingPoolNXMBalances[poolId].rewards -= amount.toUint128();

    token.burn(amount);
  }

  /// @notice Deposits a specified amount of staked NXM from the member into a staking pool.
  /// @dev    Only callable by the staking pool associated with the given poolId
  /// @param from    The member address from which the NXM is transferred.
  /// @param amount  The amount of NXM to deposit.
  /// @param poolId  The ID of the staking pool.
  function depositStakedNXM(address from, uint amount, uint poolId) external override {

    require(msg.sender == _stakingPool(poolId), "TokenController: Caller not a staking pool");

    stakingPoolNXMBalances[poolId].deposits += amount.toUint128();

    token.operatorTransfer(from, amount);
  }

  /// @notice Withdraws a specified amount of staked NXM and rewards from a staking pool to the member address
  /// @dev    Only callable by the staking pool associated with the given poolId
  /// @param to                 The address to which the NXM and rewards are transferred.
  /// @param stakeToWithdraw    The amount of staked NXM to withdraw.
  /// @param rewardsToWithdraw  The amount of rewards to withdraw.
  /// @param poolId             The ID of the staking pool.
  function withdrawNXMStakeAndRewards(
    address to,
    uint stakeToWithdraw,
    uint rewardsToWithdraw,
    uint poolId
  ) external override {

    require(msg.sender == _stakingPool(poolId), "TokenController: Caller not a staking pool");
    StakingPoolNXMBalances memory poolBalances = stakingPoolNXMBalances[poolId];

    poolBalances.deposits -= stakeToWithdraw.toUint128();
    poolBalances.rewards -= rewardsToWithdraw.toUint128();
    stakingPoolNXMBalances[poolId] = poolBalances;

    token.transfer(to, stakeToWithdraw + rewardsToWithdraw);
  }

  /// @notice Burns a specified amount of staked NXM from a staking pool.
  /// @dev    Only callable by the staking pool associated with the given poolId
  /// @param amount  The amount of staked NXM to burn.
  /// @param poolId  The ID of the staking pool.
  function burnStakedNXM(uint amount, uint poolId) external override {

    require(msg.sender == _stakingPool(poolId), "TokenController: Caller not a staking pool");

    stakingPoolNXMBalances[poolId].deposits -= amount.toUint128();

    token.burn(amount);
  }
}

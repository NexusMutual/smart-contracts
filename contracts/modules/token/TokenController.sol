// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../abstract/RegistryAware.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IStakingNFT.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/ITokenControllerErrors.sol";
import "../../libraries/SafeUintCast.sol";
import "../../libraries/StakingPoolLibrary.sol";

contract TokenController is ITokenController, ITokenControllerErrors, RegistryAware {
  using SafeUintCast for uint;

  // master + mapping + lockReason + locked
  uint[4] internal _unused;

  address internal _unused_token;
  address internal _unused_pooledStaking;
  uint internal _unused_minCALockTime;
  uint internal _unused_claimSubmissionGracePeriod;
  uint internal _unused_coverInfo; // was mapping(uint coverId => uint CoverInfo)

  // pool id => { rewards, deposits }
  mapping(uint => StakingPoolNXMBalances) public override stakingPoolNXMBalances;

  // pool id => manager
  mapping(uint => address) internal stakingPoolManagers;

  // pool id => offer
  mapping(uint => StakingPoolOwnershipOffer) internal stakingPoolOwnershipOffers;

  // manager => pool ids
  mapping(address => uint[]) internal managerStakingPools;

  INXMToken public immutable token;
  address public immutable stakingPoolFactory;
  IStakingNFT public immutable stakingNFT;
  IPool public immutable pool;

  modifier onlyStakingPool(uint poolId) {
    require(msg.sender == _stakingPool(poolId), OnlyStakingPool());
    _;
  }

  constructor (address _registry) RegistryAware(_registry) {
    stakingPoolFactory = fetch(C_STAKING_POOL_FACTORY);
    token = INXMToken(fetch(C_TOKEN));
    stakingNFT = IStakingNFT(fetch(C_STAKING_NFT));
    pool = IPool(fetch(C_POOL));
  }

  /* ========== DEPENDENCIES ========== */

  function stakingPool(uint poolId) internal view returns (IStakingPool) {
    return IStakingPool(_stakingPool(poolId));
  }

  function _stakingPool(uint poolId) internal view returns (address) {
    return StakingPoolLibrary.getAddress(stakingPoolFactory, poolId);
  }

  /// @dev Changes the operator address.
  /// @param _newOperator The new address of the operator.
  function changeOperator(address _newOperator) public override onlyContracts(C_GOVERNOR) {
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
  ) external override onlyContracts(C_COVER) returns (bool) {

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
  function burnFrom(address _of, uint amount) public override onlyContracts(C_COVER | C_RAMM) returns (bool) {
    return token.burnFrom(_of, amount);
  }

  /// @dev Adds an address to the whitelist maintained in the contract.
  /// @param _member The address to add to the whitelist.
  function addToWhitelist(address _member) public virtual override onlyContracts(C_REGISTRY | C_GOVERNOR) {
    token.addToWhiteList(_member);
  }

  /// @notice Removes an address from the whitelist in the token
  /// @dev Requires the member's token balance to be zero before removal.
  /// @param _member The address to remove.
  function removeFromWhitelist(address _member) public override onlyContracts(C_REGISTRY) {
    require(token.balanceOf(_member) == 0, MemberBalanceNotZero());
    require(managerStakingPools[_member].length == 0, MemberHasStakingPools());
    token.removeFromWhiteList(_member);
  }

  /// @notice Switches membership from one address to another, transferring all tokens.
  /// @dev Transfers the full token balance from the old address to the new one, updates whitelist status accordingly.
  /// @param from The address to transfer membership from.
  /// @param to The address to transfer membership to.
  /// @param includeNxmTokens transfer the member's tokens to the new address - only for backwards compatibility with MR
  function switchMembership(
    address from,
    address to,
    bool includeNxmTokens
  ) external override onlyContracts(C_REGISTRY) {

    token.addToWhiteList(to);
    token.removeFromWhiteList(from);

    if (includeNxmTokens) {
      token.transferFrom(from, to, token.balanceOf(from));
    }

    uint stakingPoolCount = managerStakingPools[from].length;

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

  /// @dev Mints new tokens for an address and checks if the address is a member.
  /// @param _member The address to send the minted tokens to.
  /// @param _amount The number of tokens to mint.
  function mint(address _member, uint _amount) public override onlyContracts(C_RAMM) {
    _mint(_member, _amount);
  }

  /// @dev Internal function to mint new tokens for an address and checks if the address is a member.
  /// @dev Other internal functions in this contract should use _mint and never token.mint directly.
  /// @param _member The address to send the minted tokens to.
  /// @param _amount The number of tokens to mint.
  function _mint(address _member, uint _amount) internal {

    require(
      _member == address(this) || token.whiteListed(_member),
      CantMintToNonMemberAddress()
    );
    token.mint(_member, _amount);
  }

  /// @dev Locks the user's tokens.
  /// @param _of    The user's address.
  /// @param _days  The number of days to lock the tokens.
  function lockForMemberVote(address _of, uint _days) public override onlyContracts(C_GOVERNOR) {
    token.lockForMemberVote(_of, _days);
  }

  /// @notice Returns the total supply of the NXM token.
  /// @return The total supply of the NXM token.
  function totalSupply() public override view returns (uint) {
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
    return pool.getTokenPrice();
  }

  /// @notice Withdraws NXM from the Nexus platform based on specified options.
  /// @dev    Ensure the NXM is available and not locked before withdrawal. Only set flags in `WithdrawNxmOptions` for
  ///         withdrawable NXM. Reverts if some of the NXM being withdrawn is locked or unavailable.
  /// @param stakingPoolDeposits        Details for withdrawing staking pools stake and rewards. Empty array to skip
  /// @param stakingPoolManagerRewards  Details for withdrawing staking pools manager rewards. Empty array to skip
  ///                                   specific assesment stake or rewards withdrawal.
  function withdrawNXM(
    StakingPoolDeposit[] calldata stakingPoolDeposits,
    StakingPoolManagerReward[] calldata stakingPoolManagerRewards
  ) external whenNotPaused(PAUSE_GLOBAL) {
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
  function assignStakingPoolManager(uint poolId, address manager) external override onlyContracts(C_STAKING_PRODUCTS) {
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

    require(msg.sender == stakingPoolManagers[poolId], OnlyStakingPoolManager());
    require(block.timestamp < deadline, DeadlinePassed());

    stakingPoolOwnershipOffers[poolId] = StakingPoolOwnershipOffer(proposedManager, deadline.toUint96());
  }

  /// @notice Accepts a staking pool ownership offer
  /// @param poolId  id of the staking pool
  function acceptStakingPoolOwnershipOffer(uint poolId) external override {

    address oldManager = stakingPoolManagers[poolId];

    require(block.timestamp > token.isLockedForMV(oldManager), ManagerIsLockedForVoting());
    require(msg.sender == stakingPoolOwnershipOffers[poolId].proposedManager, OnlyProposedManager());
    require(stakingPoolOwnershipOffers[poolId].deadline > block.timestamp, OwnershipOfferHasExpired());

    _assignStakingPoolManager(poolId, msg.sender);

    delete stakingPoolOwnershipOffers[poolId];
  }

  /// @notice Cancels a staking pool ownership offer
  /// @param poolId  id of the staking pool
  function cancelStakingPoolOwnershipOffer(uint poolId) external override {

    require(msg.sender == stakingPoolManagers[poolId], OnlyStakingPoolManager());

    delete stakingPoolOwnershipOffers[poolId];
  }

  /// @notice Mints a specified amount of NXM rewards for a staking pool.
  /// @dev    Only callable by the staking pool associated with the given poolId
  /// @param amount  The amount of NXM to mint.
  /// @param poolId  The ID of the staking pool.
  function mintStakingPoolNXMRewards(uint amount, uint poolId) external override onlyStakingPool(poolId) {
    _mint(address(this), amount);
    stakingPoolNXMBalances[poolId].rewards += amount.toUint128();
  }

  /// @notice Burns a specified amount of NXM rewards from a staking pool.
  /// @dev    Only callable by the staking pool associated with the given poolId
  /// @param amount  The amount of NXM to burn.
  /// @param poolId  The ID of the staking pool.
  function burnStakingPoolNXMRewards(uint amount, uint poolId) external override onlyStakingPool(poolId) {
    stakingPoolNXMBalances[poolId].rewards -= amount.toUint128();
    token.burn(amount);
  }

  /// @notice Deposits a specified amount of staked NXM from the member into a staking pool.
  /// @dev    Only callable by the staking pool associated with the given poolId
  /// @param from    The member address from which the NXM is transferred.
  /// @param amount  The amount of NXM to deposit.
  /// @param poolId  The ID of the staking pool.
  function depositStakedNXM(address from, uint amount, uint poolId) external override onlyStakingPool(poolId) {
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
  ) external override onlyStakingPool(poolId) {

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
  function burnStakedNXM(uint amount, uint poolId) external override onlyStakingPool(poolId) {
    stakingPoolNXMBalances[poolId].deposits -= amount.toUint128();
    token.burn(amount);
  }
}

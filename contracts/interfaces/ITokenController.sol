// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "./INXMToken.sol";

interface ITokenController {

  struct StakingPoolNXMBalances {
    uint128 rewards;
    uint128 deposits;
  }

  struct CoverInfo {
    uint16 claimCount;
    bool hasOpenClaim;
    bool hasAcceptedClaim;
    uint96 requestedPayoutAmount;
    // note: still 128 bits available here, can be used later
  }

  struct StakingPoolOwnershipOffer {
    address proposedManager;
    uint96 deadline;
  }

  struct WithdrawAssessment {
    bool stake;
    bool rewards;
  }

  /// @notice The stake deposit / rewards in a staking pool that will be withdrawn.
  /// @dev    Call StakingViewer.getToken to get tokenId / trancheId information
  /// @param tokenId The ID of the token stake deposit / rewards that will be withrawn.
  /// @param trancheIds An array of tranche IDs representing the tranches where the stake was deposited.
  struct StakingPoolDeposit {
    uint tokenId;
    uint[] trancheIds;
  }

  /// @notice Represents the rewards distributed to a staking pool manager.
  /// @dev    Call StakingViewer.getManagerTokenRewardsByAddr to get poolId / trancheId information
  /// @param poolId The ID of the pool managed by the manager.
  /// @param trancheIds An array of tranche IDs representing the tranches where the manager rewards were distributed.
  struct StakingPoolManagerReward {
    uint poolId;
    uint[] trancheIds;
  }

  /* ========== VIEWS ========== */

  function token() external view returns (INXMToken);

  function coverInfo(uint id) external view returns (
    uint16 claimCount,
    bool hasOpenClaim,
    bool hasAcceptedClaim,
    uint96 requestedPayoutAmount
  );

  function getLockReasons(address _of) external view returns (bytes32[] memory reasons);

  function totalSupply() external view returns (uint);

  function totalBalanceOf(address _of) external view returns (uint amount);

  function totalBalanceOfWithoutDelegations(address _of) external view returns (uint amount);

  function getTokenPrice() external view returns (uint tokenPrice);

  function getPendingRewards(address member) external view returns (uint);

  function tokensLocked(address _of, bytes32 _reason) external view returns (uint256 amount);

  function getWithdrawableCoverNotes(
    address coverOwner
  ) external view returns (
    uint[] memory coverIds,
    bytes32[] memory lockReasons,
    uint withdrawableAmount
  );

  function getStakingPoolManager(uint poolId) external view returns (address manager);

  function getManagerStakingPools(address manager) external view returns (uint[] memory poolIds);

  function isStakingPoolManager(address member) external view returns (bool);

  function getStakingPoolOwnershipOffer(uint poolId) external view returns (address proposedManager, uint deadline);

  function stakingPoolNXMBalances(uint poolId) external view returns (uint128 rewards, uint128 deposits);

  /* ========== MUTATIVE FUNCTIONS ========== */

  function withdrawCoverNote(
    address _of,
    uint[] calldata _coverIds,
    uint[] calldata _indexes
  ) external;

  function changeOperator(address _newOperator) external;

  function operatorTransfer(address _from, address _to, uint _value) external returns (bool);

  function burnFrom(address _of, uint amount) external returns (bool);

  function addToWhitelist(address _member) external;

  function removeFromWhitelist(address _member) external;

  function mint(address _member, uint _amount) external;

  function lockForMemberVote(address _of, uint _days) external;

  function withdrawClaimAssessmentTokens(address[] calldata users) external;

  function transferStakingPoolsOwnership(address from, address to) external;

  function assignStakingPoolManager(uint poolId, address manager) external;

  function createStakingPoolOwnershipOffer(uint poolId, address proposedManager, uint deadline) external;

  function acceptStakingPoolOwnershipOffer(uint poolId) external;

  function cancelStakingPoolOwnershipOffer(uint poolId) external;

  function mintStakingPoolNXMRewards(uint amount, uint poolId) external;

  function burnStakingPoolNXMRewards(uint amount, uint poolId) external;

  function depositStakedNXM(address from, uint amount, uint poolId) external;

  function withdrawNXMStakeAndRewards(address to, uint stakeToWithdraw, uint rewardsToWithdraw, uint poolId) external;

  function burnStakedNXM(uint amount, uint poolId) external;
}

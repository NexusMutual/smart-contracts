// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "@openzeppelin/contracts-v4/token/ERC721/IERC721.sol";

/* structs for io */

struct CoverRequest {
  uint coverId;
  uint productId;
  uint amount;
  uint period;
  uint gracePeriod;
  uint globalCapacityRatio;
  uint capacityReductionRatio;
  uint rewardRatio;
}

struct WithdrawRequest {
  uint tokenId;
  bool withdrawStake;
  bool withdrawRewards;
  uint[] trancheIds;
}

struct DepositRequest {
  uint amount;
  uint trancheId;
  uint tokenId;
  address destination;
}

struct ProductParams {
  uint productId;
  bool setTargetWeight;
  bool recalculateEffectiveWeight;
  uint8 targetWeight;
  bool setPrice;
  uint96 targetPrice;
}

struct ProductInitializationParams {
  uint productId;
  uint8 weight;
  uint96 initialPrice;
  uint96 targetPrice;
}

interface IStakingPool {

  /* structs for storage */

  // stakers are grouped in tranches based on the timelock expiration
  // tranche index is calculated based on the expiration date
  // the initial proposal is to have 4 tranches per year (1 tranche per quarter)
  struct Tranche {
    uint /* uint128 */ stakeShares;
    uint /* uint128 */ rewardsShares;
  }

  struct ExpiredTranche {
    uint accNxmPerRewardShareAtExpiry;
    uint stakeAmountAtExpiry;
    uint stakeShareSupplyAtExpiry;
  }

  struct Deposit {
    uint lastAccNxmPerRewardShare;
    uint pendingRewards;
    uint stakeShares;
    uint rewardsShares;
  }

  struct StakedProduct {
    uint8 lastEffectiveWeight;
    uint8 targetWeight;
    uint96 targetPrice;
    uint96 nextPrice;
    uint32 nextPriceUpdateTime;
  }

  struct RewardBucket {
    // TODO: pack 4 buckets in a slot. uint64 can hold a max of ~1593798 nxm rewards per day
    uint rewardPerSecondCut;
  }

  function initialize(
    address _manager,
    bool isPrivatePool,
    uint initialPoolFee,
    uint maxPoolFee,
    ProductInitializationParams[] calldata params,
    uint _poolId
  ) external;

  function operatorTransfer(address from, address to, uint[] calldata tokenIds) external;

  function updateTranches(bool updateUntilCurrentTimestamp) external;

  function allocateStake(
    CoverRequest calldata request
  ) external returns (uint allocatedAmount, uint premium, uint rewardsInNXM);

  function deallocateStake(
    CoverRequest memory request,
    uint coverStartTime,
    uint premium
  ) external;

  function burnStake(uint productId, uint start, uint period, uint amount) external;

  function depositTo(DepositRequest[] memory requests) external returns (uint[] memory tokenIds);

  function withdraw(
    WithdrawRequest[] memory params
  ) external returns (uint stakeToWithdraw, uint rewardsToWithdraw);

  function setPoolFee(uint newFee) external;

  function setPoolPrivacy(bool isPrivatePool) external;

  function setProducts(ProductParams[] memory params) external;

  function manager() external view returns (address);

  function getActiveStake() external view returns (uint);

  function getProductStake(uint productId, uint coverExpirationDate) external view returns (uint);

  function getFreeProductStake(uint productId, uint coverExpirationDate) external view returns (uint);

  function getAllocatedProductStake(uint productId) external view returns (uint);

  function getPriceParameters(
    uint productId,
    uint maxCoverPeriod
  ) external view returns (
    uint activeCover,
    uint[] memory capacities,
    uint lastBasePrice,
    uint targetPrice
  );
}

// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "@openzeppelin/contracts-v4/token/ERC721/IERC721.sol";

/* structs for io */

struct WithdrawParams {
  uint positionId;
  uint[] groupIds;
  uint flags;
}

struct ProductParams {
  uint productId;
  uint weight;
  uint targetPrice;
  uint flags;
}

struct ProductInitializationParams {
  uint productId;
  uint weight;
  uint initialPrice;
  uint targetPrice;
}

struct LastPrice {
  uint96 value;
  uint32 lastUpdateTime;
}


interface IStakingPool is IERC721 {

  /* structs for storage */

  // stakers are grouped based on the timelock expiration
  // group index is calculated based on the expiration date
  // the initial proposal is to have 4 groups per year (1 group per quarter)
  struct StakeGroup {
    uint stakeShares;
    uint rewardsShares;
    uint groupSharesSupply;
    // TODO: consider extracting the following fields to a separate struct
    uint accRewardPerStakeShareAtExpiration;
    uint expiredStakeAmount;
  }

  struct Product {
    uint weight;
    uint allocatedStake;
    uint lastBucket;
    uint targetPrice;
    uint lastPrice;
  }

  struct PoolBucket {
    uint rewardPerSecondCut;
  }

  struct ProductBucket {
    uint allocationCut;
  }

  function initialize(address _manager, ProductInitializationParams[] calldata params) external;

  function operatorTransfer(address from, address to, uint[] calldata tokenIds) external;

  function updateGroups() external;

  function allocateStake(
    uint productId,
    uint period,
    uint gracePeriod,
    uint productStakeAmount,
    uint rewardRatio
  ) external returns (uint allocatedNXM, uint premium);

  function deallocateStake(
    uint productId,
    uint start,
    uint period,
    uint amount,
    uint premium
  ) external;

  function burnStake(uint productId, uint start, uint period, uint amount) external;

  function deposit(uint amount, uint groupId, uint _positionId) external returns (uint positionId);

  function withdraw(WithdrawParams[] memory params) external;

  function setProductDetails(ProductParams[] memory params) external;

  function manager() external view returns (address);

  function getActiveStake() external view returns (uint);

  function getProductStake(uint productId, uint coverExpirationDate) external view returns (uint);

  function getFreeProductStake(uint productId, uint coverExpirationDate) external view returns (uint);

  function getAllocatedProductStake(uint productId) external view returns (uint);


  function getPriceParameters(
    uint productId,
    uint globalCapacityRatio,
    uint capacityReductionRatio
  ) external view returns (
    uint activeCover, uint[] memory capacities, uint lastBasePrice, uint targetPrice
  );
}

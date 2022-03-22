// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "@openzeppelin/contracts-v4/token/ERC721/IERC721.sol";

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
  }

  struct PoolBucket {
    uint rewardPerSecondCut;
  }

  struct ProductBucket {
    uint allocationCut;
  }

  /* structs for io */

  struct AllocateParams {
    uint productId;
    uint period;
    uint productStakeAmount;
    uint rewardRatio;
  }

  struct DeallocateParams {
    uint productId;
    uint start;
    uint period;
    uint amount;
    uint premium;
  }

  struct BurnParams {
    uint productId;
    uint start;
    uint period;
    uint amount;
  }

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

  function initialize(address _manager, ProductInitializationParams[] calldata params) external;

  function operatorTransfer(address from, address to, uint256 tokenId) external;

  function updateGroups() external;

  function allocateStake(AllocateParams calldata params) external returns (uint allocatedNXM, uint premium);

  function deallocateStake(DeallocateParams calldata params) external;

  function burnStake(BurnParams calldata params) external;

  function deposit(uint amount, uint groupId, uint _positionId) external returns (uint positionId);

  function withdraw(WithdrawParams[] memory params) external;

  function setProductDetails(ProductParams[] memory params) external;

  function manager() external view returns (address);

  function getActiveStake() external view returns (uint);

  function getProductStake(uint productId, uint coverExpirationDate) external view returns (uint);

  function getFreeProductStake(uint productId, uint coverExpirationDate) external view returns (uint);

  function getAllocatedProductStake(uint productId) external view returns (uint);

}


# StakingPool Contract Developer Documentation

## Overview

The `StakingPool` contract manages nxm staking and capacity allocations for purchased covers. When depositing an NFT is minted which is used to track stake ownership.

## Key Concepts

### Tranches
Time-based slices of staking periods, each with its own stake and reward shares.

```solidity
struct Tranche {
  uint128 stakeShares;
  uint128 rewardsShares;
}
```

| Parameter        | Description                           |
|------------------|---------------------------------------|
| `stakeShares`    | Tranche's share of the pool's stake   |
| `rewardsShares`  | Tranche's share of the pool's rewards |

```solidity
uint public constant TRANCHE_DURATION = 91 days;
uint public constant MAX_ACTIVE_TRANCHES = 8; // 7 whole quarters + 1 partial quarter
```

Formula for current tranche id:
```solidity
uint currentTrancheId = block.timestamp / TRANCHE_DURATION;
```
### Buckets
Groupings used to manage rewards and cover allocation expirations over time.

```solidity
uint public constant BUCKET_DURATION = 28 days;
```

Formula for current bucket id:
```solidity
    uint currentBucketId = block.timestamp / BUCKET_DURATION;
```

### Allocations
Amount of used capacity by individual covers

## Mutative Functions

### `depositTo`
Allows users to deposit NXM into the pool, creating stake and rewards shares in return. Supports deposits to specific tranches and allows reusing the same nft for deposits in multiple tranches to an existing deposit.

```solidity
function depositTo(uint amount, uint trancheId, uint requestTokenId, address destination) external;
```
| Parameter        | Description                                                                                                 |
|------------------|-------------------------------------------------------------------------------------------------------------|
| `amount`         | The amount to deposit.                                                                                      |
| `trancheId`      | The ID of the tranche to deposit into.                                                                      |
| `requestTokenId` | The ID of the request token (0 for a new deposit, or use an existing token ID to add to a previous deposit. |
| `destination`    | The address to send the Staking NFT token to.                                                               |

### `withdraw`
Allows users to withdraw their stake and/or rewards from specific tranches. Withdrawing the stakes can be done only on expired tranches, while rewards can be withdrawn at any time.


```solidity
function withdraw(uint tokenId, bool withdrawStake, bool withdrawRewards, uint[] memory trancheIds) external;
```

| Parameter         | Description                               |
|-------------------|-------------------------------------------|
| `tokenId`         | The ID of the staking NFT token.          |
| `withdrawStake`   | Whether to withdraw the stake.            |
| `withdrawRewards` | Whether to withdraw the rewards.          |
| `trancheIds`      | The IDs of the tranches to withdraw from. |

### `extendDeposit`
Extends the duration of a deposit by moving it from an tranche to a future tranche.


```solidity
function extendDeposit(uint tokenId, uint initialTrancheId, uint targetTrancheId, uint topUpAmount) external;
```

| Parameter          | Description                          |
|--------------------|--------------------------------------|
| `tokenId`          | The ID of the staking NFT token.     |
| `initialTrancheId` | The ID of the initial tranche.       |
| `targetTrancheId`  | The ID of the target tranche.        |
| `topUpAmount`      | The amount to top up the deposit by. |


## View Functions


### `getDeposit`
Returns deposit data by token id and trancheId.

```solidity
function getDeposit(uint tokenId, uint trancheId) external override view returns (
  uint lastAccNxmPerRewardShare,
  uint pendingRewards,
  uint stakeShares,
  uint rewardsShares
);
```

| Parameter        | Description            |
|------------------|------------------------|
| `tokenId`        | The ID of the product. |
| `trancheId`      | The ID of the tranche. |

### `getTranche`
Returns tranche data by tranche id.

```solidity
function getTranche(uint trancheId) external override view returns (
  uint stakeShares,
  uint rewardsShares
);
```

| Parameter        | Description            |
|------------------|------------------------|
| `trancheId`      | The ID of the tranche. |

### `getExpiredTranche`
Returns expired tranche data by tranche id.

```solidity
function getExpiredTranche(uint trancheId) external override view returns (
  uint accNxmPerRewardShareAtExpiry,
  uint stakeAmountAtExpiry,
  uint stakeSharesSupplyAtExpiry
);
```

| Parameter        | Description            |
|------------------|------------------------|
| `trancheId`      | The ID of the tranche. |

### `getActiveAllocations`
Returns an array with the allocated amounts in the currently active tranches for a product.

```solidity
function getActiveAllocations(uint productId)  public view returns (uint[] memory trancheAllocations);
```

| Parameter          | Description                          |
|--------------------|--------------------------------------|
| `productId`        | The ID of the product.               |

### `getActiveTrancheCapacities`
Returns an array of the active tranche capacities and total capacity for a product.

```solidity
function getActiveTrancheCapacities(
  uint productId,
  uint globalCapacityRatio,
  uint capacityReductionRatio
) public view returns (
  uint[] memory trancheCapacities,
  uint totalCapacity
);
```

| Parameter                | Description               |
|--------------------------|---------------------------|
| `productId`              | The ID of the product.    |
| `globalCapacityRatio`    | Global Capacity Ratio     |
| `capacityReductionRatio` | Capacity Reduction Ratio. |



### `getTrancheCapacities`
Returns an array with the total capacities for the currently active tranches for a product.

```solidity
function getTrancheCapacities(
  uint productId,
  uint firstTrancheId,
  uint trancheCount,
  uint capacityRatio,
  uint reductionRatio
) public view returns (uint[] memory trancheCapacities);
```

| Parameter                | Description               |
|--------------------------|---------------------------|
| `productId`              | The ID of the product.    |
| `globalCapacityRatio`    | Global Capacity Ratio     |
| `capacityReductionRatio` | Capacity Reduction Ratio. |

### `getPoolId`
Returns the pool id.

```solidity
function getPoolId() external override view returns (uint);
```

### `getPoolFee`
Returns the pool fee.

```solidity
function getPoolFee() external override view returns (uint);
```

### `getMaxPoolFee`
Returns the max pool fee.

```solidity
function getMaxPoolFee() external override view returns (uint);
```

### `getActiveStake`
Returns the active stake.

```solidity
function getActiveStake() external view returns (uint);
```

### `getStakeSharesSupply`
Returns stake shares supply.

```solidity
function getStakeSharesSupply() external view returns (uint);
```

### `getRewardsSharesSupply`
Returns stake shares supply.

```solidity
function getRewardsSharesSupply() external view returns (uint);
```

### `getRewardPerSecond`
Returns rewards per second.

```solidity
function getRewardPerSecond() external view returns (uint);
```

### `getAccNxmPerRewardsShare`
Returns accumulated nxm per reward share.

```solidity
function getAccNxmPerRewardsShare() external view returns (uint);
```


### `getLastAccNxmUpdate`
Returns timestamp of last nxm update.

```solidity
function getLastAccNxmUpdate() external view returns (uint);
```

### `getFirstActiveTrancheId`
Returns first active tranche id.

```solidity
function getFirstActiveTrancheId() external view returns (uint);
```

### `getFirstActiveBucketId`
Returns first active bucket id.

```solidity
function getFirstActiveBucketId() external view returns (uint);
```

### `getNextAllocationId`
Returns next allocation id.

```solidity
function getNextAllocationId() external view returns (uint);
```

## Events

- **`StakeDeposited(address indexed user, uint256 amount, uint256 trancheId, uint256 tokenId)`**: Emitted when a user deposits stake into the pool.
- **`Withdraw(address indexed user, uint indexed tokenId, uint tranche, uint amountStakeWithdrawn, uint amountRewardsWithdrawn)`**: Emitted when a user withdraws stake and/or rewards.
- **`PoolFeeChanged(address indexed manager, uint newFee)`**: Emitted when the pool fee is updated by the manager.
- **`PoolPrivacyChanged(address indexed manager, bool isPrivate)`**: Emitted when the pool's privacy status is changed by manager.

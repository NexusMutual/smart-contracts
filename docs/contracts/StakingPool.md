# StakingPool Contract Developer Documentation

## Table of Contents

- [StakingPool Contract Developer Documentation](#stakingpool-contract-developer-documentation)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Key Concepts](#key-concepts)
    - [Tranches](#tranches)
      - [Formula for current tranche ID:](#formula-for-current-tranche-id)
    - [Buckets](#buckets)
      - [Formula for current bucket ID:](#formula-for-current-bucket-id)
    - [Allocations](#allocations)
  - [Functions](#functions)
    - [Mutative Functions](#mutative-functions)
      - [`depositTo`](#depositto)
      - [`withdraw`](#withdraw)
      - [`extendDeposit`](#extenddeposit)
    - [View Functions](#view-functions)
      - [`getDeposit`](#getdeposit)
      - [`getTranche`](#gettranche)
      - [`getExpiredTranche`](#getexpiredtranche)
      - [`getActiveAllocations`](#getactiveallocations)
    - [`getActiveTrancheCapacities`](#getactivetranchecapacities)
      - [`getTrancheCapacities`](#gettranchecapacities)
      - [Miscellaneous View Functions](#miscellaneous-view-functions)
  - [Events](#events)
  - [FAQ](#faq)
    - [How is cover capacity allocated from tranches?](#how-is-cover-capacity-allocated-from-tranches)
    - [What happens when I deposit NXM?](#what-happens-when-i-deposit-nxm)
    - [Can I withdraw my stake at any time?](#can-i-withdraw-my-stake-at-any-time)
    - [How are rewards distributed?](#how-are-rewards-distributed)
    - [Can I move my stake to a different tranche?](#can-i-move-my-stake-to-a-different-tranche)
    - [What happens if my allocation is used for cover?](#what-happens-if-my-allocation-is-used-for-cover)
  - [Contact and Support](#contact-and-support)

---

## Overview

The `StakingPool` contract **manages NXM staking** and **allocates capacity** for purchased covers within the staking pool.

Each StakingPool contract represents its own distinct pool that manages the staked NXM tokens and the allocations of those staked NXM to cover products. This allows for precise management of stakes and cover allocations specific to that pool

When a user **stakes NXM**, the contract **mints an NFT**, which serves as a proof of stake ownership.

This contract handles:

- **NXM Staking & tracking:** Users deposit NXM, with stakes tracked over time.
- **Tranches (91-day staking periods):** Stakes are locked per tranche, determining withdrawals and staking rewards.
- **Cover Allocations:** When cover products are purchased, capacity is allocated across multiple tranches to ensure sustained coverage and balanced reward distribution.
- **Stake Management:** Users can extend stakes to future tranches or withdraw after expiration.

---

## Key Concepts

### Tranches

- Fixed 91-day staking periods, each with its own stake & reward shares.
- Staking early locks for 91 days; mid-tranche staking locks for the remaining duration.
- Staked NXM in an **active tranche** contributes to cover capacity.
- Once expired (after 91 days), stakes no longer provide capacity.
- Users can withdraw rewards and either unstake or extend to a new tranche.

```solidity
struct Tranche {
  uint128 stakeShares;
  uint128 rewardsShares;
}
```

| Parameter       | Description                                                        |
| --------------- | ------------------------------------------------------------------ |
| `stakeShares`   | Proportional representation of stake ownership in the tranche.     |
| `rewardsShares` | Proportional share of the pool's rewards allocated to the tranche. |

#### Formula for current tranche ID:

```solidity
uint currentTrancheId = block.timestamp / TRANCHE_DURATION;
```

---

### Buckets

- **Groupings used to track rewards & cover expirations.**
- A bucket's duration lasts **28 days**.
- Covers expire only at bucket intervals (28 days), enforcing a minimum cover period of 28 days.
- Shorter than tranches to allow more frequent reward updates and allocation adjustments.

#### Formula for current bucket ID:

```solidity
uint currentBucketId = block.timestamp / BUCKET_DURATION;
```

---

### Allocations

- **Tracks how much of a pool's capacity is used** for purchased cover.
- Allocations are distributed **across multiple active tranches** to ensure sustained coverage
- Balances capacity across tranches, maintaining sufficient capacity across all active tranches

---

## Functions

### Mutative Functions

#### `depositTo`

Allows users to deposit NXM into the pool, creating stake and rewards shares in return. Supports deposits to specific tranches and allows reusing the same nft for deposits in multiple tranches to an existing deposit.

```solidity
function depositTo(uint amount, uint trancheId, uint requestTokenId, address destination) external;
```

| Parameter        | Description                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| `amount`         | The amount to deposit.                                                                                      |
| `trancheId`      | The ID of the tranche to deposit into.                                                                      |
| `requestTokenId` | The ID of the request token (0 for a new deposit, or use an existing token ID to add to a previous deposit) |
| `destination`    | The address to send the Staking NFT token to.                                                               |

- **Creates stake & reward shares.**
- **Emits** `StakeDeposited`.

---

#### `withdraw`

Allows users to withdraw their stake and/or rewards from specific tranches. Withdrawing the stakes can be done only on expired tranches, while rewards can be withdrawn at any time.

```solidity
function withdraw(uint tokenId, bool withdrawStake, bool withdrawRewards, uint[] memory trancheIds) external;
```

| Parameter         | Description                               |
| ----------------- | ----------------------------------------- |
| `tokenId`         | The ID of the staking NFT token.          |
| `withdrawStake`   | Whether to withdraw the stake.            |
| `withdrawRewards` | Whether to withdraw the rewards.          |
| `trancheIds`      | The IDs of the tranches to withdraw from. |

- **Stake can only be withdrawn from expired tranches.**
- **Rewards can be withdrawn at any time.**
- **Emits** `Withdraw`.

---

#### `extendDeposit`

Extends the duration of a deposit by moving it from an tranche to a future tranche.

```solidity
function extendDeposit(uint tokenId, uint initialTrancheId, uint targetTrancheId, uint topUpAmount) external;
```

| Parameter          | Description                          |
| ------------------ | ------------------------------------ |
| `tokenId`          | The ID of the staking NFT token.     |
| `initialTrancheId` | The ID of the initial tranche.       |
| `targetTrancheId`  | The ID of the target tranche.        |
| `topUpAmount`      | The amount to top up the deposit by. |

- **Tranche must be active to extend.**
- **Emits** `DepositExtended`.

---

### View Functions

#### `getDeposit`

**Get deposit details for a given NFT and tranche.**

```solidity
function getDeposit(uint tokenId, uint trancheId) external view returns (
  uint lastAccNxmPerRewardShare,
  uint pendingRewards,
  uint stakeShares,
  uint rewardsShares
);
```

| Parameter   | Description            |
| ----------- | ---------------------- |
| `tokenId`   | The ID of the product. |
| `trancheId` | The ID of the tranche. |

---

#### `getTranche`

**Get details of a specific tranche.**

```solidity
function getTranche(uint trancheId) external view returns (
  uint stakeShares,
  uint rewardsShares
);
```

| Parameter   | Description            |
| ----------- | ---------------------- |
| `trancheId` | The ID of the tranche. |

---

#### `getExpiredTranche`

**Get data of an expired tranche.**

```solidity
function getExpiredTranche(uint trancheId) external view returns (
  uint accNxmPerRewardShareAtExpiry,
  uint stakeAmountAtExpiry,
  uint stakeSharesSupplyAtExpiry
);
```

| Parameter   | Description            |
| ----------- | ---------------------- |
| `trancheId` | The ID of the tranche. |

---

#### `getActiveAllocations`

Returns an array with the allocated amounts in the currently active tranches for a product.

```solidity
function getActiveAllocations(uint productId) external view returns (uint[] memory trancheAllocations);
```

| Parameter   | Description            |
| ----------- | ---------------------- |
| `productId` | The ID of the product. |

---

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
| ------------------------ | ------------------------- |
| `productId`              | The ID of the product.    |
| `globalCapacityRatio`    | Global Capacity Ratio     |
| `capacityReductionRatio` | Capacity Reduction Ratio. |

---

#### `getTrancheCapacities`

Returns an array with the total capacities for the currently active tranches for a product.

```solidity
function getTrancheCapacities(
  uint productId,
  uint firstTrancheId,
  uint trancheCount,
  uint capacityRatio,
  uint reductionRatio
) external view returns (uint[] memory trancheCapacities);
```

| Parameter                | Description               |
| ------------------------ | ------------------------- |
| `productId`              | The ID of the product.    |
| `globalCapacityRatio`    | Global Capacity Ratio     |
| `capacityReductionRatio` | Capacity Reduction Ratio. |

---

#### Miscellaneous View Functions

- **`getPoolId()`** – Returns the pool ID.
- **`getPoolFee()`** – Returns the current pool fee.
- **`getMaxPoolFee()`** – Returns the max pool fee.
- **`getActiveStake()`** – Returns the active stake.
- **`getStakeSharesSupply()`** – Returns total stake shares.
- **`getRewardsSharesSupply()`** – Returns total reward shares.
- **`getRewardPerSecond()`** – Returns reward emission rate.
- **`getAccNxmPerRewardsShare()`** – Returns accumulated NXM per reward share.

---

## Events

- **`StakeDeposited(address indexed user, uint256 amount, uint256 trancheId, uint256 tokenId)`**

  - Emitted when a user deposits stake.

- **`Withdraw(address indexed user, uint indexed tokenId, uint tranche, uint amountStakeWithdrawn, uint amountRewardsWithdrawn)`**

  - Emitted when a user withdraws stake or rewards.

- **`PoolFeeChanged(address indexed manager, uint newFee)`**

  - Emitted when the pool fee is updated.

- **`PoolPrivacyChanged(address indexed manager, bool isPrivate)`**
  - Emitted when the pool's privacy setting is changed.

---

## FAQ

### How is cover capacity allocated from tranches?

Only tranches that remain active for the full duration of the cover plus a grace period are eligible for allocation. This ensures that covers are backed by active stakes for their entire lifespan, maintaining the security of the coverage.

### What happens when I deposit NXM?

You receive an **NFT** representing your stake, which can be **used across multiple tranches**.

### Can I withdraw my stake at any time?

No, you can **only withdraw stake from expired tranches**. Rewards can be withdrawn **at any time**.

### How are rewards distributed?

Rewards are **proportional to stake size** in a tranche.

### Can I move my stake to a different tranche?

Yes, use `extendDeposit()` to **move stake from one tranche to another**.

### What happens if my allocation is used for cover?

Once capacity is allocated for cover, your stake **remains locked until the cover expires**.

---

## Contact and Support

If you have questions or need assistance integrating with the `StakingPool` contract, please reach out through the official support channels or developer forums.

- **Developer Forums**: Join our community forums to discuss and seek help.
- **Official Support Channels**: Contact us via our official support email or join our Discord.
- **Documentation Resources**: Access tutorials and FAQs on our official website.
- **GitHub Repository**: Report issues or contribute to the codebase.

**Disclaimer:** This documentation provides a high-level overview of the `StakingPool` contract. Always refer to the latest contract code and official resources when developing against the protocol.

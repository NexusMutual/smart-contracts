# StakingProducts Contract Developer Documentation

## Table of Contents

- [StakingProducts Contract Developer Documentation](#stakingproducts-contract-developer-documentation)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Key Concepts](#key-concepts)
    - [Product Weights](#product-weights)
    - [Pricing Mechanism](#pricing-mechanism)
    - [Staking Pool Creation and Management](#staking-pool-creation-and-management)
  - [Functions](#functions)
    - [Mutative Functions](#mutative-functions)
      - [`setProducts`](#setproducts)
      - [`recalculateEffectiveWeights`](#recalculateeffectiveweights)
      - [`recalculateEffectiveWeightsForAllProducts`](#recalculateeffectiveweightsforallproducts)
      - [`createStakingPool`](#createstakingpool)
      - [`setPoolMetadata`](#setpoolmetadata)
    - [View Functions](#view-functions)
      - [`getProduct`](#getproduct)
      - [`getPoolManager`](#getpoolmanager)
      - [`getPoolMetadata`](#getpoolmetadata)
  - [Pricing Functions](#pricing-functions)
    - [`getPremium`](#getpremium)
  - [Events](#events)
  - [FAQ](#faq)
    - [How are product weights determined?](#how-are-product-weights-determined)
    - [Can effective weight be higher than the target weight?](#can-effective-weight-be-higher-than-the-target-weight)
    - [Can I create a private or public staking pool?](#can-i-create-a-private-or-public-staking-pool)
    - [How often should effective weights be recalculated?](#how-often-should-effective-weights-be-recalculated)
    - [How is the premium calculated?](#how-is-the-premium-calculated)
    - [How does StakingProducts integrate with StakingPoolFactory to create a new staking pool?](#how-does-stakingproducts-integrate-with-stakingpoolfactory-to-create-a-new-staking-pool)
    - [How can I update pool metadata?](#how-can-i-update-pool-metadata)
  - [Contact and Support](#contact-and-support)

---

## Overview

The `StakingProducts` contract manages cover products and their integration into staking pools. It handles **dynamic pricing, capacity allocation, and staking pool management**. This contract enables:

- **Creating and managing staking pools** (public or private).
- **Allowing pool managers to list and configure products** within their pools (e.g., target price, target weight).
- **Dynamically calculating premiums** based on capacity usage.
- **Adjusting product allocations and weights per pool** to optimize stake distribution.

---

## Key Concepts

### Product Weights

Each product within a staking pool has two weight metrics:

- **Target Weight (`targetWeight`)** – Set by the pool manager, defining the ideal allocation for the product.
- **Effective Weight (`lastEffectiveWeight`)** – The actual allocation, dynamically adjusted based on available stake, product utilization, and global constraints.

The contract **attempts to reach the target weight** but may assign a **lower effective weight** if:

1. **Insufficient capacity** – The pool does not have enough total staking.
2. **Low product utilization** – If the product isn't being used as much.
3. **Other products take priority** – If their target weights must be met first.

The **effective weight never exceeds the target weight**.

### Pricing Mechanism

The pricing system adjusts dynamically based on usage and capacity, ensuring fair pricing and market-driven price discovery:

- **Initial Price (`initialPrice`)** – The starting price set for a product. This can be **higher than the minimum price** (`minPrice`).
- **Target Price (`targetPrice`)** – The price pool managers set as the preferred price for their product. Pricing gradually adjusts toward this value. Must be equal to or higher than Minimum Price.
- **Minimum Price (`minPrice`)** – A product-specific minimum price that overrides the **global 1% minimum price** if needed.
- **Price Bumps** – When cover is purchased, the price **increases slightly** (+0.05% per 1% of capacity used).
- **Pricing Decay** – After a price bump, the price **gradually decreases** over time (0.5% per day) to allow for **price discovery**.
- **Dynamic Adjustments** – Pricing fluctuates based on demand, ensuring fairness while preventing extreme volatility.

### Staking Pool Creation and Management

The contract also manages the **creation and management of staking pools**.

---

## Functions

### Mutative Functions

#### `setProducts`

Configures products for a specific staking pool and updates their parameters.

```solidity
function setProducts(uint poolId, StakedProductParam[] memory params) external;
```

| Parameter | Description                                                  |
| --------- | ------------------------------------------------------------ |
| `poolId`  | ID of the staking pool.                                      |
| `params`  | Array of `StakedProductParam` structs with product settings. |

```solidity
struct StakedProductParam {
    uint productId;
    bool recalculateEffectiveWeight;
    bool setTargetWeight;
    uint8 targetWeight;
    bool setTargetPrice;
    uint96 targetPrice;
}
```

| Field                      | Type   | Description                                                           |
| -------------------------- | ------ | --------------------------------------------------------------------- |
| productId                  | uint   | The ID of the product to update.                                      |
| recalculateEffectiveWeight | bool   | Whether to recalculate effective weight based on current utilization. |
| setTargetWeight            | bool   | If true, the targetWeight will be updated.                            |
| targetWeight               | uint8  | The desired target weight for this product.                           |
| setTargetPrice             | bool   | If true, the targetPrice will be updated.                             |
| targetPrice                | uint96 | The desired target price for this product.                            |

**Purpose:**

- **Creates, updates, or removes products** from the staking pool.
- **Adjusts weights and pricing parameters.**
- **Recalculates effective weights if necessary.**

---

#### `recalculateEffectiveWeights`

Dynamically adjusts effective weights for specified products based on current capacity and utilization.

```solidity
function recalculateEffectiveWeights(uint poolId, uint[] calldata productIds) external;
```

| Parameter    | Description                    |
| ------------ | ------------------------------ |
| `poolId`     | Staking pool ID.               |
| `productIds` | List of product IDs to update. |

**Purpose:**

- Ensures **fair capacity allocation** by dynamically adjusting product weights.
- **Recommended after significant changes** in usage or pricing.

#### `recalculateEffectiveWeightsForAllProducts`

Recalculates effective weights for all products within a staking pool.

```solidity
function recalculateEffectiveWeightsForAllProducts(uint poolId) external;
```

| Parameter | Description                 |
| --------- | --------------------------- |
| `poolId`  | The ID of the staking pool. |

**Purpose:**

- Ensures **fair capacity allocation** by dynamically adjusting all product weights.
- **Recommended after significant changes** in usage or pricing.

---

#### `createStakingPool`

**Creates a new staking pool.**

```solidity
function createStakingPool(
  bool isPrivatePool,
  uint initialPoolFee,
  uint maxPoolFee,
  ProductInitializationParams[] memory productInitParams,
  string calldata ipfsHash
) external returns (uint poolId, address stakingPoolAddress);
```

| Parameter           | Description                                    |
| ------------------- | ---------------------------------------------- |
| `isPrivatePool`     | `true` for a private pool, `false` for public. |
| `initialPoolFee`    | Initial staking pool fee.                      |
| `maxPoolFee`        | Maximum allowed pool fee.                      |
| `productInitParams` | Initial product parameters.                    |
| `ipfsHash`          | IPFS hash for metadata.                        |

**Purpose:**

- Creates a **new staking pool** with customizable settings.
- Assigns **pool manager role** to the caller.

---

#### `setPoolMetadata`

**Updates the metadata for a staking pool.**

```solidity
function setPoolMetadata(uint poolId, string calldata ipfsHash) external;
```

| Parameter  | Description                 |
| ---------- | --------------------------- |
| `poolId`   | ID of the staking pool.     |
| `ipfsHash` | New IPFS hash for metadata. |

---

### View Functions

#### `getProduct`

**Retrieves product details.**

```solidity
function getProduct(uint poolId, uint productId) external view returns (
  uint lastEffectiveWeight,
  uint targetWeight,
  uint targetPrice,
  uint bumpedPrice,
  uint bumpedPriceUpdateTime
);
```

---

#### `getPoolManager`

**Returns the pool manager address.**

```solidity
function getPoolManager(uint poolId) public view returns (address);
```

| Parameter | Description                 |
| --------- | --------------------------- |
| `poolId`  | The ID of the staking pool. |

---

#### `getPoolMetadata`

**Retrieves metadata IPFS hash.**

```solidity
function getPoolMetadata(uint poolId) external view returns (string memory ipfsHash);
```

| Parameter | Description                 |
| --------- | --------------------------- |
| `poolId`  | The ID of the staking pool. |

---

## Pricing Functions

### `getPremium`

**Calculates the premium for a cover product.**

```solidity
function getPremium(
    uint poolId,
    uint productId,
    uint period,
    uint coverAmount,
    uint totalCapacity,
    uint productMinPrice,
    bool useFixedPrice,
    uint nxmPerAllocationUnit
) public returns (uint premium);
```

| Parameter               | Description                                              |
| ----------------------- | -------------------------------------------------------- |
| `poolId`                | The ID of the staking pool.                              |
| `productId`             | The ID of the specific cover product.                    |
| `period`                | The cover duration in seconds.                           |
| `coverAmount`           | The coverage amount requested (in the protocol's units). |
| `initialCapacityUsed`   | The capacity already used before this cover.             |
| `totalCapacity`         | The total capacity available in the pool.                |
| `globalMinPrice`        | The global minimum price ratio for the cover product.    |
| `useFixedPrice`         | Boolean indicating if a fixed price should be used.      |
| `nxmPerAllocationUnit`  | The amount of NXM per allocation unit.                   |
| `allocationUnitsPerNXM` | The number of allocation units per NXM token.            |

**Description:** Typically called internally by the staking pool during cover purchase. Updates the product's bumped price and timestamp.

**Includes:**

- **Base pricing and price bumps** (as capacity is used).
- **Uses product-specific `minPrice` instead of the global minimum price.**
- **Cover period and amount affect final premium.**

---

## Events

- **`ProductUpdated(uint indexed productId, uint targetWeight, uint targetPrice)`**
  - Emitted when a product is updated.

---

## FAQ

### How are product weights determined?

Each product has two weight metrics:

- **Target Weight (`targetWeight`)** – Set by the **pool manager**, representing the **ideal** weight for the product in the pool.
- **Effective Weight (`lastEffectiveWeight`)** – The **actual** weight dynamically calculated based on **staked capacity, utilization, and platform-wide constraints**.

The contract **tries to meet the target weight** but may **assign a lower effective weight** if the pool lacks sufficient stake or if constraints (like global capacity limits) affect the allocation.

### Can effective weight be higher than the target weight?

No, the **effective weight is capped at the target weight**. If the available stake is low, the effective weight may be **lower** than the target weight, but it will **never exceed** the target.

### Can I create a private or public staking pool?

Yes:

- **Private pools** (`isPrivatePool = true`) restrict who can interact.
- **Public pools** (`isPrivatePool = false`) allow open participation.

### How often should effective weights be recalculated?

Effective weights must be manually **recalculated whenever staking pool conditions change**. This can be done by calling:

- `recalculateEffectiveWeights(poolId, productIds[])` – Recalculates specific products in a pool.
- `recalculateEffectiveWeightsForAllProducts(poolId)` – Updates all products in a pool.

Recalculations should be triggered:

- **Significant cover purchases** that affect capacity.
- **Stake changes** (new stakes, stake withdrawals, or stake extensions).
- **Periodically** (e.g., daily or weekly) to reflect evolving conditions.

### How is the premium calculated?

Premiums are calculated dynamically based on:

1. **Base Price** – The product's **target price** set by the pool manager.
2. **Price Bumps** – As more capacity is used, the price **increases slightly** (+0.05% per 1% capacity used).
3. **Pricing Decay** – Over time, the price gradually **decreases (0.5% per day)**, allowing for price discovery.
4. **Minimum Price (`minPrice`)** – Ensures the price **never falls below** a predefined level (overrides the global minimum if set).
5. **Cover Details** – The **amount of cover** purchased and **coverage duration** also impact the final premium.

This dynamic model ensures pricing reflects **demand and supply**, preventing underpricing while keeping costs fair for buyers.

### How does StakingProducts integrate with StakingPoolFactory to create a new staking pool?

The **StakingProducts** contract uses the **StakingPoolFactory** to deploy and initialize new staking pools.

**How is a new staking pool created?**

1. The `createStakingPool()` function is called on StakingProducts.
1. This interacts with StakingPoolFactory, which deploys a new StakingPool contract.
1. The caller becomes the staking pool manager, who can then:

   - Set pool parameters (e.g., fees, private/public status).
   - Choose which cover products to allow in the pool.
   - Set initial target weights for products in the pool.

1. The staking pool is linked to StakingProducts, enabling capacity allocation for covers.

### How can I update pool metadata?

Call `setPoolMetadata(poolId, ipfsHash)`, where `ipfsHash` contains **updated metadata**.

---

## Contact and Support

If you have questions or need assistance integrating with the `StakingProducts` contract, please reach out through the official support channels or developer forums.

- **Developer Forums**: Join our community forums to discuss and seek help.
- **Official Support Channels**: Contact us via our official support email or join our Discord.
- **Documentation Resources**: Access tutorials and FAQs on our official website.
- **GitHub Repository**: Report issues or contribute to the codebase.

**Disclaimer:** This documentation provides a high-level overview of the `StakingProducts` contract. Always refer to the latest contract code and official resources when developing against the protocol.

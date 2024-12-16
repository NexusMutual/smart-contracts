# StakingProducts Contract Developer Documentation

- [StakingProducts Contract Developer Documentation](#stakingproducts-contract-developer-documentation)
  - [Overview](#overview)
  - [Key Concepts](#key-concepts)
    - [Product Weights](#product-weights)
    - [Pricing Dynamics](#pricing-dynamics)
    - [Staking Pool Management](#staking-pool-management)
  - [Mutative Functions](#mutative-functions)
    - [`setProducts`](#setproducts)
    - [`recalculateEffectiveWeights`](#recalculateeffectiveweights)
    - [`recalculateEffectiveWeightsForAllProducts`](#recalculateeffectiveweightsforallproducts)
    - [`getPremium`](#getpremium)
    - [`createStakingPool`](#createstakingpool)
    - [`setPoolMetadata`](#setpoolmetadata)
  - [View Functions](#view-functions)
    - [`getProduct`](#getproduct)
    - [`getProductTargetWeight`](#getproducttargetweight)
    - [`getTotalTargetWeight`](#gettotaltargetweight)
    - [`getTotalEffectiveWeight`](#gettotaleffectiveweight)
    - [`getPoolManager`](#getpoolmanager)
    - [`getPoolMetadata`](#getpoolmetadata)
  - [Pricing Functions](#pricing-functions)
    - [`calculatePremium`](#calculatepremium)
    - [`calculatePremiumPerYear`](#calculatepremiumperyear)
    - [`calculateSurgePremium`](#calculatesurgepremium)
    - [`getBasePrice`](#getbaseprice)
    - [`calculateFixedPricePremium`](#calculatefixedpricepremium)
  - [Events](#events)
  - [Integration Guidelines](#integration-guidelines)
  - [Frequently Asked Questions](#frequently-asked-questions)
    - [How are product weights determined?](#how-are-product-weights-determined)
    - [Can I create a private or public staking pool?](#can-i-create-a-private-or-public-staking-pool)
    - [How often should effective weights be recalculated?](#how-often-should-effective-weights-be-recalculated)
    - [How is the premium calculated?](#how-is-the-premium-calculated)
    - [What is surge pricing and when does it apply?](#what-is-surge-pricing-and-when-does-it-apply)
    - [How can I update the pool metadata?](#how-can-i-update-the-pool-metadata)
    - [Who can set or update products in a pool?](#who-can-set-or-update-products-in-a-pool)
  - [Contact and Support](#contact-and-support)

## Overview

The `StakingProducts` contract is a **core component** of the protocol, responsible for managing staking pools, their associated products, and dynamic pricing mechanisms for cover products. This contract enables the creation and management of staking pools, configuration of products within those pools, and calculation of premiums based on capacity and utilization.

## Key Concepts

### Product Weights

Each product within a staking pool has two key weight metrics:

- **Target Weight (`targetWeight`)**: The desired allocation for a product within the pool, as defined by the pool manager.
- **Effective Weight (`lastEffectiveWeight`)**: The actual allocation used in calculations, dynamically adjusted based on global capacity, product-specific capacity reductions, and current utilization.

Understanding these weights is crucial for managing capacity allocation and ensuring fair distribution among products.

### Pricing Dynamics

The contract employs a sophisticated pricing mechanism that includes:

- **Base Pricing**: The initial price for a cover product, based on the target price set by the pool manager.
- **Price Bumps**: Incremental price increases applied as capacity is utilized, encouraging efficient use of resources.
- **Surge Pricing**: An additional price increase activated when capacity usage exceeds a threshold (90%), to prevent over-saturation and maintain pool stability.
- **Price Smoothing**: Daily adjustments towards the target price to stabilize pricing dynamics.

### Staking Pool Management

The `StakingProducts` contract allows for:

- **Creating Staking Pools**: Initialize new pools with specific configurations, either private or public.
- **Managing Products**: Add, update, or remove products within a pool, adjusting their weights and pricing settings.
- **Metadata Management**: Associate pools with metadata stored on decentralized platforms like IPFS for transparency.

## Mutative Functions

### `setProducts`

Configures products for a specific staking pool and updates their parameters.

```solidity
function setProducts(uint poolId, StakedProductParam[] memory params) external;
```

| Parameter | Description                                                |
| --------- | ---------------------------------------------------------- |
| `poolId`  | The ID of the staking pool.                                |
| `params`  | An array of `StakedProductParam` structs containing product parameters. |

### `recalculateEffectiveWeights`

Dynamically adjusts effective weights for specified products based on current capacity and utilization.

```solidity
function recalculateEffectiveWeights(uint poolId, uint[] calldata productIds) external;
```

| Parameter     | Description                                               |
| ------------- | --------------------------------------------------------- |
| `poolId`      | The ID of the staking pool to update.                     |
| `productIds`  | The IDs of the products within the pool whose weights will be recalculated. |

**Description:** Recalculates `effectiveWeight` for each specified product. Ensures fair capacity allocation among products.

### `recalculateEffectiveWeightsForAllProducts`

Recalculates effective weights for all products within a staking pool.

```solidity
function recalculateEffectiveWeightsForAllProducts(uint poolId) external;
```

| Parameter | Description                    |
| --------- | ------------------------------ |
| `poolId`  | The ID of the staking pool.    |

**Description:** Useful for comprehensive updates after significant changes.

### `getPremium`

Calculates the premium for a cover product based on current pricing dynamics.

```solidity
function getPremium(
    uint poolId,
    uint productId,
    uint period,
    uint coverAmount,
    uint initialCapacityUsed,
    uint totalCapacity,
    uint globalMinPrice,
    bool useFixedPrice,
    uint nxmPerAllocationUnit,
    uint allocationUnitsPerNXM
) public returns (uint premium);
```

| Parameter                | Description                                                 |
| ------------------------ | ----------------------------------------------------------- |
| `poolId`                 | The ID of the staking pool.                                 |
| `productId`              | The ID of the specific cover product.                       |
| `period`                 | The cover duration in seconds.                              |
| `coverAmount`            | The coverage amount requested (in the protocol's units).    |
| `initialCapacityUsed`    | The capacity already used before this cover.                |
| `totalCapacity`          | The total capacity available in the pool.                   |
| `globalMinPrice`         | The global minimum price ratio for the cover product.       |
| `useFixedPrice`          | Boolean indicating if a fixed price should be used.         |
| `nxmPerAllocationUnit`   | The amount of NXM per allocation unit.                      |
| `allocationUnitsPerNXM`  | The number of allocation units per NXM token.               |

**Description:** Typically called internally by the staking pool during cover purchase. Updates the product's bumped price and timestamp.

### `createStakingPool`

Creates a new staking pool with specified configurations.

```solidity
function createStakingPool(
    bool isPrivatePool,
    uint initialPoolFee,
    uint maxPoolFee,
    ProductInitializationParams[] memory productInitParams,
    string calldata ipfsHash
) external returns (uint poolId, address stakingPoolAddress);
```

| Parameter              | Description                                              |
| ---------------------- | -------------------------------------------------------- |
| `isPrivatePool`        | Indicates if the pool is private (`true`) or public (`false`). |
| `initialPoolFee`       | The initial fee for the pool (in basis points).          |
| `maxPoolFee`           | The maximum allowable fee for the pool (in basis points). |
| `productInitParams`    | Initial parameters for products in the pool.             |
| `ipfsHash`             | IPFS hash for the pool's metadata.                       |

**Description:** Initializes a new staking pool and sets up initial products. The pool manager role is assigned to the caller.

### `setPoolMetadata`

Updates the metadata for a staking pool.

```solidity
function setPoolMetadata(uint poolId, string calldata ipfsHash) external;
```

| Parameter | Description                            |
| --------- | -------------------------------------- |
| `poolId`  | The ID of the staking pool.            |
| `ipfsHash`| New IPFS hash for the pool's metadata. |

### `getProduct`

Retrieves detailed information about a specific product in a pool.

```solidity
function getProduct(uint poolId, uint productId) external view returns (
    uint lastEffectiveWeight,
    uint targetWeight,
    uint targetPrice,
    uint bumpedPrice,
    uint bumpedPriceUpdateTime
);
```

| Parameter   | Description                         |
| ----------- | ----------------------------------- |
| `poolId`    | The ID of the staking pool.         |
| `productId` | The ID of the product.              |

**Returns:**

- `lastEffectiveWeight`: The last calculated effective weight.
- `targetWeight`: The target weight set by the pool manager.
- `targetPrice`: The target price set by the pool manager.
- `bumpedPrice`: The last bumped price.
- `bumpedPriceUpdateTime`: The timestamp of the last price update.

### `getProductTargetWeight`

Gets the target weight for a specific product in a pool.

```solidity
function getProductTargetWeight(uint poolId, uint productId) external view returns (uint);
```

| Parameter   | Description                         |
| ----------- | ----------------------------------- |
| `poolId`    | The ID of the staking pool.         |
| `productId` | The ID of the product.              |

### `getTotalTargetWeight`

Gets the total target weight for all products in a pool.

```solidity
function getTotalTargetWeight(uint poolId) external view returns (uint);
```

| Parameter | Description                    |
| --------- | ------------------------------ |
| `poolId`  | The ID of the staking pool.    |

### `getTotalEffectiveWeight`

Gets the total effective weight for all products in a pool.

```solidity
function getTotalEffectiveWeight(uint poolId) external view returns (uint);
```

| Parameter | Description                    |
| --------- | ------------------------------ |
| `poolId`  | The ID of the staking pool.    |

### `getPoolManager`

Retrieves the address of the manager for a staking pool.

```solidity
function getPoolManager(uint poolId) public view returns (address);
```

| Parameter | Description                    |
| --------- | ------------------------------ |
| `poolId`  | The ID of the staking pool.    |

### `getPoolMetadata`

Retrieves the IPFS hash of the pool's metadata.

```solidity
function getPoolMetadata(uint poolId) external view returns (string memory ipfsHash);
```

| Parameter | Description                    |
| --------- | ------------------------------ |
| `poolId`  | The ID of the staking pool.    |

## Pricing Functions

### `calculatePremium`

Calculates the premium for a cover product and updates the product's bumped price.

```solidity
function calculatePremium(
    StakedProduct memory product,
    uint period,
    uint coverAmount,
    uint initialCapacityUsed,
    uint totalCapacity,
    uint targetPrice,
    uint currentBlockTimestamp,
    uint nxmPerAllocationUnit,
    uint allocationUnitsPerNxm,
    uint targetPriceDenominator
) public pure returns (uint premium, StakedProduct memory);
```

**Description:** Computes the premium based on current pricing dynamics (price bumps, surge pricing)

### `calculatePremiumPerYear`

Calculates the annualized premium for a cover product, including surge pricing if applicable.

```solidity
function calculatePremiumPerYear(
    uint basePrice,
    uint coverAmount,
    uint initialCapacityUsed,
    uint totalCapacity,
    uint nxmPerAllocationUnit,
    uint allocationUnitsPerNxm,
    uint targetPriceDenominator
) public pure returns (uint);
```

**Description:** Calculates the premium per year considering base price and capacity utilization

### `calculateSurgePremium`

Calculates the surge premium for the capacity used above the surge threshold.

```solidity
function calculateSurgePremium(
    uint amountOnSurge,
    uint totalCapacity,
    uint allocationUnitsPerNxm
) public pure returns (uint);
```

**Description:** Computes additional premium due to surge pricing. Applied when capacity usage exceeds 90%.

### `getBasePrice`

Calculates the base price of a product, adjusting towards the target price over time.

```solidity
function getBasePrice(
    uint productBumpedPrice,
    uint productBumpedPriceUpdateTime,
    uint targetPrice,
    uint timestamp
) public pure returns (uint basePrice);
```

**Description:** Applies daily adjustments towards the target price ensuring smooth price transitions over time.

### `calculateFixedPricePremium`

Calculates the premium using a fixed price, bypassing dynamic pricing mechanisms.

```solidity
function calculateFixedPricePremium(
    uint coverAmount,
    uint period,
    uint fixedPrice,
    uint nxmPerAllocationUnit,
    uint targetPriceDenominator
) public pure returns (uint);
```

**Description:** Used when a fixed price is required. Does not consider capacity or utilization.

## Events

- `ProductUpdated(uint indexed productId, uint targetWeight, uint targetPrice)`: Emitted when a product's parameters are updated.

## Integration Guidelines

- **Creating Pools**: Use `createStakingPool` to initialize new staking pools, specifying whether they are private or public.
- **Managing Products**: Pool managers can use `setProducts` to configure products, adjusting weights and pricing.
- **Recalculating Weights**: Regularly call `recalculateEffectiveWeights` to update effective weights based on current utilization.
- **Premium Calculation**: Utilize `getPremium` within staking pools to calculate premiums for cover products.
- **Metadata Management**: Keep pool metadata updated using `setPoolMetadata` for transparency.

## Frequently Asked Questions

### How are product weights determined?

Product weights are determined based on:

- **Target Weight**: Set by the pool manager to represent the desired allocation.
- **Effective Weight**: Calculated dynamically, considering global capacity ratio, product-specific capacity reductions, and current utilization.

Effective weight ensures that actual allocation reflects current conditions, promoting fair resource distribution.

### Can I create a private or public staking pool?

Yes. When creating a staking pool using `createStakingPool`, you can specify:

- **Private Pool**: Set `isPrivatePool` to `true`. Only authorized participants can interact.
- **Public Pool**: Set `isPrivatePool` to `false`. Open to all participants.

### How often should effective weights be recalculated?

It's recommended to recalculate effective weights:

- **Periodically**: At regular intervals (e.g., daily or weekly) to keep allocations accurate.
- **After Significant Events**: Such as large cover purchases, capacity changes, or adjustments to product parameters.

Regular recalculations help maintain optimal resource allocation and pricing accuracy.

### How is the premium calculated?

Premiums are calculated based on:

- **Base Price**: Derived from the product's target price, adjusted over time.
- **Price Bumps**: Applied for capacity used, increasing the price by 0.2% for each 1% of capacity utilized.
- **Surge Pricing**: Activated when capacity usage exceeds 90%, significantly increasing premiums to prevent over-saturation.
- **Cover Period and Amount**: The duration and amount of the cover requested.

The `getPremium` function encapsulates this calculation, considering all relevant factors to determine the final premium.

### What is surge pricing and when does it apply?

Surge pricing is a mechanism that increases premiums when capacity usage exceeds 90%. It:

- **Activation Threshold**: Activated when capacity usage exceeds the surge threshold (90%).
- **Effect**: Increases premiums proportionally to the capacity used beyond the threshold, up to a maximum of doubling the price (200% increase).
- **Purpose**: Discourages over-saturation and encourages staking or diversification.

### How can I update the pool metadata?

As a pool manager, you can update your pool's metadata by:

- **Calling `setPoolMetadata` Function**: Provide the pool ID and the new IPFS hash containing your metadata.

```solidity
function setPoolMetadata(uint poolId, string calldata ipfsHash) external;
```

**Note:** The IPFS hash must not be empty.

### Who can set or update products in a pool?

Only the pool manager can set or update products within their pool. The pool manager is assigned upon pool creation and has exclusive rights to manage the pool's products and settings.

## Contact and Support

If you have questions or need assistance integrating with the `StakingProducts` contract or other parts of the protocol, please reach out through the official support channels or developer forums.

- **Developer Forums**: Join our community forums to discuss with other developers and seek help.
- **Official Support Channels**: Contact us via our official support email or join our Discord server.
- **Documentation Resources**: Access additional documentation, tutorials, and FAQs on our official website.
- **GitHub Repository**: Report issues or contribute to the codebase through our GitHub repository.

**Disclaimer:** This documentation provides a high-level overview of the `StakingProducts` contract's functionality. It is intended for developers integrating with the protocol and may omit internal details not relevant to external interactions. Always refer to the latest contract code and official resources



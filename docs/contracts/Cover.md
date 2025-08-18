# Cover

## Overview

The Cover contract manages the purchase and management of coverage within the protocol. It allows users to buy coverage for specific products and handles the allocation of coverage across various staking pools. The contract keeps track of cover segments, allocations, and active covers, ensuring that coverage is properly managed over time.

## Key Concepts

### Cover Data Structures

#### CoverData

Represents the basic information about a cover.

```solidity
struct CoverData {
    uint24 productId;
    uint8 coverAsset;
    uint96 amount;
    uint32 start;
    uint32 period;
    uint32 gracePeriod;
    uint16 rewardsRatio;
    uint16 capacityRatio;
}
```

| Parameter        | Description                                        |
|------------------|----------------------------------------------------|
| `productId`      | The ID of the product being covered.               |
| `coverAsset`     | The asset ID used for coverage (e.g., ETH).        |
| `amount`         | Active amount of cover in cover asset.             |
| `start`          | Start timestamp of the cover.                      |
| `period`         | Duration of the cover (in seconds).                |
| `gracePeriod`    | Additional time allowed for submitting claims.     |
| `rewardsRatio`   | Ratio used to calculate rewards.                   |
| `capacityRatio`  | Ratio used to calculate pool capacity utilization. |

#### PoolAllocation

Represents the allocation of coverage to a specific staking pool.

```solidity
struct PoolAllocation {
    uint40 poolId;
    uint96 coverAmountInNXM;
    uint96 premiumInNXM;
    uint24 allocationId;
}
```

| Parameter           | Description                                            |
|---------------------|--------------------------------------------------------|
| `poolId`            | ID of the staking pool.                                |
| `coverAmountInNXM`  | Cover amount allocated to the pool in NXM tokens.      |
| `premiumInNXM`      | Premium paid for the allocation in NXM tokens.         |
| `allocationId`      | Unique identifier for the allocation within the pool.  |

#### CoverReference
Tracks edits and extensions to a cover.

```solidity
struct CoverReference {
    uint32 originalCoverId;
    uint32 latestCoverId;
}
```

### Active Cover and Expiration Buckets

- **ActiveCover:** Tracks the total active cover in an asset and the last bucket update ID.
- **Expiration Buckets:** Cover amounts are tracked in weekly buckets (BUCKET_SIZE is 7 days). As covers expire, the amounts are deducted from the active cover.

### Constants

- **Commission and Ratios:**

```solidity
uint private constant COMMISSION_DENOMINATOR = 10000;
uint public constant MAX_COMMISSION_RATIO = 3000; // 30%
uint public constant GLOBAL_CAPACITY_RATIO = 20000; // 2x
uint public constant GLOBAL_REWARDS_RATIO = 5000; // 50%
uint public constant GLOBAL_MIN_PRICE_RATIO = 100; // 1%
uint public constant DEFAULT_MIN_PRICE_RATIO  = 100; // 1%
```

- **Cover Periods:**

```solidity
uint private constant MAX_COVER_PERIOD = 365 days;
uint private constant MIN_COVER_PERIOD = 28 days;
uint private constant BUCKET_SIZE = 7 days;
```

### Allocation Units

- **Allocation Units per NXM:**

```solidity
uint private constant ALLOCATION_UNITS_PER_NXM = 100;
uint public constant NXM_PER_ALLOCATION_UNIT = ONE_NXM / ALLOCATION_UNITS_PER_NXM;
uint private constant MAX_ACTIVE_TRANCHES = 8;
```

### Asset IDs

- **Asset Identifiers:**

```solidity
uint private constant ETH_ASSET_ID = 0;
uint private constant NXM_ASSET_ID = type(uint8).max;
```

## Mutative Functions

### `buyCover`

Allows a user to purchase or edit cover for a specific product.

```solidity
function buyCover(
    BuyCoverParams memory params,
    PoolAllocationRequest[] memory poolAllocationRequests
) external payable onlyMember nonReentrant whenNotPaused returns (uint coverId);
```

| Parameter                 | Description                                                                                                 |
|---------------------------|-------------------------------------------------------------------------------------------------------------|
| `params`                  | Struct containing cover purchase parameters (see below).                                                    |
| `poolAllocationRequests`  | Array of pool allocation requests specifying how to allocate cover amount across staking pools (see below). |

#### `BuyCoverParams` Structure:

```solidity
struct BuyCoverParams {
    uint coverId;
    address owner;
    uint24 productId;
    uint8 coverAsset;
    uint96 amount;
    uint32 period;
    uint maxPremiumInAsset;
    uint8 paymentAsset;
    uint16 commissionRatio;
    address commissionDestination;
    string ipfsData;
}

```

| Field                     | Description                                                                          |
|---------------------------|--------------------------------------------------------------------------------------|
| `coverId`                 | The ID of an existing cover to extend or modify, or 0 to create a new cover.         |
| `owner`                   | The address that will own the cover NFT.                                             |
| `productId`               | The ID of the product to purchase cover for.                                         |
| `coverAsset`              | The asset ID used for coverage. See `Pool.getAssets` (e.g., 0 ~ ETH).                |
| `amount`                  | The amount of coverage in the cover asset.                                           |
| `period`                  | The duration of the cover in seconds.                                                |
| `maxPremiumInAsset`       | The maximum premium the buyer is willing to pay in the payment asset.                |
| `paymentAsset`            | The asset ID used for payment (must be coverAsset or NXM_ASSET_ID).                  |
| `commissionRatio`         | The commission ratio (in basis points, where 10000 = 100%).                          |
| `commissionDestination`   | The address where the commission should be sent.                                     |
| `ipfsData`                | IPFS hash of additional data related to the cover (e.g., list of wallet addresses).  |

#### `PoolAllocationRequest` Structure:

```solidity
struct PoolAllocationRequest {
    uint poolId;
    uint coverAmountInAsset;
}
```

To retrieve data to construct `PoolAllocationRequest`, call the `/quote` endpoint of the cover-router API service: [API Documentation](https://api.nexusmutual.io/v2/api/docs/#/Quote/get_v2_quote).

| Field                 | Description                                                           |
|-----------------------|-----------------------------------------------------------------------|
| `poolId`              | ID of the staking pool to allocate cover to.                          |
| `coverAmountInAsset`  | Amount of coverage to allocate to the pool in the cover asset.        |

**Returns:** The coverId of the purchased cover.

**Description:** Purchases new cover or edits an existing cover. Validates input parameters (e.g., cover period, commission ratio), allocates cover amounts across specified staking pools, calculates premiums and commissions, and mints a new Cover NFT if it's a new cover.

### `expireCover`

Explicitly expires a cover that has reached its expiration time removing its allocations.

```solidity
function expireCover(uint coverId) external;
```

| Parameter   | Description                     |
|-------------|---------------------------------|
| `coverId`   | The ID of the cover to expire.  |

**Description:** Checks if the cover has expired, deallocates cover amounts from staking pools, and updates active cover amounts and expiration buckets. Reverts if the cover has not yet expired.

**Usage:** Called when a cover has expired to clean up allocations and update cover data. Only callable after the cover's expiration time.

### `burnStake`

Burns stake from staking pools when a claim is approved.

```solidity
function burnStake(
    uint coverId,
    uint segmentId,
    uint payoutAmountInAsset
) external onlyInternal override returns (address);
```

| Parameter               | Description                                                    |
|-------------------------|----------------------------------------------------------------|
| `coverId`               | The ID of the cover associated with the claim.                 |
| `segmentId`             | The segment ID within the cover.                               |
| `payoutAmountInAsset`   | The amount to be paid out for the claim, in the cover asset.   |

**Returns:** The owner address of the cover NFT.

**Description:** Calculates the proportion of stake to burn based on the payout amount, updates the cover's amountPaidOut, calls burnStake on the relevant staking pools, adjusts active cover amounts and expiration buckets, and returns the owner of the cover NFT.

**Usage:** Called internally when a claim is approved. Ensures that staking pools bear the appropriate loss.

### `updateTotalActiveCoverAmount`

Updates the total active cover amount for a specific asset.

```solidity
function updateTotalActiveCoverAmount(uint coverAsset) public;
```

| Parameter      | Description                                                                      |
|----------------|----------------------------------------------------------------------------------|
| `coverAsset`   | The asset ID for which to update the active cover amount. See `Pool.getAssets`   |

**Description:** Processes expired covers and updates active cover amounts. Adjusts the active cover expiration buckets. Can be called to manually trigger an update of active cover amounts. Typically used internally when buying or expiring covers.

**Usage:** Can be called to manually trigger an update of active cover amounts. Typically used internally when buying or expiring covers.

## View Functions

### `coverData`

Retrieves the cover data for a specific cover ID.

```solidity
function getCoverData(uint coverId) external override view returns (CoverData memory);
```

| Parameter   | Description            |
|-------------|------------------------|
| `coverId`   | The ID of the cover.   |

**Description:** Returns the CoverData struct associated with the given cover ID. Useful for fetching basic information about a cover, such as productId, coverAsset, and amountPaidOut.

### `getPoolAllocations`

Returns PoolAllocation array for a given coverId.

```solidity
function getPoolAllocations(uint coverId) external view returns (PoolAllocation[] memory);
```

| Parameter    | Description           |
|--------------|-----------------------|
| `coverId`    | The ID of the cover.  |

**Description:** Returns PoolAllocation array for a given coverId.

### `getCoverReference`

Returns the reference for a cover.

```solidity
function getCoverReference(uint coverId) public view returns (CoverReference memory);
```

| Parameter   | Description           |
|-------------|-----------------------|
| `coverId`   | The ID of the cover.  |

**Description:** Returns the cover reference original id and the latest id for a cover.

### `getCoverDataWithReference`

Returns CoverData and CoverReference.

```solidity
function getCoverDataWithReference(uint coverId) external view returns (CoverData memory, CoverReference memory);
```

| Parameter   | Description           |
|-------------|-----------------------|
| `coverId`   | The ID of the cover.  |

**Description:** Returns both Cover data and cover reference for a cover by ID.

### `getLatestEditCoverData`

Returns the latest edited cover data.

```solidity
function getLatestEditCoverData(uint coverId) external view returns (CoverData memory);
```

| Parameter  | Description           |
|------------|-----------------------|
| `coverId`  | The ID of the cover.  |

**Description:** Returns latest edited Cover data by ID

### `totalActiveCoverInAsset`

Returns the total active cover amount for a specific asset.

```solidity
function totalActiveCoverInAsset(uint assetId) public view returns (uint);
```

| Parameter  | Description            |
|------------|------------------------|
| `assetId`  | The ID of the asset.   |

**Description:** Retrieves the total amount of active cover in the specified asset. Useful for assessing the exposure of the protocol in a particular asset.

### `getGlobalCapacityRatio`

Returns the `GLOBAL_CAPACITY_RATIO` constant

```solidity
function getGlobalCapacityRatio() external pure returns (uint);
```

Description: Returns the . Provides the capacity ratio used in cover calculations.

### `getGlobalRewardsRatio`

Returns the `GLOBAL_REWARDS_RATIO` constant

```solidity
function getGlobalRewardsRatio() external pure returns (uint);
```

### `getGlobalMinPriceRatio`

Returns the `GLOBAL_MIN_PRICE_RATIO` constant.

```solidity
function getGlobalMinPriceRatio() external pure returns (uint);
```

### `getGlobalCapacityAndPriceRatios`

Returns both the `GLOBAL_CAPACITY_RATIO` and the `GLOBAL_MIN_PRICE_RATIO` constants in a single call.

```solidity
function getGlobalCapacityAndPriceRatios() external pure returns (
    uint _globalCapacityRatio,
    uint _globalMinPriceRatio
);
```

## Integration Guidelines

- **Buying Cover:** Use the `buyCover` function with appropriate parameters to purchase or edit coverage. Ensure that you handle the premium payment and any commissions.
- **Staking Pools Allocation:** To retrieve data to construct `PoolAllocationRequest`, call the `/quote` endpoint of the cover-router API service: [API Documentation](https://api.nexusmutual.io/v2/api/docs/#/Quote/get_v2_quote).
- **Asset IDs:** Be aware of the asset IDs used within the protocol, such as `ETH_ASSET_ID` and `NXM_ASSET_ID`.
- **Premium Payments:** Premiums can be paid in NXM or the cover asset. Ensure you handle token transfers and approvals appropriately.
- **Commission Handling:** If a commission is involved, specify the commissionRatio and commissionDestination in the BuyCoverParams.

## Frequently Asked Questions

### How do I purchase cover for a product?

Use the buyCover function, providing the necessary parameters and allocation requests. Ensure that you have the required funds and have approved token transfers if paying with an ERC20 asset.

### Can I extend or modify an existing cover?

As of the current implementation, modifying existing covers is not supported and will revert with EditNotSupported. You may need to purchase a new cover instead.

### How is the premium calculated?

Premiums are calculated based on the cover amount, period, and allocations to staking pools. The premium may also include commissions if specified.

### What happens when a cover expires?

When a cover expires, you can call the expireCover function to deallocate cover amounts from staking pools and update active cover data.

### How are claims processed?

When a claim is approved, the burnStake function is called internally to burn the appropriate amount of stake from the staking pools and update cover data.

## Contact and Support

If you have questions or need assistance integrating with the `Cover` contract, please reach out through the official support channels or developer forums.

- **Developer Forums**: Join our community forums to discuss and seek help.
- **Official Support Channels**: Contact us via our official support email or join our Discord.
- **Documentation Resources**: Access tutorials and FAQs on our official website.
- **GitHub Repository**: Report issues or contribute to the codebase.

**Disclaimer:** This documentation provides a high-level overview of the `Cover` contract. Always refer to the latest contract code and official resources when developing against the protocol.

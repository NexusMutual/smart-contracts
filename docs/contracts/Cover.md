# Cover

## Overview

The Cover contract manages the purchase and management of coverage within the protocol. It allows users to buy coverage for specific products — optionally with a reinsurance (RI) component — and handles the allocation of coverage across various staking pools. The contract keeps track of cover data, pool allocations, cover references (for edits), and active covers, ensuring that coverage is properly managed over time.

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

| Parameter          | Description                                                                 |
|--------------------|-----------------------------------------------------------------------------|
| `originalCoverId`  | The ID of the original cover (0 in the original cover's own storage slot).  |
| `latestCoverId`    | The ID of the latest edited version (only used in the original cover).      |

#### Ri

Reinsurance information associated with a cover.

```solidity
struct Ri {
    uint24 providerId;
    uint96 amount;
}
```

| Parameter    | Description                              |
|--------------|------------------------------------------|
| `providerId` | The ID of the reinsurance provider.      |
| `amount`     | The reinsurance amount for the cover.    |

#### RiConfig

Configuration for a reinsurance provider.

```solidity
struct RiConfig {
    uint24 nextNonce;
    address premiumDestination;
}
```

| Parameter             | Description                                           |
|-----------------------|-------------------------------------------------------|
| `nextNonce`           | The next nonce to use for signature verification.     |
| `premiumDestination`  | The address where RI premiums are sent.               |

#### RiRequest

Parameters for a reinsurance request when buying cover with RI.

```solidity
struct RiRequest {
    uint providerId;
    uint amount;
    uint premium;
    bytes signature;
    bytes data;
    uint8 dataFormat;
    uint32 deadline;
}
```

| Parameter    | Description                                                        |
|--------------|--------------------------------------------------------------------|
| `providerId` | The ID of the reinsurance provider.                                |
| `amount`     | The reinsurance amount requested.                                  |
| `premium`    | The premium for the reinsurance component.                         |
| `signature`  | EIP-712 signature from the RI signer authorizing the quote.       |
| `data`       | Arbitrary data associated with the RI request.                     |
| `dataFormat` | Format identifier for the data field.                              |
| `deadline`   | Timestamp after which the signature is no longer valid.            |

### Active Cover and Expiration Buckets

- **ActiveCover:** Tracks the total active cover in an asset and the last bucket update ID.
- **Expiration Buckets:** Cover amounts are tracked in weekly buckets (BUCKET_SIZE is 7 days). As covers expire, the amounts are deducted from the active cover.

### Constants

- **Commission and Ratios:**

```solidity
uint private constant COMMISSION_DENOMINATOR = 10000;
uint public constant MAX_COMMISSION_RATIO = 3000; // 30%
uint private constant GLOBAL_CAPACITY_RATIO = 20000; // 2x
uint private constant GLOBAL_REWARDS_RATIO = 5000; // 50%
uint public constant DEFAULT_MIN_PRICE_RATIO = 100; // 1%
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
```

### Asset IDs

- **Asset Identifiers:**

```solidity
uint private constant ETH_ASSET_ID = 0;
uint private constant NXM_ASSET_ID = type(uint8).max;
```

## Mutative Functions

### `buyCover`

Allows a member to purchase or edit cover for a specific product.

```solidity
function buyCover(
    BuyCoverParams memory params,
    PoolAllocationRequest[] memory poolAllocationRequests
) external payable onlyMember returns (uint coverId);
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
| `coverAsset`              | The asset ID used for coverage. See `Pool.getAssets` (e.g., 0 ~ ETH).               |
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

**Returns:** The `coverId` of the purchased cover.

**Description:** Purchases new cover or edits an existing cover. When `params.coverId` is non-zero, the existing cover is deallocated and a new cover is created linked via `CoverReference`. Validates input parameters (e.g., cover period, commission ratio), allocates cover amounts across specified staking pools, calculates premiums and commissions, and mints a new Cover NFT. Covers with reinsurance cannot be edited through this entrypoint — use `buyCoverWithRi` instead.

### `executeCoverBuy`

Entrypoint for the `LimitOrders` contract to execute a cover buy on behalf of a user.

```solidity
function executeCoverBuy(
    BuyCoverParams memory params,
    PoolAllocationRequest[] memory poolAllocationRequests,
    address buyer
) external payable onlyContracts(C_LIMIT_ORDERS) returns (uint coverId);
```

| Parameter                 | Description                                                                 |
|---------------------------|-----------------------------------------------------------------------------|
| `params`                  | Struct containing cover purchase parameters (same as `buyCover`).           |
| `poolAllocationRequests`  | Array of pool allocation requests.                                          |
| `buyer`                   | The address of the user on whose behalf the cover is being purchased.       |

**Returns:** The `coverId` of the purchased cover.

**Description:** Functions identically to `buyCover` but is callable only by the `LimitOrders` contract. Ownership and approval checks are performed against the `buyer` address rather than `msg.sender`.

### `buyCoverWithRi`

Allows a member to purchase or edit cover with a reinsurance (RI) component.

```solidity
function buyCoverWithRi(
    BuyCoverParams memory params,
    PoolAllocationRequest[] memory poolAllocationRequests,
    RiRequest memory riRequest
) external payable onlyMember returns (uint coverId);
```

| Parameter                 | Description                                                                 |
|---------------------------|-----------------------------------------------------------------------------|
| `params`                  | Struct containing cover purchase parameters (same as `buyCover`).           |
| `poolAllocationRequests`  | Array of pool allocation requests.                                          |
| `riRequest`               | Struct containing reinsurance request parameters (see `RiRequest` above).   |

**Returns:** The `coverId` of the purchased cover.

**Description:** Purchases cover with a reinsurance component. The RI quote must be signed by the protocol's `riSigner` using EIP-712. The RI premium is paid directly to the provider's configured `premiumDestination` address. When paying with a cover asset that includes RI, `paymentAsset` must equal `coverAsset` (NXM payment is not supported for the RI premium portion). On a new cover buy, `riRequest.amount` must be non-zero; on edits, it may be zero.

**Events emitted:**
- `CoverBought(coverId, originalCoverId, buyerMemberId, productId)`
- `CoverRiAllocated(coverId, premium, paymentAsset, data, dataFormatVersion)`

### `expireCover`

Explicitly expires a cover that has reached its expiration time, removing its allocations.

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
    uint payoutAmountInAsset
) external onlyContracts(C_CLAIMS) override;
```

| Parameter               | Description                                                    |
|-------------------------|----------------------------------------------------------------|
| `coverId`               | The ID of the cover associated with the claim.                 |
| `payoutAmountInAsset`   | The amount to be paid out for the claim, in the cover asset.   |

**Description:** Calculates the proportion of stake to burn based on the payout amount relative to the cover amount, calls `burnStake` on each relevant staking pool, adjusts pool allocation amounts, updates active cover amounts and expiration buckets, and reduces the cover's `amount` by the payout.

**Usage:** Called by the Claims contract when a claim is approved. Ensures that staking pools bear the appropriate loss.

### `updateTotalActiveCoverAmount`

Updates the total active cover amount for a specific asset.

```solidity
function updateTotalActiveCoverAmount(uint coverAsset) public;
```

| Parameter      | Description                                                                      |
|----------------|----------------------------------------------------------------------------------|
| `coverAsset`   | The asset ID for which to update the active cover amount. See `Pool.getAssets`.   |

**Description:** Processes expired covers and updates active cover amounts by iterating through expiration buckets. Can be called to manually trigger an update of active cover amounts. Typically used internally when buying or expiring covers.

### `recalculateActiveCoverInAsset`

Recalculates the total active cover for an asset from scratch by iterating all future expiration buckets.

```solidity
function recalculateActiveCoverInAsset(uint coverAsset) public;
```

| Parameter      | Description                                                                      |
|----------------|----------------------------------------------------------------------------------|
| `coverAsset`   | The asset ID for which to recalculate the active cover amount.                   |

**Description:** Iterates over all future weekly expiration buckets (up to `MAX_COVER_PERIOD / BUCKET_SIZE` buckets) and sums the amounts to recalculate `totalActiveCoverInAsset`. Useful as a correction mechanism if the tracked total has drifted.

## View Functions

### `getCoverData`

Retrieves the cover data for a specific cover ID.

```solidity
function getCoverData(uint coverId) external view returns (CoverData memory);
```

| Parameter   | Description            |
|-------------|------------------------|
| `coverId`   | The ID of the cover.   |

**Description:** Returns the `CoverData` struct associated with the given cover ID, containing `productId`, `coverAsset`, `amount`, `start`, `period`, `gracePeriod`, `rewardsRatio`, and `capacityRatio`.

### `getCoverRi`

Returns the reinsurance information for a cover.

```solidity
function getCoverRi(uint coverId) external view returns (Ri memory);
```

| Parameter   | Description            |
|-------------|------------------------|
| `coverId`   | The ID of the cover.   |

**Description:** Returns the `Ri` struct containing `providerId` and `amount` for covers that include a reinsurance component.

### `getCoverDataWithRi`

Returns both cover data and reinsurance information.

```solidity
function getCoverDataWithRi(uint coverId) external view returns (CoverData memory, Ri memory);
```

| Parameter   | Description            |
|-------------|------------------------|
| `coverId`   | The ID of the cover.   |

**Description:** Convenience function that returns both `CoverData` and `Ri` in a single call.

### `getCoverReference`

Returns the reference for a cover.

```solidity
function getCoverReference(uint coverId) public view returns (CoverReference memory);
```

| Parameter   | Description           |
|-------------|-----------------------|
| `coverId`   | The ID of the cover.  |

**Description:** Returns the cover reference with `originalCoverId` and `latestCoverId`. If the cover has never been edited, both fields default to the provided `coverId`.

### `getCoverDataWithReference`

Returns CoverData and CoverReference.

```solidity
function getCoverDataWithReference(uint coverId) external view returns (CoverData memory, CoverReference memory);
```

| Parameter   | Description           |
|-------------|-----------------------|
| `coverId`   | The ID of the cover.  |

**Description:** Returns both cover data and cover reference for a cover by ID.

### `getCoverMetadata`

Returns the IPFS metadata string for a cover.

```solidity
function getCoverMetadata(uint coverId) external view returns (string memory);
```

| Parameter   | Description           |
|-------------|-----------------------|
| `coverId`   | The ID of the cover.  |

**Description:** Returns the IPFS metadata hash stored when the cover was purchased (the `ipfsData` field from `BuyCoverParams`).

### `getLatestEditCoverData`

Returns the latest edited cover data.

```solidity
function getLatestEditCoverData(uint coverId) external view returns (CoverData memory);
```

| Parameter  | Description           |
|------------|-----------------------|
| `coverId`  | The ID of the cover.  |

**Description:** Resolves the `CoverReference` to find the latest cover ID, then returns its `CoverData`. Useful when you have an original cover ID and want the most recent version after edits.

### `getPoolAllocations`

Returns PoolAllocation array for a given coverId.

```solidity
function getPoolAllocations(uint coverId) external view returns (PoolAllocation[] memory);
```

| Parameter    | Description           |
|--------------|-----------------------|
| `coverId`    | The ID of the cover.  |

**Description:** Returns the array of `PoolAllocation` structs for a given cover, showing how the cover amount is distributed across staking pools.

### `getCoverDataCount`

Returns the total number of covers minted.

```solidity
function getCoverDataCount() external view returns (uint);
```

**Description:** Returns the total supply of the Cover NFT, representing the total number of covers that have been created.

### `getRiProviderConfig`

Returns the configuration for a reinsurance provider.

```solidity
function getRiProviderConfig(uint providerId) external view returns (RiConfig memory);
```

| Parameter    | Description                          |
|--------------|--------------------------------------|
| `providerId` | The ID of the reinsurance provider.  |

**Description:** Returns the `RiConfig` struct containing the `nextNonce` and `premiumDestination` for the given provider.

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

Returns the `GLOBAL_CAPACITY_RATIO` constant.

```solidity
function getGlobalCapacityRatio() external pure returns (uint);
```

**Description:** Returns the global capacity ratio (20000, i.e. 2x) used in cover calculations.

### `getGlobalRewardsRatio`

Returns the `GLOBAL_REWARDS_RATIO` constant.

```solidity
function getGlobalRewardsRatio() external pure returns (uint);
```

**Description:** Returns the global rewards ratio (5000, i.e. 50%) used in staking reward calculations.

### `getDefaultMinPriceRatio`

Returns the `DEFAULT_MIN_PRICE_RATIO` constant.

```solidity
function getDefaultMinPriceRatio() external pure returns (uint);
```

**Description:** Returns the default minimum price ratio (100, i.e. 1%) used when a product does not specify its own minimum price.

### `getGlobalCapacityAndPriceRatios`

Returns both the `GLOBAL_CAPACITY_RATIO` and the `DEFAULT_MIN_PRICE_RATIO` constants in a single call.

```solidity
function getGlobalCapacityAndPriceRatios() external pure returns (
    uint _globalCapacityRatio,
    uint _defaultMinPriceRatio
);
```

## Governance Functions

These functions are restricted to governance or the advisory board.

### `setRiSigner`

Sets the address authorized to sign reinsurance quotes.

```solidity
function setRiSigner(address _riSigner) external onlyContracts(C_GOVERNOR);
```

| Parameter    | Description                              |
|--------------|------------------------------------------|
| `_riSigner`  | The new RI signer address.               |

### `setRiConfig`

Configures a reinsurance provider's premium destination.

```solidity
function setRiConfig(uint providerId, address premiumDestination) external onlyContracts(C_GOVERNOR);
```

| Parameter             | Description                                       |
|-----------------------|---------------------------------------------------|
| `providerId`          | The ID of the reinsurance provider.               |
| `premiumDestination`  | The address where RI premiums should be sent.     |

### `changeCoverNFTDescriptor`

Updates the NFT descriptor contract used by CoverNFT for token URI generation.

```solidity
function changeCoverNFTDescriptor(address _coverNFTDescriptor) external onlyContracts(C_GOVERNOR);
```

| Parameter              | Description                          |
|------------------------|--------------------------------------|
| `_coverNFTDescriptor`  | The new NFT descriptor address.      |

### `changeStakingNFTDescriptor`

Updates the NFT descriptor contract used by StakingNFT for token URI generation.

```solidity
function changeStakingNFTDescriptor(address _stakingNFTDescriptor) external onlyContracts(C_GOVERNOR);
```

| Parameter                | Description                          |
|--------------------------|--------------------------------------|
| `_stakingNFTDescriptor`  | The new NFT descriptor address.      |

### `populateIpfsMetadata`

One-time migration function to backfill IPFS metadata for existing covers.

```solidity
function populateIpfsMetadata(
    uint[] memory coverIds,
    string[] memory ipfsMetadata
) external onlyAdvisoryBoard;
```

| Parameter       | Description                                             |
|-----------------|---------------------------------------------------------|
| `coverIds`      | Array of cover IDs to set metadata for.                 |
| `ipfsMetadata`  | Array of IPFS metadata strings, one per cover ID.       |

**Description:** Sets IPFS metadata for covers that don't already have it. Reverts if any of the provided covers already have metadata set.

## Integration Guidelines

- **Buying Cover:** Use the `buyCover` function with appropriate parameters to purchase or edit coverage. Ensure that you handle the premium payment and any commissions.
- **Buying Cover with Reinsurance:** Use `buyCoverWithRi` when the cover requires a reinsurance component. The RI quote must be obtained off-chain and signed by the protocol's `riSigner`.
- **Limit Orders:** The `executeCoverBuy` function is reserved for the `LimitOrders` contract to execute cover purchases on behalf of users.
- **Editing Covers:** Pass a non-zero `coverId` in `BuyCoverParams` to edit an existing cover. The old cover is deallocated and a new one is created, linked via `CoverReference`. Covers with RI must be edited via `buyCoverWithRi`.
- **Staking Pools Allocation:** To retrieve data to construct `PoolAllocationRequest`, call the `/quote` endpoint of the cover-router API service: [API Documentation](https://api.nexusmutual.io/v2/api/docs/#/Quote/get_v2_quote).
- **Asset IDs:** Be aware of the asset IDs used within the protocol, such as `ETH_ASSET_ID` (0) and `NXM_ASSET_ID` (`type(uint8).max`).
- **Premium Payments:** Premiums can be paid in NXM or the cover asset. When paying with NXM, the premium is burned. When paying with ETH or ERC20, the premium is transferred to the Pool. RI premiums cannot be paid in NXM.
- **Commission Handling:** If a commission is involved, specify the `commissionRatio` and `commissionDestination` in the `BuyCoverParams`. Maximum commission is 30%.

## Frequently Asked Questions

### How do I purchase cover for a product?

Use the `buyCover` function, providing the necessary parameters and allocation requests. Ensure that you have the required funds and have approved token transfers if paying with an ERC20 asset.

### Can I extend or modify an existing cover?

Yes. Pass the existing cover's ID as `params.coverId` in `buyCover` (or `buyCoverWithRi` if the cover has a reinsurance component). The contract will deallocate the old cover, create a new one with the updated parameters, and link them via `CoverReference`. The remaining premium from the old cover is refunded (credited against the new premium). Note: expired covers cannot be edited.

### How is the premium calculated?

Premiums are calculated based on the cover amount, period, and allocations to staking pools. Each staking pool returns its premium for the requested allocation. The total premium may also include commissions if specified, and an RI premium if reinsurance is used.

### What happens when a cover expires?

When a cover expires, anyone can call the `expireCover` function to deallocate cover amounts from staking pools and update active cover data.

### How are claims processed?

When a claim is approved, the `burnStake` function is called by the Claims contract to burn the appropriate amount of stake from the staking pools and update cover data.

## Contact and Support

If you have questions or need assistance integrating with the `Cover` contract, please reach out through the official support channels or developer forums.

- **Developer Forums**: Join our community forums to discuss and seek help.
- **Official Support Channels**: Contact us via our official support email or join our Discord.
- **Documentation Resources**: Access tutorials and FAQs on our official website.
- **GitHub Repository**: Report issues or contribute to the codebase.

**Disclaimer:** This documentation provides a high-level overview of the `Cover` contract. Always refer to the latest contract code and official resources when developing against the protocol.

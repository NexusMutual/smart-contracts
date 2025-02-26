# Pool Contract Developer Documentation

## Table of Contents

- [Pool Contract Developer Documentation](#pool-contract-developer-documentation)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Key Concepts](#key-concepts)
    - [Assets Management](#assets-management)
    - [Swap Details](#swap-details)
    - [SwapOperator](#swapoperator)
    - [Payouts and Claims](#payouts-and-claims)
    - [Token Price Calculation](#token-price-calculation)
  - [Mutative Functions](#mutative-functions)
    - [`addAsset`](#addasset)
    - [`setAssetDetails`](#setassetdetails)
    - [`setSwapDetails`](#setswapdetails)
    - [`transferAsset`](#transferasset)
    - [`transferAssetToSwapOperator`](#transferassettoswapoperator)
    - [`setSwapDetailsLastSwapTime`](#setswapdetailslastswaptime)
    - [`setSwapValue`](#setswapvalue)
    - [`sendPayout`](#sendpayout)
    - [`sendEth`](#sendeth)
    - [`upgradeCapitalPool`](#upgradecapitalpool)
    - [`updateAddressParameters`](#updateaddressparameters)
  - [View Functions](#view-functions)
    - [`getPoolValueInEth`](#getpoolvalueineth)
    - [`getAsset`](#getasset)
    - [`getAssets`](#getassets)
    - [`getAssetSwapDetails`](#getassetswapdetails)
    - [`calculateMCRRatio`](#calculatemcrratio)
    - [`getInternalTokenPriceInAsset`](#getinternaltokenpriceinasset)
    - [`getInternalTokenPriceInAssetAndUpdateTwap`](#getinternaltokenpriceinassetandupdatetwap)
    - [`getMCRRatio`](#getmcrratio)
  - [Events](#events)
  - [Integration Guidelines](#integration-guidelines)
  - [Frequently Asked Questions](#frequently-asked-questions)
      - [How can I get the price of the native token in a specific asset?](#how-can-i-get-the-price-of-the-native-token-in-a-specific-asset)
      - [Can I add a new asset to the Pool?](#can-i-add-a-new-asset-to-the-pool)
      - [How do I know which assets are available for claim payouts?](#how-do-i-know-which-assets-are-available-for-claim-payouts)
      - [What happens when an asset is marked as abandoned?](#what-happens-when-an-asset-is-marked-as-abandoned)
  - [Contact and Support](#contact-and-support)

## Overview

The `Pool` contract is a **core component** of the protocol, responsible for managing collective assets such as ETH and other ERC20 tokens. The contract maintains these assets, facilitating their swaps through either the RAMM or SwapOperator contracts. It also handles the receipt of premiums from cover purchases and disburses payouts for claims.

As a core contract it is designed for interaction by other contracts within the protocol. It integrates various contracts to manage reserve assets securely and efficiently, ensuring the system's liquidity and claim payout obligations are met.

**Note:** While the `Pool` contract provides several functions, developers are generally advised to interact with higher-level contracts like the `TokenController` for token pricing and other functionalities, as these interfaces are more stable and user-friendly.

## Key Concepts

### Assets Management

The `Pool` holds various assets, including ETH and multiple ERC20 tokens. Each asset is tracked with specific properties:

```solidity
struct Asset {
    address assetAddress;
    bool isCoverAsset;
    bool isAbandoned;
}
```

| Parameter      | Description                                              |
| -------------- | -------------------------------------------------------- |
| `assetAddress` | The address of the ERC20 token contract or ETH constant. |
| `isCoverAsset` | Indicates if the asset can be used for claim payouts.    |
| `isAbandoned`  | Marks the asset as no longer in use.                     |

### Swap Details

Each asset has associated swap parameters to manage asset swapping:

```solidity
struct SwapDetails {
    uint104 minAmount;
    uint104 maxAmount;
    uint32 lastSwapTime;
    uint16 maxSlippageRatio;
}
```

| Parameter          | Description                                                             |
| ------------------ | ----------------------------------------------------------------------- |
| `minAmount`        | Minimum amount for swapping.                                            |
| `maxAmount`        | Maximum amount for swapping.                                            |
| `lastSwapTime`     | Timestamp of the last swap operation.                                   |
| `maxSlippageRatio` | Maximum allowable slippage during a swap to prevent unfavorable trades. |

### SwapOperator

The `Pool` interacts with the `SwapOperator` contract to handle asset swaps, maintaining the desired asset allocations.

### Payouts and Claims

The `Pool` is responsible for disbursing claim payouts to policyholders. It ensures that the correct amount and asset type are sent to the claimant and may return deposit amounts to users as part of the payout process.

### Token Price Calculation

The `Pool` provides functions to calculate the internal price of the protocol's native token (`NXM`) in various assets.

## Mutative Functions

**Note:** Most mutative functions in the `Pool` contract are restricted to internal use, governance, or specific roles like the `SwapOperator`. Developers integrating with the protocol should interact with higher-level contracts or via the designated interfaces.

### `addAsset`

Adds a new asset to the `Pool` with specified swap parameters (governance only).

```solidity
function addAsset(
    address assetAddress,
    bool isCoverAsset,
    uint _min,
    uint _max,
    uint _maxSlippageRatio
) external onlyGovernance;
```

| Parameter          | Description                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `assetAddress`     | The address of the new asset's ERC20 contract.                                           |
| `isCoverAsset`     | Whether the asset can be used for claim payouts.                                         |
| `min`              | The minimum amount for swapping.                                                         |
| `max`              | The maximum amount for swapping.                                                         |
| `maxSlippageRatio` | The maximum allowable slippage ratio during swaps (in basis points, where 10000 = 100%). |

### `setAssetDetails`

Updates the properties of an existing asset (governance only).

```solidity
function setAssetDetails(
    uint assetId,
    bool isCoverAsset,
    bool isAbandoned
) external onlyGovernance;
```

| Parameter      | Description                                                  |
| -------------- | ------------------------------------------------------------ |
| `assetId`      | The index of the asset in the Pool's asset array.            |
| `isCoverAsset` | Updated status of whether the asset can be used for payouts. |
| `isAbandoned`  | Marks the asset as abandoned or active.                      |

### `setSwapDetails`

Updates the swap parameters for a specific asset (governance only).

```solidity
function setSwapDetails(
    address assetAddress,
    uint _min,
    uint _max,
    uint _maxSlippageRatio
) external onlyGovernance;
```

| Parameter        | Description                                                       |
| ---------------- | ----------------------------------------------------------------- |
| assetAddress     | The address of the asset's ERC20 contract.                        |
| min              | New minimum swap amount.                                          |
| max              | New maximum swap amount.                                          |
| maxSlippageRatio | New maximum slippage ratio (in basis points, where 10000 = 100%). |

### `transferAsset`

Transfers a specified amount of an asset from the `Pool` to a destination address (governance only).

```solidity
function transferAsset(
    address assetAddress,
    address payable destination,
    uint amount
) external onlyGovernance nonReentrant;
```

| Parameter      | Description                                |
| -------------- | ------------------------------------------ |
| `assetAddress` | The address of the asset's ERC20 contract. |
| `destination`  | The recipient address.                     |
| `amount`       | The amount to transfer.                    |

### `transferAssetToSwapOperator`

Transfers a specified amount of an asset from the Pool to the SwapOperator (SwapOperator only).

```solidity
function transferAssetToSwapOperator(
    address assetAddress,
    uint amount
) public override onlySwapOperator nonReentrant whenNotPaused;
```

| Parameter    | Description                                                           |
| ------------ | --------------------------------------------------------------------- |
| assetAddress | The address of the asset's ERC20 contract, or ETH constant for Ether. |
| amount       | The amount of the asset to transfer to the SwapOperator.              |

**Description:** Called by the SwapOperator to receive assets from the Pool for swapping purposes.

### `setSwapDetailsLastSwapTime`

Updates the lastSwapTime for a specific asset's swap details (SwapOperator only).

```solidity
function setSwapDetailsLastSwapTime(
    address assetAddress,
    uint32 lastSwapTime
) public override onlySwapOperator whenNotPaused;
```

| Parameter    | Description                                              |
| ------------ | -------------------------------------------------------- |
| assetAddress | The address of the asset's ERC20 contract.               |
| lastSwapTime | The timestamp of the last swap operation for this asset. |

**Description:** Allows the SwapOperator to update the last time a swap was performed for an asset.

### `setSwapValue`

Updates the swapValue to reflect the value of assets currently in the process of being swapped (SwapOperator only).

```solidity
function setSwapValue(uint newValue) external onlySwapOperator whenNotPaused;
```

| Parameter | Description                                           |
| --------- | ----------------------------------------------------- |
| newValue  | The new total value (in ETH) of assets being swapped. |

**Description:** Sets the total value of assets currently being swapped by the SwapOperator. Helps the Pool keep track of assets during swaps.

### `sendPayout`

Executes a claim payout by transferring assets to the claimant (internal only).

```solidity
function sendPayout(
    uint assetId,
    address payable payoutAddress,
    uint amount,
    uint ethDepositAmount
) external onlyInternal nonReentrant;
```

| Parameter        | Description                           |
| ---------------- | ------------------------------------- |
| assetId          | The index of the cover asset.         |
| payoutAddress    | The recipient of the payout.          |
| amount           | The amount of the asset to send.      |
| ethDepositAmount | Any additional ETH deposit to return. |

### `sendEth`

Transfers ETH to a member, typically in exchange for native tokens (RAMM only).

```solidity
function sendEth(address member, uint amount) external onlyRamm nonReentrant;
```

| Parameter | Description                   |
| --------- | ----------------------------- |
| `member`  | The address of the recipient. |
| `amount`  | The amount of ETH to send.    |

### `upgradeCapitalPool`

Transfers all assets from the current `Pool` to a new `Pool` contract during a contract upgrade (master only).

```solidity
function upgradeCapitalPool(address payable newPoolAddress) external onlyMaster nonReentrant;
```

| Parameter        | Description                           |
| ---------------- | ------------------------------------- |
| `newPoolAddress` | The address of the new Pool contract. |

### `updateAddressParameters`

Updates address-based parameters within the `Pool` contract (governance only).

```solidity
function updateAddressParameters(bytes8 code, address value) external onlyGovernance;
```

| Parameter | Description                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `code`    | A code representing the parameter to update (`"SWP_OP"` for swapOperator, `"PRC_FEED"` for priceFeedOracle) |
| `value`   | The new address value.                                                                                                          |

## View Functions

### `getPoolValueInEth`

Calculates the total value of all assets held by the `Pool` in ETH.

```solidity
function getPoolValueInEth() public view returns (uint);
```

**Description:** Useful for understanding the Pool's overall value and for internal calculations like the Minimum Capital Requirement (MCR) ratio.

### `getAsset`

Fetches detailed information about a specific asset.

```solidity
function getAsset(uint assetId) external view returns (Asset memory);
```

| Parameter | Description                                       |
| --------- | ------------------------------------------------- |
| `assetId` | The index of the asset in the Pool's asset array. |

### `getAssets`

Retrieves a list of all assets managed by the `Pool`, along with their properties.

```solidity
function getAssets() external view returns (Asset[] memory);
```

### `getAssetSwapDetails`

Retrieves the swap parameters for a specific asset.

```solidity
function getAssetSwapDetails(address assetAddress) external view returns (SwapDetails memory);
```

| Parameter      | Description                                |
| -------------- | ------------------------------------------ |
| `assetAddress` | The address of the asset's ERC20 contract. |

### `calculateMCRRatio`

Helper function to calculate the MCR ratio given specific values.

```solidity
function calculateMCRRatio(uint totalAssetValue, uint mcrEth) public override pure returns (uint);
```

| Parameter       | Description                                     |
| --------------- | ----------------------------------------------- |
| totalAssetValue | The total value of all assets in ETH.           |
| mcrEth          | The current Minimum Capital Requirement in ETH. |

**Description:** Calculates the MCR ratio using the formula:

```solidity
uint mcrRatio = totalAssetValue * (10 ** MCR_RATIO_DECIMALS) / mcrEth;
```

**Usage:** Primarily used internally but can be helpful for simulations or calculations outside the contract.

### `getInternalTokenPriceInAsset`

Calculates the internal price of the native token (`NXM`) in terms of the specified asset.

```solidity
function getInternalTokenPriceInAsset(uint assetId) public view returns (uint tokenPrice);
```

| Parameter | Description                                       |
| --------- | ------------------------------------------------- |
| `assetId` | The index of the cover asset in the assets array. |

**Recommendation:** Use `TokenController.getTokenPrice()` instead for a stable interface.

### `getInternalTokenPriceInAssetAndUpdateTwap`

Calculates the internal price of the native token in terms of a specific asset and updates the Time-Weighted Average Price (TWAP).

```solidity
function getInternalTokenPriceInAssetAndUpdateTwap(uint assetId) public returns (uint tokenPrice);
```

| Parameter | Description                                       |
| --------- | ------------------------------------------------- |
| `assetId` | The index of the cover asset in the assets array. |

**Recommendation:** Use `TokenController.getTokenPrice()` instead for a stable interface.

### `getMCRRatio`

Calculates the Minimum Capital Requirement (MCR) ratio, representing the `Pool`'s total asset value relative to the required minimum capital.

```solidity
function getMCRRatio() public view returns (uint);
```

**Description:** Useful for assessing the capital adequacy of the `Pool`.

## Events

- `Payout(address indexed to, address indexed assetAddress, uint amount)`: Emitted when a payout is made to a claimant.
- `DepositReturned(address indexed to, uint amount)`: Emitted when a deposit amount is returned to a user.

## Integration Guidelines

- **Token Pricing:** For token price information, use `TokenController.getTokenPrice()`. This provides a stable address as opposed to the `Pool` contract.
- **Asset Information:** Use the `getAssets()` and `getAsset(uint assetId)` functions to retrieve information about supported assets.
- **Proxy Contracts:** Be aware that some contracts, like the `Pool`, may not be proxies and could have their addresses changed during upgrades. Always refer to the [latest contract addresses](https://sdk.nexusmutual.io/) or use interfaces that abstract away these details.

## Frequently Asked Questions

#### How can I get the price of the native token in a specific asset?

Use the `TokenController.getTokenPrice()` function instead of calling `getInternalTokenPriceInAsset()` directly from the `Pool` contract.

#### Can I add a new asset to the Pool?

Adding new assets is restricted to the governance address. If you believe an asset should be added, consider submitting a proposal through the protocol's governance process.

#### How do I know which assets are available for claim payouts?

Use the `getAssets()` function to retrieve all assets and check the `isCoverAsset` property for each asset.

#### What happens when an asset is marked as abandoned?

An abandoned asset is no longer used by the `Pool` for any operations, including swaps and payouts. Assets may be abandoned due to deprecation or strategic shifts.

## Contact and Support

If you have questions or need assistance integrating with the `Pool` contract, please reach out through the official support channels or developer forums.

- **Developer Forums**: Join our community forums to discuss and seek help.
- **Official Support Channels**: Contact us via our official support email or join our Discord.
- **Documentation Resources**: Access tutorials and FAQs on our official website.
- **GitHub Repository**: Report issues or contribute to the codebase.

**Disclaimer:** This documentation provides a high-level overview of the `Pool` contract. Always refer to the latest contract code and official resources when developing against the protocol.

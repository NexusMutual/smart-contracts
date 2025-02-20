
# Ramm Contract Developer Documentation

## Overview

The `Ramm` contract is designed to allow swaps between NXM tokens and ETH. Internally it works by simulating 2 Uniswap v2 -like pools which have their liquidity adjusted using liquidity injection and a ratcheting mechanism.

## Key Concepts

### Slot0 and Slot1
`Slot0` and `Slot1` manage the contract's internal state for liquidity, ETH reserves, and NXM reserves. They store important values such as the available budget for liquidity injection and the current reserves.

```solidity
struct Slot0 {
  uint128 nxmReserveA;
  uint128 nxmReserveB;
}

  struct Slot1 {
    uint128 ethReserve;
    uint88 budget;
    uint32 updatedAt;
    bool swapPaused;
  }
```

### Circuit Breakers
Circuit breakers are in place to limit the total amount of ETH and NXM that can be released within a given period.

| Parameter     | Description                                  |
|---------------|----------------------------------------------|
| `ethReleased` | Amount of ETH released                       |
| `ethLimit`    | Maximum ETH that can be released before halt |
| `nxmReleased` | Amount of NXM released                       |
| `nxmLimit`    | Maximum NXM that can be released before halt |

### Observations
The `Observation` struct is used to track historical prices, allowing for Time-Weighted Average Price (TWAP) calculations.

```solidity
struct Observation {
  uint32 timestamp;
  uint112 priceCumulativeAbove;
  uint112 priceCumulativeBelow;
}
```

### Liquidity Management Parameters
Several constants manage the liquidity behavior and price adjustments:

```solidity
uint public constant LIQ_SPEED_PERIOD = 1 days;
uint public constant TARGET_LIQUIDITY = 5_000 ether;
uint public constant FAST_LIQUIDITY_SPEED = 1_500 ether;
uint public constant NORMAL_RATCHET_SPEED = 400;
uint public constant FAST_RATCHET_SPEED = 5_000;
```

## Mutative Functions

### `swap`
Allows users to swap NXM tokens for ETH or vice versa.

```solidity
function swap(
  uint nxmIn,
  uint minAmountOut,
  uint deadline
) external payable nonReentrant returns (uint);
```

| Parameter        | Description                                                                                  |
|------------------|----------------------------------------------------------------------------------------------|
| `nxmIn`          | Amount of NXM to swap for ETH (0 if swapping ETH for NXM, and send ETH with the transaction) |
| `minAmountOut`   | Minimum amount of ETH or NXM expected from the swap                                          |
| `deadline`       | The deadline for the swap to be executed                                                     | 

*To ensure that the transaction will be successful, make sure the amount are estimated right. One way to do this is by doing a static call and then applying slippage to the result*
```js
Ramm.callStatic.swap(nxmIn, 0, future_timestamp)
```

### `removeBudget`
Resets the ETH budget used for liquidity injection to zero. This function can only be called by governance.

```solidity
function removeBudget() external onlyGovernance;
```

### `setEmergencySwapPause`
Allows an emergency administrator to pause or resume swap functionality during emergencies.

```solidity
function setEmergencySwapPause(bool _swapPaused) external onlyEmergencyAdmin;
```

| Parameter      | Description                                |
|----------------|--------------------------------------------|
| `_swapPaused`  | True to pause swaps, false to resume them  |

### `setCircuitBreakerLimits`
Sets the limits for the circuit breakers, controlling the maximum ETH and NXM that can be released.

```solidity
function setCircuitBreakerLimits(
  uint _ethLimit,
  uint _nxmLimit
) external onlyEmergencyAdmin;
```

| Parameter    | Description                                  |
|--------------|----------------------------------------------|
| `_ethLimit`  | Maximum ETH that can be released             |
| `_nxmLimit`  | Maximum NXM that can be released             |

## View Functions

### `getReserves`
Returns the current reserves and budget of the contract.

```solidity
function getReserves() external view returns (
  uint ethReserve,
  uint nxmA,
  uint nxmB,
  uint budget
);
```

| Return         | Description                                 |
|----------------|---------------------------------------------|
| `ethReserve`   | Available ETH liquidity in the virtual pool |
| `nxmA`         | Amount of NXM in the virtual pool above     |
| `nxmB`         | Amount of NXM in the virtual pool below     |
| `budget`       | Available ETH budget for liquidity          |

### `getSpotPrices`
Returns the current spot prices for NXM buy and sell operations.

```solidity
function getSpotPrices() external view returns (uint spotPriceA, uint spotPriceB);
```

| Return         | Description            |
|----------------|------------------------|
| `spotPriceA`   | Current NXM buy price  |
| `spotPriceB`   | Current NXM sell price |

*Swapping prices are on a Uniswap V2 curve principle, and spot prices are representation where the price curve starts*

### `getBookValue`
Returns the current book value of NXM, which is amount of the capital pool backing NXM (capital pool in ETH / NXM supply).

```solidity
function getBookValue() external view returns (uint bookValue);
```

| Return         | Description                |
|----------------|----------------------------|
| `bookValue`    | The current NXM book value |

## TWAP and Price Calculation

### `updateTwap`
Updates the Time-Weighted Average Price (TWAP) by adding new price observations.

```solidity
function updateTwap() external;
```

### `getInternalPriceAndUpdateTwap`
Returns the current internal price of NXM and updates TWAP observations.

```solidity
function getInternalPriceAndUpdateTwap() external returns (uint internalPrice);
```

| Return          | Description                                              |
|-----------------|----------------------------------------------------------|
| `internalPrice` | The calculated internal price based on TWAP observations |

## Events

- **`EthInjected(uint injected)`**: Emitted when ETH is injected into the pool.
- **`EthExtracted(uint extracted)`**: Emitted when ETH is extracted from the pool.
- **`EthSwappedForNxm(address indexed user, uint ethIn, uint nxmOut)`**: Emitted when a user swaps ETH for NXM.
- **`NxmSwappedForEth(address indexed user, uint nxmIn, uint ethOut)`**: Emitted when a user swaps NXM for ETH.
- **`ObservationUpdated(uint32 timestamp, uint112 priceCumulativeAbove, uint112 priceCumulativeBelow)`**: Emitted when price observations are updated.
- **`BudgetRemoved()`**: Emitted when the ETH budget is removed.
- **`SwapPauseConfigured(bool swapPaused)`**: Emitted when the swap pause status is configured.




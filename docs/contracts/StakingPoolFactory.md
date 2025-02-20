# StakingPoolFactory Contract Developer Documentation

- [StakingPoolFactory Contract Developer Documentation](#stakingpoolfactory-contract-developer-documentation)
  - [Overview](#overview)
  - [Key Concepts](#key-concepts)
    - [Staking Pool Creation](#staking-pool-creation)
    - [Beacon Proxy](#beacon-proxy)
    - [Operator Role](#operator-role)
  - [Mutative Functions](#mutative-functions)
    - [`changeOperator`](#changeoperator)
    - [`create`](#create)
  - [View Functions](#view-functions)
    - [`stakingPoolCount`](#stakingpoolcount)
  - [Events](#events)
  - [Frequently Asked Questions](#frequently-asked-questions)
    - [Who can create a staking pool?](#who-can-create-a-staking-pool)
    - [What happens if the beacon address is incorrect?](#what-happens-if-the-beacon-address-is-incorrect)
    - [How can the operator role be changed?](#how-can-the-operator-role-be-changed)
  - [Contact and Support](#contact-and-support)

## Overview

The `StakingPoolFactory` contract is responsible for **deploying and managing staking pools** in the protocol. It uses a **beacon proxy pattern** to deploy pools efficiently while keeping gas costs low.

However, **users should not call `StakingPoolFactory.create()` directly**. Instead, staking pools are created through `StakingProducts.createStakingPool()`, which:

- Calls `StakingPoolFactory.create()` to deploy the pool.
- Assigns a pool manager.
- Configures initial products within the pool.

Only the `StakingProducts` contract has **operator permissions** to create staking pools, ensuring pools are deployed securely and with proper configuration.

## Key Concepts

### Staking Pool Creation

- **Pools are created through `StakingProducts.createStakingPool()`**, not directly via `StakingPoolFactory.create()`.
- `StakingProducts` acts as the **operator** of `StakingPoolFactory` and **manages pool creation**.
- When `StakingProducts.createStakingPool()` is called:
  1. `StakingPoolFactory.create()` is executed, deploying a **beacon proxy staking pool**.
  2. `StakingProducts` assigns a **pool manager**.
  3. `StakingProducts` configures **initial cover products** for the pool.

This ensures all pools are **properly registered, assigned managers, and configured correctly**.

### Beacon Proxy

The contract uses a beacon address to define the logic for staking pools. This allows for efficient deployment and potential upgrades of staking pools without affecting existing instances.

### Operator Role

- The **operator** is the **only** account authorized to create staking pools and change the operator itself.
- In this system, `StakingProducts` is **the operator** of `StakingPoolFactory`.
- This ensures:
  - **Controlled staking pool creation**, preventing unauthorized deployments.
  - **Automated pool management**, where pools are assigned managers and configured correctly upon creation.
- The operator role can be changed using `changeOperator(newOperator)`, but only the **current operator (`StakingProducts`)** can perform this action.

## Mutative Functions

### `changeOperator`

Updates the operator address to a new address.

```solidity
function changeOperator(address newOperator) public;
```

| Parameter     | Description                                     |
| ------------- | ----------------------------------------------- |
| `newOperator` | The new address to be assigned as the operator. |

**Description:**

- Verifies that the caller is the current operator.
- Ensures the new operator address is not zero.
- Updates the `operator` to the new address.

**Access Control:** Only the current operator can call this function.

---

### `create`

Creates a new staking pool using the provided beacon address.

```solidity
function create(address _beacon) external returns (uint poolId, address stakingPoolAddress);
```

| Parameter | Description                                       |
| --------- | ------------------------------------------------- |
| `_beacon` | The address of the beacon for staking pool logic. |

**Returns:**

- `poolId`: The unique ID of the newly created staking pool.
- `stakingPoolAddress`: The address of the deployed staking pool.

**Description:**

- Verifies that the caller is the operator.
- Increments the `_stakingPoolCount` and assigns a new `poolId`.
- Deploys a new staking pool using the minimal beacon proxy pattern.
- Ensures the new pool address is not zero.
- Emits a `StakingPoolCreated` event.

**Access Control:** Only the operator can call this function.

---

## View Functions

### `stakingPoolCount`

Returns the total number of staking pools created.

```solidity
function stakingPoolCount() external view returns (uint);
```

**Returns:**

- `uint`: The total number of staking pools created.

**Description:**

- Provides the current count of staking pools created by the factory.

---

## Events

- `StakingPoolCreated(uint indexed poolId, address indexed stakingPoolAddress)`: Emitted when a new staking pool is successfully created.

---

## Frequently Asked Questions

### Who can create a staking pool?

Users **cannot directly call** `StakingPoolFactory.create()` (only `StakingProducts` can). Instead, user's should call `StakingProducts.createStakingPool()` to create staking pools.

---

### What happens if the beacon address is incorrect?

If the provided beacon address is incorrect or undeployed:

- The deployment of the staking pool will fail.
- An error will be thrown: `"StakingPoolFactory: Failed to create staking pool"`.

Ensure the beacon address is valid and points to a deployed contract.

---

### How can the operator role be changed?

The operator role can be updated using the `changeOperator` function:

1. Call `changeOperator` with the new operator address.
2. The caller must be the current operator.

---

## Contact and Support

If you have questions or need assistance integrating with the `StakingPoolFactory` contract or other parts of the protocol, please reach out through the official support channels or developer forums.

- **Developer Forums**: Join our community forums to discuss with other developers and seek help.
- **Official Support Channels**: Contact us via our official support email or join our Discord server.
- **Documentation Resources**: Access additional documentation, tutorials, and FAQs on our official website.
- **GitHub Repository**: Report issues or contribute to the codebase through our GitHub repository.

**Disclaimer:** This documentation provides a high-level overview of the `StakingPoolFactory` contract's functionality. It is intended for developers integrating with the protocol and may omit internal details not relevant to external interactions. Always refer to the latest contract code and official resources.

# TokenController

## Overview

The `TokenController` contract is the **core token manager** within the protocol, governing **NXM minting, burning, and transfers**. It is **not meant to be directly integrated by users** but rather serves as an internal controller for **Governance, Staking Pools, and Assessment**.

This contract enables:

- **Minting and burning NXM** for staking, rewards, and governance.
- **Managing staking pool deposits and withdrawals** to regulate staked NXM.
- **Facilitating governance and assessment rewards** by distributing NXM.
- **Operator-controlled transfers** for protocol-authorized token movements.

**Designed for Internal Use Only**

- NOT meant for direct integration by users or external contracts.
- Only protocol-approved contracts (e.g., Governance, StakingPool, Assessment, Pool) can interact with it.
- Functions are restricted using access control mechanisms such as onlyInternal and onlyGovernance.

This design ensures that all NXM token movements remain securely controlled within the protocol.

## Key Concepts

### NXM Token Management

`TokenController` is the **sole authority** for NXM operations. It ensures:

- **Minting:** Only authorized contracts (e.g., Governance, Assessment) can mint NXM as rewards.
- **Burning:** NXM is burned when governance penalties, staking pool claims, or expired cover obligations occur.
- **Operator-controlled transfers:** Only designated contracts can initiate approved token movements, maintaining strict oversight over token transactions.

This **prevents unauthorized token manipulation** and maintains **strict control over token flows**.

### Staking Pool Interactions

Staking pools interact with `TokenController` through the following functions:

- **Deposit staked NXM** when users stake their tokens (`depositStakedNXM`).
- **Burn staked NXM** when cover claims are approved (`burnStakedNXM`).
- **Withdraw staked NXM and rewards** when a staking tranche expires (`withdrawNXMStakeAndRewards`).

This ensures **accurate stake tracking**, prevents premature withdrawals, and aligns rewards with active stakes.

### Governance and Assessment Integration

Governance and Assessment contracts leverage `TokenController` through:

- **Reward distribution** to governance voters and assessment participants (`mintRewards`).
- **Token burning** in case of governance-imposed penalties (`burnFrom`).
- **NXM transfers** for governance-related activities (`operatorTransfer`).

Each function ensures that NXM token movements remain **restricted to protocol-approved operations** and **cannot be arbitrarily accessed** by external users.

### **Locking and Unlocking Tokens**

Tokens can be locked for various reasons, restricting transfers until the conditions for unlocking are met.

| **Lock Type**             | **Purpose**                                     | **Unlock Conditions**                     |
| ------------------------- | ----------------------------------------------- | ----------------------------------------- |
| **Governance Lock**       | Prevents withdrawal of voting power mid-vote.   | Unlocks after the vote concludes.         |
| **Claim Assessment Lock** | Ensures assessors cannot withdraw NXM mid-vote. | Unlocks after the claim is resolved.      |
| **Staking Lock**          | Ensures liquidity remains available for covers. | Unlocks after the staking period expires. |

**Important:**
If NXM is locked for **multiple reasons**, **all** unlock conditions must be met before withdrawal is allowed.

---

### **Rewards and Incentives**

`TokenController` handles multiple types of rewards distributed by the protocol:

- **Staking Rewards** – Earned by staking NXM in pools.
- **Governance Rewards** – Earned by participating in governance voting.
- **Claim Assessment Rewards** – Earned by assessing claims.

Rewards must be **manually claimed** using the function:

```solidity
function withdrawNXM(uint amount) external;
```

This ensures that users explicitly collect rewards, allowing for flexible management of their earnings.

## Mutative Functions

### `burnFrom`

Burns NXM tokens from an account.

```solidity
function burnFrom(address member, uint amount) external;
```

| Parameter | Description                     |
| --------- | ------------------------------- |
| `member`  | Address from which to burn NXM. |
| `amount`  | Amount of NXM to burn.          |

**Usage:**

- Called by **Governance or Assessment** to penalize users.
- Used by **Staking Pools** when claims are approved.

---

### `operatorTransfer`

Transfers NXM on behalf of an account, but only when authorized.

```solidity
function operatorTransfer(address from, address to, uint amount) external;
```

| Parameter | Description                   |
| --------- | ----------------------------- |
| `from`    | Address sending the tokens.   |
| `to`      | Address receiving the tokens. |
| `amount`  | Amount of NXM to transfer.    |

**Usage:**

- Allows **protocol-approved transfers** (e.g., reward distributions).
- Cannot be used for unrestricted user-to-user transfers.

---

### `mintRewards`

Mints new NXM as rewards.

```solidity
function mintRewards(address recipient, uint amount) external;
```

| Parameter   | Description                |
| ----------- | -------------------------- |
| `recipient` | Address receiving rewards. |
| `amount`    | Amount of NXM to mint.     |

**Usage:**

- Used by **Governance** to reward voting participation.
- Used by **Assessment** to pay assessors.

---

### `depositStakedNXM`

Deposits NXM into a staking pool.

```solidity
function depositStakedNXM(address stakingPool, uint amount) external;
```

| Parameter     | Description                  |
| ------------- | ---------------------------- |
| `stakingPool` | Address of the staking pool. |
| `amount`      | Amount of NXM to stake.      |

**Usage:**

- Called by **Staking Pools** when a user stakes NXM.

---

### `burnStakedNXM`

Burns staked NXM when a cover claim is approved.

```solidity
function burnStakedNXM(address stakingPool, uint amount) external;
```

| Parameter     | Description                  |
| ------------- | ---------------------------- |
| `stakingPool` | Address of the staking pool. |
| `amount`      | Amount of NXM to burn.       |

**Usage:**

- Ensures that claims are covered proportionally.

---

### `withdrawNXMStakeAndRewards`

Withdraws staked NXM and rewards from a staking pool.

```solidity
function withdrawNXMStakeAndRewards(address stakingPool, uint amount) external;
```

| Parameter     | Description                  |
| ------------- | ---------------------------- |
| `stakingPool` | Address of the staking pool. |
| `amount`      | Amount of NXM to withdraw.   |

**Usage:**

- Used when a staking tranche expires.

---

### `withdrawCoverNote (Deprecated)`

```solidity
function withdrawCoverNote() external;
```

**This function is deprecated and should not be used in new integrations.**

## View Functions

### `getWithdrawableCoverNotes (Deprecated)`

```solidity
function getWithdrawableCoverNotes(address member) external view returns (uint);
```

**Deprecated and no longer relevant in the updated staking model.**

## Frequently Asked Questions

### **Who can interact with `TokenController`?**

Only **protocol-approved contracts** such as `Governance`, `StakingPool`, and `Assessment` can call its functions.

---

### **How does `TokenController` prevent unauthorized transfers?**

NXM transfers are **operator-controlled**, meaning only **approved protocol contracts** can initiate token movements.

---

### **What happens if my stake is burned due to a claim?**

Your staked NXM is **permanently reduced** based on the claim payout, ensuring the pool covers losses.

---

### **Can I withdraw my locked tokens at any time?**

No. Tokens locked for governance, staking, or claims must meet their respective unlocking conditions first.

---

### **When can stakers withdraw their NXM?**

Stakers **must wait until their tranche expires** before calling `withdrawNXMStakeAndRewards`.

---

### **When can governance participants withdraw their NXM?**

Governance participants must wait until the voting period ends before their tokens are unlocked and withdrawable.

### **When can claim assessors withdraw their NXM?**

Claim assessors must wait until the claim is resolved before they can withdraw their locked NXM.

---

### **Why are `withdrawCoverNote` and `getWithdrawableCoverNotes` deprecated?**

These functions were part of an **old v1 staking mechanism** and are no longer relevant.

## Contact and Support

If you have questions or need assistance integrating with the `TokenController` contract, please reach out through the official support channels or developer forums.

- **Developer Forums**: Join our community forums to discuss and seek help.
- **Official Support Channels**: Contact us via our official support email or join our Discord.
- **Documentation Resources**: Access tutorials and FAQs on our official website.
- **GitHub Repository**: Report issues or contribute to the codebase.

**Disclaimer:** This documentation provides a high-level overview of the `TokenController` contract. Always refer to the latest contract code and official resources when developing against the protocol.

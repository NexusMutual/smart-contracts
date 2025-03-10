# NXM Staker User Flow

## Overview

Staking in **NXM Staking Pools** allows you to **earn rewards** by locking up NXM tokens to help **underwrite insurance covers**. However, staking **also carries risks**, including **NXM burns in the case of a claim payout**.

### What You Need to Know Before Staking

- ✅ **You earn rewards over time** based on how long your NXM is staked.
- ⚠️ **Your NXM may be burned** if a claim is approved and your pool is liable for part of the payout.
- ✅ **Your stake is locked within a tranche, but if you deposit mid-tranche, your lock-up time may be shorter.**
- ⚠️ **Managers control voting power** over your staked NXM, which can delay withdrawals.
- ✅ **You can extend your stake** to keep earning rewards after your tranche expires.

---

## Choosing a Staking Pool

Before staking, **always check the pool's conditions**:

### 1. Manager Fees

- Managers can **change the fee at any time** (up to the max fee set at pool creation).
- **Check the current and max fee** before depositing:

  ```solidity
  uint currentFee = stakingPool.getPoolFee();
  uint maxFee = stakingPool.getMaxPoolFee();
  ```

### 2. Products Covered by the Pool

- Ensure the pool supports products you are comfortable underwriting.
- Check listed products:

  ```solidity
  StakingProducts.getPoolProducts(poolId);
  ```

### 3. Pool Utilization & Risk Exposure

- Higher utilization may mean more rewards but **also higher burn risk, depending on the risk profile of the products listed.**
- Check pool utilization using the [capacity pools API](https://api.nexusmutual.io/v2/api/docs/#/Capacity/get_v2_capacity_pools__poolId_):

  ```bash
  GET https://api.nexusmutual.io/v2/capacity/pools/{poolId}

  {
    "poolId": 22,
    "utilizationRate": 4926,  // 49.26% utilization
    ...
  }
  ```

---

## Key Concepts

### How Staking, Underwriting & Rewards Work

When you stake in a pool:

1. **Your NXM provides underwriting capacity** → The pool can now sell insurance cover.
2. **Cover premiums are collected** → The pool earns fees from cover sales.
3. **Stakers earn rewards over time** → Rewards are distributed **proportionally** to staking duration & share supply.
   - Premiums flow into the Capital Pool when a cover is purchased.
   - 50% of the cover premium is minted as NXM and allocated as rewards to the staking pools.
   - The manager's fee is **deducted from these pool rewards** before distribution.
   - The remaining staking pool rewards are **streamed over the cover's lifetime**.
   - Stakers earn a share of these streaming rewards **proportionally** to their share of the pool based on their **staking duration & share supply**.
4. **If a claim is approved, staked NXM may be burned** → The pool's **allocated capacity determines the burn amount**.

---

### Tranches & What Happens When They Expire

- **Staking happens in fixed 91-day tranches.**
- **Before expiration**: Your stake is **actively used** for underwriting.
- **After expiration**:
  - ✅ You **stop underwriting**, and your stake is **eligible for withdrawal**.
  - ✅ You **can extend your deposit** to keep earning.
  - ⚠️ Rewards do not continue indefinitely after expiration.
    - If your staked NXM is no longer underwriting active cover, it will not earn additional rewards.
    - Risk of NXM burns only applies while your NXM is still backing active cover.
    - If all covers your stake was allocated to have expired, your risk is reduced, but so are rewards.
    - To continue earning, you must either extend your stake or actively participate in underwriting.
  - ⚠️ You can only withdraw if the tranche has expired. However, even if the tranche expires, if your staked NXM is being used by the manager for voting, you must wait until the voting concludes to withdraw.

---

#### Depositing Mid-Tranche & Withdrawal Timing

- **If you deposit mid-tranche, you are locked for the remainder of that tranche.**
- **Example:**
  - You **stake 50 days into a 91-day tranche**.
  - Your stake will **unlock on Day 91**.
  - Since you entered on Day 50, **you can withdraw after 42 more days** (on Day 92).

---

#### Checking When a Tranche Will Expire

You can check when the tranche will expire using:

```solidity
uint TRANCHE_DURATION = 91 days;
uint trancheExpirationTime = (trancheId + 1) * TRANCHE_DURATION;
```

To get the **first active tranche ID** (earliest tranche still providing capacity):

```solidity
uint firstActiveTrancheId = StakingPool.getFirstActiveTrancheId();
```

---

### How Earnings Flow in a Staking Pool

- Premiums flow into the Capital Pool when a cover is purchased.
- **50% of the cover premium** is minted as NXM and allocated as rewards to the staking pools.
- The manager's fee is **deducted from these pool rewards** before distribution.
- The remaining staking pool rewards are **streamed over the cover's lifetime**.
- Stakers earn a share of these streaming rewards **proportionally** to their share of the pool based on their **staking duration & share supply**.

---

### How to Check Withdrawal Eligibility

Your staked NXM can be locked for **two reasons**:

1.  **The tranche is not expired yet.**

    - **Use this function to check when the tranche expires:**

      ```solidity
      uint TRANCHE_DURATION = 91 days;
      uint trancheExpirationTime = (trancheId + 1) * TRANCHE_DURATION;
      ```

2.  **Your NXM is locked due to voting.**

    - If your manager voted, your withdrawal is **delayed until the vote concludes**.
    - **Use this function to check if your stake is locked due to voting:**

          ```solidity
          address manager = StakingPool.manager();
          uint managerLockedInGovernanceUntil = nxm.isLockedForMV(manager);
          ```

---

### How NXM Burns Are Calculated

When a **valid claim** is approved, a portion of the **staked NXM in the pool is burned** to cover the payout.

#### How the Burn Amount is Calculated

NXM burns are **proportional** to the **pool's share of total risk exposure**:

$$ \text{Pool Burned NXM} = \frac{\text{Pool's Allocated Capacity for the Cover}}{\text{Total Allocated Capacity Across All Pools}} \times \text{Cover Payout} $$

However, this **only determines the total burned amount for the pool**. The actual amount burned for each **individual staker** depends on **their share of the pool's total stake**.

#### How Much NXM Will Be Burned Per Staker?

Each staker's **NXM burn is proportional** to their **share of the total pool stake**.

$$ \text{Staker Burned NXM} = \frac{\text{Staker's Share of Pool Stake}}{\text{Total Staked in Pool}} \times \text{Pool Burned NXM} $$

#### Example Scenario:

- A **100,000 NXM** cover payout is approved.
- There are **three pools** backing the cover, with the following allocations:

| **Pool**  | **Allocated Capacity** | **Percentage of Total Capacity** | **Pool Burned NXM** |
| --------- | ---------------------- | -------------------------------- | ------------------- |
| Pool A    | 200,000 NXM            | 40%                              | 40,000 NXM          |
| Pool B    | 150,000 NXM            | 30%                              | 30,000 NXM          |
| Pool C    | 150,000 NXM            | 30%                              | 30,000 NXM          |
| **Total** | **500,000 NXM**        | **100%**                         | **100,000 NXM**     |

#### Individual Staker Burn Calculation:

If **you** have **20,000 NXM staked** in **Pool A**, and **Pool A burns 40,000 NXM**, your **burn amount** is:

$$
\frac{20,000}{200,000} \times 40,000 = 4,000 \text{ NXM burned}
$$

##### How to Check Your Staking Share:

To check your **total staked amount** ofin the pool:

```solidity
uint stakedAmount = StakingPool.getStakeInfo(tokenId);
```

To check **total stake in the pool**:

```solidity
uint totalPoolStake = StakingPool.getPoolStake(poolId);
```

---

## Step-by-Step Process

### Pre-Staking Checklist

#### Verify the Pool's Fee Structure

- Check the **current pool fee** and **maximum fee limit**.
- ```solidity
  StakingPool.getPoolFee();
  StakingPool.getMaxPoolFee();
  ```

#### Review the Products the Pool Underwrites

- Ensure you're comfortable with the **risk level** of the **products covered**.
- ```solidity
  StakingViewer.getPoolProducts(poolId);
  ```

#### Check Pool Utilization & Burn Risk

- **High utilization** means **higher risk of NXM burns**.
- Check pool utilization using the [capacity pools API](https://api.nexusmutual.io/v2/api/docs/#/Capacity/get_v2_capacity_pools__poolId_):

  ```bash
  GET https://api.nexusmutual.io/v2/capacity/pools/{poolId}

  {
    "poolId": 22,
    "utilizationRate": 4926,  // 49.26% utilization
    ...
  }
  ```

#### Understand Withdrawal Rules

- **Your stake may be locked for voting.**
- **If you stake mid-tranche, your lock-up period may be shorter.**
  ```solidity
  // Tranche Expiration
   uint trancheExpirationTime = (trancheId + 1) * TRANCHE_DURATION;
   // NXM token locked for voting
   address manager = StakingPool.manager();
   uint managerLockedInGovernanceUntil = nxm.isLockedForMV(manager);
  ```

### How to Deposit

Depositing NXM into a staking pool allows you to **earn rewards while underwriting risk**. Before depositing, consider:

- **Manager Fee:** Verify the percentage taken from rewards.
- **Risk Exposure:** Ensure the pool supports products you're comfortable underwriting.
- **Staking Period:** Longer staking periods lock funds for longer but yield proportional rewards.

```solidity
StakingPool.depositTo(uint amount, uint trancheId, uint requestTokenId, address destination)
```

| Parameter        | Description                                              |
| ---------------- | -------------------------------------------------------- |
| `amount`         | Amount of NXM to stake                                   |
| `trancheId`      | ID of the tranche to stake in                            |
| `requestTokenId` | ID of the request token (0 if not using a request token) |
| `destination`    | Address that will receive the staking position NFT       |

Returns: `uint tokenId` - The ID of the newly minted staking position NFT

### How to Extend a Stake

To keep your stake active beyond its initial duration and continue earning rewards, you must extend it before expiration.

```solidity
StakingPool.extendDeposit(uint tokenId, uint newDuration);
```

| Parameter     | Description                                 |
| ------------- | ------------------------------------------- |
| `tokenId`     | ID of the staking position (NFT) to extend. |
| `newDuration` | Additional duration for staking.            |

### How to Withdraw Stake / Rewards

Once the staking period has ended, you can withdraw your stake. Be aware that if the manager recently voted, there might be a delay.

Rewards can be withdrawn anytime.

```solidity
function withdraw(uint tokenId, bool withdrawStake, bool withdrawRewards, uint[] memory trancheIds) external;
```

| Parameter         | Description                               |
| ----------------- | ----------------------------------------- |
| `tokenId`         | The ID of the staking NFT token.          |
| `withdrawStake`   | Whether to withdraw the stake.            |
| `withdrawRewards` | Whether to withdraw the rewards.          |
| `trancheIds`      | The IDs of the tranches to withdraw from. |

### How to Check Withdrawal Eligibility

Your staked NXM can be locked for **two reasons**:

1. **The tranche is not expired yet.**

   - **To find when a trancheId will expire:**

     ```solidity
     uint TRANCHE_DURATION = 91 days;
     uint trancheExpirationTime = (trancheId + 1) * TRANCHE_DURATION;
     ```

2. **Your NXM is locked due to voting.**

   - If your manager voted, your withdrawal is **delayed until the vote concludes**.
   - **Use this function to check if your stake is locked due to voting:**

     ```solidity
     address manager = StakingPool.manager();
     uint managerLockedInGovernanceUntil = nxm.isLockedForMV(manager);
     ```

---

## Frequently Asked Questions (FAQ)

### What happens if a manager votes near the end of a tranche?

- Your stake remains locked for voting even if the tranche expires.
- **Example:**
  - **Manager votes on Day 88** of a **91-day tranche**.
  - **Tranche expires on Day 91**, but **your NXM remains locked**.
  - If voting ends **on Day 96**, you must wait **until then** to withdraw.

### Can I prevent my NXM from being used in governance?

- ❌ No, when you stake, you delegate governance rights to the pool manager.

### How do I know if my stake is at risk of being burned?

- The risk depends on:

  - **Utilization of the pool** (how much NXM is backing active cover).
  - **Risk level of the listed products** (higher risk = higher chance of claims).

- Check pool utilization using the [capacity pools API](https://api.nexusmutual.io/v2/api/docs/#/Capacity/get_v2_capacity_pools__poolId_):

  ```bash
  GET https://api.nexusmutual.io/v2/capacity/pools/{poolId}

  {
    "poolId": 22,
    "utilizationRate": 4926,  // 49.26% utilization
    ...
  }
  ```

### What happens if a manager votes near the end of a tranche?

- Your stake remains locked for voting even if the tranche expires.
- **Example:**
  - **Manager votes on Day 88** of a **91-day tranche**.
  - **Tranche expires on Day 91**, but **your NXM remains locked**.
  - If voting ends **on Day 96**, you must wait **until then** to withdraw.

### Can I prevent my NXM from being used in governance?

- ❌ No, when you stake, you delegate governance rights to the pool manager.

### How do I know if my stake is at risk of being burned?

- The risk depends on:

  - **Utilization of the pool** (how much NXM is backing active cover).
  - **Risk level of the listed products** (higher risk = higher chance of claims).

- Check pool utilization using the [capacity pools API](https://api.nexusmutual.io/v2/api/docs/#/Capacity/get_v2_capacity_pools__poolId_):

  ```bash
  GET https://api.nexusmutual.io/v2/capacity/pools/{poolId}

  {
    "poolId": 22,
    "utilizationRate": 4926,  // 49.26% utilization
    ...
  }
  ```

### How can I track when my stake will be unlocked?

To check when your stake will be unlocked:

```solidity
// Get full token info including all deposits and their tranche IDs
Token token = StakingViewer.getToken(tokenId);

// For each deposit, calculate when its tranche expires
uint TRANCHE_DURATION = 91 days;
uint trancheExpirationTime = (trancheId + 1) * TRANCHE_DURATION;

// Check if withdrawals are blocked by governance voting
address manager = StakingPool.manager();
uint managerLockedInGovernanceUntil = nxm.isLockedForMV(manager);
```

Note: Even after a tranche expires, withdrawals may be blocked if the pool manager is participating in governance voting. The `Token` struct returned by `getToken()` includes:

- `deposits`: Array of all deposits for this token, each containing its `trancheId`
- `activeStake`: Currently active stake amount
- `expiredStake`: Amount of stake in expired tranches
- `rewards`: Total rewards earned

---

## Best Practices

✅ **Monitor Staking Periods:** Extend deposits if you want to continue earning.  
⚠️ **Be Aware of Voting Locks:** Your stake may be locked if the manager votes.  
✅ **Check Manager Fees Regularly:** Managers can change fees at any time.

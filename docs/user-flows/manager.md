# Manager User Flow Documentation

## Quick Summary

Before diving into the details, here’s a **high-level overview** of what a staking pool manager does:

1. **Create a Staking Pool** → Set fees, add products, define capacity.
2. **Monitor Cover Purchases** → Capacity is allocated automatically from active tranches.
3. **Adjust Pricing** → Set **target price, monitor price bumps & decay**.
4. **Manage Tranches** → Ensure active tranches remain available for allocation.
5. **Earn Rewards** → Pool fees + staking rewards are distributed every tranche cycle.
6. **Handle Voting Impacts** → If a manager votes using **delegated NXM**, withdrawals may be delayed.

---

- [Manager User Flow Documentation](#manager-user-flow-documentation)
  - [Quick Summary](#quick-summary)
  - [Overview](#overview)
    - [Your Responsibilities](#your-responsibilities)
  - [Key Concepts](#key-concepts)
    - [Tranches \& Pool Mechanics](#tranches--pool-mechanics)
    - [Determining Which Tranches Are Active for Capacity Allocation](#determining-which-tranches-are-active-for-capacity-allocation)
    - [**How Earnings Flow in a Staking Pool**](#how-earnings-flow-in-a-staking-pool)
    - [Cover Length and Grace Period Effects](#cover-length-and-grace-period-effects)
      - [Example: Cover Length + Grace Period Falling Outside a Tranche](#example-cover-length--grace-period-falling-outside-a-tranche)
    - [Managing NXM Delegation](#managing-nxm-delegation)
    - [How Earnings Flow in a Staking Pool](#how-earnings-flow-in-a-staking-pool-1)
    - [NXM Burn Mechanics: What Happens When a Claim is Paid?](#nxm-burn-mechanics-what-happens-when-a-claim-is-paid)
      - [How is the Burn Amount Calculated?](#how-is-the-burn-amount-calculated)
      - [**Worked Example:**](#worked-example)
        - [**Scenario:**](#scenario)
      - [**Burn Calculation:**](#burn-calculation)
    - [**How the Burn Process Works in the Contract**](#how-the-burn-process-works-in-the-contract)
  - [**Key Considerations for Managers**](#key-considerations-for-managers)
  - [Step-by-Step Process](#step-by-step-process)
    - [Create a New Staking Pool](#create-a-new-staking-pool)
    - [Allocate Capacity to Cover Products](#allocate-capacity-to-cover-products)
      - [Add Products to the Pool](#add-products-to-the-pool)
    - [How to Compare Your Pool Pricing](#how-to-compare-your-pool-pricing)
    - [Set Target Weights and Pricing](#set-target-weights-and-pricing)
    - [When Should a Manager Call These Functions?](#when-should-a-manager-call-these-functions)
  - [3. Manager Fees \& Earnings](#3-manager-fees--earnings)
  - [Frequently Asked Questions (FAQ)](#frequently-asked-questions-faq)
    - [Why does the cover quote not utilize my pool's full capacity?](#why-does-the-cover-quote-not-utilize-my-pools-full-capacity)
    - [How does tranche expiration affect available capacity?](#how-does-tranche-expiration-affect-available-capacity)
    - [What Happens if a staking pool manager uses a staker's staked NXM for voting?](#what-happens-if-a-staking-pool-manager-uses-a-stakers-staked-nxm-for-voting)
    - [How do I as a staking pool manager adjust pricing?](#how-do-i-as-a-staking-pool-manager-adjust-pricing)
    - [How are pool rewards calculated?](#how-are-pool-rewards-calculated)
    - [What is the Cover Router API and how does it affect pricing?](#what-is-the-cover-router-api-and-how-does-it-affect-pricing)
  - [Best Practices](#best-practices)

## Overview

This guide walks through how to **create, configure, and manage staking pools**, allocate capacity to cover products, adjust pricing, and understand key mechanics such as **tranche expiration, NXM delegation, voting power impacts, and rewards.**

### Your Responsibilities

- **Create & configure a staking pool** (public or private).
- **Allocate capacity** to cover products.
- **Monitor and adjust pricing** for competitiveness.
- **Understand NXM delegation & voting power impacts**.
- **Earn rewards through management fees and staking pool profits**.

---

## Key Concepts

### Tranches & Pool Mechanics

- **Pools operate in fixed 91-day tranches**, with each tranche holding staked NXM.
- **Stakers commit their NXM to a tranche**, locking it for at least 91 days.
- Stakers can **stake for multiple tranches**, extending their lock-up period.
- **Staked NXM in an active tranche contributes to pool capacity**, allowing the pool to underwrite cover.
- **Once a tranche expires (after 91 days), its stake no longer provides capacity**.
- After expiration, stakers can **withdraw their stake or extend it into a new tranche**.
- **Managers should monitor tranche expiration** to ensure their pool remains competitive for cover allocation.

### Determining Which Tranches Are Active for Capacity Allocation

When a **cover is purchased**, capacity is allocated only from **active tranches** that will remain active for the **entire duration of the cover + grace period**.

To determine the first eligible tranche (`TRANCHE DURATION = 91 days`):

$$
\text{coverEndTimestamp} = \text{block.timestamp} + \text{coverDuration} + \text{gracePeriod}
$$

$$
\text{startingTrancheId} = \frac{\text{coverEndTimestamp}}{\text{TRANCHE DURATION}}
$$

- **`startingTrancheId`** is the first tranche that can be used for the cover.
- Any **future tranches** beyond this are also included in allocation.
- The manager can call `StakingPool.getFirstActiveTrancheId()` to get the **current first active tranche** (i.e., the earliest tranche still providing capacity).
- **If `startingTrancheId` is greater than `getFirstActiveTrancheId()`**, it means the current tranches **cannot be used** for allocation.

---

### **How Earnings Flow in a Staking Pool**

1. **Buyer purchases cover** → Cover premium is paid.
2. **Pool earns fees** → Cover fee is split between managers and stakers.
3. **Manager Fees are deducted** → Taken before rewards are distributed.
4. **Remaining rewards are distributed** → Stakers receive their proportional share.
5. **Tranche expiration releases stake** → Stakers can withdraw their NXM.

```solidity
uint currentFee = stakingPool.getPoolFee();
uint maxFee = stakingPool.getMaxPoolFee();
```

### Cover Length and Grace Period Effects

- When a buyer purchases a cover, it includes a **grace period** beyond the cover length.
- **Example:** A 60-day cover with a **30-day grace period** requires **90 days of active capacity**.
- If the **cover length + grace period** extends beyond a tranche's expiration, the **capacities in that tranche are excluded** from allocation.

#### Example: Cover Length + Grace Period Falling Outside a Tranche

- You are **32 days into a 91-day tranche**.
- A buyer purchases a **30-day cover with a 30-day grace period**.
- The total required capacity duration is **60 days**, extending to **Day 92**.
- However, the **current tranche expires on Day 91**.
- Since the required capacity extends **beyond the tranche expiration**, the **capacity from this tranche is excluded**.
- The allocation is instead taken from the **next tranche (Day 92 onward).**

### Managing NXM Delegation

- Staked NXM contributes to pool capital.
- Managers have **voting power** over delegated NXM in their pool.
- If a manager votes using delegated staked NXM, **that NXM remains locked** for voting **until voting concludes**.
- Even if the tranche expires, staked NXM cannot be withdrawn until **both the tranche expiration and voting lock are cleared**.
- If a manager votes at the end of a tranche, withdrawals of staked NXM may be delayed until voting concludes.

---

### How Earnings Flow in a Staking Pool

1. **A buyer purchases cover** → Staked NXM is allocated from active tranches.
2. **The pool earns fees** → A percentage of cover fees goes to the pool.
3. **Manager Fees are deducted** → The manager's fee is deducted from rewards.
4. **Stakers earn rewards** → Remaining rewards are distributed proportionally.

### NXM Burn Mechanics: What Happens When a Claim is Paid?

When a **valid claim** is approved, a portion of the **staked NXM in the pool is burned** to cover the payout. This process ensures that pools backing cover products **bear the financial risk** associated with claims.

#### How is the Burn Amount Calculated?

The NXM burn amount is proportional to the **pool’s share of the total risk exposure**.

$$ \text{Burned NXM} = \frac{\text{Pool's Allocated Capacity for the Cover}}{\text{Total Allocated Capacity Across All Pools}} \times \text{Cover Payout} $$

This ensures that:

- **Each pool contributes fairly** based on how much of the cover it supports.
- **Pools that allocate more NXM to high-risk covers bear greater losses**.
- **No pool absorbs more risk than it explicitly allocated**.

#### **Worked Example:**

##### **Scenario:**

- A **100,000 NXM** cover payout is approved.
- There are **three pools** backing the cover, with the following allocations:

| **Pool**  | **Allocated Capacity** | **Percentage of Total Capacity** |
| --------- | ---------------------- | -------------------------------- |
| Pool A    | 200,000 NXM            | 40%                              |
| Pool B    | 150,000 NXM            | 30%                              |
| Pool C    | 150,000 NXM            | 30%                              |
| **Total** | **500,000 NXM**        | **100%**                         |

#### **Burn Calculation:**

For **Pool A**:

$$
\frac{200,000}{500,000} \times 100,000 = 40,000 \text{ NXM burned}
$$

For **Pool B**:

$$
\frac{150,000}{500,000} \times 100,000 = 30,000 \text{ NXM burned}
$$

For **Pool C**:

$$
\frac{150,000}{500,000} \times 100,000 = 30,000 \text{ NXM burned}
$$

---

### **How the Burn Process Works in the Contract**

1. **Identifies the staked NXM** allocated to the affected cover.
2. **Calculates the required burn amount** based on the cover payout.
3. **Burns NXM from the pool’s staked balance**, reducing the available capacity.
4. **Adjusts pool allocations** to reflect the new effective stake.

---

## **Key Considerations for Managers**

- **Monitor Exposure:** Track how much NXM is allocated to covers to avoid excessive risk.
- **Diversify Allocations:** Spread NXM across multiple cover products to reduce single-cover exposure.
- **Understand Tranche Expiry:** Expired tranches **do not contribute to new covers** but may still be burned if previously allocated.
- **Review Claim History:** Stay updated on claim approvals, as they **directly impact the pool’s NXM balance**.

---

## Step-by-Step Process

### Create a New Staking Pool

To create a new pool, call:

```solidity
StakingProducts.createStakingPool(
  bool isPrivatePool,
  uint initialPoolFee,
  uint maxPoolFee,
  ProductInitializationParams[] memory productInitParams,
  string calldata ipfsHash
)
```

- **`isPrivatePool`** – Set to `true` for a private pool, `false` for a public pool.
- **`initialPoolFee`** – Initial fee taken from stakers' rewards.
- **`maxPoolFee`** – The maximum fee the manager can set.
- **`productInitParams`** – List of products to be initially listed in the pool.
- **`ipfsHash`** – Metadata storage reference.

Once created, you **become the manager** of the pool, responsible for configuring its parameters.

---

### Allocate Capacity to Cover Products

Each pool can support multiple products. Managers **must explicitly list a product** in their pool before setting weights and pricing.

#### Add Products to the Pool

Call:

```solidity
StakingProducts.setProducts(uint poolId, StakedProductParam[] memory params);
```

| Parameter | Description                                                  |
| --------- | ------------------------------------------------------------ |
| `poolId`  | ID of the staking pool.                                      |
| `params`  | Array of `StakedProductParam` structs with product settings. |

This function:

- Adds **new products** to the pool.
- Sets **initial target weights** and **pricing**.

---

### How to Compare Your Pool Pricing

Managers can check how their pricing compares to other pools using:

```solidity
StakingViewer.getPoolProducts(poolId);
```

This function returns:

- **Current price per cover product.**
- **Target and effective weights.**
- **Utilization rates of competing pools.**

---

### Set Target Weights and Pricing

Once products are added using `setProducts`, **effective weights** can change based on **capacity utilization** and **staking activity**.

Managers should call `StakingProducts.recalculateEffectiveWeights` or `StakingProducts.recalculateEffectiveWeightsForAllProducts` to ensure proper allocation **after significant changes in usage or pricing**.

```solidity
StakingProducts.recalculateEffectiveWeights(poolId, productIds);
```

| Function                                            | Purpose                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `recalculateEffectiveWeights(poolId, productIds)`   | Updates **effective weights** for specific products based on **current utilization**. |
| `recalculateEffectiveWeightsForAllProducts(poolId)` | Updates **all product weights** in the pool to ensure **fair capacity allocation**.   |

### When Should a Manager Call These Functions?

- After **significant cover purchases** that alter utilization.
- When **staking levels change**, impacting available capacity.
- After **adjusting product pricing**, to maintain proper weight distribution.

---

## 3. Manager Fees & Earnings

Pool managers **earn rewards** through a **management fee** set at pool creation.

- **Max Management Fee (`getMaxPoolFee()`)** – Set **once at pool creation** and **cannot be increased**.
- **Current Management Fee (`getPoolFee()`)** – Can be **adjusted at any time**, but **cannot exceed the max fee**.
- **How Fees Work:**
  - The **fee applies to all staking rewards** generated by the pool.
  - **Deducted before distributing rewards** to stakers.
  - **Managers can lower fees anytime** to stay competitive.

To check fees:

```solidity
uint currentFee = stakingPool.getPoolFee();
uint maxFee = stakingPool.getMaxPoolFee();
```

---

## Frequently Asked Questions (FAQ)

### Why does the cover quote not utilize my pool's full capacity?

- If a **cover's duration + grace period extends beyond a tranche expiration**, the **capacities in that tranche are excluded** from allocation.

---

### How does tranche expiration affect available capacity?

- If a **cover extends beyond a tranche's expiration**, the **capacities in that tranche are not included** in allocation.

---

### What Happens if a staking pool manager uses a staker's staked NXM for voting?

- The staked NXM remains locked for voting until the vote concludes.
- Even if the tranche expires, a staker cannot withdraw until:
  - The tranche expiration unlocks their stake.
  - The governance voting lock is cleared.

---

### How do I as a staking pool manager adjust pricing?

Call:

```solidity
StakingProducts.setProductTargetPrice(poolId, productId, newTargetPrice);
```

- This updates the **minimum price**, but actual pricing **still fluctuates** due to:
  - **Price bumps** (small increases with capacity usage).
  - **Price decay** (gradual reductions over time).

---

### How are pool rewards calculated?

- **Rewards are based on cover pricing, capacity allocation, and utilization.**
- **Cover Rate** – Each product has a **target price**, adjusted dynamically by **market forces**.
- **Manager Fees** – Before distributing rewards, the **staking pool deducts the manager's fee**.
- **Stake Share Distribution** – The remaining rewards are distributed **proportionally to each staker's share** in the pool.

---

### What is the Cover Router API and how does it affect pricing?

- Cover quotes are **determined by the API**:
  - Prioritizes **lowest price pools first**.
  - Allocates to the **cheapest pool until full**, then moves to the next.
- **API Reference:** [`/quote`](https://api.nexusmutual.io/v2/api/docs/#/Quote/get_v2_quote)

---

## Best Practices

- **Monitor Pricing Regularly:** Adjust target price and weight.
- **Be Mindful of Voting Locks:** Avoid locking stakers' NXM.
- **Understand Tranche Expiry:** A pool's NXM capacity might not be fully available if cover length + grace period exceeds a tranche's expiry

# Manager User Flow Documentation

## Table of Contents

- [Manager User Flow Documentation](#manager-user-flow-documentation)
  - [Table of Contents](#table-of-contents)
  - [Quick Summary](#quick-summary)
  - [Overview](#overview)
    - [Your Responsibilities](#your-responsibilities)
  - [Key Concepts](#key-concepts)
    - [Tranches \& Pool Mechanics](#tranches--pool-mechanics)
    - [Determining Which Tranches Are Active for Capacity Allocation](#determining-which-tranches-are-active-for-capacity-allocation)
    - [Understanding Capacity \& Utilization in NXM Terms](#understanding-capacity--utilization-in-nxm-terms)
      - [Why This Matters for Managers:](#why-this-matters-for-managers)
    - [How the Multiplier Affects Underwriting Capacity](#how-the-multiplier-affects-underwriting-capacity)
      - [How is the Multiplier Determined?](#how-is-the-multiplier-determined)
      - [How to Calculate a Product's Maximum Multiplier](#how-to-calculate-a-products-maximum-multiplier)
      - [Example Calculation:](#example-calculation)
      - [Key Formula for Effective Capacity:](#key-formula-for-effective-capacity)
      - [Why is This Important for Managers?](#why-is-this-important-for-managers)
    - [Cover Length and Grace Period Effects](#cover-length-and-grace-period-effects)
      - [Example: Cover Length + Grace Period Falling Outside a Tranche](#example-cover-length--grace-period-falling-outside-a-tranche)
    - [Managing NXM Delegation](#managing-nxm-delegation)
    - [How Earnings Flow in a Staking Pool](#how-earnings-flow-in-a-staking-pool)
    - [NXM Burn Mechanics: What Happens When a Claim is Paid?](#nxm-burn-mechanics-what-happens-when-a-claim-is-paid)
      - [How the Burn Amount is Calculated](#how-the-burn-amount-is-calculated)
      - [How Much NXM Will Be Burned Per Staker?](#how-much-nxm-will-be-burned-per-staker)
      - [Example Scenario:](#example-scenario)
      - [Burn Calculation:](#burn-calculation)
        - [How to Check Pool Burn Risk:](#how-to-check-pool-burn-risk)
    - [How the Burn Process Works in the Contract](#how-the-burn-process-works-in-the-contract)
  - [Key Considerations for Managers](#key-considerations-for-managers)
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
      - [Struct: `StakedProductParam`](#struct-stakedproductparam)
      - [Steps to Adjust Pricing](#steps-to-adjust-pricing)
      - [Why Pricing Adjustments Matter](#why-pricing-adjustments-matter)
      - [Why Pricing Adjustments Matter](#why-pricing-adjustments-matter-1)
    - [How are pool rewards calculated?](#how-are-pool-rewards-calculated)
    - [What is the Cover Router API and how does it affect pricing?](#what-is-the-cover-router-api-and-how-does-it-affect-pricing)
  - [Best Practices](#best-practices)

## Quick Summary

Before diving into the details, here's a **high-level overview** of what a staking pool manager does:

1. **Create a Staking Pool** → Set fees, add products, define capacity.
2. **Monitor Cover Purchases** → Capacity is allocated automatically from active tranches.
3. **Adjust Pricing** → Set **target price, monitor price bumps & decay**.
4. **Manage Tranches** → Ensure active tranches remain available for allocation.
5. **Earn Rewards** → Pool fees + staking rewards are distributed every tranche cycle.
6. **Handle Voting Impacts** → If a manager votes using **delegated NXM**, withdrawals may be delayed.

---

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

### Understanding Capacity & Utilization in NXM Terms

- **The protocol reserves and tracks capacity in NXM terms**—this is the **unit of account** within the system.
- When a **cover is purchased**, NXM is **reserved from the pool's active tranches**.
- **Available capacity** is determined by the **NXM actively staked** in **valid tranches**.
- **Utilized capacity** represents the **NXM currently backing active cover**.
- **Once capacity is utilized, it remains locked** until the cover expires or is replaced.

#### Why This Matters for Managers:

- **Understanding how much capacity is actually available** helps managers **price their pool competitively**.
- **Over-allocating** capacity can **increase the burn risk** in case of claims.
- **Pools with insufficient available NXM** may **miss out on cover purchases**.

---

### How the Multiplier Affects Underwriting Capacity

When a pool has **X amount of NXM staked**, it can **underwrite more than X NXM worth of cover**. This is due to the concept of **capacity multipliers**, which allow capital efficiency in staking.

#### How is the Multiplier Determined?

The **multiplier is determined by two key factors**:

1. The **global capacity ratio** set at the protocol level
2. The **capacity reduction ratio** set at the product level

The maximum theoretical multiplier is capped at **20x** (`StakingProducts.MAX_TOTAL_WEIGHT`), but the actual maximum for a specific product may be lower based on its capacity reduction ratio.

#### How to Calculate a Product's Maximum Multiplier

To determine the maximum multiplier for a specific product:

1. **Get the product's capacity reduction ratio**:
```solidity
// Get the product capacityReductionRatio
uint capacityReductionRatio = CoverProducts.getProduct(productId).capacityReductionRatio;
```

2. **Calculate the base multiplier**:
```solidity
uint GLOBAL_CAPACITY_DENOMINATOR = StakingProducts.GLOBAL_CAPACITY_DENOMINATOR();
uint CAPACITY_REDUCTION_DENOMINATOR = StakingProducts.CAPACITY_REDUCTION_DENOMINATOR();
uint globalCapacityRatio = cover().getGlobalCapacityRatio(); // Usually 10000 (100%)

uint baseMultiplier = globalCapacityRatio * (CAPACITY_REDUCTION_DENOMINATOR - capacityReductionRatio) / 
                     (GLOBAL_CAPACITY_DENOMINATOR * CAPACITY_REDUCTION_DENOMINATOR);
```

3. **Calculate the maximum effective multiplier**:
```solidity
uint MAX_TOTAL_WEIGHT = StakingProducts.MAX_TOTAL_WEIGHT();
uint maxEffectiveMultiplier = baseMultiplier * MAX_TOTAL_WEIGHT;
```

#### Example Calculation:

- If a product has a **capacity reduction ratio of 2000 (20%)**:
  - Base multiplier = 10000 * (10000 - 2000) / (10000 * 10000) = 0.8
  - Maximum effective multiplier = 0.8 * 20 = **16x**

This means that even though the system allows up to 20x multiplier, this specific product can only leverage staked NXM up to 16x due to its capacity reduction ratio.

#### Key Formula for Effective Capacity:

$$
\text{Effective Underwriting Capacity} = \text{Staked NXM} \times \text{Base Multiplier} \times \text{Target Weight}
$$

Where:
- **Base Multiplier** = globalCapacityRatio × (100% - capacityReductionRatio)
- **Target Weight** can be set up to 20x (MAX_TOTAL_WEIGHT)

#### Why is This Important for Managers?

Understanding the actual maximum multiplier for each product helps you:

1. **Set realistic target weights** that don't exceed the product's maximum
2. **Estimate actual underwriting capacity** more accurately
3. **Balance risk exposure** across different products based on their capacity reduction ratios

---

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

1. **Buyer purchases cover** → Cover premium is paid, flowing into the Capital Pool.
2. **50% of the cover premium is minted as NXM** → This amount is allocated as rewards to the staking pools.
3. **Manager Fees are deducted** → The manager's fee is taken from the minted rewards before distribution.
4. **Remaining rewards are streamed over the cover's lifetime** → Staking pools earn a share of these rewards, split proportionally among stakers based on their staking duration and share supply.
5. **Tranche expiration releases stake** → Stakers can withdraw their NXM once the tranche expires.

```solidity
uint currentFee = stakingPool.getPoolFee();
uint maxFee = stakingPool.getMaxPoolFee();
```

---

### NXM Burn Mechanics: What Happens When a Claim is Paid?

When a **valid claim** is approved, a portion of the **staked NXM in the pool is burned** to cover the payout. This process ensures that pools backing cover products **bear the financial risk** associated with claims.

#### How the Burn Amount is Calculated

NXM burns are **proportional** to the **pool's share of total risk exposure**:

$$ \text{Pool Burned NXM} = \frac{\text{Pool's Allocated Capacity for the Cover}}{\text{Total Allocated Capacity Across All Pools}} \times \text{Cover Payout} $$

This ensures that:

- **Each pool contributes fairly** based on how much of the cover it supports.
- Pools that **allocate more NXM to high-risk** covers **bear greater losses**.
- No pool absorbs more risk than it **explicitly allocated**.

#### How Much NXM Will Be Burned Per Staker?

Each staker's **NXM burn is proportional** to their **share of the total pool stake**:

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

#### Burn Calculation:

Since **Pool A contributed 40%** of the total allocated capacity, it is responsible for **40% of the claim payout**, resulting in **40,000 NXM burned** from the pool.

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

##### How to Check Pool Burn Risk:

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

### How the Burn Process Works in the Contract

1. **Identifies the staked NXM** allocated to the affected cover.
2. **Calculates the required burn amount** based on the cover payout.
3. **Burns NXM from the pool's staked balance**, reducing the available capacity.
4. **Adjusts pool allocations** to reflect the new effective stake.

---

## Key Considerations for Managers

- **Monitor Capacity Utilization** – Ensure your pool has enough available capacity to stay competitive while avoiding excessive risk.
- **Track Expiring Tranches** – Expired tranches do not contribute new underwriting capacity, so plan ahead.
- **Review Claim History** – Be aware of past claims, as they impact pool NXM balance and burn risk.
- **Understand How Rewards Are Distributed** – Manager fees come from the 50% of premiums minted as NXM before rewards are streamed.

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

### How do I as a staking pool manager adjust pricing?

To update the **target price** and **weights** for products in your staking pool, use:

```solidity
StakingProducts.setProducts(uint poolId, StakedProductParam[] memory params);
```

#### Struct: `StakedProductParam`

| Field                        | Type     | Description                                                      |
| ---------------------------- | -------- | ---------------------------------------------------------------- |
| `productId`                  | `uint24` | ID of the product being updated.                                 |
| `recalculateEffectiveWeight` | `bool`   | Flag to indicate if the effective weight should be recalculated. |
| `setTargetWeight`            | `bool`   | Flag to indicate if the target weight should be set.             |
| `targetWeight`               | `uint8`  | **New target weight** (determines allocation).                   |
| `setTargetPrice`             | `bool`   | Flag to indicate if the target price should be set.              |
| `targetPrice`                | `uint96` | **New target price** of the product.                             |

#### Steps to Adjust Pricing

1. **Prepare an array of `StakedProductParam` structs**, setting:

   - `productId` → The ID of the product to update.
   - `setTargetPrice` → Set to `true` to update the target price.
   - `targetPrice` → The **new target price** for the product.
   - `setTargetWeight` → Set to `true` to update the target weight.
   - `targetWeight` → Adjust how much stake is allocated to this product.
   - `recalculateEffectiveWeight` → Set to `true` to recalculate effective weights.

2. Retrieve the minimum product price before setting pool `minPrice`:
   - Each product has a **minimum price** set globally.
   - The **pool's `minPrice` must not be lower than the product's minimum price**.
   - Retrieve the product's min price using:

```solidity
uint16 minPrice = CoverProducts.getProduct(productId).minPrice;
```

To get the **minimum prices** for multiple products:

```solidity
uint[] minPrices = CoverProducts.getMinPrices(productIds);
```

3. Call `setProducts` to update the staking pool settings:

```solidity
require(minPrice >= minProductPrice, "Pool minPrice cannot be lower than product minPrice");

StakedProductParam[] memory params = new StakedProductParam[](1);
params[0] = StakedProductParam({
    productId: 1,
    recalculateEffectiveWeight: true,
    setTargetWeight: true,
    targetWeight: 100,         // Adjust target weight (0-255)
    setTargetPrice: true,
    targetPrice: 500           // Example: Set new target price to 500
});

StakingProducts.setProducts(poolId, params);
```

4. **Call `recalculateEffectiveWeights`** to ensure price and weight adjustments reflect utilization:

```solidity
StakingProducts.recalculateEffectiveWeights(poolId, productIds);
```

---

#### Why Pricing Adjustments Matter

- **Target Price** → Acts as a reference, but actual price fluctuates with demand.
- **Price Bump** → Increases price **by 2% per purchase**.
- **Price Decay** → Reduces price **by 0.1% per day** when no new purchases occur.
- **Utilization Impact** → Higher utilization pushes the effective price **closer to maxPrice**.
- **`minPrice` Constraint** → Ensures no pool undercuts the **global minimum product price**.

#### Why Pricing Adjustments Matter

- **Target Price** → Acts as a reference, but actual price fluctuates with demand.
- **Price Bump** → Increases price **by 2% per purchase**.
- **Price Decay** → Reduces price **by 0.1% per day** when no new purchases occur.
- **Utilization Impact** → Higher utilization pushes the effective price **closer to maxPrice**.

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

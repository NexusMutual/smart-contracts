# Cover Buyer User Flow Documentation

## Table of Contents

- [Cover Buyer User Flow Documentation](#cover-buyer-user-flow-documentation)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Key Concepts](#key-concepts)
    - [Cover Length \& Grace Period](#cover-length--grace-period)
    - [Cover Pricing \& Dynamic Adjustments](#cover-pricing--dynamic-adjustments)
      - [Initial Price Ratio](#initial-price-ratio)
      - [Target Price](#target-price)
      - [Price Bump](#price-bump)
      - [Price Decay](#price-decay)
      - [How to Check Current Cover Pricing:](#how-to-check-current-cover-pricing)
    - [Cover Router API \& Cover Buy Process](#cover-router-api--cover-buy-process)
      - [Why Use the Cover Router API?](#why-use-the-cover-router-api)
    - [Accepted Payment Assets](#accepted-payment-assets)
    - [Membership Requirement](#membership-requirement)
  - [Step-by-Step Process](#step-by-step-process)
    - [Cover Purchase Summary](#cover-purchase-summary)
    - [How to Get a Quote](#how-to-get-a-quote)
      - [Example curl Command:](#example-curl-command)
      - [Expected API Response:](#expected-api-response)
    - [How to Buy Cover](#how-to-buy-cover)
      - [Structs Used in `Cover.buyCover()`](#structs-used-in-coverbuycover)
    - [How to Verify Cover Purchase Success](#how-to-verify-cover-purchase-success)
    - [How to Check Cover Expiration](#how-to-check-cover-expiration)
    - [How to Submit a Claim](#how-to-submit-a-claim)
      - [Claim Review Process](#claim-review-process)
  - [Frequently Asked Questions (FAQ)](#frequently-asked-questions-faq)
    - [How do I know when my cover expires?](#how-do-i-know-when-my-cover-expires)
    - [What happens if I am not a member?](#what-happens-if-i-am-not-a-member)
    - [How much is the claim payout?](#how-much-is-the-claim-payout)
      - [How Long is the Grace Period?](#how-long-is-the-grace-period)
    - [What happens if my claim is rejected?](#what-happens-if-my-claim-is-rejected)
    - [What happens if I try to buy cover without being a member?](#what-happens-if-i-try-to-buy-cover-without-being-a-member)
  - [Best Practices](#best-practices)

---

## Overview

Buying cover on Nexus Mutual allows users to protect against **specific risks** (such as smart contract failures or stablecoin depegging).  
Before purchasing a cover, it is important to understand **how pricing works, membership requirements, and the claim process**.

---

## Key Concepts

### Cover Length & Grace Period

- **Cover Length** – The **active period** during which the cover provides protection.
  - **Minimum Cover Length:** **28 days**.
  - **Maximum Cover Length:** **365 days**.
- **Grace Period** – The **additional time after cover expiration** during which claims can still be submitted.
- **Key Rule:** If the **grace period expires**, you **can no longer submit a claim**.

To check the **grace period** of a product:

```solidity
uint16 productType = CoverProducts.getProduct(productId).productType;
uint32 gracePeriod = CoverProducts.getProductType(productType).gracePeriod;
```

---

### Cover Pricing & Dynamic Adjustments

Cover pricing follows a **dynamic adjustment mechanism**:

#### Initial Price Ratio

- Each product has a **base price**, which is the starting cost for cover.

#### Target Price

- The **target price** is the **reference price** that a cover aims to revert toward **when no new purchases are made**.
- How is it determined?
  - Each product has a **pre-set target price** defined at creation.
  - This **does not change dynamically** but is influenced by **utilization and time**.
- Why does the price decay toward the target price?
  - When demand **decreases** (no new covers purchased), the price **naturally reduces** back to the target price **via price decay**.
- How does it interact with price bumps?
  - **Price bumps** push the price **above** the target price when utilization is high.
  - **Price decay** pulls it **back toward the target price** when utilization drops.

#### Price Bump

- **When utilization increases**, the **cover price increases** per purchase.
- **Bump Rate:** The price **increases by 2% per purchase**, **compounded** on the previous price.

#### Price Decay

- If **no new purchases occur**, the price **decays daily** back toward the target price.
- **Decay Rate:** Price reduces by **0.1% per day**, applied as:

  $$
  \text{New Price} = \text{Current Price} \times 0.999
  $$

- **Lower Limit:** Price **cannot go below the product's initial price ratio**.

To check the **minimum price** of a product:

```solidity
uint16 minPrice = CoverProducts.getProduct(productId).minPrice;
```

#### How to Check Current Cover Pricing:

To check **the current price of a product in a pool**, use the [capacity pool product API](https://api.nexusmutual.io/v2/api/docs/#/Capacity/get_v2_capacity_pools__poolId__products__productId_):

```
GET /v2/capacity/pools/{poolId}/products/{productId}
```

This returns pricing information including other info:

```json
{
  "minAnnualPrice": "0.02", // 2% minimum annual price
  "maxAnnualPrice": "0.10", // 10% maximum annual price
  "productId": 123,
  ...
}
```

The annual prices are percentage values between 0-1 (e.g., 0.05 = 5%).

To calculate the **premium for a specific cover period**, use:

$$
\text{Premium} = \text{Cover Amount} \times \text{Annual Price} \times \left(\frac{\text{Cover Length (days)}}{365}\right)
$$

---

### Cover Router API & Cover Buy Process

The **Cover Router API** simplifies cover purchases by **finding the best-priced cover automatically**.

#### Why Use the Cover Router API?

The Cover Router **facilitates the process** of buying cover by **finding the best-priced pools** for a given cover request. After obtaining the pool allocation, you will need to call the `Cover.buyCover` function to complete the purchase.

When calling the **\`/quote\` API**, it:

1. **Identifies available staking pools** providing cover for the selected product.
2. **Calculates how much capacity each pool should provide**.
3. **Returns a price quote** and a breakdown of pool allocations.

**Cover Router API Reference:**  
[\`/quote\` API Docs](/quote)

---

### Accepted Payment Assets

The available **denominations** for cover payment depend on the product.

To check **which assets are accepted**, call:

```solidity
(uint productId, string memory productName, uint[] memory acceptedAssets) = CoverProducts.getProduct(productId);
```

Common **asset IDs**:

| Asset | ID  |
| ----- | --- |
| NXM   | 255 |
| ETH   | 0   |
| USDC  | 6   |
| cBTC  | 7   |

---

### Membership Requirement

- You **must be a Nexus Mutual member** before purchasing cover or making a claim.
- If you are not a member, **cover purchase and claim transactions will fail**.

To check if an address is a member:

```solidity
bool isMember = MemberRoles.checkRole(memberAddress, uint8(Role.Member));
```

---

## Step-by-Step Process

### Cover Purchase Summary

1. **Call Cover Router \`/quote\` API** – Fetch price & pool allocations for the requested cover.
2. **Verify pricing & pool allocations** – Ensure the computed allocation is correct.
3. **Call \`Cover.buyCover()\`** – Pass the \`poolAllocationRequests\` from \`/quote\` API.
4. **Verify the cover purchase** – Check for success via **Cover NFT** & emitted events.

---

### How to Get a Quote

To get a cover quote, call the **Cover Router** \`/quote\` API.

#### Example curl Command:

```bash
curl -X GET "https://api.nexusmutual.io/v2/quote" \
 -H "Content-Type: application/json" \
 -d '{
"productId": 1,
"coverAmount": 100000,
"coverDuration": 90,
"paymentAsset": 6
}'
```

#### Expected API Response:

```json
{
  "premium": 1500,
  "poolAllocationRequests": [
    { "poolId": 3, "allocatedAmount": 50000 },
    { "poolId": 5, "allocatedAmount": 50000 }
  ]
}
```

---

### How to Buy Cover

1. **Use the \`/quote\` API** to fetch **\`poolAllocationRequests\`**.
2. **Call \`Cover.buyCover()\`** with the following parameters:

```solidity
Cover.buyCover(
    BuyCoverParams memory params,
    PoolAllocationRequest[] memory poolAllocationRequests
);
```

#### Structs Used in `Cover.buyCover()`

**BuyCoverParams**

| Parameter               | Description                                                    |
| ----------------------- | -------------------------------------------------------------- |
| `coverId`               | **Existing cover ID** (if extending) or **0** for a new cover. |
| `owner`                 | Address of the cover **buyer**.                                |
| `productId`             | **Product being covered** (must be a valid `productId`).       |
| `coverAsset`            | **Asset being covered** (e.g., USDC, ETH).                     |
| `amount`                | **Cover amount in `coverAsset` units**.                        |
| `period`                | **Cover duration in days**.                                    |
| `maxPremiumInAsset`     | **Max premium the buyer is willing to pay**.                   |
| `paymentAsset`          | **Asset used for payment (e.g., NXM, USDC, ETH)**.             |
| `commissionRatio`       | **Commission percentage** (if using an affiliate).             |
| `commissionDestination` | **Affiliate address** (if applicable).                         |
| `ipfsData`              | **Metadata stored on IPFS**.                                   |

**PoolAllocationRequest**

| Parameter            | Description                                                  |
| -------------------- | ------------------------------------------------------------ |
| `poolId`             | **Pool providing cover capacity**.                           |
| `skip`               | **Whether to skip this pool allocation** (`true/false`).     |
| `coverAmountInAsset` | **Amount allocated from this pool (in `coverAsset` units)**. |

---

### How to Verify Cover Purchase Success

A successful **cover purchase** results in a **Cover NFT**.

To verify purchase success:

- Buyer will receive a **Cover NFT** for their cover purchase.
- **Monitor the `CoverEdited` event**:

```solidity
event CoverEdited(
    uint indexed coverId,
    uint indexed productId,
    uint indexed segmentId,
    address buyer,
    string ipfsMetadata
);
```

- Retrieve **cover details** via:

```solidity
CoverViewer.getCovers(coverIds);
```

---

### How to Check Cover Expiration

- **Use the Cover NFT** to check the **cover expiration date**.
- Retrieve cover details via:

```solidity
CoverViewer.getCovers(coverIds);
```

---

### How to Submit a Claim

1. **Ensure the cover is active** or **within the grace period**.
2. **Call \`IndividualClaims.submitClaim()\`** with the cover ID and deposit.

```solidity
IndividualClaims.submitClaim(uint coverId);
```

- **Claim Payout:** **100% of the cover amount.** No deductibles.

#### Claim Review Process

- Claims are **reviewed by claim assessors** who evaluate validity based on cover conditions.
- **Review Duration:** Typically 7 days, but can vary depending on complexity.
- If a claim is **approved**, payout = **100% of cover amount** (no deductibles).
- If a claim is **rejected**, the **claim deposit is lost**.
- Appeal Process:
  - If rejected, claimants **cannot appeal** directly, but can **resubmit** a claim with additional evidence.
  - **Repeated false claims** may result in membership **penalties**.

---

## Frequently Asked Questions (FAQ)

### How do I know when my cover expires?

- Your **Cover NFT** includes the **expiry date**.
- You can also retrieve cover details using:

```solidity
CoverViewer.getCovers(coverIds);
```

---

### What happens if I am not a member?

- You must be a member to buy cover and submit claims.
- Check membership status:

```solidity
bool isMember = MemberRoles.checkRole(memberAddress, uint8(Role.Member));
```

---

### How much is the claim payout?

- **100% of the cover amount.**
- **No deductibles.**

---

#### How Long is the Grace Period?

- Each product has a **different grace period**, which determines how long after expiration a claim can still be submitted.
- Can the Grace Period Change?
  - **No.** Once a cover is purchased, the grace period **remains fixed** for that cover.
  - However, **future purchases of the same product may have a different grace period** if the product owner updates it.

Retrieve the grace period for a product using:

```solidity
uint16 productType = CoverProducts.getProduct(productId).productType;
uint32 gracePeriod = CoverProducts.getProductType(productType).gracePeriod;
```

---

### What happens if my claim is rejected?

- **You lose the claim deposit.**
- It is distributed to claim assessors as rewards.

---

### What happens if I try to buy cover without being a member?

- Your transaction **will fail**.
- You must **become a Nexus Mutual member first**.

---

## Best Practices

- ✅ **Always verify pricing before purchasing cover.**
- ⚠️ **Submit claims within the grace period** or you will **lose eligibility**.
- ✅ **Ensure you are a Nexus Mutual member before purchasing cover.**
- ⚠️ **Monitor pool utilization and pricing changes before buying cover.**

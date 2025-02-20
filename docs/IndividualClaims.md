# IndividualClaims Contract Developer Documentation

- [IndividualClaims Contract Developer Documentation](#individualclaims-contract-developer-documentation)
  - [**Overview**](#overview)
  - [**Key Concepts**](#key-concepts)
    - [**The Mutual and Claim Assessment Process**](#the-mutual-and-claim-assessment-process)
    - [**Cover Segments**](#cover-segments)
    - [**Claim Lifecycle**](#claim-lifecycle)
    - [**Assessment Deposit and Rewards**](#assessment-deposit-and-rewards)
    - [**Claim Status and Payout**](#claim-status-and-payout)
  - [**Mutative Functions**](#mutative-functions)
    - [`submitClaim`](#submitclaim)
  - [**Integration Best Practices**](#integration-best-practices)
    - [**What to Track Off-Chain**](#what-to-track-off-chain)
    - [**Which Functions Should Be Polled?**](#which-functions-should-be-polled)
    - [**Gas Considerations**](#gas-considerations)
  - [**Frequently Asked Questions**](#frequently-asked-questions)
    - [**Who can submit a claim?**](#who-can-submit-a-claim)
    - [**Can I submit a claim for a cover I just bought?**](#can-i-submit-a-claim-for-a-cover-i-just-bought)
    - [**How do I know when my payout is ready to redeem?**](#how-do-i-know-when-my-payout-is-ready-to-redeem)
    - [**What happens if my claim is accepted but I forget to redeem my payout?**](#what-happens-if-my-claim-is-accepted-but-i-forget-to-redeem-my-payout)
    - [**Can someone else redeem my payout for me?**](#can-someone-else-redeem-my-payout-for-me)
    - [**Do I get my assessment deposit back if my claim is accepted?**](#do-i-get-my-assessment-deposit-back-if-my-claim-is-accepted)
    - [**Can I appeal a rejected claim?**](#can-i-appeal-a-rejected-claim)
    - [**Why does my claim require an assessment deposit in ETH instead of the cover asset?**](#why-does-my-claim-require-an-assessment-deposit-in-eth-instead-of-the-cover-asset)
    - [**What’s the difference between an individual claim and other claim types?**](#whats-the-difference-between-an-individual-claim-and-other-claim-types)
  - [Integration Best Practices:](#integration-best-practices-1)
  - [Contact and Support](#contact-and-support)

---

## **Overview**

The `IndividualClaims` contract enables cover owners to **submit claims** and **redeem payouts** if their claims are accepted. Claims go through a **decentralized assessment** process where members of the mutual decide the claim outcome.

The contract integrates with multiple protocol components, including:

- **Assessment (`IAssessment`)** – Handles voting and decision-making for claims.
- **Cover (`ICover`)** – Provides cover policy and segment details.
- **Staking Pools (`IPool`)** – Facilitates payout processing.
- **RAMM (`IRamm`)** – Updates token prices and liquidity.

---

## **Key Concepts**

### **The Mutual and Claim Assessment Process**

The **mutual** operates as a decentralized insurance protocol. Instead of a centralized authority deciding claims, **assessors** (community members) vote on whether a claim is valid.

**How it works:**

1. A cover owner **submits a claim**, paying an **assessment deposit** in ETH.
2. A new **assessment poll** is created.
3. **Assessors vote** to **accept** or **deny** the claim.
4. After voting ends, the claim is either:
   - ✅ **Accepted** → Cover owner can **redeem the payout**.
   - ❌ **Denied** → No payout is given.

---

### **Cover Segments**

Covers are **divided into segments** to allow partial claims.  
Each cover has **multiple segments** that correspond to different time periods or risk exposures.

| Term               | Description                                                |
| ------------------ | ---------------------------------------------------------- |
| **Cover ID**       | Unique identifier for the cover.                           |
| **Segment ID**     | A sub-unit of a cover, representing a portion of coverage. |
| **Segment Period** | The time duration of the segment.                          |

🔹 **Example:**  
A **6-month cover** could be split into **two segments** of 3 months each. The owner can submit a claim for **one segment** instead of the entire cover.

---

### **Claim Lifecycle**

Claims go through **several stages**:

1. **Pending:** The claim is submitted and under assessment.
2. **Accepted:** The claim is approved after voting.
3. **Denied:** The claim is rejected after voting.
4. **Cooldown:** The claim is accepted but cannot be redeemed yet.
5. **Complete:** The payout has been redeemed.
6. **Unclaimed:** The claim was accepted, but the redemption period expired.

⏳ **Deadlines:**

- Cooldown before payout: **Configurable period (e.g., 7 days).**
- Redemption window: **Default 30 days** after the cooldown ends.
- If not redeemed in time: The payout expires and **cannot be claimed**.

---

### **Assessment Deposit and Rewards**

When submitting a claim, the cover owner must **pay a deposit** in ETH.  
This deposit is used to incentivize assessors.

**Formula for Deposit & Rewards:**

```
Assessment Deposit = max(min deposit, dynamic deposit)
```

Where:

- **Min Deposit** = **Flat fee** (e.g., 0.05 ETH).
- **Dynamic Deposit** = Based on **requested amount** & **NXM price**.

**Does the claimant get their deposit back?**

- If the claim is **accepted** → Deposit is refunded.
- If the claim is **denied** → Deposit is **not refunded**.

---

### **Claim Status and Payout**

After a claim is **accepted**, the cover owner can **redeem their payout**.  
This must be done **before the redemption deadline**.

💡 **Anyone** can call `redeemClaimPayout()`, but the **payout always goes to the cover owner**.

---

## **Mutative Functions**

### `submitClaim`

Submits a claim for a cover.

```solidity
function submitClaim(
    uint32 coverId,
    uint16 segmentId,
    uint96 requestedAmount,
    string calldata ipfsMetadata
) external payable override onlyMember whenNotPaused returns (Claim memory claim);
```

| Parameter         | Description                         |
| ----------------- | ----------------------------------- |
| `coverId`         | The cover ID to claim against.      |
| `segmentId`       | The specific segment of the cover.  |
| `requestedAmount` | Amount requested for payout.        |
| `ipfsMetadata`    | IPFS hash containing proof of loss. |

- **Requires** an ETH deposit.
- Emits `ClaimSubmitted` event.
- The **same cover cannot have multiple active claims**.

---

## **Integration Best Practices**

### **What to Track Off-Chain**

1. **Claim Submission History** → Use `getClaimsToDisplay()`.
2. **NXM Price Updates** → Needed to estimate deposit in UI.
3. **Payout Deadlines** → Track accepted claims & redemption deadlines.

### **Which Functions Should Be Polled?**

- `getClaimsToDisplay()` → Fetch latest claim statuses.
- `getAssessmentDepositAndReward()` → Calculate deposits before submitting claims.
- `redeemClaimPayout()` → Check if claims are redeemable.

### **Gas Considerations**

- **Claim Submission** can be **costly** due to assessment deposits.
- **Use batching** if submitting multiple claims.

---

## **Frequently Asked Questions**

### **Who can submit a claim?**

Only the **cover owner** or an **approved operator**.

---

### **Can I submit a claim for a cover I just bought?**

No. You must wait **at least one block** after purchase.

---

### **How do I know when my payout is ready to redeem?**

Check your claim’s **status** via `getClaimsToDisplay()` or listen for the `ClaimAccepted` event.

- A claim goes through a **cooldown period** before becoming redeemable.
- Use `redeemClaimPayout()` **before the redemption deadline** to receive your payout.

---

### **What happens if my claim is accepted but I forget to redeem my payout?**

If your claim is accepted but you don’t redeem the payout within the deadline, you lose it permanently.

- **Redemption deadline** = **cooldown period (e.g., 7 days) + 30 days redemption window.**
- After this period, the claim is marked **Unclaimed**, and the payout can no longer be withdrawn.
- Track your accepted claims and **set reminders** to avoid losing payouts.

---

### **Can someone else redeem my payout for me?**

Yes. **Anyone** can call `redeemClaimPayout()`, but the payout always goes to the cover owner.

---

### **Do I get my assessment deposit back if my claim is accepted?**

Yes. The deposit is **refunded** when you redeem the payout.

---

### **Can I appeal a rejected claim?**

No. Once a claim is denied, you **cannot appeal**. You must submit a **new claim**.

---

### **Why does my claim require an assessment deposit in ETH instead of the cover asset?**

ETH is used to **incentivize assessors** and prevent spam claims.

---

### **What’s the difference between an individual claim and other claim types?**

- **Individual Claims** → A **single cover owner** submits the claim.
- **Group Claims** (future feature) → Claims are processed in **batches**.

---

## Integration Best Practices:

- **Track accepted claims and their deadlines** using `getClaimsToDisplay()`.
- **Set reminders** for users when the payout is redeemable to avoid expiration.

## Contact and Support

If you have questions or need assistance integrating with the `IndividualClaims` contract or other parts of the protocol, please reach out through the official support channels or developer forums.

- **Developer Forums**:
- **Official Support Channels**
- **Documentation Resources**
- **GitHub Repository**:

Disclaimer: This documentation provides a high-level overview of the `IndividualClaims` contract's functionality. It is intended for developers integrating with the protocol and may omit internal details not relevant to external interactions. Always refer to the latest contract code and official resources.

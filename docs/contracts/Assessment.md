# Assessment Contract Developer Documentation

- [Assessment Contract Developer Documentation](#assessment-contract-developer-documentation)
  - [Overview](#overview)
  - [Key Concepts](#key-concepts)
    - [Stake \& Voting Power](#stake--voting-power)
    - [Stake Locking](#stake-locking)
    - [Assessment \& Poll](#assessment--poll)
      - [Voting Outcome](#voting-outcome)
    - [ETH Deposits \& Claim Resolution](#eth-deposits--claim-resolution)
    - [Reward Distribution](#reward-distribution)
    - [Fraud Resolution](#fraud-resolution)
    - [Configuration](#configuration)
  - [Mutative Functions](#mutative-functions)
    - [`stake(uint96 amount)`](#stakeuint96-amount)
    - [`unstake(uint96 amount, address to)`](#unstakeuint96-amount-address-to)
    - [`unstakeAllFor(address staker)`](#unstakeallforaddress-staker)
    - [`withdrawRewards(address staker, uint104 batchSize)`](#withdrawrewardsaddress-staker-uint104-batchsize)
    - [`withdrawRewardsTo(address destination, uint104 batchSize)`](#withdrawrewardstoaddress-destination-uint104-batchsize)
    - [`startAssessment(uint totalAssessmentReward, uint assessmentDepositInETH)`](#startassessmentuint-totalassessmentreward-uint-assessmentdepositineth)
    - [`castVotes(uint[] calldata assessmentIds, bool[] calldata votes, string[] calldata ipfsAssessmentDataHashes, uint96 stakeIncrease)`](#castvotesuint-calldata-assessmentids-bool-calldata-votes-string-calldata-ipfsassessmentdatahashes-uint96-stakeincrease)
    - [`_castVote(uint assessmentId, bool isAcceptVote, string memory ipfsAssessmentDataHash)`](#_castvoteuint-assessmentid-bool-isacceptvote-string-memory-ipfsassessmentdatahash)
    - [`processFraud(...)`](#processfraud)
    - [`updateUintParameters(UintParams[] calldata paramNames, uint[] calldata values)`](#updateuintparametersuintparams-calldata-paramnames-uint-calldata-values)
    - [`changeDependentContractAddress()`](#changedependentcontractaddress)
  - [View Functions](#view-functions)
    - [`getVoteCountOfAssessor(address assessor)`](#getvotecountofassessoraddress-assessor)
    - [`getAssessmentsCount()`](#getassessmentscount)
    - [`getPoll(uint assessmentId)`](#getpolluint-assessmentid)
    - [`getRewards(address staker)`](#getrewardsaddress-staker)
  - [Dependencies and Libraries](#dependencies-and-libraries)
  - [Events](#events)
  - [Frequently Asked Questions (FAQ)](#frequently-asked-questions-faq)
    - [How are product weights determined?](#how-are-product-weights-determined)
    - [Can I create a private or public staking pool?](#can-i-create-a-private-or-public-staking-pool)
    - [How often should effective weights be recalculated?](#how-often-should-effective-weights-be-recalculated)
    - [What happens if capacity is exceeded?](#what-happens-if-capacity-is-exceeded)
    - [How is surge pricing applied?](#how-is-surge-pricing-applied)
    - [How can I update pool metadata?](#how-can-i-update-pool-metadata)
    - [What are the limits for target weights and prices?](#what-are-the-limits-for-target-weights-and-prices)
    - [Can I adjust pool fees?](#can-i-adjust-pool-fees)
    - [Is there a way to preview the premium without purchasing cover?](#is-there-a-way-to-preview-the-premium-without-purchasing-cover)
    - [When can stakers withdraw their NXM?](#when-can-stakers-withdraw-their-nxm)
    - [What happens if my vote is fraudulent?](#what-happens-if-my-vote-is-fraudulent)
    - [How is the outcome of an assessment decided?](#how-is-the-outcome-of-an-assessment-decided)
    - [When is an assessment finalized?](#when-is-an-assessment-finalized)
  - [Best Practices](#best-practices)
  - [Integration Guidelines](#integration-guidelines)
  - [Contact and Support](#contact-and-support)

## Overview

The `Assessment` contract manages evaluation of cover claims. Members stake NXM tokens and cast votes to determine the outcome of assessments. The contract distributes rewards for benevolent participation, enforces stake lockup periods, and implements a fraud resolution process by burning tokens from fraudulent assessors.

---

## Key Concepts

### Stake & Voting Power

A **Stake** represents the amount of NXM tokens deposited by a member. Stakes determine **voting power**:

- Assessors must **stake NXM** before they can vote.
- The more NXM staked, the **greater the vote weight**.
- Stakes are **locked** when used for voting.

### Stake Locking

**Stakes are locked after voting** and cannot be withdrawn immediately. If voting on multiple assessments, the longest lock period applies.

| Lock Type           | Purpose                            | Unlock Condition                       |
| ------------------- | ---------------------------------- | -------------------------------------- |
| **Governance Lock** | Prevents withdrawals during voting | Unlocks after governance vote ends     |
| **Assessment Lock** | Prevents voting manipulation       | Unlocks after assessment cooldown ends |

### Assessment & Poll

An **Assessment** is a voting process initiated when a claim is raised to determine its validity. It contains:

- `accepted`: Total stake voting in favor.
- `denied`: Total stake voting against.
- `start`: Timestamp when the poll began.
- `end`: Timestamp when the poll ends.

Each assessment contains a **Poll**, which tracks:

- **Accepted votes** (`accepted`) → Total stake voting **for** the claim.
- **Denied votes** (`denied`) → Total stake voting **against** the claim.
- **Start & End timestamps** (`start`, `end`) → Voting period.

#### Voting Outcome

- If **more stake is placed on `accept`**, the claim is approved.
- If **more stake is placed on `deny`**, the claim is rejected.
- **First `accept` vote** extends the poll duration.
- **Late voting activity** may further extend the poll (`silentEndingPeriod`).

### ETH Deposits & Claim Resolution

- **Claimants deposit ETH** when filing a claim.
- If the **claim is denied**, the deposit is used to fund rewards for assessors.
- If the **claim is approved**, the deposit is refunded to the claimant.

### Reward Distribution

- **NXM rewards are given to honest voters**.
- Voters **must manually withdraw rewards** using `withdrawRewards()`.
- **How rewards are calculated**:
  - The total reward pool is split **proportionally to the stake**.
  - If an assessor votes incorrectly, **they receive no rewards**.
  - Rewards are only claimable **after the payout cooldown ends**.

### Fraud Resolution

- If fraudulent votes are detected, **a Merkle proof is submitted**.
- Fraudulent voters:
  - **Lose their rewards**.
  - **May have their NXM staked for the vote burned**.
  - **Can be banned from future voting**.
- **How fraud is processed:**
  - Fraud reports are submitted via `processFraud()`.
  - The system verifies fraud via a Merkle tree proof.
  - If confirmed, the fraudulent votes are **removed** and tokens **burned**.

### Configuration

The **Configuration** struct contains parameters that govern the assessment process. These parameters can be updated via governance:

- **minVotingPeriodInDays**: Minimum duration for which a poll remains open once the first accept vote is cast.
- **stakeLockupPeriodInDays**: Duration for which staked tokens are locked after a vote.
- **payoutCooldownInDays**: Cooldown period after a poll ends before rewards can be withdrawn.
- **silentEndingPeriodInDays**: A period used to extend the poll end time if voting activity is low near closing.\*\*\*\*

## Mutative Functions

### `stake(uint96 amount)`

Allows a member to increase their stake by transferring NXM tokens to the contract.

```solidity
function stake(uint96 amount) public whenNotPaused { ... }
```

| Parameter | Description                        |
| --------- | ---------------------------------- |
| `amount`  | The amount of NXM tokens to stake. |

- **Behavior:**
  - Increases the sender's stake.
  - Transfers NXM from the sender to the contract via the Token Controller.
  - Emits the `StakeDeposited` event.

---

### `unstake(uint96 amount, address to)`

Withdraws part or all of a member's stake, subject to lockup restrictions.

```solidity
function unstake(uint96 amount, address to) external override whenNotPaused { ... }
```

| Parameter | Description                                          |
| --------- | ---------------------------------------------------- |
| `amount`  | The amount of NXM tokens to withdraw.                |
| `to`      | The address to which the tokens will be transferred. |

- **Conditions:**
  - The caller must have sufficient staked tokens.
  - The stake is locked until the stake lockup period (and any governance lock) has expired.
- **Events:**
  - Emits the `StakeWithdrawn` event.

---

### `unstakeAllFor(address staker)`

Withdraws the full staked amount for a given member. Can only be invoked by the Token Controller.

```solidity
function unstakeAllFor(address staker) external override whenNotPaused onlyTokenController { ... }
```

| Parameter | Description                           |
| --------- | ------------------------------------- |
| `staker`  | The address of the member to unstake. |

- **Access Control:**
  - Restricted to the Token Controller.

---

### `withdrawRewards(address staker, uint104 batchSize)`

Allows a staker to withdraw accumulated rewards up to the last finalized poll.

```solidity
function withdrawRewards(
  address staker,
  uint104 batchSize
) external override whenNotPaused returns (uint withdrawn, uint withdrawnUntilIndex) { ... }
```

| Parameter   | Description                                                        |
| ----------- | ------------------------------------------------------------------ |
| `staker`    | The address of the staker whose rewards are being withdrawn.       |
| `batchSize` | Number of votes to process in this withdrawal (supports batching). |

- **Returns:**
  - `withdrawn`: Total NXM rewards withdrawn.
  - `withdrawnUntilIndex`: The vote index until which rewards were processed.
- **Events:**
  - Emits the `RewardWithdrawn` event.

---

### `withdrawRewardsTo(address destination, uint104 batchSize)`

Enables a staker to withdraw rewards to a specified destination address.

```solidity
function withdrawRewardsTo(
  address destination,
  uint104 batchSize
) external override whenNotPaused returns (uint withdrawn, uint withdrawnUntilIndex) { ... }
```

| Parameter     | Description                                               |
| ------------- | --------------------------------------------------------- |
| `destination` | The destination address where rewards will be sent.       |
| `batchSize`   | The number of votes to process (for batched withdrawals). |

- **Returns:**
  - `withdrawn`: Total NXM rewards withdrawn.
  - `withdrawnUntilIndex`: The vote index processed.
- **Events:**
  - Emits the `RewardWithdrawn` event.

---

### `startAssessment(uint totalAssessmentReward, uint assessmentDepositInETH)`

Creates a new assessment poll for an event.

```solidity
function startAssessment(
  uint totalAssessmentReward,
  uint assessmentDepositInETH
) external override onlyInternal returns (uint) { ... }
```

| Parameter                | Description                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| `totalAssessmentReward`  | Total reward allocated for distribution among participating stakers if the outcome is positive. |
| `assessmentDepositInETH` | ETH deposit used as collateral, returned upon a positive assessment outcome.                    |

- **Returns:**
  - The new assessment's identifier (its index in the assessments array).
- **Access Control:**
  - Only callable by internal contracts (e.g., redemption methods).

---

### `castVotes(uint[] calldata assessmentIds, bool[] calldata votes, string[] calldata ipfsAssessmentDataHashes, uint96 stakeIncrease)`

Allows a member to cast votes on multiple assessments in a single transaction and optionally increase their stake.

```solidity
function castVotes(
  uint[] calldata assessmentIds,
  bool[] calldata votes,
  string[] calldata ipfsAssessmentDataHashes,
  uint96 stakeIncrease
) external override onlyMember whenNotPaused { ... }
```

| Parameter                  | Description                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `assessmentIds`            | Array of assessment identifiers on which votes are cast.                                                         |
| `votes`                    | Array of boolean values representing votes (true for accept, false for deny). Must match `assessmentIds` length. |
| `ipfsAssessmentDataHashes` | Array of IPFS hashes containing off-chain assessment data.                                                       |
| `stakeIncrease`            | Optional additional stake to be added before voting (if non-zero).                                               |

- **Behavior:**
  - Validates that the lengths of `assessmentIds`, `votes`, and `ipfsAssessmentDataHashes` are equal.
  - Optionally increases the caller's stake.
  - Iterates over the provided assessments and casts each vote by calling the internal function `_castVote`.
- **Events:**
  - Emits a `VoteCast` event for each vote.

---

### `_castVote(uint assessmentId, bool isAcceptVote, string memory ipfsAssessmentDataHash)`

Internal function that processes an individual vote on an assessment.

```solidity
function _castVote(uint assessmentId, bool isAcceptVote, string memory ipfsAssessmentDataHash) internal { ... }
```

| Parameter                | Description                                                    |
| ------------------------ | -------------------------------------------------------------- |
| `assessmentId`           | Identifier of the assessment being voted on.                   |
| `isAcceptVote`           | Vote decision: `true` for accept, `false` for deny.            |
| `ipfsAssessmentDataHash` | IPFS hash of additional assessment data provided by the voter. |

- **Behavior:**
  - Checks that the sender has not already voted on the assessment.
  - Validates that the sender has sufficient staked tokens.
  - Ensures that voting is still open.
  - For the first accept vote, resets the poll's end time to ensure the minimum voting period.
  - Potentially extends the poll end time based on the staker's contribution relative to the total vote.
  - Updates the poll totals (accepted or denied) accordingly.
  - Records the vote and emits the `VoteCast` event.

---

### `processFraud(...)`

Allows anyone to process fraudulent votes by verifying a Merkle proof and burning tokens from fraudulent assessors.

```solidity
function processFraud(
  uint256 rootIndex,
  bytes32[] calldata proof,
  address assessor,
  uint256 lastFraudulentVoteIndex,
  uint96 burnAmount,
  uint16 fraudCount,
  uint256 voteBatchSize
) external override whenNotPaused { ... }
```

| Parameter                 | Description                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `rootIndex`               | Index of the Merkle tree root in the `fraudResolution` array.                                  |
| `proof`                   | Merkle proof path verifying the fraudulent assessor's details.                                 |
| `assessor`                | Address of the assessor alleged to have cast fraudulent votes.                                 |
| `lastFraudulentVoteIndex` | The last vote index that is considered fraudulent.                                             |
| `burnAmount`              | Amount of staked tokens to be burned from the fraudulent assessor.                             |
| `fraudCount`              | Number of fraud attempts recorded for the assessor so far.                                     |
| `voteBatchSize`           | Number of votes to process in the current batch (prevents unbounded loops for gas efficiency). |

- **Behavior:**
  - Verifies the Merkle proof against the stored root.
  - Iterates over the fraudulent votes (up to a batch limit) to adjust the poll totals by subtracting the staked amounts.
  - Ensures that finalized polls (after the cooldown period) are not affected.
  - Burns the specified tokens from the fraudulent assessor if the fraud count matches.
  - Updates the assessor's fraud count and rewards withdrawal index.
- **Events:**
  - Emits `FraudProcessed` for each vote adjusted.
  - Emits `FraudSubmitted` when a new fraud Merkle root is submitted (via a separate function).

---

### `updateUintParameters(UintParams[] calldata paramNames, uint[] calldata values)`

Allows governance to update configuration parameters related to the assessment process.

```solidity
function updateUintParameters(
  UintParams[] calldata paramNames,
  uint[] calldata values
) external override onlyGovernance { ... }
```

| Parameter    | Description                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| `paramNames` | Array of configuration parameters to update (e.g., `minVotingPeriodInDays`, `stakeLockupPeriodInDays`). |
| `values`     | New values for each corresponding parameter.                                                            |

- **Behavior:**
  - Iterates over each parameter and updates the configuration accordingly.

---

### `changeDependentContractAddress()`

Updates the internal contract addresses from the master registry and initializes configuration if not yet set.

```solidity
function changeDependentContractAddress() external override { ... }
```

- **Behavior:**
  - Updates addresses for the Token Controller, Member Roles, and Ramm contracts.
  - Checks if configuration parameters are uninitialized and, if so, sets default values:
    - `minVotingPeriodInDays`: 3 days
    - `payoutCooldownInDays`: 1 day
    - `stakeLockupPeriodInDays`: 14 days
    - `silentEndingPeriodInDays`: 1 day
  - Whitelists the Assessment contract in the Token Controller.

---

## View Functions

### `getVoteCountOfAssessor(address assessor)`

Returns the total number of votes cast by the specified assessor.

```solidity
function getVoteCountOfAssessor(address assessor) external override view returns (uint);
```

| Parameter  | Description                           |
| ---------- | ------------------------------------- |
| `assessor` | The address of the assessor to query. |

- **Returns:**
  - The number of votes the assessor has cast.

---

### `getAssessmentsCount()`

Provides the total number of assessments created.

```solidity
function getAssessmentsCount() external override view returns (uint);
```

- **Returns:**
  - The count of assessments.

---

### `getPoll(uint assessmentId)`

Returns the poll details of a specific assessment.

```solidity
function getPoll(uint assessmentId) external override view returns (Poll memory);
```

| Parameter      | Description                              |
| -------------- | ---------------------------------------- |
| `assessmentId` | The index of the assessment to retrieve. |

- **Returns:**
- A `Poll` struct with:
  - `accepted`: Total stake in favor.
  - `denied`: Total stake against.
  - `start`: Poll start timestamp.
  - `end`: Poll end timestamp.

---

### `getRewards(address staker)`

Returns details about a staker's rewards including pending rewards, withdrawable rewards, and the index until which rewards can be withdrawn.

```solidity
function getRewards(address staker) external override view returns (
  uint totalPendingAmountInNXM,
  uint withdrawableAmountInNXM,
  uint withdrawableUntilIndex
);
```

| Parameter | Description                         |
| --------- | ----------------------------------- |
| `staker`  | The address of the staker to query. |

- **Returns:**
  - `totalPendingAmountInNXM`: Total pending rewards.
  - `withdrawableAmountInNXM`: Rewards currently available for withdrawal.
  - `withdrawableUntilIndex`: Vote index marking the limit of withdrawable rewards.

---

## Dependencies and Libraries

- **OpenZeppelin's MerkleProof:**  
  Used to verify Merkle tree proofs in the fraud resolution process.

- **SafeUintCast:**  
  Provides safe conversion between integer types.

- **Math:**  
  Used for calculations, including proportional time extensions for poll endings.

- **MasterAwareV2:**  
  Inherited to facilitate interactions with the master contract for internal address resolution.

- **Interfaces:**

  - `IAssessment`: Interface defining the Assessment contract functions.
  - `IMemberRoles`: Interface for verifying membership.
  - `INXMToken`: Interface for interacting with the NXM token.
  - `ITokenController`: Interface for token transfers, minting, and burning.
  - `IRamm`: Interface used for TWAP updates in liquidity management.

- **Note:**  
  The contract relies on internal contract addresses (such as the Token Controller and Ramm) which are updated through the `changeDependentContractAddress()` function.

---

## Events

- **`StakeDeposited(address indexed staker, uint amount)`**  
  Emitted when a member increases their stake.

- **`StakeWithdrawn(address indexed staker, address to, uint amount)`**  
  Emitted when a member withdraws their stake.

- **`RewardWithdrawn(address indexed staker, address destination, uint withdrawn)`**  
  Emitted when rewards are successfully withdrawn.

- **`VoteCast(address indexed voter, uint assessmentId, uint stakeAmount, bool accepted, string ipfsAssessmentDataHash)`**  
  Emitted each time a vote is cast on an assessment.

- **`FraudSubmitted(bytes32 root)`**  
  Emitted when governance submits a Merkle tree root for fraudulent assessors.

- **`FraudProcessed(uint assessmentId, address assessor, Poll updatedPoll)`**  
  Emitted when fraudulent votes are processed and the corresponding poll is updated.

## Frequently Asked Questions (FAQ)

### How are product weights determined?

Product weights are set dynamically to balance stake allocations:

- **Target Weight** – Set by the pool manager to indicate the desired allocation.
- **Effective Weight** – Adjusted dynamically based on:
  - Global capacity ratio.
  - Product-specific capacity reductions.
  - The pool's current utilization.

This ensures that actual allocations reflect real-time conditions, promoting fair resource distribution.

---

### Can I create a private or public staking pool?

Yes. When creating a staking pool using `createStakingPool`, you can specify:

- **Private Pool** → Set `isPrivatePool = true`. Only authorized participants can interact.
- **Public Pool** → Set `isPrivatePool = false`. Open to all participants.

---

### How often should effective weights be recalculated?

Effective weights should be recalculated:

- **Periodically** → Regular updates (e.g., daily or weekly) ensure allocations remain accurate.
- **After Significant Events** → Such as:
  - Large cover purchases.
  - Stake deposits/withdrawals.
  - Adjustments to product parameters.

Frequent recalculations maintain optimal stake distribution.

---

### What happens if capacity is exceeded?

If capacity usage reaches or exceeds predefined limits:

- **Price Bumps** → The price gradually increases per additional capacity used.
- **Surge Pricing** → Once usage exceeds 90%, surge pricing significantly increases premiums.

This prevents over-saturation and ensures sustainability.

---

### How is surge pricing applied?

Surge pricing is triggered when capacity usage exceeds 90%. It increases premiums based on the percentage of capacity used beyond this threshold, with a **maximum price cap of 200% (2x increase).**

---

### How can I update pool metadata?

Pool managers can update metadata by calling:

```solidity
function setPoolMetadata(uint poolId, string calldata ipfsHash) external;
```

The `ipfsHash` should reference an updated metadata document stored off-chain.

---

### What are the limits for target weights and prices?

- **Target Weight** → Cannot exceed 100% (`WEIGHT_DENOMINATOR`). Exceeding this will result in a `TargetWeightTooHigh` error.
- **Target Price** → Must be within the global **minimum price ratio** and **100% (TARGET_PRICE_DENOMINATOR)**.

---

### Can I adjust pool fees?

Yes. When creating a staking pool, you set the **initial and maximum pool fees**, which can be adjusted later within defined limits.

---

### Is there a way to preview the premium without purchasing cover?

While `getPremium()` calculates the premium during the cover purchase process, you can **simulate** premium calculations off-chain using the same logic.

---

### When can stakers withdraw their NXM?

- Stakers **must wait until their assessment lock period ends**.
- Call `unstake()` to withdraw NXM.

---

### What happens if my vote is fraudulent?

- **Your stake will be burned** if fraud is proven.
- Fraud is verified using **Merkle proofs**.

---

### How is the outcome of an assessment decided?

- If **more stake is placed on "accept"**, the claim is **approved**.
- If **more stake is placed on "deny"**, the claim is **rejected**.
- The **first accept vote** extends the poll duration.

---

### When is an assessment finalized?

An assessment is finalized when:

- The **cooldown period ends**.
- Rewards become **claimable**.
- Stakes become **withdrawable**.

---

## Best Practices

1. **Regular Updates**
   - Frequently update **product weights and pricing** to reflect current market conditions.
   - Ensure **pool metadata** remains updated to maintain transparency.
2. **Monitor Capacity**
   - Keep track of **capacity utilization** to prevent unexpected **surge pricing**.
   - Allocate additional stakes before reaching critical thresholds.
3. **Transparent Metadata**
   - Use **IPFS** or similar decentralized storage for metadata.
   - Ensure metadata updates are accessible and traceable.
4. **Secure Management**
   - **Restrict access** to pool management functions to prevent unauthorized changes.
   - Ensure that **only authorized operators** can modify staking pools.
5. **Community Engagement**
   - Engage with the **community and stakeholders** to gather feedback.
   - Stay updated on **best practices** for optimal staking and governance.

---

## Integration Guidelines

- **🔒 Access Control**
  - Only **authorized roles** (e.g., pool managers) can perform administrative actions.
  - Ensure **proper role assignments** to avoid unauthorized modifications.
- **📏 Validation Checks**
  - The contract **enforces parameter limits** to prevent misconfigurations.
  - **Invalid weight allocations or excessive pricing** will revert transactions.
- **🛡️ Safe Math Operations**
  - The contract **uses safe math libraries** to prevent overflows and underflows.
  - This ensures all calculations are accurate and secure.

---

## Contact and Support

For assistance, reach out via:

- **Developer Forums** → Join discussions and seek help from the community.
- **Official Support Channels** → Contact us via email or join our Discord.
- **Documentation Resources** → Access tutorials and FAQs on our official website.
- **GitHub Repository** → Report issues or contribute via GitHub.

We are committed to supporting our developers and users. **Don't hesitate to reach out!**

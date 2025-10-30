# Governor

## Overview

The Governor contract allows creating, voting and executing proposals within the Nexus Platform.

The Advisory Board (AB) can create proposals with arbitrary system actions to determine the direction of the Mutual.

On the other hand mutual members cannot propose arbitrary actions but maintain control over who serves on the Advisory Board.

## Key Concepts

### Proposal Types

* **Advisory Board (AB) proposals**
  * raised and voted on by AB members
  * can contain arbitrary actions to be executed by the Governor contract
* **Member proposals**
  * limited to proposing changes to the Advisory Board (AB) seats
  * raised and voted on by members

### Voting

* **Advisory Board (AB) proposals**
  * each AB member has vote weight of 1
* **Member proposals**
  * token weighted votes, capped at 5% supply vote per member
  * voting locks member tokens until proposal executing deadline

### Threshold

* **Advisory Board (AB) proposals**
  * each AB member has vote weight of 1
  * passes if the proposal receive ≥ 3 supporting votes
* **Member proposals**
  * must have >= 100 tokens to raise AB swap proposal
  * at least 15% of total token supply must participate in the proposal
  * passes if supporting votes > against votes

### Proposal Timeline

* **Proposal Creation** - proposal is created
* **Voting Period (3 days)** - proposal is voted on
* **Timelock (1 day)** - cooldown before executing actions
* **Execution** - proposal actions can be executed after timelock

## Mutative Functions

### `propose`

Creates a new Advisory Board proposal.

```solidity
function propose(
  Transaction[] calldata txs,
  string calldata description
) external returns (uint proposalId) { ... }
```

| Parameter     | Description                                    |
| ------------- | ---------------------------------------------- |
| `txs`         | Array of transactions to execute if approved   |
| `description` | Text description of the proposal               |

- **Access Control:**
  - Only callable by Advisory Board members.
- **Returns:**
  - The ID of the created proposal.
- **Events:**
  - Emits `ProposalCreated` event.

---

### `proposeAdvisoryBoardSwap`

Creates a proposal to swap Advisory Board members.

```solidity
function proposeAdvisoryBoardSwap(
  AdvisoryBoardSwap[] memory swaps,
  string calldata description
) external returns (uint proposalId) { ... }
```

| Parameter     | Description                                           |
| ------------- | ----------------------------------------------------- |
| `swaps`       | Array of member swaps (from/to member IDs)            |
| `description` | Text description of the proposal                      |

- **Access Control:**
  - Only callable by members with sufficient voting weight (>=100 NXM).
- **Behavior:**
  - Validates swap pairs and member eligibility.
- **Returns:**
  - The ID of the created proposal.
- **Events:**
  - Emits `ProposalCreated` event.

---

### `cancel`

Cancels an Advisory Board proposal.

```solidity
function cancel(uint proposalId) external { ... }
```

| Parameter    | Description                      |
| ------------ | -------------------------------- |
| `proposalId` | The ID of the proposal to cancel |

- **Access Control:**
  - Only callable by Advisory Board members.
- **Behavior:**
  - Can only cancel Advisory Board proposals that haven't been executed.
- **Events:**
  - Emits `ProposalCanceled` event.

---

### `vote`

Casts a vote on a proposal.

```solidity
function vote(uint proposalId, Choice choice) external { ... }
```

| Parameter    | Description                                          |
| ------------ | ---------------------------------------------------- |
| `proposalId` | The ID of the proposal to vote on                    |
| `choice`     | Vote choice: Against (0), For (1), or Abstain (2)    |

- **Access Control:**
  - Only callable by members (for member proposals) or AB members (for AB proposals).
- **Behavior:**
  - Locks tokens for member proposals until execution deadline.
  - AB proposals with 3+ votes immediately start timelock period and close voting early.
- **Events:**
  - Emits `VoteCast` event.

---

### `execute`

Executes a passed proposal after the timelock period.

```solidity
function execute(uint proposalId) external payable { ... }
```

| Parameter    | Description                        |
| ------------ | ---------------------------------- |
| `proposalId` | The ID of the proposal to execute  |

- **Access Control:**
  - AB proposals: Only callable by Advisory Board members.
  - Member proposals: Only callable by members.
- **Behavior:**
  - Verifies proposal passed voting and timelock period expired.
  - Executes all transactions in the proposal.
- **Events:**
  - Emits `ProposalExecuted` event.

---

## View Functions

### `getProposal`

Returns the basic proposal data.

```solidity
function getProposal(uint proposalId) external view returns (Proposal memory) { ... }
```

| Parameter    | Description                     |
| ------------ | ------------------------------- |
| `proposalId` | The ID of the proposal to query |

- **Returns:**
  - The `Proposal` struct containing kind, status, and timestamps.

---

### `getProposalDescription`

Returns the text description of a proposal.

```solidity
function getProposalDescription(uint proposalId) external view returns (string memory) { ... }
```

| Parameter    | Description                     |
| ------------ | ------------------------------- |
| `proposalId` | The ID of the proposal to query |

- **Returns:**
  - The proposal's text description.

---

### `getProposalTransactions`

Returns all transactions in a proposal.

```solidity
function getProposalTransactions(uint proposalId) external view returns (Transaction[] memory) { ... }
```

| Parameter    | Description                     |
| ------------ | ------------------------------- |
| `proposalId` | The ID of the proposal to query |

- **Returns:**
  - Array of transactions to be executed if proposal passes.

---

### `getProposalTally`

Returns the vote tally for a proposal.

```solidity
function getProposalTally(uint proposalId) external view returns (Tally memory) { ... }
```

| Parameter    | Description                     |
| ------------ | ------------------------------- |
| `proposalId` | The ID of the proposal to query |

- **Returns:**
  - The `Tally` struct with for/against/abstain vote counts.

---

### `getProposalWithDetails`

Returns comprehensive proposal information in a single call.

```solidity
function getProposalWithDetails(uint proposalId) external view returns (
  uint proposalId,
  Proposal memory,
  string memory,
  Transaction[] memory,
  Tally memory
) { ... }
```

| Parameter    | Description                     |
| ------------ | ------------------------------- |
| `proposalId` | The ID of the proposal to query |

- **Returns:**
  - Complete proposal data: proposal struct, description, transactions, and tally.
- **Behavior:**
  - Designed for user interfaces to get all relevant proposal information in one call.

---

### `getVote`

Returns a specific vote cast on a proposal.

```solidity
function getVote(uint proposalId, uint memberId) external view returns (Vote memory) { ... }
```

| Parameter    | Description                                                                              |
| ------------ | ---------------------------------------------------------------------------------------- |
| `proposalId` | The ID of the proposal to query                                                          |
| `memberId`   | The member ID of the voter for member proposals or seat id for Advisory Board proposals  |

- **Returns:**
  - The `Vote` struct containing choice and weight.

---

## Events

- **`ProposalCreated(uint proposalId, ProposalKind kind, string description)`**
  Emitted when a new proposal is created.

- **`ProposalCanceled(uint proposalId)`**
  Emitted when a proposal is canceled.

- **`ProposalExecuted(uint proposalId)`**
  Emitted when a proposal is successfully executed.

- **`VoteCast(uint indexed proposalId, ProposalKind indexed kind, uint indexed voterId, Choice choice, uint weight)`**
  Emitted when a vote is cast on a proposal.

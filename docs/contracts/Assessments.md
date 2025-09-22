# Assessments

## Overview

The `Assessments` contract manages the evaluation over cover claims. Each cover product type has an assigned assessor group responsible for evaluating all claims submitted under that product type. The assessors within an assessor group are trusted and vetted industry professionals, approved by the Advisory Board.

Each assessor has the responsibility to evaluate the cover claims and cast their votes to approve / deny the claim. A majority in favour needs to be met to approve a claim.

## Key Concepts

### Assessment

An **Assessment** is a voting process initiated when a claim is submitted to determine its validity.

- `assessingGroupId`: Group ID of the assessor group responsible for this assessment
- `cooldownPeriod`: The amount of time (seconds) the claimant needs to wait after the voting period ends before they can redeem the claim payout if the claim was approved
- `start`: Timestamp when the assessment began
- `votingEnd`: Timestamp when the assessment voting period ends
- `acceptVotes`: Total votes in favor.
- `denyVotes`: Total votes against.

### Assessor group

Each cover product type has an assigned assessor group responsible for evaluating all claims submitted under that product type

### Assessment Timeline

1. Claim is submitted
2. Voting period (72 hours): starts after claim submission
3. Cooldown before payout: starts after voting period ends
     - The Advisory Board uses the cooldown period to review for any potential fraud
4. Redemption period: starts after cooldown period ends. The time window during which a claimant can withdraw their payout

### Voting

* each assessor has a vote weight of 1
* only the votes actually cast are counted
* if no ones votes against and the voting period ends, a single accept vote is enough to approve the claim

### Fraud Resolution

- If fraudulent votes are detected, the Advisory Board can step in and intervene before the claims results are finalized
- The Advisory Board has the powers to:
  - pause Assessments and Claims contract
  - undo fraudulent votes
  - remove fraudulent assessors
  - extend assessment voting period

## Mutative Functions

### `addAssessorsToGroup`

Adds assessors to a group, creating a new group if groupId is 0.

```solidity
function addAssessorsToGroup(
  uint[] calldata assessorMemberIds,
  uint groupId
) external override onlyContracts(C_GOVERNOR) { ... }
```

| Parameter           | Description                                       |
| ------------------- | ------------------------------------------------- |
| `assessorMemberIds` | Array of member IDs to add to the group          |
| `groupId`           | Target group ID (0 creates new group)            |

- **Access Control:**
  - Only callable by the Governor contract.
- **Events:**
  - Emits `AssessorAddedToGroup` for each assessor added.

---

### `setGroupMetadata`

Sets IPFS metadata for a group.

```solidity
function setGroupMetadata(
  uint groupId,
  bytes32 ipfsMetadata
) external override onlyContracts(C_GOVERNOR) { ... }
```

| Parameter      | Description                                 |
| -------------- | ------------------------------------------- |
| `groupId`      | The ID of the group to update               |
| `ipfsMetadata` | The IPFS hash containing group metadata    |

- **Access Control:**
  - Only callable by the Governor contract.
- **Events:**
  - Emits `GroupMetadataSet` event.

---

### `removeAssessorFromGroup`

Removes an assessor from a specific group.

```solidity
function removeAssessorFromGroup(
  uint assessorMemberId,
  uint groupId
) external override onlyContracts(C_GOVERNOR) { ... }
```

| Parameter           | Description                                |
| ------------------- | ------------------------------------------ |
| `assessorMemberId`  | The member ID of the assessor to remove   |
| `groupId`           | The ID of the group to remove from        |

- **Access Control:**
  - Only callable by the Governor contract.
- **Events:**
  - Emits `AssessorRemovedFromGroup` event.

---

### `removeAssessorFromAllGroups`

Removes an assessor from all groups they belong to.

```solidity
function removeAssessorFromAllGroups(
  uint assessorMemberId
) external override onlyContracts(C_GOVERNOR) { ... }
```

| Parameter          | Description                               |
| ------------------ | ----------------------------------------- |
| `assessorMemberId` | The member ID of the assessor to remove  |

- **Access Control:**
  - Only callable by the Governor contract.
- **Events:**
  - Emits `AssessorRemovedFromGroup` for each group the assessor is removed from.

---

### `setAssessingGroupIdForProductTypes`

Sets assessing group id for multiple product types.

```solidity
function setAssessingGroupIdForProductTypes(
  uint[] calldata productTypeIds,
  uint groupId
) external override onlyContracts(C_GOVERNOR) { ... }
```

| Parameter        | Description                                                   |
| ---------------- | ------------------------------------------------------------- |
| `productTypeIds` | Array of product type IDs to configure                       |
| `groupId`        | The assessing group ID responsible for these product types    |

- **Access Control:**
  - Only callable by the Governor contract.
- **Events:**
  - Emits `AssessingGroupForProductTypeSet` for each product type.

---

### `undoVotes`

Undoes votes cast by an assessor on multiple claims.

```solidity
function undoVotes(
  uint assessorMemberId,
  uint[] calldata claimIds
) external override onlyContracts(C_GOVERNOR) { ... }
```

| Parameter          | Description                                        |
| ------------------ | -------------------------------------------------- |
| `assessorMemberId` | The member ID of the assessor whose votes to undo |
| `claimIds`         | Array of claim IDs to undo votes for              |

- **Access Control:**
  - Only callable by the Governor contract.
- **Events:**
  - Emits `VoteUndone` for each vote undone.

---

### `castVote`

Allows an assessor to cast a vote on a claim.

```solidity
function castVote(
  uint claimId,
  bool voteSupport,
  bytes32 ipfsHash
) external override whenNotPaused(PAUSE_ASSESSMENTS) { ... }
```

| Parameter     | Description                                                    |
| ------------- | -------------------------------------------------------------- |
| `claimId`     | The unique identifier for the claim to vote on                |
| `voteSupport` | The assessor's vote; `true` to accept, `false` to deny        |
| `ipfsHash`    | IPFS hash containing off-chain metadata or reasoning          |

- **Access Control:**
  - Only callable by members who are assessors for the claim's assigned group.
- **Behavior:**
  - Reverts if voting period has ended or if assessor has already voted.
- **Events:**
  - Emits `VoteCast` event.

---

### `startAssessment`

Initiates a new assessment for a claim.

```solidity
function startAssessment(
  uint claimId,
  uint productTypeId,
  uint cooldownPeriod
) external override onlyContracts(C_CLAIMS) { ... }
```

| Parameter        | Description                                  |
| ---------------- | -------------------------------------------- |
| `claimId`        | Unique identifier for the claim              |
| `productTypeId`  | Type of product the claim is for             |
| `cooldownPeriod` | Cooldown period for the given product type   |

- **Access Control:**
  - Only callable by the Claims contract.
- **Behavior:**
  - Reverts if an assessment already exists for the given claimId.
- **Events:**
  - Emits `AssessmentStarted` event.

---

### `extendVotingPeriod`

Extends the voting period for a claim, starting a new full voting window.

```solidity
function extendVotingPeriod(uint claimId) external override onlyContracts(C_GOVERNOR) { ... }
```

| Parameter | Description                                |
| --------- | ------------------------------------------ |
| `claimId` | The unique identifier for the claim        |

- **Access Control:**
  - Only callable by the Governor contract.
- **Events:**
  - Emits `VotingEndChanged` event.

---

### `closeVotingEarly`

Allows for the early closing of a claim's voting period if all assessors have cast their votes.

```solidity
function closeVotingEarly(uint claimId) external override { ... }
```

| Parameter | Description                                |
| --------- | ------------------------------------------ |
| `claimId` | The unique identifier for the claim        |

- **Behavior:**
  - Can only be called if all assigned assessors have cast their votes.
  - Sets the assessment's `votingEnd` to the current block timestamp.
- **Events:**
  - Emits `VotingEndChanged` event.

---

## View Functions

### `getGroupsCount`

Returns the total number of assessor groups.

```solidity
function getGroupsCount() external view override returns (uint groupCount) { ... }
```

- **Returns:**
  - The current number of assessor groups.

---

### `getGroupAssessorCount`

Returns the number of assessors in a specific group.

```solidity
function getGroupAssessorCount(
  uint groupId
) public view returns (uint assessorCount) { ... }
```

| Parameter | Description                      |
| --------- | -------------------------------- |
| `groupId` | The ID of the group to query     |

- **Returns:**
  - The number of assessors in the group.

---

### `getGroupAssessors`

Returns all assessor member IDs in a specific group.

```solidity
function getGroupAssessors(
  uint groupId
) public view returns (uint[] memory assessorMemberIds) { ... }
```

| Parameter | Description                      |
| --------- | -------------------------------- |
| `groupId` | The ID of the group to query     |

- **Returns:**
  - Array of assessor member IDs in the group.

---

### `isAssessorInGroup`

Checks if an assessor is a member of a specific group.

```solidity
function isAssessorInGroup(
  uint assessorMemberId,
  uint groupId
) external view override returns (bool) { ... }
```

| Parameter           | Description                        |
| ------------------- | ---------------------------------- |
| `assessorMemberId`  | The member ID of the assessor      |
| `groupId`           | The ID of the group to check       |

- **Returns:**
  - True if the assessor is in the group, false otherwise.

---

### `getGroupsForAssessor`

Returns all group IDs that an assessor belongs to.

```solidity
function getGroupsForAssessor(
  uint assessorMemberId
) external view override returns (uint[] memory groupIds) { ... }
```

| Parameter           | Description                        |
| ------------------- | ---------------------------------- |
| `assessorMemberId`  | The member ID of the assessor      |

- **Returns:**
  - Array of group IDs the assessor belongs to.

---

### `isAssessor`

Checks if a given member ID belongs to at least one assessor group.

```solidity
function isAssessor(
  uint assessorMemberId
) external view override returns (bool) { ... }
```

| Parameter           | Description                        |
| ------------------- | ---------------------------------- |
| `assessorMemberId`  | The ID of the member to check      |

- **Returns:**
  - True if the member is an assessor, false otherwise.

---

### `getGroupsData`

Returns detailed information for multiple groups.

```solidity
function getGroupsData(
  uint[] calldata groupIds
) external view override returns (AssessmentGroupView[] memory groups) { ... }
```

| Parameter  | Description                        |
| ---------- | ---------------------------------- |
| `groupIds` | Array of group IDs to query        |

- **Returns:**
  - Array of group data including metadata and assessors.

---

### `getAssessingGroupIdForProductType`

Returns assessor group for a given product type.

```solidity
function getAssessingGroupIdForProductType(
  uint productTypeId
) external view override returns (uint assessingGroupId) { ... }
```

| Parameter        | Description                        |
| ---------------- | ---------------------------------- |
| `productTypeId`  | The product type identifier        |

- **Returns:**
  - assessing group ID.

---

### `getAssessment`

Returns the full assessment data for a claim.

```solidity
function getAssessment(
  uint claimId
) external view override returns (Assessment memory assessment) { ... }
```

| Parameter | Description                        |
| --------- | ---------------------------------- |
| `claimId` | The ID of the claim to query       |

- **Returns:**
  - The complete assessment data including votes and timing.

---

### `minVotingPeriod`

Returns the minimum voting period (legacy compatibility).

```solidity
function minVotingPeriod() external pure returns (uint) { ... }
```

- **Returns:**
  - The minimum voting period in seconds (3 days).

---

### `ballotOf`

Returns the ballot for a given claim and assessor.

```solidity
function ballotOf(
  uint claimId,
  uint assessorMemberId
) external view override returns (Ballot memory) { ... }
```

| Parameter           | Description                        |
| ------------------- | ---------------------------------- |
| `claimId`           | The claim identifier               |
| `assessorMemberId`  | The member ID of the assessor      |

- **Returns:**
  - The Ballot struct for the assessor on the claim.

---

### `getBallotsMetadata`

Returns the ballot metadata for a given claim and assessor.

```solidity
function getBallotsMetadata(
  uint claimId,
  uint assessorMemberId
) external view override returns (bytes32) { ... }
```

| Parameter           | Description                        |
| ------------------- | ---------------------------------- |
| `claimId`           | The claim identifier               |
| `assessorMemberId`  | The member ID of the assessor      |

- **Returns:**
  - The IPFS hash containing off-chain metadata for the vote.

---

## Events

- **`AssessingGroupForProductTypeSet(uint indexed productTypeId, uint indexed groupId)`**
  Emitted when a product type is assigned to an assessor group.

- **`AssessorAddedToGroup(uint indexed groupId, uint assessorMemberId)`**
  Emitted when an assessor is added to a group.

- **`AssessorRemovedFromGroup(uint indexed groupId, uint assessorMemberId)`**
  Emitted when an assessor is removed from a group.

- **`GroupMetadataSet(uint indexed groupId, bytes32 ipfsMetadata)`**
  Emitted when group metadata is updated.

- **`AssessmentStarted(uint indexed claimId, uint assessorGroupId, uint start, uint end)`**
  Emitted when a new assessment is started for a claim.

- **`VoteCast(uint indexed claimId, address indexed assessor, uint indexed assessorMemberId, bool support, bytes32 ipfsHash)`**
  Emitted when an assessor casts a vote on a claim.

- **`VoteUndone(uint indexed claimId, uint indexed assessorMemberId)`**
  Emitted when a vote is undone by governance.

- **`VotingEndChanged(uint indexed claimId, uint newEnd)`**
  Emitted when the voting end time is changed (extended or closed early).

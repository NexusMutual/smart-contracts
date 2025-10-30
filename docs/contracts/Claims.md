# Claims

## Overview

The `Claims` contract enables cover owners to **submit claims** and **redeem payouts** if their claim are accepted.

Claims go through an assessment process where an assigned assessing group votes whether to approve or deny a claim. The assessors within this assessing group are trusted and vetted industry professionals, approved by the Advisory Board.

## Key Concepts

### Claims Timeline

1. Claim is submitted within the cover grace period
2. Assessment voting period: starts after claim submission
3. Cooldown before payout: starts after assessment voting period ends
4. Redemption period: starts after cooldown period. the claimant can withdraw their payout on an approved claim within this period
   - If not redeemed in time: The payout expires and **cannot be claimed**

### Grace Period

Each cover product type has a defined grace period which determines the time window during which a claimant can still submit a claim.

### ETH Deposit

Claimants are required to deposit 0.05 ETH when submitting a claim.

### Claim Status

1. **VOTING:** The claim is submitted and under assessment voting
2. **COOLDOWN:** During this period the assessment votes are reviewed for any fraud
3. **FINALIZED:** The assessment outcome is finalized

### Claim Outcome

1. **PENDING:** The claim is still under assessment (no outcome yet)
2. **ACCEPTED:** The claim has been approved
   - the claimant can redeem payout if its within the redemption period
   - the claim deposit is refunded back to the claimant
3. **DENIED:** The claim has been rejected
   - no payout
   - claim deposit is NOT returned to claimant
4. **DRAW** no majority vote reached
   - no payout
   - the claimant can retrieve their deposit back by calling `retrieveDeposit`

### Pause Functionality

The Claims contract includes a pause mechanism for emergency situations. When paused, the following functions are disabled:
- `submitClaim`: New claims cannot be submitted
- `redeemClaimPayout`: Payouts cannot be redeemed
- `retrieveDeposit`: Deposits cannot be retrieved

This pause functionality provides a safety mechanism to protect the protocol during critical situations or when fraudulent activity is detected.

## Mutative Functions

### `submitClaim`

Submits a claim for assessment for a specific cover.

```solidity
function submitClaim(
  uint32 coverId,
  uint96 requestedAmount,
  bytes32 ipfsMetadata
) external payable override whenNotPaused(PAUSE_CLAIMS) returns (Claim memory claim) { ... }
```

| Parameter         | Description                                                      |
| ----------------- | ---------------------------------------------------------------- |
| `coverId`         | Cover identifier                                                 |
| `requestedAmount` | The requested claim payout amount                                |
| `ipfsMetadata`    | IPFS hash that stores metadata about the claim for proof of loss |

- **Access Control:**
  - Only callable by members who own the cover NFT.
- **Behavior:**
  - Requires a claim deposit fee of 0.05 ETH.
  - Validates that no other claim is being assessed for the same cover.
  - Validates the claim is within the grace period.
  - Starts the assessment process.
- **Returns:**
  - The created `Claim` struct.
- **Events:**
  - Emits `ClaimSubmitted` event.
  - Emits `MetadataSubmitted` event if `ipfsMetadata` is provided.

---

### `redeemClaimPayout`

Redeems claim payouts and sends assessment deposit back for accepted claims.

```solidity
function redeemClaimPayout(
  uint claimId
) external override onlyMember whenNotPaused(PAUSE_CLAIMS) { ... }
```

| Parameter | Description      |
| --------- | ---------------- |
| `claimId` | Claim identifier |

- **Access Control:**
  - Only callable by members who own the cover NFT for the claim.
- **Behavior:**
  - Must be within the redemption period after assessment cooldown ends.
  - Claim must be accepted and not already redeemed.
  - Burns staked tokens and sends payout in cover asset.
- **Events:**
  - Emits `ClaimPayoutRedeemed` event.
  - Emits `ClaimDepositRetrieved` event.

---

### `retrieveDeposit`

Allows the cover owner to retrieve their claim deposit if their claim is resolved as DRAW.

```solidity
function retrieveDeposit(
  uint claimId
) external override whenNotPaused(PAUSE_CLAIMS) { ... }
```

| Parameter | Description      |
| --------- | ---------------- |
| `claimId` | Claim identifier |

- **Behavior:**
  - Can be called by anyone, but deposit is transferred to current cover NFT owner.
  - Only available for claims with DRAW outcome.
  - Deposit must not have been already retrieved.
- **Events:**
  - Emits `ClaimDepositRetrieved` event.

---

### `initialize`

Initializes the contract with the last claim ID from previous `IndividualClaims` contract

```solidity
function initialize(
  uint lastClaimId
) external onlyContracts(C_GOVERNOR) { ... }
```

| Parameter     | Description                                   |
| ------------- | --------------------------------------------- |
| `lastClaimId` | The last claim ID from the previous contract  |

- **Access Control:**
  - Only callable by the Governor contract.
- **Behavior:**
  - Can only be called once during contract initialization.

---

## View Functions

### `getClaimsCount`

Returns the total number of claims created.

```solidity
function getClaimsCount() external override view returns (uint) { ... }
```

- **Returns:**
  - The total count of claims.

---

### `getClaim`

Returns the claim data for a specific claim ID.

```solidity
function getClaim(
  uint claimId
) external override view returns (Claim memory) { ... }
```

| Parameter | Description                   |
| --------- | ----------------------------- |
| `claimId` | The claim identifier to query |

- **Returns:**
  - The `Claim` struct containing claim details.

---

### `getClaimDetails`

Returns comprehensive claim information including cover, assessment and status data.

```solidity
function getClaimDetails(
  uint claimId
) external view returns (ClaimDetails memory) { ... }
```

| Parameter | Description                   |
| --------- | ----------------------------- |
| `claimId` | The claim identifier to query |

- **Returns:**
  - A `ClaimDetails` struct containing:
    - `claimId`: The claim identifier
    - `claim`: The claim data
    - `cover`: Associated cover data
    - `assessment`: Assessment data
    - `status`: Current assessment status
    - `outcome`: Assessment outcome
    - `redeemable`: Whether the claim can be redeemed
    - `ipfsMetadata`: IPFS metadata hash
- **Behavior:**
  - Designed for user interfaces to get all relevant claim information in a single call.

---

### `getMemberClaims`

Returns all claim IDs submitted by a specific member.

```solidity
function getMemberClaims(
  uint memberId
) external view returns (uint[] memory) { ... }
```

| Parameter  | Description                        |
| ---------- | ---------------------------------- |
| `memberId` | The member ID to query claims for  |

- **Returns:**
  - Array of claim IDs submitted by the member.

---

## Events

- **`ClaimSubmitted(address indexed user, uint claimId, uint indexed coverId, uint productId)`**
  Emitted when a new claim is submitted.

- **`MetadataSubmitted(uint indexed claimId, bytes32 ipfsMetadata)`**
  Emitted when IPFS metadata is provided with a claim submission.

- **`ClaimPayoutRedeemed(address indexed user, uint amount, uint claimId, uint coverId)`**
  Emitted when a claim payout is successfully redeemed.

- **`ClaimDepositRetrieved(uint indexed claimId, address indexed user)`**
  Emitted when a claim deposit is retrieved (either after payout or for DRAW outcome).

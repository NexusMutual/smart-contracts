# Claims & Assessment

## 1. Submit Claim Flow

```mermaid
graph TD
    %% Users
    Member(("Cover Buyer"))

    %% Contracts
    IndividualClaims["IndividualClaims Contract"]
    Assessment["Assessment Contract"]
    Cover["Cover Contract"]
    CoverNFT["CoverNFT Contract"]

    %% Submit Claim
    Member -->|"**(1a)** submitClaim"| IndividualClaims
    IndividualClaims -->|"**(1b)** validate cover"| CoverNFT
    IndividualClaims -->|"**(1c)** validate amount"| Cover
    IndividualClaims -->|"**(1d)** startAssessment"| Assessment
```

## 2. Assessment & Redemption Flow

```mermaid
graph TD
    %% Users
    Member(("Cover Buyer"))
    Assessor(("Claim Assessor"))

    %% Contracts
    IndividualClaims["IndividualClaims Contract"]
    Assessment["Assessment Contract"]
    Cover["Cover Contract"]
    TokenController["TokenController"]
    Pool["Pool"]

    %% Assessment Process
    Assessor -->|"**(2a)** castVotes"| Assessment
    Assessment -->|"**(2b)** lock staked NXM"| TokenController

    %% Claim Payout
    Member -->|"**(3a)** redeemClaimPayout"| IndividualClaims
    IndividualClaims -->|"**(3b)** validate claim status"| Assessment
    IndividualClaims -->|"**(3c)** burnStake"| Cover
    IndividualClaims -->|"**(3d)** sendPayout"| Pool
    Pool -.->|"**(3e)** transfer claim amount + deposit"| Member
```

## Actions

### Quick Summary:

1. Cover buyers can submit claims and redeem payouts
2. Claim assessors vote on claim validity
3. Approved claims receive payouts in cover asset

### 1. Cover Buyer Actions

1. **Submit Claim**

   - Call `submitClaim` on IndividualClaims to request a payout
   - Provide:
     - Cover ID
     - Claim amount
     - Incident date
     - Proof of loss
   - Pay claim assessment deposit in ETH

2. **Redeem Approved Claim**
   - Wait for assessment period to complete
   - If claim is approved, call `redeemClaimPayout` on IndividualClaims
   - Receive:
     - Claim amount in cover asset
     - Assessment deposit returned in ETH

### 2. Claim Assessor Actions

1. **Vote on Claims**
   - Call `castVotes` on Assessment contract
   - Specify:
     - Claim ID
     - Vote (Accept/Reject)
     - Stake amount
   - NXM stake is locked during voting period

---

## Claim Submission & Processing

1. **Submit Claim**
   **(1a)** `Cover Buyer` calls `submitClaim` on IndividualClaims
   **(1b)** `IndividualClaims` validates cover ownership via CoverNFT
   **(1c)** `IndividualClaims` validates claim amount via Cover
   **(1d)** `IndividualClaims` starts assessment process

2. **Assessment Process**
   **(2a)** `Assessors` call `castVotes` on Assessment
   **(2b)** `Assessment` locks staked NXM via TokenController for voting period

3. **Claim Payout**
   **(3a)** `Cover Buyer` calls `redeemClaimPayout` on IndividualClaims
   **(3b)** `IndividualClaims` validates with Assessment:

   - Assessment period has ended
   - More accept votes than deny votes
   - Cooldown period has passed

   **(3c)** `IndividualClaims` calls Cover to burn stake from affected pools
   **(3d)** `IndividualClaims` sends payout via Pool
   **(3e)** `Pool` transfers:

   - Claim amount in cover asset
   - Returns assessment deposit in ETH

## Notes

- Claims can be submitted before the grace period ends (cover expiry + grace period days)
- Assessment period has a fixed duration for voting
- Claimant deposits ETH when submitting a claim:
  - Deposit is returned to claimant if claim is approved
  - Deposit is distributed to assessors if claim is rejected
- Approved claims burn staked NXM from affected staking pools

## Nexus Mutual Platform Flow Diagram

This document merges multiple **Cover** and **Staking** flows with their underlying interactions across **Token**, **Capital**, **Claims/Assessment**, and **Governance** groupings. We use two comprehensive flows:

1. Buying Cover and Processing Claims
   - Includes:
     - Buying Cover (**Cover ↔ Token ↔ Capital**)
     - Submitting and Assessing Claims (**Claims/Assessment ↔ Cover ↔ Capital ↔ Governance**)
2. Staking Pool Management and Staking Lifecycle
   - Includes:
     - Pool creation and product listing (**Staking ↔ Token**)
     - Stakers redeeming rewards (**Staking ↔ Token**)
     - Burning NXM on approved claims (**Claims/Assessment ↔ Staking ↔ Token**)

We provide detailed steps and a **Mermaid diagram** for each flow, ensuring step numbering in both the **text description** and **diagrams** for clarity. Code blocks are **escaped** so they remain valid raw markdown.

---

## Buying Cover & Processing Claims

```mermaid
flowchart LR
    %% Actors & Contracts
    Buyer("Cover Buyer")
    subgraph "Cover Group"
      CoverC("Cover")
      CoverP("CoverProducts")
      CoverN("CoverNFT")
    end

    subgraph "Token Group"
      TC("TokenController")
      NXM("NXMToken")
    end

    subgraph "Capital Group"
      PoolC("Pool")
    end

    subgraph "Staking Group"
      SP("StakingPool")
    end

    subgraph "Governance Group"
      MR("MemberRoles")
    end

    subgraph "Claims/Assessment Group"
      IndClaims("IndividualClaims")
      Assess("Assessment")
      Assessor("Assessor")
    end

    %% 1. Buy Cover (single tx)
    Buyer -->|"**(1a)** buyCover()"| CoverC
    CoverC -->|"**(1b)** onlyMember check"| MR
    CoverC -->|"**(1c)** get product info"| CoverP
    CoverC -->|"**(1d)** mint Cover NFT"| CoverN
    CoverN -->|"**(1e)** issue NFT"| Buyer
    CoverC -->|"**(1f)** request allocations"| SP
    CoverC -->|"**(1g)** handle payment"| TC
    TC -->|"**(1g)** burn NXM or transfer ETH/ERC20"| PoolC

    %% 2. Submit Claim (single tx)
    Buyer -->|"**(2a)** submitClaim()"| IndClaims
    IndClaims -->|"**(2b)** validate isApprovedOrOwner()"| CoverN
    IndClaims -->|"**(2b)** validate amount"| CoverC
    IndClaims -->|"**(2c)** startAssessment()"| Assess

    %% 3. Assessment Process (multiple tx)
    Assessor -->|"**(3a)** castVotes()"| Assess
    Assess -->|"**(3b)** lock staked NXM"| TC
    TC -->|"**(3b)** lock"| NXM

    %% 4. Claim Payout (single tx)
    Buyer -->|"**(4a)** redeemClaimPayout()"| IndClaims
    IndClaims -->|"**(4b)** burnStake()"| CoverC
    IndClaims -->|"**(4c)** sendPayout()"| PoolC
    PoolC -->|"**(4c)** transfer claim amount + deposit"| Buyer
```

### Step-by-Step

1. **Buyer Purchases Cover**<br>
   **(1a)** `Buyer` calls `buyCover(params, poolAllocationRequests)` on **Cover**.<br>
   **(1b)** `Cover` checks if buyer is a member via `onlyMember` modifier.<br>
   **(1c)** `Cover` gets product info from **CoverProducts**.<br>
   **(1d)** `Cover` mints NFT via **CoverNFT** if new cover.<br>
   **(1e)** `CoverNFT` issues NFT to buyer.<br>
   **(1f)** `Cover` requests allocations from **StakingPool**(s).<br>
   **(1g)** `Cover` handles payment:<br>
   - For NXM: Burns premium via **TokenController**<br>
   - For ETH/ERC20: Transfers premium to **Pool**

2. **Buyer Submits Claim**<br>
   **(2a)** `Buyer` calls `submitClaim()` on **IndividualClaims**.<br>
   **(2b)** `IndividualClaims` validates:

   - Cover ownership via `CoverNFT.isApprovedOrOwner()`
   - Cover validity via `Cover.coverSegmentWithRemainingAmount()`

   **(2c)** `IndividualClaims` starts assessment via `Assessment.startAssessment()`.<br>

3. **Claim Assessment**<br>
   **(3a)** `Assessors` call `castVotes()` on **Assessment**.<br>
   **(3b)** `Assessment` locks staked NXM via **TokenController**.<br>
   **(3c)** When voting ends:<br>

   - If accepted: Claim can be redeemed<br>
   - If denied: Claim deposit funds rewards<br>

4. **Claim Payout**<br>
   **(4a)** `Buyer` calls `redeemClaimPayout()` on **IndividualClaims**.<br>
   **(4b)** `IndividualClaims` calls `Cover.burnStake()` to burn staker's NXM.<br>
   **(4c)** `IndividualClaims` calls `Pool.sendPayout()` which:<br>
   - Transfers claim amount in cover asset<br>
   - Returns assessment deposit in ETH

---

## Staking Pool Management & Staking Lifecycle

```mermaid
flowchart LR
    %% Actors & Contracts
    Manager(("Pool Manager"))
    Staker(("Staker"))
    Claimant(("Claimant"))


    subgraph "Staking Group"
      SPF("StakingPoolFactory")
      SP("StakingPool")
      SPd("StakingProducts")
    end

    subgraph "Token Group"
      TCO("TokenController")
      NXM("NXMToken")
    end

    subgraph "Claims/Assessment Group"
      IC("IndividualClaims")
      AS("Assessment")
    end

    subgraph "Cover Group"
      CoverC("Cover")
    end

    subgraph "Capital Group"
      PoolC("Pool")
    end

    %% 1. Create Pool (single tx)
    Manager -->|"**(1a)** createStakingPool()"| SPd
    SPd -->|"**(1b)** create()"| SPF
    SPF -->|"**(1c)** deploys"| SP
    SPd -->|"**(1d)** assignManager"| TCO
    SPd -->|"**(1e)** setInitialProducts"| SP

    %% 2. Update Products (single tx)
    Manager -->|"**(2a)** setProducts()"| SPd
    SPd -->|"**(2b)** updates weights & prices"| SP

    %% 3. Deposit NXM (single tx)
    Staker -->|"**(3a)** depositTo()"| SP
    SP -->|"**(3b)** depositStakedNXM()"| TCO
    TCO -->|"**(3c)** operatorTransfer()"| NXM

    %% 4. Withdraw (single tx)
    Staker -->|"**(4a)** withdraw()"| SP
    SP -->|"**(4b)** withdrawNXMStakeAndRewards()"| TCO
    TCO -->|"**(4c)** transfer"| NXM
    TCO -->|"**(4d)** transfer stake + rewards"| Staker

    %% 5. Burn and Payout on Claim (single tx)
    Claimant -->|"**(5a)** redeemClaimPayout()"| IC
    IC -->|"**(5b)** burnStake()"| CoverC
    CoverC -->|"**(5c)** burnStake()"| SP
    SP -->|"**(5d)** burnStakedNXM()"| TCO
    TCO -->|"**(5e)** burn()"| NXM
    IC -->|"**(5f)** sendPayout()"| PoolC
    PoolC -->|"**(5f)** transfer claim amount + deposit"| Claimant
```

### Step-by-Step

1. **Pool Manager Creates a New Staking Pool**<br>
   **(1a)** `Manager` calls `"createStakingPool()"` on **StakingProducts**.<br>
   **(1b)** `StakingProducts` calls `"create()"` on **StakingPoolFactory**.<br>
   **(1c)** `StakingPoolFactory` deploys new **StakingPool**.<br>
   **(1d)** `StakingProducts` assigns manager via **TokenController**.<br>
   **(1e)** `StakingProducts` sets initial products and metadata.<br>
2. **Manager Updates Pool Products**<br>
   **(2a)** `Manager` calls `"setProducts()"` on **StakingProducts**.<br>
   **(2b)** `StakingProducts` updates weights and prices in **StakingPool**.<br>
3. **Staker Deposits NXM**<br>
   **(3a)** `Staker` calls `"depositTo(amount, trancheId, tokenId, dest)"` on **StakingPool**.<br>
   **(3b)** `StakingPool` validates and calculates shares, calls `"depositStakedNXM()"` on **TokenController**.<br>
   **(3c)** `TokenController` updates pool balance and calls `"operatorTransfer()"` on **NXMToken**.<br>
4. **Staker Withdraws Stake/Rewards**<br>
   **(4a)** `Staker` calls `"withdraw()"` on **StakingPool**.<br>

   - _Optional_: Check withdrawable amounts first via **NexusViewer** (`"getClaimableNXM()"`, `"getStakedNXM()"`)<br>

   **(4b)** `StakingPool` calculates amounts, calls `"withdrawNXMStakeAndRewards()"` on **TokenController**.<br>
   **(4c)** `TokenController` calls transfers on **NXMToken**.<br>
   **(4d)** `NXMToken` transfer stake + rewards to **Staker**<br>
5. **Claim Redemption Burns Stake and Pays Claimant**<br>
   If a claim is approved the claimant is paid from the staked NXM.<br>
   **(5a)** `Claimant` calls `"redeemClaimPayout()"` on **IndividualClaims**.<br>
   **(5b)** `IndividualClaims` calls `"burnStake()"` on **Cover**.<br>
   **(5c)** `Cover` calls `"burnStake()"` on affected **StakingPool**(s).<br>
   **(5d)** `StakingPool` calls `"burnStakedNXM()"` on **TokenController**.<br>
   **(5e)** `TokenController` burns tokens via **NXMToken**.<br>
   **(5f)** `IndividualClaims` calls `"Pool.sendPayout()"` which:<br>
   - Transfers claim amount in cover asset<br>
   - Returns assessment deposit in ETH

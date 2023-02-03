# V2 Launch Checklist

## Open Questions
- Where/ what address do we call contracts functions from during the upgrade?
- Where do we run the scripts?

## Pre-requisites
1. [ ] No claims / incidents in progress

## Dependencies
1. [ ] NFT indexer
2. [ ] Cover router
3. [ ] Other APIs?

## Actions before upgrade

### Scripts
- [ ] Have all the scripts needed ready in `/v2-migration` folder
  - [ ] `get-governance-rewards.js`
  - [ ] `get-legacy-assessment-rewards.js`
  - [ ] `get-locked-in-v1-claim-assessment.js`
  - [ ] `get-v1-cover-prices.js`
  - [ ] `get-products.js`
  - [ ] `populate-v2-products.js`
  - [ ] `get-withdrawable-cover-notes.js`

### Products [Status: in progress]
**What we need**
1. `ProductsV1.sol`: a contract containing a mapping between V1 product IDs (contract addresses) 
   and V2 product IDs 
  (numerical)
2. IPFS data uploaded for `productTypes` and `products` info 
3. Tx data for AB to write onchain all V2 `productTypes` and `products` info

**How we get it**

#1
- [x] Run `scripts/v2-migration/products/get-products.js`
  - [x] Generate `scripts/v2-migration/products/output/v2ProductAddresses.json` - a subset of V1 products that are either _not deprecated_ or _deprecated, but have covers that are active / in grace period_
  - [x] Generate `ProductsV1.sol` - a contract that includes a mapping between V1 product IDs (i.e. contract addresses) and V2 product IDs (numerical IDs)
- [ ] Check `ProductsV1.sol` data
- [x] Check `v2-migration/products/output/v2ProductAddresses.json` data against the list of all products below

#2
- [x] [List of all product types + metadata](https://docs.google.com/spreadsheets/d/1mhPPdmVyGTZHfhnCTK9pkyuVCwIFm5JtKiTa011e9g8/edit#gid=0) 
  - [ ] store product type name onchain in a mapping
- [x] [List of all products + metadata](https://docs.google.com/spreadsheets/d/1mhPPdmVyGTZHfhnCTK9pkyuVCwIFm5JtKiTa011e9g8/edit#gid=1826493151)
  - [ ] store the product name onchain in a mapping
- [x] IPFS structure for `productTypes` info:
  - store the cover wording PDF on IPFS and use that IPFS hash
- [x] IPFS structure for `products` info
  - store the product exclusions on IPFS: {"exclusions": "Exclusion 1", "Exclusion 2", ...} - can be found [here](https://docs.google.com/spreadsheets/d/1mhPPdmVyGTZHfhnCTK9pkyuVCwIFm5JtKiTa011e9g8/edit#gid=1755020585) 
- [ ] **In review** Script to generate and upload all the above to IPFS
  - Need to adapt: https://github.com/NexusMutual/smart-contracts/blob/782d93cf42dbc12d579b8625f3ec9b8d2c8c645f/scripts/populate-v2-products.js#L34
- [ ] Upload the above to IPFS

#3
- [ ] **TODO** Format input for `setProducts()` and `setProductTypes()` functions 
- [ ] **TODO**: Script to create the tx data for AB to write `products` and `productTypes` info 
  onchain - we need to modify a bit `scripts/populate-v2-products.js` for this
- [ ] Simulate the above txs in the fork test

### Rewards
**What we need**
1. List of all V1 assessment rewards
2. ... TBD

**How we get it**
- [ ] Run `get-legacy-assessment-rewards.js` to automatically populate `LegacyClaimsRewards.sol` with the list of addresses we reimburse with the assessment rewards.
  - [ ] Check `LegacyClaimsRewards.sol`
 
### Staking Pools - WIP
- [ ] List of initial syndicate operators and their migration strategy
  - [ ] Final inputs [here](https://docs.google.com/spreadsheets/d/1ebhsVWjc18rQJpGLMzRfmzRwwYzND7_6Q0A9zOlADvE)
- [ ] Update `migrateToNewV2Pool` in `LegacyPooledStaking.sol` with the above info 

### Onchain
- [ ] **Add new proposal category**: 42 Add new contracts
- [ ] **Add new proposal category**: 43 Remove contracts
- [ ] **Edit proposal category** 41 (Set Asset Swap Details). It needs the new function signature in
   order to modify limits used by `SwapOperator.sol`. 
  - [ ] **TODO** double check if needed

## Contract Deployment

**Deployment & verification**
Any time
- [ ] `ProductsV1.sol` [non-internal]
- [ ] `CoverNFT.sol` [non-internal] - *NFT symbols
- [ ] `Assessment.sol` [AS] (must be done after `CoverNFT.sol`)
- [ ] `IndividualClaims.sol` [IC] (must be done after `CoverNFT.sol`)
- [ ] `YieldTokenIncidents.sol` [YT] (must be done after `CoverNFT.sol`)
- [ ] `SwapOperator.sol` [non-internal]  
- [ ] `PriceFeedOracle.sol` [non-internal]
- [ ] `Pool.sol` [P1] (must be done after `SwapOperator.sol` and `PriceFeedOracle.sol`)
  - [ ] !!! Contact Enzyme to whitelist the new Pool contract as receiver for the vault
- [ ] `Governance.sol`[GV]
- [ ] `CoverInitializer.sol` [CO]
- [ ] `NXMaster.sol` [NXMaster]
- [ ] `MCR.sol` [MC]
- [ ] `MemberRoles.sol` [MR]
- [ ] `Gateway.sol` [GW]
- [ ] `CoverMigrator.sol`
- [ ] `CoverViewer.sol`
- [ ] `LegacyClaimsReward.sol` [CR]
- [ ] `TokenController.sol` [TC] (must be done after `LegacyClaimsReward.sol`)

After `CoverInitializer.sol` is upgraded(!)
- [ ] `StakingPoolFactory.sol`
- [ ] `StakingNFT.sol` - *NFT symbols
- [ ] `StakingPool.sol` 
- [ ] `LegacyPooledStaking.sol` [PS]
- [ ] `Cover.sol` [CO] (must be done after `StakingNFT.sol`)

## Upgrade

### Pre-upgrade
- [ ] Turn off the quote engine
- [ ] Turn off the UI

### Upgrade
---------- Proposals ----------
- [ ] **Proposal**: Upgrade `Governance.sol` to prevent governance rewards withdrawal (`upgradeMultipleContracts()`)
- [ ] **Proposal**: Add new internal contract: CoverInitializer.sol (CO). The proxy address is required to deploy the implementations of `Cover.sol` (`addNewInternalContracts()`)
- [ ] **Deploy** `StakingNFT.sol` and `StakingPool.sol` (depend on `CoverInitializer.sol`)
- [ ] **Proposal**: Upgrade master `NXMaster.sol` (`upgradeMasterAddress()`)
- [ ] **Deploy** `ClaimRewards.sol`
- [ ] **Proposal**: Upgrade existing internal contracts: MR, MC, CO, TC, PS, P1, CL (CoverMigrator.sol), GW (``)
- [ ] **Proposal**: Upgrade existing internal contract: CR (it depends on TC above)
- [ ] **Call function** `initialize()` from `Cover.sol` to set `globalCapacityRatio` and `globalRewardsRatio`

---------- Staking migration ----------
- [ ] **Call function** `blockV1()` from `LegacyPooledStaking.sol` This will prevent new deposits 
  and any changes to stake amounts.
- [ ] **Run script** to process all PS pending actions
- [ ] **Call function** `migrateToNewV2Pool` in `LegacyPooledStaking.sol` for each staker to be migrated

---------- Claim Assessment migration ----------
- [ ] **Run script** `get-locked-in-v1-claim-assesment.js` and save the output 
- [ ] **Call function** `withdrawClaimAssessmentTokens` from `TokenController.sol` and pass the addresses generated above to transfer back to them the NXM staked for V1 claim assessment
- [ ] **Call function** `transferRewards()` in `LegacyClaimRewards.sol` to transfer V1 claim assessment rewards to their owners
- [ ] **Call function** `unlistClaimsReward()` in `TokenController.sol` to blacklist the CR contract, so it can't hold NXM

---------- Proposals ----------
- [ ] **Proposal** to remove legacy internal contracts: CR, CD, IC, QD, QT, TF, TD
- [ ] **Proposal** to add new internal contracts: Assessment, IndividualClaims, 
  YieldTokenIncidents
  - TODO: can this be done in the same proposal as `CoverInitializer.sol`? 

### Post-upgrade
- [ ] Update `version-data.json` with the new contract addresses
- [ ] Start APIs
- [ ] Start the new UI



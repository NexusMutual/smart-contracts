# V2 Launch Checklist

## Pre-requisites
1. [ ] No claims / incidents in progress

## Dependencies
1. [ ] NFT indexer
2. [ ] Cover router
3. [ ] Membership worker

## Actions before upgrade

### Scripts to run before contracts deploy
1. [x] `get-v2-products.js`
  - Generates `ProductsV1.sol`
2. [x] `get-v1-cover-prices.js`
  - Generates `PricesV1.sol`
3. [x] `get-governance-rewards.js`
  - Generates codeblock in `ClaimRewards.sol`
4. [x] `upload-to-ipfs.js`
  - Uploads the product and product type info to ipfs
5. [ ] TBD 
  - Generate `setProducts()` and `setProductTypes()` txs data

### Automatically generated contracts code
1. [ ] `ProductsV1.sol`
2. [ ] `PricesV1.sol`
3. [ ] `ClaimsReward.sol` - code block addition

### Product-related prep:
1. [ ] Upload to IPFS data for `productTypes` and `products` info 
2. [ ] Have handy tx data for AB to write onchain all V2 `productTypes` and `products` info

## Contract Deployment
- [ ] `ProductsV1.sol` [non-internal]
- [ ] `PricesV1.sol` [non-internal]
- [ ] `CoverViewer.sol`[non-internal]
- [ ] `CoverNFT.sol` [non-internal] - *NFT symbols
- [ ] `Cover.sol` [CO] 
- [ ] `LegacyGateway.sol` [GW]
- [ ] `CoverMigrator.sol`[CL]

- [ ] `StakingPoolFactory.sol`
- [ ] `StakingNFT.sol` - *NFT symbols
- [ ] `StakingPool.sol` 
- [ ] `LegacyPooledStaking.sol` [PS]

- [ ] `Assessment.sol` [AS]
- [ ] `IndividualClaims.sol` [IC] 
- [ ] `YieldTokenIncidents.sol` [YT]

- [ ] `Pool.sol` [P1]
  - [ ] !!! Contact Enzyme to whitelist the new Pool contract as receiver for the vault
- [ ] `SwapOperator.sol` [non-internal]  
- [ ] `PriceFeedOracle.sol` [non-internal]
- [ ] `MCR.sol` [MC]

- [ ] `NXMaster.sol` [NXMaster]
- [ ] `Governance.sol`[GV]
- [ ] `MemberRoles.sol` [MR]
- [ ] `TokenController.sol` [TC]
- [ ] `LegacyClaimsReward.sol` [CR]

### Upgrade pre-requisites
- [ ] Turn off the quote engine & all other workers
- [ ] Turn off the UI
- [ ] Bring up V2 version-data endpoint

### Upgrade
- [ ] **Proposal**: Add new proposal category: 42 Add new contracts 
- [ ] **Proposal**: Add new proposal category: 43 Remove contracts
- [ ] **Proposal**: Upgrade master `NXMaster.sol` (`upgradeMasterAddress()`)
- [ ] **Proposal**: Add new internal contracts - CI, CG, AS, CO, SP (`addNewInternalContracts(bytes2[],address[],uint256[])`)
- [ ] **Proposal**: Upgrade existing internal contracts: MR, MCR, TC, PS, PriceFeedOracle, P1, CL (CoverMigrator), GW, CR, GV (`upgradeMultipleContracts(bytes2[],address[])`)

---------- Add new products and product types onchain ----------
- [ ] TBD

---------- Rewards migration ----------
- [ ] **Call function** `transferRewards()` in `LegacyClaimRewards.sol` to transfer V1 claim assessment rewards to their owners
- [ ] **Call function** `unlistClaimsReward()` in `TokenController.sol` to blacklist the CR contract, so it can't hold NXM

---------- Staking migration ----------
- [ ] **Run script** to push pending rewards and process all PS pending actions
- [ ] **Call function** `migrateToNewV2Pool` in `LegacyPooledStaking.sol` for each staker to be migrated

---------- Cleanup ----------
- [ ] **Proposal**: Remove internal contracts
- [ ] **Propoasl** Edit proposal category: 41 (Set Asset Swap Details). It needs the new function signature in order to modify limits used by `SwapOperator.sol`. 

### Post-upgrade
- [ ] Update `version-data.json` with the new contract addresses
- [ ] Start APIs
- [ ] Start the new UI

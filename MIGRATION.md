### Governor upgrade todos

Definitions:
- TemporaryGovernance - `TemporaryGovernance.sol` solidity contract used as temporary implementation for both Governance and Governor
- TGovernance - the old governance proxy contract with TemporaryGovernance implementation
- TGovernor - the new governor proxy contact with TemporaryGovernance implementation

phase 0: prep for ab actions
1. execute script to push old governance rewards
2. deploy registry implementation (create2) and proxy (create1) manually
3. transfer registry proxy ownership to AB safe multisig (to avoid deployer compromise risk)
4. deploy new contract implementations (create2)
   - TemporaryGovernance
   - LegacyAssessment
   - LegacyMemberRoles

phase 1: first ab actions
1. upgrade using old Governance proposal (upgrade multiple contracts):
   - upgrade Governance to TemporaryGovernance
   - upgrade Assessment to LegacyAssessment
   - upgrade MemberRoles to LegacyMemberRoles
2. batch transactions using safe multisig calling TGovernance:
   - upgrade NXMaster
   - NXMaster.transferOwnershipToRegistry
   - Registry.migrate (will also upgrade Governor to use TemporaryGovernance)

phase 2: prep for ab actions
1. execute script to push LegacyAssessment stake and rewards
2. call LegacyMemberRoles.migrateMembers
3. deploy new contract implementations (create2)
   - Pool
   - SwapOperator
   - Ramm
   - SafeTracker
   - Assessments
   - Claims
   - TokenController
   - Cover
   - CoverProducts
   - LimitOrders
   - StakingProducts
   - Governor

phase 3 (second ab action) - all are TGovernor actions except master.migrate
1. batch transactions using safe multisig calling TGovernor (todo: check gas limit)
   - upgrade contracts
     - Pool
     - SwapOperator
     - Ramm
     - SafeTracker
     - Assessments
     - Claims
     - TokenController
     - Cover
     - CoverProducts
     - LimitOrders
     - StakingProducts
   - registry.setEmergencyAdmin x6
   - registry.setKycAuthAddress
   - swapOperator.setSwapController
   - claims.initialize
   - assessments.addAssessorsToGroup (create new group for 3 assessors)
   - assessments.setAssessingGroupIdForProductTypes (set new group as assessing group for all product types)
   - cover.changeCoverNFTDescriptor to new CoverNFTDescriptor
   - master.migrate (copies assets/oracles/mcr and moves the funds!) [TGovernance action]
   - transfer Registry proxy ownership to Governor
2. safe transaction via TGovernor.execute
   - upgrade TGovernor to `Governor.sol` - in theory can be batched above

phase 4 (post phase 3 actions)
1. Singe AB member ops:
   - coverProducts.setProductTypes set assessmentCooldownPeriod and payoutRedemptionPeriod values to all product types
   - cover.populateIpfsMetadata sets covers IPFS metadata to storage
2. CoverBroker Safe Owner
   - switchMembership to new CoverBroker
   - maxApproveCoverContract for cbBTC and USDC
3. Non AB
   - memberRoles.recoverETH
4. Enzyme (via UI)
   - remove old depositors and set SwapOperator as a depositor

Total transactions for AB: 4

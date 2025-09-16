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
2. batch transactions using safe multisig calling TGovernance (todo: check gas limit):
   - upgrade NXMaster
   - NXMaster.transferOwnershipToRegistry
   - Registry.migrate (will also upgade Governor to use TemporaryGovernance)

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
   - Governor

phase 3 (second ab action)
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
   - registry.setEmergencyAdmin 1
   - registry.setEmergencyAdmin 2
   - registry.setKycAuthAddress
   - swapOperator.setSwapController
   - claims.initialize
   - master.migrate (copies assets/oracles/mcr and moves the funds!)
   - transfer registry proxy ownership to Governor
   - setup assessing groups for product types
2. safe transaction via TGovernor.execute
   - upgrade TGovernor to `Governor.sol` - in theory can be batched above

Total transactions for AB: 4

Non AB:
- memberRoles.recoverETH

Single AB member ops:
- update existing CoverProduct productTypes to add assessmentCooldownPeriod and payoutRedemptionPeriod values

Enzyme:
- remove old depositors and set SwapOperator as a depositor

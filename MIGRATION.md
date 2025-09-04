### Governor upgrade todos

phase 0 (preparation for first ab action)
1. execute script to push old governance rewards
2. deploy registry implementation (create2) and proxy (create1) manually
3. deploy new contract implementations (create2)
   - TemporaryGovernance
   - LegacyAssessment
   - LegacyMemberRoles

phase 1 (first ab action)
1. upgrade via old governor proposal (upgrade multiple contracts):
   - upgrade Governance to TemporaryGovernance
   - upgrade Assessment to LegacyAssessment
   - upgrade MemberRoles
2. execute script to push LegacyAssessment stake and rewards
3. upgrade NXMaster (AB action via tempGovernance)
4. master.transferOwnershipToRegistry (AB action via tempGovernance)
5. registry.migrate (AB action via tempGovernance)
6. transfer registry proxy ownership to Governor (deployer)

phase 2 (preparation for second ab action)
1. legacyMemberRoles.migrateMembers
2. deploy new contract implementations (create2)
   - Pool
   - SwapOperator
   - Ramm
   - SafeTracker
   - Assessment
   - Claims
   - TokenController

phase 3 (second ab action)
1. batch via tempGovernor.execute (AB action)
   - registry.setEmergencyAdmin 1
   - registry.setEmergencyAdmin 2
   - registry.setKycAuthAddress
   - upgrade contracts
     - Pool
     - SwapOperator
     - Ramm
     - SafeTracker
     - Assessment
     - Claims
     - TokenController
2. batch via tempGovernor.execute (AB action)
   - claims.initialize
   - swapOperator.setSwapController
4. memberRoles.recoverETH
5. master.migrate (AB action via tempGovernance)
6. pool.migrate (AB action via tempGovernor)

phase 4 (upgrade Governor)
1. upgrade Governor from TemporaryGovernor to Governor

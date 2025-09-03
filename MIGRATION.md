### Governor upgrade todos

phase 0 (preparation for first ab action)
1. execute script to push old governance rewards
2. deploy registry implementation (create2) and proxy (create1) manually
3. deploy TempGov, LegacyAssessment, LegacyMemberRoles implementations (create2)
4. upgrade Governance, Assessment, MemberRoles via governor proposal

phase 1 (first ab action)
1. execute script to push LegacyAssessment stake and rewards
2. upgrade NXMaster (AB action via tempGovernance)
3. master.transferOwnershipToRegistry (AB action via tempGovernance)
4. registry.migrate (AB action via tempGovernance)
5. transfer registry proxy ownership to Governor (deployer)

phase 2 (preparation for second ab action)
1. legacyMemberRoles.migrateMembers
2. deploy new Pool, SwapOperator, Ramm, StakingPool, Assessment, Claims, TokenController implementations (create2)

phase 3 (second ab action)
1. governor proposal (AB action)
   - registry.setEmergencyAdmin
   - registry.setKycAuthAddress
   - upgrade Pool, SwapOperator, Ramm, SafeTracker, Assessment, Claims, TokenController via governor proposal
   - claims.initialize
   - swapoperator.setSwapController
2. memberRoles.recoverETH
3. master.migrate (AB action via tempGovernance)
4. pool.migrate (AB action via governor proposal)

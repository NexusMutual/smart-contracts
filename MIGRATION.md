### Governor upgrade todos

phase 0 (preparation for first ab action)
- push old governance rewards
- deploy registry implementation (create2) and proxy (create1) manually
- deploy TempGov implementation (create2)

phase 1 (first ab action)
1. upgrade to TempGov using the old Governance
2. batch:
  - call registry.migrate using TempGov
  - call registry.addContract using TempGov to add Token, CoverNFT, StakingNFT
  - set emergency admins
  - set kyc address
  - upgrade master using TempGov
  - transfer of Master ownership from TempGov to Governor

phase 2 (preparation for second ab action)
- deploy new P1, SO, RA, ST, AS, CL, GV implementations
- memberRoles.migrateMembres - called with any address (deployer for ex)

phase 3 (second ab action)
1. batch:
  - call pool.migrate
  - call master.migrate using TempGov:
    - transfer internal contracts proxies' ownership
    - upgrades the capital pool
    - switches control over to Governor/Registry
  - upgrade Governor using TempGov

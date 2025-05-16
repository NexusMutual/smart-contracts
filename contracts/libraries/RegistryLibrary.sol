// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

library RegistryLibrary {

  enum ID {
    TC, // TokenController
    P1, // Pool
    MR, // MemberRoles
    MC, // MCR
    CO, // Cover
    SP, // StakingProducts
    UNUSED_PS, // LegacyPooledStaking - removed
    GV, // Governance
    UNUSED_GW, // LegacyGateway - removed
    UNUSED_CL, // CoverMigrator - removed
    AS, // Assessment
    CI, // IndividualClaims (claims for individuals)
    UNUSED_CG, // YieldTokenIncidents (claims for groups) - removed
    RA, // Ramm
    ST, // SafeTracker
    CP, // CoverProducts
    LO  // Limit Orders
  }



}

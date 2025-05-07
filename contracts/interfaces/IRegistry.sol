// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

interface IRegistry {

  // contract codes
  enum Contract {
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

  event Joined(address indexed member);
  event Left(address indexed member);
  event Swapped(address indexed previous, address indexed current);

  event MembershipChanged(address indexed previous, address indexed current);
  // Joined: MembershipChanged(address(0), current)
  // Swapped: MembershipChanged(previous, current)
  // Left: MembershipChanged(current, address(0))l

  error ContractAlreadyExists();
  error InvalidContractCode();
  error ContractDoesNotExist();

}

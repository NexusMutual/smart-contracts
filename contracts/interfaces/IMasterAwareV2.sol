// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IMasterAwareV2 {

  enum ID {
    TC, // TokenController.sol
    P1, // Pool.sol
    MR, // MemberRoles.sol
    MC, // MCR.sol
    CO, // Cover.sol
    SP, // StakingProducts.sol
    PS, // LegacyPooledStaking.sol
    GV, // Governance.sol
    GW, // LegacyGateway.sol
    CL, // CoverMigrator.sol
    AS, // Assessment.sol
    CI, // IndividualClaims.sol - Claims for Individuals
    CG, // YieldTokenIncidents.sol - Claims for Groups
    // TODO: 1) if you update this enum, update lib/constants.js as well
    // TODO: 2) TK is not an internal contract!
    //          If you want to add a new contract below TK, remove TK and make it immutable in all
    //          contracts that are using it (currently LegacyGateway and LegacyPooledStaking).
    TK  // NXMToken.sol
  }

  function changeMasterAddress(address masterAddress) external;

  function changeDependentContractAddress() external;

}

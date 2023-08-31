// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IMasterAwareV2 {

  // TODO: if you update this enum, update lib/constants.js as well
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
    RA  // Ramm.sol
  }

  function changeMasterAddress(address masterAddress) external;

  function changeDependentContractAddress() external;

  function internalContracts(uint) external view returns (address payable);
}

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
    UNUSED_PS, // LegacyPooledStaking.sol - removed
    GV, // Governance.sol
    UNUSED_GW, // LegacyGateway.sol - removed
    UNUSED_CL, // CoverMigrator.sol - removed
    AS, // Assessment.sol
    CI, // IndividualClaims.sol - Claims for Individuals
    UNUSED_CG, // YieldTokenIncidents.sol - Claims for Groups -- removed
    RA, // Ramm.sol
    ST,  // SafeTracker.sol
    CP,  // CoverProducts.sol
    LO  // CoverOrders.sol - Limit Orders
  }

  function changeMasterAddress(address masterAddress) external;

  function changeDependentContractAddress() external;

  function internalContracts(uint) external view returns (address payable);
}

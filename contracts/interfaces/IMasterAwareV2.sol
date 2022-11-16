// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IMasterAwareV2 {

  enum ID {
    TC, // TokenController.sol
    P1, // Pool.sol
    MR, // MemberRoles.sol
    MC, // MCR.sol
    CO, // Cover.sol
    AS, // Assessment.sol
    TK,
    PS,
    GV
  }

  function changeMasterAddress(address masterAddress) external;

}

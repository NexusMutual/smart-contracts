// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IMasterAwareV2 {

  enum ID {
    QD,
    TC,
    P1,
    MC,
    GV,
    PC,
    MR,
    PS,
    GW,
    IC,
    CL,
    YT,
    AS,
    CO,
    CR
  }

  function changeMasterAddress(address masterAddress) external;

}

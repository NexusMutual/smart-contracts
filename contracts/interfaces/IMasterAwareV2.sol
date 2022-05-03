// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IMasterAwareV2 {

  // [todo] Are there any missing contracts here?
  enum ID {GW, GV, MR, CL, CR, MC, P1, QT, QD, PC, PS, TC, TD, IC, AS, CO}

  function changeMasterAddress(address masterAddress) external;

}

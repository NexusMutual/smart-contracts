// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IMasterAware {

  function changeMasterAddress(address masterAddress) external;

  function changeDependentContractAddress() external;

}

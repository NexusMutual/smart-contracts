// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../abstract/MasterAwareV2.sol";

// This contract is required to initialize master (see MasterAwareV2). Also see
// addNewInternalContracts from NXMaster.sol which calls changeMasterAddress.
// Without it the transaction would fail.
contract CoverInitializer is MasterAwareV2 {

  function changeDependentContractAddress() external override {
    //noop
  }

}

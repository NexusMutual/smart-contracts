// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/IIncidents.sol";

contract DisposableIncidents is MasterAwareV2 {

  /* ========== STATE VARIABLES ========== */

  IIncidents.Configuration public config;

  IIncidents.Incident[] public incidents;

  /* ========== CONSTRUCTOR ========== */

  function initialize (address masterAddress) external {
    config.rewardRatio = 52; // 0.52%
    config.incidentExpectedPayoutRatio = 3000; // 30%
    config.incidentPayoutDeductibleRatio = 9000; // 90%
    master = INXMMaster(masterAddress);
  }

  function changeDependentContractAddress() external override {}

}

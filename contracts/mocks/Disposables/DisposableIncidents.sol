// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/IYieldTokenIncidents.sol";

contract DisposableYieldTokenIncidents is MasterAwareV2 {

  /* ========== STATE VARIABLES ========== */

  Configuration public config;

  Incident[] public incidents;

  /* ========== CONSTRUCTOR ========== */

  function initialize (address masterAddress) external {
    config.expectedPayoutRatio = 3000; // 30%
    config.payoutDeductibleRatio = 9000; // 90%
    config.rewardRatio = 52; // 0.52%
    config.maxRewardInNXMWad = 59; // 50 NXM
    master = INXMMaster(masterAddress);
  }

  function changeDependentContractAddress() external override {}

}

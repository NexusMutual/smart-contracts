// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/IIndividualClaims.sol";

contract DisposableIndividualClaims is MasterAwareV2 {

  /* ========== STATE VARIABLES ========== */

  Configuration public config;

  Claim[] public claims;
  address[] public claimants;

  /* ========== CONSTRUCTOR ========== */

  function initialize(address masterAddress) external {
    // The minimum cover premium per year is 2.6%. 20% of the cover premium is: 2.6% * 20% = 0.52%
    config.rewardRatio = 52; // 0.52%
    config.minAssessmentDepositRatio = 500; // 5% i.e. 0.05 ETH submission flat fee
    config.payoutRedemptionPeriodInDays = 14; // days until the payout will not be redeemable anymore
    master = INXMMaster(masterAddress);
  }

  function changeDependentContractAddress() external override {}

  function usedInternalContracts() internal override pure returns (uint) {
    return 0;
  }
}

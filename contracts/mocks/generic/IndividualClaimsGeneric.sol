// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/IIndividualClaims.sol";

contract IndividualClaimsGeneric is IIndividualClaims {
  Claim[] public claims;

  function getClaimsCount() external pure returns (uint) {
    revert("Unsupported");
  }

  function getPayoutRedemptionPeriod() external pure override virtual returns (uint) {
    revert("Unsupported");
  }

  function getMinAssessmentDepositRatio() external pure override virtual returns (uint) {
    revert("Unsupported");
  }

  function getMaxRewardInNxm() external pure override virtual returns (uint) {
    revert("Unsupported");
  }

  function getRewardRatio() external pure override virtual returns (uint) {
    revert("Unsupported");
  }

  function submitClaim(uint32, uint96, string calldata) external payable virtual returns (Claim memory) {
    revert("Unsupported");
  }

  function redeemClaimPayout(uint104) external pure {
    revert("Unsupported");
  }
}

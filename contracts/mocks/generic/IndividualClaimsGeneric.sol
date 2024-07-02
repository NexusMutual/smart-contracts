// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/IIndividualClaims.sol";

contract IndividualClaimsGeneric is IIndividualClaims {
  Configuration public config;
  Claim[] public claims;

  function getClaimsCount() external pure returns (uint) {
    revert("Unsupported");
  }

  function submitClaim(uint32, uint16, uint96, string calldata) external payable virtual returns (Claim memory) {
    revert("Unsupported");
  }

  function submitClaimFor(uint32, uint16, uint96, string calldata, address) external payable returns (Claim memory) {
    revert("Unsupported");
  }

  function redeemClaimPayout(uint104) external pure {
    revert("Unsupported");
  }

  function updateUintParameters(UintParams[] calldata, uint[] calldata) external pure {
    revert("Unsupported");
  }
}

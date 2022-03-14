// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "../../interfaces/IClaims.sol";


contract CLMockDistributor {

  IClaims internal claims;

  constructor(address claimsAddress) {
    claims = IClaims(claimsAddress);
  }

  function submitClaim(uint coverId) external {
    claims.submitClaim(coverId);
  }
}

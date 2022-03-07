// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/IIndividualClaims.sol";


contract CLMockDistributor {

  IIndividualClaims internal claims;

  constructor(address claimsAddress) {
    claims = IIndividualClaims(claimsAddress);
  }

  function submitClaim(uint coverId) external {
    claims.submitClaim(coverId);
  }
}

// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

import "../../interfaces/ICoverMigrator.sol";


contract CLMockDistributor {

  ICoverMigrator internal claims;

  constructor(address claimsAddress) {
    claims = ICoverMigrator(claimsAddress);
  }

  function submitClaim(uint coverId) external {
    claims.submitClaim(coverId);
  }
}

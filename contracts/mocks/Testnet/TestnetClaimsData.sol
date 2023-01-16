// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "../../modules/legacy/LegacyClaimsData.sol";

contract TestnetClaimsData is LegacyClaimsData {

  function addMockClaim(
    uint claimId,
    uint coverId,
    address coverOwner,
    uint timestamp
  ) external {
    allClaims.push(Claim(coverId, timestamp));
    allClaimsByAddress[coverOwner].push(claimId);
  }

}

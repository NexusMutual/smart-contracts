// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

contract CMMockTokenController {

  struct CoverInfo {
    uint16 claimCount;
    bool hasOpenClaim;
    bool hasAcceptedClaim;
    uint96 requestedPayoutAmount;
    // note: still 128 bits available here, can be used later
  }

  mapping(uint => CoverInfo) public coverInfo;

  function addCoverInfo(
    uint coverId,
    uint16 claimCount,
    bool hasOpenClaim,
    bool hasAcceptedClaim
  ) external {
    coverInfo[coverId] = CoverInfo(claimCount, hasOpenClaim, hasAcceptedClaim, 0);
  }
}

// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../generic/TokenControllerGeneric.sol";

contract CMMockTokenController is TokenControllerGeneric {

  function addCoverInfo(
    uint coverId,
    uint16 claimCount,
    bool hasOpenClaim,
    bool hasAcceptedClaim
  ) external {
    coverInfo[coverId] = CoverInfo(claimCount, hasOpenClaim, hasAcceptedClaim, 0);
  }
}

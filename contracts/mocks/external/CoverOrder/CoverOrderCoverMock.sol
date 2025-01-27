// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;
import "../../generic/CoverGeneric.sol";

contract CoverOrderCoverMock is CoverGeneric {

  function buyCoverInternally(
    BuyCoverParams memory,
    PoolAllocationRequest[] memory
  ) external payable override returns (uint coverId) {
    return 1;
  }
}

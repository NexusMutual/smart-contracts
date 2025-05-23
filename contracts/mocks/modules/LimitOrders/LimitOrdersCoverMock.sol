// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;
import "../../generic/CoverGeneric.sol";

contract LimitOrdersCoverMock is CoverGeneric {

  function executeCoverBuy(
    BuyCoverParams memory,
    PoolAllocationRequest[] memory,
    address
  ) external payable override returns (uint coverId) {
    return 1;
  }
}

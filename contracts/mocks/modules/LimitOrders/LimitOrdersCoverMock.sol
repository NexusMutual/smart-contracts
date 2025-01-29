// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;
import "../../generic/CoverGeneric.sol";
import "hardhat/console.sol";

contract LimitOrdersCoverMock is CoverGeneric {

  function buyCoverFor(
    address,
    BuyCoverParams memory,
    PoolAllocationRequest[] memory
  ) external payable override returns (uint coverId) {
    return 1;
  }
}

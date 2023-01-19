// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "../../interfaces/ICover.sol";

contract MCRMockCover {

  mapping(uint24 => uint) public totalActiveCoverInAsset;

  function getTotalActiveCoverInAsset(uint24 coverAsset) external view returns (uint) {
    return totalActiveCoverInAsset[coverAsset];
  }

  function setTotalActiveCoverInAsset(uint24 asset, uint amount) public {
    totalActiveCoverInAsset[asset] = amount;
  }
}

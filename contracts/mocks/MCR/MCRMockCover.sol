// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/ICover.sol";

contract MCRMockCover {

  mapping(uint => uint) public totalActiveCoverInAsset;

  function getTotalActiveCoverInAsset(uint coverAsset) external view returns (uint) {
    return totalActiveCoverInAsset[coverAsset];
  }

  function setTotalActiveCoverInAsset(uint asset, uint amount) public {
    totalActiveCoverInAsset[asset] = amount;
  }
}

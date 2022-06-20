// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

contract MCRMockCover {

  mapping(uint24 => uint) public sumAssuredByAsset;


  function totalActiveCoverInAsset(uint24 coverAsset) external view returns (uint) {
    return sumAssuredByAsset[coverAsset];
  }

  function setTotalActiveCoverInAsset(uint24 asset, uint amount) public {
    sumAssuredByAsset[asset] = amount;
  }

  function activeCoverAmountCommitted() public pure returns (bool) {
    return true;
  }
}

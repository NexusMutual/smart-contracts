// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/ICover.sol";
import "../../generic/CoverGeneric.sol";

contract MCRMockCover is CoverGeneric {

  mapping(uint => uint) public _totalActiveCoverInAsset;

  function getTotalActiveCoverInAsset(uint coverAsset) external view returns (uint) {
    return _totalActiveCoverInAsset[coverAsset];
  }

  function setTotalActiveCoverInAsset(uint asset, uint amount) public {
    _totalActiveCoverInAsset[asset] = amount;
  }

  function totalActiveCoverInAsset(uint coverAsset) external override view returns (uint) {
    return _totalActiveCoverInAsset[coverAsset];
  }
}

// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../generic/CoverGeneric.sol";

contract CVMockCover is CoverGeneric {

  mapping(uint => CoverData) public _coverData;

  function addCoverData(uint coverId, CoverData memory newCoverData) public {
    _coverData[coverId] = newCoverData;
  }

  function coverData(uint coverId) external override view returns (CoverData memory) {
    return _coverData[coverId];
  }
}

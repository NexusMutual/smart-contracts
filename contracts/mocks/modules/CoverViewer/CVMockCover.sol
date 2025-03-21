// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../generic/CoverGeneric.sol";

contract CVMockCover is CoverGeneric {

  mapping(uint => CoverData) public _coverData;
  mapping(uint => CoverReference) public _coverReference;

  function addCoverData(uint coverId, CoverData memory newCoverData) public {
    _coverData[coverId] = newCoverData;
  }

  function addCoverDataWithReference(uint coverId, CoverData memory newCoverData, CoverReference memory newCoverReference) public {
    _coverData[coverId] = newCoverData;
    _coverReference[coverId] = newCoverReference;
  }

  function getCoverData(uint coverId) external override view returns (CoverData memory) {
    return _coverData[coverId];
  }

  function getCoverDataWithReference(uint coverId) external override view returns (CoverData memory, CoverReference memory) {
    return (_coverData[coverId], _coverReference[coverId]);
  }
}

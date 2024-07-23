// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../generic/CoverGeneric.sol";

contract CVMockCover is CoverGeneric {

  mapping(uint => CoverSegment[]) public _coverSegments;
  mapping(uint => CoverData) public _coverData;

  function addCoverData(uint coverId, CoverData memory newCoverData) public {
    _coverData[coverId] = newCoverData;
  }

  function addSegments(uint coverId, CoverSegment[] memory segments) public {
    for (uint i = 0; i < segments.length; i++) {
      _coverSegments[coverId].push(segments[i]);
    }
  }

  function coverData(uint coverId) external override view returns (CoverData memory) {
    return _coverData[coverId];
  }

  function coverSegmentsCount(uint coverId) external override view returns (uint) {
    return _coverSegments[coverId].length;
  }

  function coverSegments(uint coverId) external override view returns (CoverSegment[] memory)  {
    return _coverSegments[coverId];
  }

  function coverSegmentWithRemainingAmount(
    uint coverId,
    uint segmentId
  ) external override view returns (CoverSegment memory) {
    return _coverSegments[coverId][segmentId];
  }
}

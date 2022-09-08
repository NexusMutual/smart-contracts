// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "../../interfaces/ICover.sol";

contract CoverViewerMockCover {


  mapping(uint => CoverSegment[]) public _coverSegments;

  function addSegments(uint coverId, CoverSegment[] memory segments) public {

    for (uint i = 0; i < segments.length; i++) {
      _coverSegments[coverId].push(segments[i]);
    }
  }

  function coverSegmentsCount(uint coverId) external view returns (uint) {
    return _coverSegments[coverId].length;
  }

  function coverSegments(uint coverId, uint segmentId) external view returns (CoverSegment memory) {
    return _coverSegments[coverId][segmentId];
  }
}

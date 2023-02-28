// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "../../interfaces/ICover.sol";
import "../../interfaces/INXMMaster.sol";

contract CoverViewer {

  struct Segment {
    uint segmentId;
    uint amount;
    uint remainingAmount;
    uint start;
    uint period; // seconds
    uint gracePeriod; // seconds
  }

  struct Cover {
    uint coverId;
    uint productId;
    uint coverAsset;
    uint amountPaidOut;
    Segment[] segments;
  }

  INXMMaster internal immutable master;

  constructor(address masterAddress) {
    master = INXMMaster(masterAddress);
  }

  function cover() internal view returns (ICover) {
    return ICover(master.contractAddresses('CO'));
  }

  function getCovers(uint[] calldata coverIds) external view returns (Cover[] memory) {
    Cover[] memory covers = new Cover[](coverIds.length);
    ICover _cover = cover();

    for (uint i = 0; i < coverIds.length; i++) {
      uint coverId = coverIds[i];

      CoverData memory coverData = _cover.coverData(coverId);
      covers[i].coverId = coverId;
      covers[i].productId = coverData.productId;
      covers[i].coverAsset = coverData.coverAsset;
      covers[i].amountPaidOut = coverData.amountPaidOut;

      uint segmentsCount = _cover.coverSegmentsCount(coverId);
      Segment[] memory segments = new Segment[](segmentsCount);

      CoverSegment[] memory coverSegments = _cover.coverSegments(coverId);
      for (uint segId = 0; segId < segmentsCount; segId++) {
        CoverSegment memory coverSegment = coverSegments[segId];

        segments[segId].segmentId = segId;
        segments[segId].start = coverSegment.start;
        segments[segId].period = coverSegment.period;
        segments[segId].gracePeriod = coverSegment.gracePeriod;
        segments[segId].amount = coverSegment.amount;
        segments[segId].remainingAmount = coverSegment.amount > coverData.amountPaidOut
          ? coverSegment.amount - coverData.amountPaidOut
          : 0;
      }
      covers[i].segments = segments;
    }
    return covers;
  }

  function getCoverSegments(uint coverId) external view returns (Segment[] memory) {
    ICover _cover = cover();
    CoverData memory coverData = _cover.coverData(coverId);
    CoverSegment[] memory coverSegments = _cover.coverSegments(coverId);

    uint segmentsCount = _cover.coverSegmentsCount(coverId);
    Segment[] memory segments = new Segment[](segmentsCount);

    for (uint segId = 0; segId < segmentsCount; segId++) {
      CoverSegment memory coverSegment = coverSegments[segId];

      segments[segId].start = coverSegment.start;
      segments[segId].period = coverSegment.period;
      segments[segId].gracePeriod = coverSegment.gracePeriod;
      segments[segId].amount = coverSegment.amount;
      segments[segId].remainingAmount = coverSegment.amount > coverData.amountPaidOut
        ? coverSegment.amount - coverData.amountPaidOut
        : 0;
    }

    return segments;
  }
}

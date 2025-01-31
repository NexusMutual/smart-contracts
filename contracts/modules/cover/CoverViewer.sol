// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/ICover.sol";
import "../../interfaces/INXMMaster.sol";

contract CoverViewer {

  struct Cover {
    uint coverId;
    uint productId;
    uint coverAsset;
    uint amount;
    uint start;
    uint period; // seconds
    uint gracePeriod; // seconds
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
      covers[i].start = coverData.start;
      covers[i].period = coverData.period;
      covers[i].gracePeriod = coverData.gracePeriod;
      covers[i].amount = coverData.amount;
    }

    return covers;
  }

}

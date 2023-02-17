// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

contract CMMockCover {

  event AddLegacyCoverCalledWith(
    uint productId,
    uint coverAsset,
    uint amount,
    uint start,
    uint period,
    address newOwner
  );

  uint public nextCoverId;

  function addLegacyCover(
    uint productId,
    uint coverAsset,
    uint amount,
    uint start,
    uint period,
    address newOwner
  ) external returns (uint coverId) {

    emit AddLegacyCoverCalledWith(
      productId,
      coverAsset,
      amount,
      start,
      period,
      newOwner
    );

    return nextCoverId++;
  }

}

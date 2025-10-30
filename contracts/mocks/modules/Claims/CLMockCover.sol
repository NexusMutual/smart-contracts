// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../../interfaces/ICover.sol";
import "../../../interfaces/ICoverNFT.sol";
import "../../generic/CoverGeneric.sol";

contract CLMockCover is CoverGeneric {

  ICoverNFT public immutable _coverNFT;

  struct BurnStakeCalledWith {
    uint coverId;
    uint amount;
  }

  BurnStakeCalledWith public burnStakeCalledWith;

  mapping(uint => CoverData) public _coverData;

  /* === CONSTANTS ==== */

  constructor(address coverNFTAddress) {
    _coverNFT = ICoverNFT(coverNFTAddress);
  }

  function getCoverData(uint id) external override view returns (CoverData memory) {
    return _coverData[id];
  }

  /* === MUTATIVE FUNCTIONS ==== */

  function createMockCover(
    address owner,
    uint24 productId,
    uint8 coverAsset,
    uint96 amount,
    uint32 start,
    uint32 period,
    uint32 gracePeriod,
    uint16 rewardsRatio,
    uint16 capacityRatio
  ) external payable returns (uint coverId) {

    coverId = _coverNFT.mint(owner);

    _coverData[coverId] = CoverData(
      productId,
      coverAsset,
      amount,
      start > 0 ? start : uint32(block.timestamp),
      period,
      gracePeriod,
      rewardsRatio,
      capacityRatio
    );
  }

  function burnStake(uint coverId, uint amount) external override {
    burnStakeCalledWith = BurnStakeCalledWith(coverId, amount);
  }

  function coverNFT() external override view returns (ICoverNFT) {
    return _coverNFT;
  }
}

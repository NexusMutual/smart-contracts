// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../libraries/SafeUintCast.sol";
import "../../../interfaces/ICoverProducts.sol";
import "../../generic/CoverGeneric.sol";

contract P1MockCover is CoverGeneric {
  using SafeUintCast for uint;

  mapping(uint assetId => ActiveCover) public activeCover;

  ICoverProducts public override coverProducts;

  function totalActiveCoverInAsset(uint assetId) public override view returns (uint) {
    return uint(activeCover[assetId].totalActiveCoverInAsset);
  }

  function setTotalActiveCoverInAsset(uint _assetId, uint _totalActiveCoverInAsset) public {
    activeCover[_assetId].totalActiveCoverInAsset = _totalActiveCoverInAsset.toUint192();
  }

  function setCoverProducts(address _coverProducts) public {
    coverProducts = ICoverProducts(_coverProducts);
  }

}

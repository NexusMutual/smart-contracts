// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-v4/proxy/beacon/UpgradeableBeacon.sol";

import "../../interfaces/ICover.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IERC20Detailed.sol";
import "../../interfaces/INXMMaster.sol";

contract CoverViewer {
  struct CoverView {
    uint24 productId;
    uint16 productType;
    address productAddress;
    uint96 amountPaidOut;
    uint amountRemaining;
    uint coverStart;
    uint coverEnd;
    uint8 payoutAsset;
    string payoutAssetSymbol;
    uint8 claimMethod;
    uint16 gracePeriodInDays;
  }

  INXMMaster internal immutable master;

  constructor(address masterAddress) {
    master = INXMMaster(masterAddress);
  }

  function pool() internal view returns (IPool) {
    return IPool(master.contractAddresses('P1'));
  }

  function cover() internal view returns (ICover) {
    return ICover(master.contractAddresses('CO'));
  }

  function getCover(uint coverId) public view returns (CoverView memory) {
    uint coverStart;
    uint coverEnd;
    uint amountRemaining;
    CoverData memory coverData = cover().coverData(coverId);

    {
      CoverSegment memory firstSegment = cover().coverSegments(coverId, 0);
      coverStart = firstSegment.start;
      uint segmentCount = cover().coverSegmentsCount(coverId);
      if (segmentCount == 1) {
        coverEnd = coverStart + firstSegment.period;
        amountRemaining = firstSegment.amount;
      } else {
        CoverSegment memory lastSegment = cover().coverSegments(coverId, segmentCount - 1);
        coverEnd = lastSegment.start + lastSegment.period;
        amountRemaining = lastSegment.amount;
      }
    }

    Product memory product = cover().products(coverData.productId);
    ProductType memory productType = cover().productTypes(product.productType);

    string memory payoutAssetSymbol;
    if (coverData.payoutAsset == 0) {
      payoutAssetSymbol = "ETH";
    } else {
      (address assetAddress,) = pool().payoutAssets(coverData.payoutAsset);
      try IERC20Detailed(assetAddress).symbol() returns (string memory v) {
        payoutAssetSymbol = v;
      } catch {
        // return payoutAssetSymbol as empty string and use coverData.payoutAsset instead in the UI
      }
    }

    return CoverView(
      coverData.productId,
      product.productType,
      product.productAddress,
      coverData.amountPaidOut,
      amountRemaining,
      coverStart,
      coverEnd,
      coverData.payoutAsset,
      payoutAssetSymbol,
      productType.claimMethod,
      productType.gracePeriodInDays
    );
  }

  function getCovers(uint[] calldata coverIds) external view returns (CoverView[] memory) {
    CoverView[] memory coverViews = new CoverView[](coverIds.length);
    for (uint i = 0; i < coverIds.length; i++) {
      coverViews[i] = getCover(coverIds[i]);
    }
    return coverViews;
  }
}

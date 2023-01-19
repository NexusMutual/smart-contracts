// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "solmate/src/tokens/ERC721.sol";
import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-v4/proxy/beacon/UpgradeableBeacon.sol";

import "../../interfaces/IStakingNFT.sol";
import "../../interfaces/IStakingPoolFactory.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/IERC20Detailed.sol";

contract StakingViewer {

  struct StakingPoolDetails {
    uint poolId;
    bool isPrivatePool;
    address manager;
    uint8 poolFee;
    uint8 maxPoolFee;
    uint activeStake;
    uint currentAPY;
    string ipfsHash;
  }

  mapping(uint => StakedProduct) public products;

  IStakingNFT public immutable override stakingNFT;
  IStakingPoolFactory public immutable override stakingPoolFactory;

  constructor(
    IStakingNFT _stakingNFT,
    IStakingPoolFactory _stakingPoolFactory,
  ) {
    stakingNFT = _stakingNFT;
    stakingPoolFactory = _stakingPoolFactory;
  }

  function getStakingPoolDetails(uint[] tokenIds) public view returns (StakingPoolDetails memory) {

  }




//  function getCover(uint coverId) public view returns (CoverView memory) {
//    uint coverStart;
//    uint coverEnd;
//    uint amountRemaining;
//    uint32 gracePeriod;  // grace period for each segment
//    CoverData memory coverData = cover().coverData(coverId);
//
//    {
//      CoverSegment memory firstSegment = cover().coverSegments(coverId, 0);
//      coverStart = firstSegment.start;
//      uint segmentCount = cover().coverSegmentsCount(coverId);
//      if (segmentCount == 1) {
//        coverEnd = coverStart + firstSegment.period;
//        amountRemaining = firstSegment.amount;
//        gracePeriod = firstSegment.gracePeriod;
//      } else {
//        CoverSegment memory lastSegment = cover().coverSegments(coverId, segmentCount - 1);
//        coverEnd = lastSegment.start + lastSegment.period;
//        amountRemaining = lastSegment.amount;
//        gracePeriod = lastSegment.gracePeriod;
//      }
//    }
//
//    Product memory product = cover().products(coverData.productId);
//    ProductType memory productType = cover().productTypes(product.productType);
//
//    string memory coverAssetSymbol;
//    if (coverData.coverAsset == 0) {
//      coverAssetSymbol = "ETH";
//    } else {
//      (address assetAddress,) = pool().coverAssets(coverData.coverAsset);
//      try IERC20Detailed(assetAddress).symbol() returns (string memory v) {
//        coverAssetSymbol = v;
//      } catch {
//        // return coverAssetSymbol as empty string and use coverData.coverAsset instead in the UI
//      }
//    }
//
//    return CoverView(
//      coverData.productId,
//      product.productType,
//      product.yieldTokenAddress,
//      coverData.amountPaidOut,
//      amountRemaining,
//      coverStart,
//      coverEnd,
//      coverData.coverAsset,
//      coverAssetSymbol,
//      productType.claimMethod,
//      gracePeriod
//    );
//  }
//
//  function getPeriods(uint coverId) public view returns (CoverSegment[] memory) {
//    uint segmentCount = cover().coverSegmentsCount(coverId);
//    CoverSegment[] memory segments = new CoverSegment[](segmentCount);
//    for (uint i = 0; i < segmentCount; i++) {
//      segments[i] = cover().coverSegments(coverId, i);
//    }
//    return segments;
//  }
//
//  function getCovers(uint[] calldata coverIds) external view returns (CoverView[] memory) {
//    CoverView[] memory coverViews = new CoverView[](coverIds.length);
//    for (uint i = 0; i < coverIds.length; i++) {
//      coverViews[i] = getCover(coverIds[i]);
//    }
//    return coverViews;
//  }
//
//  function getCoverSegments(uint coverId) external view returns (CoverSegment[] memory segments) {
//
//    ICover _cover = cover();
//    uint count = _cover.coverSegmentsCount(coverId);
//    segments = new CoverSegment[](count);
//
//    for (uint i = 0; i < count; i++) {
//      segments[i] = _cover.coverSegments(coverId, i);
//    }
//  }

}

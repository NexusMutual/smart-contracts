// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "solmate/src/tokens/ERC721.sol";
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
    uint8 coverAsset;
    string coverAssetSymbol;
    uint8 claimMethod;
    uint16 gracePeriodInDays;
  }

  uint private constant CAPACITY_REDUCTION_DENOMINATOR = 10000;
  uint private constant GLOBAL_CAPACITY_DENOMINATOR = 10_000;

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

    string memory coverAssetSymbol;
    if (coverData.coverAsset == 0) {
      coverAssetSymbol = "ETH";
    } else {
      (address assetAddress,) = pool().coverAssets(coverData.coverAsset);
      try IERC20Detailed(assetAddress).symbol() returns (string memory v) {
        coverAssetSymbol = v;
      } catch {
        // return coverAssetSymbol as empty string and use coverData.coverAsset instead in the UI
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
      coverData.coverAsset,
      coverAssetSymbol,
      productType.claimMethod,
      productType.gracePeriodInDays
    );
  }

  function getPeriods(uint coverId) public view returns (CoverSegment[] memory) {
    uint segmentCount = cover().coverSegmentsCount(coverId);
    CoverSegment[] memory segments = new CoverSegment[](segmentCount);
    for (uint i = 0; i < segmentCount; i++) {
      segments[i] = cover().coverSegments(coverId, i);
    }
    return segments;
  }

  function getCovers(uint[] calldata coverIds) external view returns (CoverView[] memory) {
    CoverView[] memory coverViews = new CoverView[](coverIds.length);
    for (uint i = 0; i < coverIds.length; i++) {
      coverViews[i] = getCover(coverIds[i]);
    }
    return coverViews;
  }

  function getCoverSegments(uint coverId) external view returns (CoverSegment[] memory segments) {

    ICover _cover = cover();
    uint count = _cover.coverSegmentsCount(coverId);
    segments = new CoverSegment[](count);

    for (uint i = 0; i < count; i++) {
      segments[i] = _cover.coverSegments(coverId, i);
    }
  }

  /* ========== COVER PRICING VIEWS ========== */

  function getPoolAllocationPriceParametersForProduct(
    uint poolId,
    uint productId
  ) public view returns (
    PoolAllocationPriceParameters memory params
  ) {

    ICover _cover = cover();

    IStakingPool _pool = _cover.stakingPool(poolId);
    Product memory product = _cover.products(productId);

    uint[] memory staked;

    // FIXME: activeCover is actually allocatedStake
    // FIXME: I think we want to return the allocated stake instead,
    // FIXME: because active cover amount will change if the capacity factors are changed
    (
    params.activeCover,
    staked,
    params.lastBasePrice,
    params.targetPrice
    ) = _pool.getPriceParameters(productId, _cover.MAX_COVER_PERIOD());

    params.capacities = new uint[](staked.length);

    for (uint i = 0; i < staked.length; i++) {
      params.capacities[i] = calculateCapacity(
        staked[i],
        product.capacityReductionRatio
      );
    }

    params.initialPriceRatio = product.initialPriceRatio;
  }

  struct PoolAllocationPriceParameters {
    uint activeCover;
    uint[] capacities;
    uint initialPriceRatio;
    uint lastBasePrice;
    uint targetPrice;
  }

  function getPoolAllocationPriceParameters(uint poolId) public view returns (
    PoolAllocationPriceParameters[] memory params
  ) {
    uint count = cover().productsCount();
    params = new PoolAllocationPriceParameters[](count);

    for (uint i = 0; i < count; i++) {
      params[i] = getPoolAllocationPriceParametersForProduct(poolId, i);
    }
  }

  /* ========== CAPACITY CALCULATION ========== */

  function calculateCapacity(
    uint staked,
    uint capacityReductionRatio
  ) public view returns (uint) {

    ICover _cover = cover();
    return staked *
    _cover.globalCapacityRatio() *
    (CAPACITY_REDUCTION_DENOMINATOR - capacityReductionRatio) /
    GLOBAL_CAPACITY_DENOMINATOR /
    CAPACITY_REDUCTION_DENOMINATOR;
  }

}

// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "@openzeppelin/contracts-v4/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import "../../abstract/MasterAwareV2.sol";
import "../../abstract/Multicall.sol";
import "../../interfaces/ICompleteStakingPoolFactory.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/ICoverNFT.sol";
import "../../interfaces/ICoverProducts.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IStakingNFT.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/IStakingPoolBeacon.sol";
import "../../interfaces/ISwapOperator.sol";
import "../../interfaces/ITokenController.sol";
import "../../libraries/Math.sol";
import "../../libraries/SafeUintCast.sol";
import "../../libraries/StakingPoolLibrary.sol";

contract Cover is ICover, MasterAwareV2, IStakingPoolBeacon, ReentrancyGuard, Multicall {
  using SafeERC20 for IERC20;
  using SafeUintCast for uint;

  /* ========== STATE VARIABLES ========== */

  uint private __unused_0; // was Product[] products
  uint private __unused_1; // was ProductType[] productTypes

  mapping(uint coverId => LegacyCoverData) private _legacyCoverData;
  mapping(uint coverId => mapping(uint segmentId => PoolAllocation[])) private legacyCoverSegmentAllocations;

  uint private __unused_4; // was mapping(uint => uint[]) allowedPools

  mapping(uint coverId => LegacyCoverSegment[]) private _legacyCoverSegments;

  mapping(uint assetId => ActiveCover) public activeCover;
  mapping(uint assetId => mapping(uint bucketId => uint amount)) internal activeCoverExpirationBuckets;

  mapping(uint coverId => CoverData) private _coverData;
  mapping(uint coverId => PoolAllocation[]) private _poolAllocations;
  mapping(uint coverId => CoverEditInfo) private _coverEditInfo;

  /* ========== CONSTANTS ========== */

  uint private constant GLOBAL_CAPACITY_RATIO = 20000; // 2
  uint private constant GLOBAL_REWARDS_RATIO = 5000; // 50%

  uint private constant COMMISSION_DENOMINATOR = 10000;
  uint private constant GLOBAL_CAPACITY_DENOMINATOR = 10_000;

  uint private constant MAX_COVER_PERIOD = 365 days;
  uint private constant MIN_COVER_PERIOD = 28 days;
  uint private constant BUCKET_SIZE = 7 days;

  uint public constant MAX_COMMISSION_RATIO = 3000; // 30%

  uint public constant DEFAULT_MIN_PRICE_RATIO = 100; // 1%

  uint private constant ONE_NXM = 1e18;

  uint private constant ETH_ASSET_ID = 0;
  uint private constant NXM_ASSET_ID = type(uint8).max;

  // internally we store capacity using 2 decimals
  // 1 nxm of capacity is stored as 100
  uint private constant ALLOCATION_UNITS_PER_NXM = 100;

  // given capacities have 2 decimals
  // smallest unit we can allocate is 1e18 / 100 = 1e16 = 0.01 NXM
  uint public constant NXM_PER_ALLOCATION_UNIT = ONE_NXM / ALLOCATION_UNITS_PER_NXM;

  uint private constant MAX_ACTIVE_TRANCHES = 8; // 7 whole quarters + 1 partial quarter

  ICoverNFT public immutable override coverNFT;
  IStakingNFT public immutable override stakingNFT;
  ICompleteStakingPoolFactory public immutable override stakingPoolFactory;
  address public immutable stakingPoolImplementation;

  /* ========== CONSTRUCTOR ========== */

  constructor(
    ICoverNFT _coverNFT,
    IStakingNFT _stakingNFT,
    ICompleteStakingPoolFactory _stakingPoolFactory,
    address _stakingPoolImplementation
  ) {
    // in constructor we only initialize immutable fields
    coverNFT = _coverNFT;
    stakingNFT = _stakingNFT;
    stakingPoolFactory = _stakingPoolFactory;
    stakingPoolImplementation = _stakingPoolImplementation;
  }

  /* === MUTATIVE FUNCTIONS ==== */

  function buyCover(
    BuyCoverParams memory params,
    PoolAllocationRequest[] memory poolAllocationRequests
  ) external payable onlyMember nonReentrant whenNotPaused returns (uint coverId) {

    if (params.period < MIN_COVER_PERIOD) {
      revert CoverPeriodTooShort();
    }

    if (params.period > MAX_COVER_PERIOD) {
      revert CoverPeriodTooLong();
    }

    if (params.commissionRatio > MAX_COMMISSION_RATIO) {
      revert CommissionRateTooHigh();
    }

    if (params.amount == 0) {
      revert CoverAmountIsZero();
    }

    // can pay with cover asset or nxm only
    if (params.paymentAsset != params.coverAsset && params.paymentAsset != NXM_ASSET_ID) {
      revert InvalidPaymentAsset();
    }

    // new cover
    coverId = coverNFT.mint(params.owner);

    uint previousCoverAmount;
    uint previousCoverExpiration;
    uint refundedPremium;

    if (params.coverId != 0) {

      if (!coverNFT.isApprovedOrOwner(msg.sender, params.coverId)) {
        revert OnlyOwnerOrApproved();
      }

      (
        previousCoverAmount,
        previousCoverExpiration,
        refundedPremium
      ) = _requestDeallocation(params.coverId);

      uint initialCoverId = getInitialCoverId(params.coverId);
      _coverEditInfo[coverId].initialCoverId = initialCoverId.toUint32();
      _coverEditInfo[initialCoverId].latestCoverId = coverId.toUint32();
    }

    AllocationRequest memory allocationRequest;

    {
      ICoverProducts _coverProducts = coverProducts();

      if (_coverProducts.getProductCount() <= params.productId) {
        revert ProductNotFound();
      }

      (
        Product memory product,
        ProductType memory productType
      ) = _coverProducts.getProductWithType(params.productId);

      if (product.isDeprecated) {
        revert ProductDeprecated();
      }

      if (!_isCoverAssetSupported(params.coverAsset, product.coverAssets)) {
        revert CoverAssetNotSupported();
      }

      allocationRequest = AllocationRequest(
        params.productId,
        coverId,
        params.period,
        productType.gracePeriod,
        product.useFixedPrice,
        GLOBAL_CAPACITY_RATIO,
        product.capacityReductionRatio,
        GLOBAL_REWARDS_RATIO,
        product.minPrice != 0 ? product.minPrice : DEFAULT_MIN_PRICE_RATIO
      );
    }

    _coverData[coverId] = CoverData(
      params.productId,
      params.coverAsset,
      params.amount,
      block.timestamp.toUint32(),
      params.period,
      allocationRequest.gracePeriod.toUint32(),
      GLOBAL_REWARDS_RATIO.toUint16(),
      GLOBAL_CAPACITY_RATIO.toUint16()
    );

    uint nxmPriceInCoverAsset = pool().getInternalTokenPriceInAssetAndUpdateTwap(params.coverAsset);

    (uint coverAmountInCoverAsset, uint amountDueInNXM) = _requestAllocation(
      allocationRequest,
      poolAllocationRequests,
      nxmPriceInCoverAsset
    );

    if (coverAmountInCoverAsset < params.amount) {
      revert InsufficientCoverAmountAllocated();
    }

    _updateTotalActiveCoverAmount(
      params.coverAsset,
      coverAmountInCoverAsset,
      block.timestamp + params.period,
      previousCoverAmount,
      previousCoverExpiration
    );

    _retrievePayment(
      refundedPremium >= amountDueInNXM ? 0 : amountDueInNXM - refundedPremium,
      params.paymentAsset,
      nxmPriceInCoverAsset,
      params.maxPremiumInAsset,
      params.commissionRatio,
      params.commissionDestination
    );

    emit CoverEdited(coverId, params.productId, 0 /*segmentId*/, msg.sender, params.ipfsData);
  }

  function expireCover(uint coverId) external {

    CoverData memory cover = _coverData[coverId];
    uint expiration = cover.start + cover.period;
    uint allocationsLength = _poolAllocations[coverId].length;

    if (expiration > block.timestamp) {
      revert CoverNotYetExpired(coverId);
    }

    for (uint allocationIndex = 0; allocationIndex < allocationsLength; allocationIndex++) {
      // fetch allocation
      PoolAllocation memory allocation = _poolAllocations[coverId][allocationIndex];

      // construct deallocation request
      DeallocationRequest memory deallocationRequest = DeallocationRequest(
        allocation.allocationId,
        cover.productId,
        0, // premium
        cover.start,
        cover.period,
        cover.rewardsRatio
      );

      // request deallocation
      stakingPool(allocation.poolId).requestDeallocation(deallocationRequest);
    }

    _updateTotalActiveCoverAmount(
      cover.coverAsset,
      0, // new cover amount
      0, // new cover expiration
      cover.amount, // previous cover amount
      expiration // previous cover expiration
    );
  }

  function _requestAllocation(
    AllocationRequest memory allocationRequest,
    PoolAllocationRequest[] memory allocationRequests,
    uint nxmPriceInCoverAsset
  ) internal returns (
    uint totalCoverAmountInCoverAsset,
    uint totalAmountDueInNXM
  ) {

    uint totalCoverAmountInNXM;

    for (uint i = 0; i < allocationRequests.length; i++) {

      // converting asset amount to nxm and rounding up to the nearest NXM_PER_ALLOCATION_UNIT
      uint coverAmountInNXM = Math.roundUp(
        Math.divCeil(allocationRequests[i].coverAmountInAsset * ONE_NXM, nxmPriceInCoverAsset),
        NXM_PER_ALLOCATION_UNIT
      );

      (uint premiumInNXM, uint allocationId) = stakingPool(allocationRequests[i].poolId).requestAllocation(
        coverAmountInNXM,
        allocationRequest
      );

      _poolAllocations[allocationRequest.coverId].push(
        PoolAllocation(
          allocationRequests[i].poolId.toUint40(),
          coverAmountInNXM.toUint96(),
          premiumInNXM.toUint96(),
          allocationId.toUint24()
        )
      );

      totalAmountDueInNXM += premiumInNXM;
      totalCoverAmountInNXM += coverAmountInNXM;
    }

    totalCoverAmountInCoverAsset = totalCoverAmountInNXM * nxmPriceInCoverAsset / ONE_NXM;

    return (totalCoverAmountInCoverAsset, totalAmountDueInNXM);
  }

  function _requestDeallocation(uint coverId) internal returns (
    uint previousCoverAmount,
    uint previousCoverExpiration,
    uint refundedPremium
  ) {

    CoverData memory cover = _coverData[coverId];
    uint expiration = cover.start + cover.period;

    // require the previous cover not to be expired
    if (expiration <= block.timestamp) {
      revert ExpiredCoversCannotBeEdited();
    }

    uint allocationsLength = _poolAllocations[coverId].length;

    for (uint allocationIndex = 0; allocationIndex < allocationsLength; allocationIndex++) {
      // fetch allocation
      PoolAllocation memory allocation = _poolAllocations[coverId][allocationIndex];

      // refund = premium * remaining_period / cover_period
      refundedPremium += allocation.premiumInNXM * (expiration - block.timestamp) / cover.period;

      // construct deallocation request
      DeallocationRequest memory deallocationRequest = DeallocationRequest(
        allocation.allocationId,
        cover.productId,
        allocation.premiumInNXM,
        cover.start,
        cover.period,
        cover.rewardsRatio
      );

      // request deallocation
      stakingPool(allocation.poolId).requestDeallocation(deallocationRequest);
    }

    // get previous expiration timestamp
    previousCoverExpiration = cover.start + cover.period;

    // mark previous cover as ending now
    cover.period = (block.timestamp - cover.start).toUint32();
    _coverData[coverId] = cover;

    return (
      cover.amount,
      previousCoverExpiration,
      refundedPremium
    );
  }

  function _retrievePayment(
    uint premiumInNxm,
    uint paymentAsset,
    uint nxmPriceInCoverAsset,
    uint maxPremiumInAsset,
    uint commissionRatio,
    address commissionDestination
  ) internal {

    if (paymentAsset != ETH_ASSET_ID && msg.value > 0) {
      revert UnexpectedEthSent();
    }

    // NXM payment
    if (paymentAsset == NXM_ASSET_ID) {
      uint commissionInNxm;

      if (commissionRatio > 0) {
        commissionInNxm = (premiumInNxm * COMMISSION_DENOMINATOR / (COMMISSION_DENOMINATOR - commissionRatio)) - premiumInNxm;
      }

      if (premiumInNxm + commissionInNxm > maxPremiumInAsset) {
        revert PriceExceedsMaxPremiumInAsset();
      }

      ITokenController _tokenController = tokenController();
      _tokenController.burnFrom(msg.sender, premiumInNxm);

      if (commissionInNxm > 0) {
        // commission transfer reverts if the commissionDestination is not a member
        _tokenController.operatorTransfer(msg.sender, commissionDestination, commissionInNxm);
      }

      return;
    }

    IPool _pool = pool();
    uint premiumInPaymentAsset = nxmPriceInCoverAsset * premiumInNxm / ONE_NXM;
    uint commission = (premiumInPaymentAsset * COMMISSION_DENOMINATOR / (COMMISSION_DENOMINATOR - commissionRatio)) - premiumInPaymentAsset;
    uint premiumWithCommission = premiumInPaymentAsset + commission;

    if (premiumWithCommission > maxPremiumInAsset) {
      revert PriceExceedsMaxPremiumInAsset();
    }

    // ETH payment
    if (paymentAsset == ETH_ASSET_ID) {

      if (msg.value < premiumWithCommission) {
        revert InsufficientEthSent();
      }

      uint remainder = msg.value - premiumWithCommission;

      {
        // send premium in eth to the pool
        // solhint-disable-next-line avoid-low-level-calls
        (bool ok, /* data */) = address(_pool).call{value: premiumInPaymentAsset}("");
        if (!ok) {
          revert SendingEthToPoolFailed();
        }
      }

      // send commission
      if (commission > 0) {
        (bool ok, /* data */) = address(commissionDestination).call{value: commission}("");
        if (!ok) {
          revert SendingEthToCommissionDestinationFailed();
        }
      }

      if (remainder > 0) {
        // solhint-disable-next-line avoid-low-level-calls
        (bool ok, /* data */) = address(msg.sender).call{value: remainder}("");
        if (!ok) {
          revert ReturningEthRemainderToSenderFailed();
        }
      }

      return;
    }

    address coverAsset = _pool.getAsset(paymentAsset).assetAddress;
    IERC20 token = IERC20(coverAsset);
    token.safeTransferFrom(msg.sender, address(_pool), premiumInPaymentAsset);

    if (commission > 0) {
      token.safeTransferFrom(msg.sender, commissionDestination, commission);
    }
  }

  function updateTotalActiveCoverAmount(uint coverAsset) public {
    _updateTotalActiveCoverAmount(coverAsset, 0, 0, 0, 0);
  }

  function _updateTotalActiveCoverAmount(
    uint coverAsset,
    uint addedCoverAmount,
    uint addedCoverExpiration,
    uint removedCoverAmount,
    uint removedCoverExpiration
  ) internal {

    ActiveCover memory _activeCover = activeCover[coverAsset];
    uint totalActiveCover = _activeCover.totalActiveCoverInAsset;
    uint currentBucketId = block.timestamp / BUCKET_SIZE;

    // process expirations
    if (totalActiveCover != 0) {
      uint lastUpdateId = _activeCover.lastBucketUpdateId;
      while (lastUpdateId < currentBucketId) {
        ++lastUpdateId;
        totalActiveCover -= activeCoverExpirationBuckets[coverAsset][lastUpdateId];
      }
    }

    // add new cover amount
    if (addedCoverAmount != 0) {
      uint bucketID = Math.divCeil(addedCoverExpiration, BUCKET_SIZE);
      activeCoverExpirationBuckets[coverAsset][bucketID] += addedCoverAmount;
      totalActiveCover += addedCoverAmount;
    }

    // remove old cover amount
    uint previousExpirationBucketID = Math.divCeil(removedCoverExpiration, BUCKET_SIZE);

    if (removedCoverAmount != 0 && previousExpirationBucketID > currentBucketId) {
      totalActiveCover -= removedCoverAmount;
      activeCoverExpirationBuckets[coverAsset][previousExpirationBucketID] -= removedCoverAmount;
    }

    // update tracked active cover amount
    _activeCover.lastBucketUpdateId = currentBucketId.toUint64();
    _activeCover.totalActiveCoverInAsset = totalActiveCover.toUint192();

    // sstore
    activeCover[coverAsset] = _activeCover;
  }

  function burnStake(
    uint coverId,
    uint payoutAmountInAsset
  ) external onlyInternal override returns (address /* coverOwner */) {

    CoverData memory cover = _coverData[coverId];

    uint allocationsLength = _poolAllocations[coverId].length;

    for (uint i = 0; i < allocationsLength; i++) {
      PoolAllocation memory allocation = _poolAllocations[coverId][i];

      uint deallocationAmountInNXM = allocation.coverAmountInNXM * payoutAmountInAsset / cover.amount;
      uint burnAmountInNxm = deallocationAmountInNXM * GLOBAL_CAPACITY_DENOMINATOR / cover.capacityRatio;

      BurnStakeParams memory params = BurnStakeParams(
        allocation.allocationId,
        cover.productId,
        cover.start,
        cover.period,
        deallocationAmountInNXM
      );

      stakingPool(allocation.poolId).burnStake(burnAmountInNxm, params);

      allocation.coverAmountInNXM -= deallocationAmountInNXM.toUint96();
      allocation.premiumInNXM -= (allocation.premiumInNXM * payoutAmountInAsset / cover.amount).toUint96();

      // sstore
      _poolAllocations[coverId][i] = allocation;
    }

    _updateTotalActiveCoverAmount(
      cover.coverAsset,
      0, // new cover amount
      0, // new cover expiration
      payoutAmountInAsset, // previous cover amount
      cover.start + cover.period // previous cover expiration
    );

    // update && sstore
    cover.amount -= payoutAmountInAsset.toUint96();
    _coverData[coverId] = cover;

    return coverNFT.ownerOf(coverId);
  }

  /* ========== VIEWS ========== */

  function coverData(uint coverId) external override view returns (CoverData memory) {
    return _coverData[coverId];
  }

  function coverDataCount() external override view returns (uint) {
    return coverNFT.totalSupply();
  }

  function getInitialCoverId(uint coverId) public view returns(uint) {
    return _coverEditInfo[coverId].initialCoverId != 0 ? _coverEditInfo[coverId].initialCoverId : coverId;
  }

  function getLatestCoverId(uint initialCoverId) public view returns(uint) {
    return _coverEditInfo[initialCoverId].latestCoverId != 0 ? _coverEditInfo[initialCoverId].latestCoverId : initialCoverId;
  }

  /* ========== COVER ASSETS HELPERS ========== */

  function recalculateActiveCoverInAsset(uint coverAsset) public {
    uint currentBucketId = block.timestamp / BUCKET_SIZE;
    uint totalActiveCover = 0;
    uint yearlyBucketsCount = Math.divCeil(MAX_COVER_PERIOD, BUCKET_SIZE);

    for (uint i = 1; i <= yearlyBucketsCount; i++) {
      uint bucketId = currentBucketId + i;
      totalActiveCover += activeCoverExpirationBuckets[coverAsset][bucketId];
    }

    activeCover[coverAsset] = ActiveCover(totalActiveCover.toUint192(), currentBucketId.toUint64());
  }

  function totalActiveCoverInAsset(uint assetId) public view returns (uint) {
    return uint(activeCover[assetId].totalActiveCoverInAsset);
  }

  function getGlobalCapacityRatio() external pure returns (uint) {
    return GLOBAL_CAPACITY_RATIO;
  }

  function getGlobalRewardsRatio() external pure returns (uint) {
    return GLOBAL_REWARDS_RATIO;
  }

  function getDefaultMinPriceRatio() external pure returns (uint) {
    return DEFAULT_MIN_PRICE_RATIO;
  }

  function getGlobalCapacityAndPriceRatios() external pure returns (
    uint _globalCapacityRatio,
    uint _defaultMinPriceRatio
  ) {
    _globalCapacityRatio = GLOBAL_CAPACITY_RATIO;
    _defaultMinPriceRatio = DEFAULT_MIN_PRICE_RATIO;
  }

  function _isCoverAssetSupported(uint assetId, uint productCoverAssetsBitmap) internal view returns (bool) {

    if (
      // product does not use default cover assets
      productCoverAssetsBitmap != 0 &&
      // asset id is not in the product's cover assets bitmap
      ((1 << assetId) & productCoverAssetsBitmap == 0)
    ) {
      return false;
    }

    Asset memory asset = pool().getAsset(assetId);

    return asset.isCoverAsset && !asset.isAbandoned;
  }

  function stakingPool(uint poolId) public view returns (IStakingPool) {
    return IStakingPool(
      StakingPoolLibrary.getAddress(address(stakingPoolFactory), poolId)
    );
  }

  function changeCoverNFTDescriptor(address _coverNFTDescriptor) external onlyAdvisoryBoard {
    coverNFT.changeNFTDescriptor(_coverNFTDescriptor);
  }

  function changeStakingNFTDescriptor(address _stakingNFTDescriptor) external onlyAdvisoryBoard {
    stakingNFT.changeNFTDescriptor(_stakingNFTDescriptor);
  }

  /* ========== DEPENDENCIES ========== */

  function pool() internal view returns (IPool) {
    return IPool(internalContracts[uint(ID.P1)]);
  }

  function tokenController() internal view returns (ITokenController) {
    return ITokenController(internalContracts[uint(ID.TC)]);
  }

  function memberRoles() internal view returns (IMemberRoles) {
    return IMemberRoles(internalContracts[uint(ID.MR)]);
  }

  function coverProducts() internal view returns (ICoverProducts) {
    return ICoverProducts(internalContracts[uint(ID.CP)]);
  }

  function changeDependentContractAddress() external override {
    internalContracts[uint(ID.P1)] = master.getLatestAddress("P1");
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
    internalContracts[uint(ID.CP)] = master.getLatestAddress("CP");
  }
}

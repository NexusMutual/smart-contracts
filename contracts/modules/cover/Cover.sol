// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

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
  mapping(uint coverId => mapping(uint segmentId => PoolAllocation[])) private _legacyCoverSegmentAllocations;

  uint private __unused_4; // was mapping(uint => uint[]) allowedPools

  mapping(uint coverId => LegacyCoverSegment[]) private _legacyCoverSegments;

  mapping(uint assetId => ActiveCover) public activeCover;
  mapping(uint assetId => mapping(uint bucketId => uint amount)) internal activeCoverExpirationBuckets;

  uint private __unused_8; // was mapping(uint => string) _productNames
  uint private __unused_9; // was mapping(uint => string) _productTypeNames

  mapping(uint coverId => CoverData) private _coverData;
  mapping(uint coverId => PoolAllocation[]) private _poolAllocations;
  mapping(uint coverId => CoverReference) private _coverReference;

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
  ) external payable onlyMember returns (uint coverId) {

    if (params.coverId != 0) {
      require(coverNFT.isApprovedOrOwner(msg.sender, params.coverId), OnlyOwnerOrApproved());
    }

    coverId = _buyCover(params, poolAllocationRequests);

    emit CoverBought(
      coverId,
      params.coverId != 0 ? params.coverId : coverId,
      params.productId,
      msg.sender,
      params.ipfsData
    );

    return coverId;
  }

  function executeCoverBuy(
    BuyCoverParams memory params,
    PoolAllocationRequest[] memory poolAllocationRequests,
    address buyer
  ) external payable onlyInternal returns (uint coverId) {

    if (params.coverId != 0) {
      require(coverNFT.isApprovedOrOwner(buyer, params.coverId), OnlyOwnerOrApproved());
    }

    coverId = _buyCover(params, poolAllocationRequests);

    emit CoverBought(
      coverId,
      params.coverId != 0 ? params.coverId : coverId,
      params.productId,
      buyer,
      params.ipfsData
    );

    return coverId;
  }

  function _buyCover(
    BuyCoverParams memory params,
    PoolAllocationRequest[] memory poolAllocationRequests
  ) internal nonReentrant whenNotPaused returns (uint coverId) {

    require(params.period >= MIN_COVER_PERIOD, CoverPeriodTooShort());
    require(params.period <= MAX_COVER_PERIOD, CoverPeriodTooLong());
    require(params.commissionRatio <= MAX_COMMISSION_RATIO, CommissionRateTooHigh());
    require(params.amount != 0, CoverAmountIsZero());
    // can pay with cover asset or nxm only
    require(params.paymentAsset == params.coverAsset || params.paymentAsset == NXM_ASSET_ID, InvalidPaymentAsset());

    // new cover
    coverId = coverNFT.mint(params.owner);

    uint previousCoverAmount;
    uint previousCoverExpiration;
    uint refundedPremium;

    if (params.coverId != 0) {


      CoverReference memory coverReference = getCoverReference(params.coverId);

      require(coverReference.originalCoverId == params.coverId, MustBeOriginalCoverId(coverReference.originalCoverId));

      (
        previousCoverAmount,
        previousCoverExpiration,
        refundedPremium
      ) = _requestDeallocation(coverReference.latestCoverId);

      _coverReference[coverId].originalCoverId = params.coverId.toUint32();
      _coverReference[params.coverId].latestCoverId = coverId.toUint32();
    }

    AllocationRequest memory allocationRequest;

    {
      ICoverProducts coverProducts = _coverProducts();

      require(params.productId < coverProducts.getProductCount(), ProductNotFound());

      (
        Product memory product,
        ProductType memory productType
      ) = coverProducts.getProductWithType(params.productId);

      require(!product.isDeprecated, ProductDeprecated());
      require(_isCoverAssetSupported(params.coverAsset, product.coverAssets), CoverAssetNotSupported());

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

    uint nxmPriceInCoverAsset = _pool().getInternalTokenPriceInAssetAndUpdateTwap(params.coverAsset);

    (uint coverAmountInCoverAsset, uint amountDueInNXM) = _requestAllocation(
      allocationRequest,
      poolAllocationRequests,
      nxmPriceInCoverAsset
    );

    require(coverAmountInCoverAsset >= params.amount, InsufficientCoverAmountAllocated());

    _coverData[coverId] = CoverData(
      params.productId,
      params.coverAsset,
      coverAmountInCoverAsset.toUint96(),
      block.timestamp.toUint32(),
      params.period,
      allocationRequest.gracePeriod.toUint32(),
      GLOBAL_REWARDS_RATIO.toUint16(),
      GLOBAL_CAPACITY_RATIO.toUint16()
    );

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
  }

  function expireCover(uint coverId) external {

    CoverData memory cover = _coverData[coverId];
    uint expiration = cover.start + cover.period;
    uint allocationsLength = _poolAllocations[coverId].length;

    require(block.timestamp >= expiration, CoverNotYetExpired(coverId));

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

    // get previous expiration timestamp
    previousCoverExpiration = cover.start + cover.period;

    // require the previous cover not to be expired
    require(block.timestamp < previousCoverExpiration, ExpiredCoversCannotBeEdited());

    uint allocationsLength = _poolAllocations[coverId].length;

    for (uint allocationIndex = 0; allocationIndex < allocationsLength; allocationIndex++) {
      // fetch allocation
      PoolAllocation memory allocation = _poolAllocations[coverId][allocationIndex];

      // refund = premium * remaining_period / cover_period
      refundedPremium += allocation.premiumInNXM * (previousCoverExpiration - block.timestamp) / cover.period;

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

    require(msg.value == 0 || paymentAsset == ETH_ASSET_ID, UnexpectedEthSent());

    // NXM payment
    if (paymentAsset == NXM_ASSET_ID) {
      uint commissionInNxm;

      if (commissionRatio > 0) {
        commissionInNxm = (premiumInNxm * COMMISSION_DENOMINATOR / (COMMISSION_DENOMINATOR - commissionRatio)) - premiumInNxm;
      }

      require(premiumInNxm + commissionInNxm <= maxPremiumInAsset, PriceExceedsMaxPremiumInAsset());

      ITokenController tokenController = _tokenController();
      tokenController.burnFrom(msg.sender, premiumInNxm);

      if (commissionInNxm > 0) {
        // commission transfer reverts if the commissionDestination is not a member
        tokenController.operatorTransfer(msg.sender, commissionDestination, commissionInNxm);
      }

      return;
    }

    IPool pool = _pool();
    uint premiumInPaymentAsset = nxmPriceInCoverAsset * premiumInNxm / ONE_NXM;
    uint commission = (premiumInPaymentAsset * COMMISSION_DENOMINATOR / (COMMISSION_DENOMINATOR - commissionRatio)) - premiumInPaymentAsset;
    uint premiumWithCommission = premiumInPaymentAsset + commission;

    require(premiumWithCommission <= maxPremiumInAsset, PriceExceedsMaxPremiumInAsset());

    // ETH payment
    if (paymentAsset == ETH_ASSET_ID) {
      require(msg.value >= premiumWithCommission, InsufficientEthSent());

      uint remainder = msg.value - premiumWithCommission;

      {
        // send premium in eth to the pool
        // solhint-disable-next-line avoid-low-level-calls
        (bool ok, /* data */) = address(pool).call{value: premiumInPaymentAsset}("");
        require(ok, SendingEthToPoolFailed());
      }

      // send commission
      if (commission > 0) {
        (bool ok, /* data */) = address(commissionDestination).call{value: commission}("");
        require(ok, SendingEthToCommissionDestinationFailed());
      }

      if (remainder > 0) {
        // solhint-disable-next-line avoid-low-level-calls
        (bool ok, /* data */) = address(msg.sender).call{value: remainder}("");
        require(ok, ReturningEthRemainderToSenderFailed());
      }

      return;
    }

    address coverAsset = pool.getAsset(paymentAsset).assetAddress;
    IERC20 token = IERC20(coverAsset);
    token.safeTransferFrom(msg.sender, address(pool), premiumInPaymentAsset);

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

  function getCoverData(uint coverId) external override view returns (CoverData memory) {
    return _coverData[coverId];
  }

  function getPoolAllocations(uint coverId) external override view returns (PoolAllocation[] memory) {
    return _poolAllocations[coverId];
  }

  function getCoverDataCount() external override view returns (uint) {
    return coverNFT.totalSupply();
  }

  function getCoverReference(uint coverId) public override view returns(CoverReference memory coverReference) {
    coverReference = _coverReference[coverId];
    coverReference.originalCoverId = coverReference.originalCoverId != 0 ? coverReference.originalCoverId : coverId.toUint32();
    coverReference.latestCoverId = coverReference.latestCoverId != 0 ? coverReference.latestCoverId : coverId.toUint32();
  }

  function getCoverDataWithReference(uint coverId) external override view returns (CoverData memory, CoverReference memory) {
    return (_coverData[coverId], getCoverReference(coverId));
  }

  function getLatestEditCoverData(uint coverId) external override view returns (CoverData memory) {
    CoverReference memory coverReference = getCoverReference(coverId);
    return _coverData[coverReference.latestCoverId];
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

    Asset memory asset = _pool().getAsset(assetId);

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

  function _pool() internal view returns (IPool) {
    return IPool(internalContracts[uint(ID.P1)]);
  }

  function _tokenController() internal view returns (ITokenController) {
    return ITokenController(internalContracts[uint(ID.TC)]);
  }

  function _memberRoles() internal view returns (IMemberRoles) {
    return IMemberRoles(internalContracts[uint(ID.MR)]);
  }

  function _coverProducts() internal view returns (ICoverProducts) {
    return ICoverProducts(internalContracts[uint(ID.CP)]);
  }

  function changeDependentContractAddress() external override {
    internalContracts[uint(ID.P1)] = master.getLatestAddress("P1");
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
    internalContracts[uint(ID.CP)] = master.getLatestAddress("CP");
  }

  /* ========== MIGRATION ========== */

  function migrateCoverDataAndPoolAllocations(uint[] calldata coverIds) external {
    uint length = coverIds.length;
    for(uint i=0; i<length; i++) {
      uint coverId = coverIds[i];

      LegacyCoverSegment memory legacyCoverSegment = _legacyCoverSegments[coverId][0];

      require(legacyCoverSegment.amount > 0, AlreadyMigratedCoverData(coverId));

      LegacyCoverData memory legacyCoverData = _legacyCoverData[coverId];

      _coverData[coverId] = CoverData({
        productId: legacyCoverData.productId,
        coverAsset: legacyCoverData.coverAsset,
        amount: legacyCoverSegment.amount,
        start: legacyCoverSegment.start,
        period: legacyCoverSegment.period,
        gracePeriod: legacyCoverSegment.gracePeriod,
        rewardsRatio: uint(legacyCoverSegment.globalRewardsRatio).toUint16(),
        capacityRatio: uint(legacyCoverSegment.globalCapacityRatio).toUint16()
      });

      _poolAllocations[coverId] = _legacyCoverSegmentAllocations[coverId][0];

      delete _legacyCoverSegments[coverId][0];
      delete _legacyCoverData[coverId];
      delete _legacyCoverSegmentAllocations[coverId][0];
    }
  }
}

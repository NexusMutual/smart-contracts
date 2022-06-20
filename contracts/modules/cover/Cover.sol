// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-v4/proxy/beacon/UpgradeableBeacon.sol";

import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/ICoverNFT.sol";
import "../../interfaces/IMCR.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IProductsV1.sol";
import "../../interfaces/IQuotationData.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/IStakingPoolBeacon.sol";
import "../../interfaces/ITokenController.sol";
import "../../libraries/Math.sol";
import "../../libraries/SafeUintCast.sol";
import "./CoverUtilsLib.sol";
import "./MinimalBeaconProxy.sol";
import "@openzeppelin/contracts-v4/security/ReentrancyGuard.sol";


contract Cover is ICover, MasterAwareV2, IStakingPoolBeacon, ReentrancyGuard {
  using SafeERC20 for IERC20;

  /* ========== CONSTANTS ========== */

  uint private constant PRICE_DENOMINATOR = 10000;
  uint private constant COMMISSION_DENOMINATOR = 10000;
  uint private constant CAPACITY_REDUCTION_DENOMINATOR = 10000;
  uint private constant GLOBAL_CAPACITY_DENOMINATOR = 10_000;
  uint private constant REWARD_DENOMINATOR = 10_000;

  uint public constant MAX_COVER_PERIOD = 364 days;
  uint private constant MIN_COVER_PERIOD = 28 days;
  // this constant is used for calculating the normalized yearly percentage cost of cover
  uint private constant ONE_YEAR = 365 days;

  uint private constant MAX_COMMISSION_RATIO = 2500; // 25%

  uint private constant GLOBAL_MIN_PRICE_RATIO = 100; // 1%

  uint private constant NXM_IN_WEI = 1e18;

  IQuotationData internal immutable quotationData;
  IProductsV1 internal immutable productsV1;
  address public immutable override coverNFT;

  /* Staking pool creation */
  bytes32 public immutable stakingPoolProxyCodeHash;
  address public immutable stakingPoolImplementation;

  /* ========== STATE VARIABLES ========== */

  Product[] internal _products;
  ProductType[] internal _productTypes;

  CoverData[] private _coverData;
  mapping(uint => mapping(uint => PoolAllocation[])) public coverSegmentAllocations;

  /*
    Each Cover has an array of segments. A new segment is created every time a cover is edited to
    deliniate the different cover periods.
  */
  mapping(uint => CoverSegment[]) private _coverSegments;

  uint24 public globalCapacityRatio;
  uint24 public globalRewardsRatio;
  uint64 public override stakingPoolCount;

  /*
    bit map representing which assets are globally supported for paying for and for paying out covers
    If the the bit at position N is 1 it means asset with index N is supported.this
    Eg. coverAssetsFallback = 3 (in binary 11) means assets at index 0 and 1 are supported.
  */
  uint32 public coverAssetsFallback;

  // Global active cover amount per asset.
  mapping(uint24 => uint) public override totalActiveCoverInAsset;

  bool public coverAmountTrackingEnabled;
  bool public activeCoverAmountCommitted;

  /* ========== CONSTRUCTOR ========== */

  constructor(
    IQuotationData _quotationData,
    IProductsV1 _productsV1,
    address _coverNFT,
    address _stakingPoolImplementation,
    address coverProxyAddress
  ) {

    // initialize immutable fields only
    quotationData = _quotationData;
    productsV1 = _productsV1;
    coverNFT = _coverNFT;

    stakingPoolProxyCodeHash = CoverUtilsLib.calculateProxyCodeHash(coverProxyAddress);
    stakingPoolImplementation = _stakingPoolImplementation;
  }

  /* === MUTATIVE FUNCTIONS ==== */

  /// @dev Migrates covers from V1. Meant to be used by EOA Nexus Mutual members
  ///
  /// @param coverIds    Legacy (V1) cover identifiers
  /// @param toNewOwner  The address for which the V2 cover NFT is minted
  function migrateCovers(uint[] calldata coverIds, address toNewOwner) external override {
    for (uint i = 0; i < coverIds.length; i++) {
      _migrateCoverFromOwner(coverIds[i], msg.sender, toNewOwner);
    }
  }

  /// @dev Migrates covers from V1. Meant to be used by Claims.sol and Gateway.sol to allow the
  /// users of distributor contracts to migrate their NFTs.
  ///
  /// @param coverId     V1 cover identifier
  /// @param fromOwner   The address from where this function is called that needs to match the
  /// @param toNewOwner  The address for which the V2 cover NFT is minted
  function migrateCoverFromOwner(
    uint coverId,
    address fromOwner,
    address toNewOwner
  ) external override onlyInternal {
    _migrateCoverFromOwner(coverId, fromOwner, toNewOwner);
  }

  /// @dev Migrates covers from V1
  ///
  /// @param coverId     V1 cover identifier
  /// @param fromOwner   The address from where this function is called that needs to match the
  /// @param toNewOwner  The address for which the V2 cover NFT is minted
  function _migrateCoverFromOwner(
    uint coverId,
    address fromOwner,
    address toNewOwner
  ) internal {

    CoverUtilsLib.migrateCoverFromOwner(
      CoverUtilsLib.MigrateParams(
        coverId,
        fromOwner,
        toNewOwner,
        ICoverNFT(coverNFT),
        quotationData,
        tokenController(),
        productsV1
      ),
      _products,
      _productTypes,
      _coverData,
      _coverSegments
    );
  }

  function buyCover(
    BuyCoverParams memory params,
    PoolAllocationRequest[] memory allocationRequests
  ) external payable override onlyMember whenNotPaused nonReentrant returns (uint /*coverId*/) {

    require(_products.length > params.productId, "Cover: Product not found");

    Product memory product = _products[params.productId];
    require(product.initialPriceRatio != 0, "Cover: Product not initialized");

    IPool _pool = pool();
    uint32 deprecatedCoverAssetsBitmap = _pool.deprecatedCoverAssetsBitmap();

    require(
      isAssetSupported(_getSupportedCoverAssets(deprecatedCoverAssetsBitmap, product.coverAssets), params.payoutAsset),
      "Cover: Payout asset is not supported"
    );
    require(
      !_isCoverAssetDeprecated(deprecatedCoverAssetsBitmap, params.paymentAsset),
      "Cover: Payment asset deprecated"
    );
    require(params.period >= MIN_COVER_PERIOD, "Cover: Cover period is too short");
    require(params.period <= MAX_COVER_PERIOD, "Cover: Cover period is too long");
    require(params.commissionRatio <= MAX_COMMISSION_RATIO, "Cover: Commission rate is too high");
    require(params.amount > 0, "Cover: amount = 0");

    {
      (uint totalPremiumInNXM, uint totalCoveredAmountInPayoutAsset) = _buyCover(params, _coverData.length, allocationRequests);
      uint tokenPriceInPaymentAsset = _pool.getTokenPrice(params.paymentAsset);

      uint premiumInPaymentAsset = totalPremiumInNXM * tokenPriceInPaymentAsset / NXM_IN_WEI;
      require(premiumInPaymentAsset <= params.maxPremiumInAsset, "Cover: Price exceeds maxPremiumInAsset");

      if (params.payWithNXM) {
        retrieveNXMPayment(totalPremiumInNXM, params.commissionRatio, params.commissionDestination);
      } else {
        retrievePayment(
          premiumInPaymentAsset,
          params.paymentAsset,
          params.commissionRatio,
          params.commissionDestination
        );
      }

      // Enable this when cover amount tracking is necessary
      if (coverAmountTrackingEnabled) {
        totalActiveCoverInAsset[params.payoutAsset] += totalCoveredAmountInPayoutAsset;
      }
    }

    // push the newly created cover
    _coverData.push(CoverData(
        params.productId,
        params.payoutAsset,
        0 // amountPaidOut
    ));

    uint coverId = _coverData.length - 1;
    ICoverNFT(coverNFT).safeMint(params.owner, coverId);

    emit CoverBought(coverId, params.productId, 0, msg.sender, params.ipfsData);
    return coverId;
  }

  function _buyCover(
    BuyCoverParams memory params,
    uint coverId,
    PoolAllocationRequest[] memory allocationRequests
  ) internal returns (uint totalPremiumInNXM, uint) {

    // convert to NXM amount
    uint nxmPriceInPayoutAsset = pool().getTokenPrice(params.payoutAsset);
    uint remainderAmountInNXM = 0;
    uint totalCoverAmountInNXM = 0;

    uint _coverSegmentsCount = _coverSegments[coverId].length;

    for (uint i = 0; i < allocationRequests.length; i++) {

      uint requestedCoverAmountInNXM
        = allocationRequests[i].coverAmountInAsset * NXM_IN_WEI / nxmPriceInPayoutAsset + remainderAmountInNXM;

      (uint coveredAmountInNXM, uint premiumInNXM, uint rewardsInNXM) = allocateCapacity(
        params,
        coverId,
        stakingPool(allocationRequests[i].poolId),
        requestedCoverAmountInNXM
      );

      // apply the global rewards ratio and the total Rewards in NXM
      tokenController().mintStakingPoolNXMRewards(rewardsInNXM, allocationRequests[i].poolId);

      remainderAmountInNXM = requestedCoverAmountInNXM - coveredAmountInNXM;
      totalCoverAmountInNXM += coveredAmountInNXM;
      totalPremiumInNXM += premiumInNXM;

      coverSegmentAllocations[coverId][_coverSegmentsCount].push(
        PoolAllocation(
          allocationRequests[i].poolId,
          SafeUintCast.toUint96(coveredAmountInNXM),
          SafeUintCast.toUint96(premiumInNXM)
        )
      );
    }

    // priceRatio is normalized on a per year basis (eg. 1.5% per year)
    uint16 priceRatio = SafeUintCast.toUint16(
      Math.divRound(
        totalPremiumInNXM * PRICE_DENOMINATOR * ONE_YEAR / params.period,
        totalCoverAmountInNXM
      )
    );

    uint96 totalCoveredAmountInPayoutAsset = SafeUintCast.toUint96(totalCoverAmountInNXM * nxmPriceInPayoutAsset / NXM_IN_WEI);

    _coverSegments[coverId].push(CoverSegment(
        totalCoveredAmountInPayoutAsset, // amount
        uint32(block.timestamp + 1), // start
        SafeUintCast.toUint32(params.period), // period
        priceRatio,
        false, // expired,
        globalRewardsRatio
      ));

    return (totalPremiumInNXM, totalCoveredAmountInPayoutAsset);
  }

  function allocateCapacity(
    BuyCoverParams memory params,
    uint coverId,
    IStakingPool _stakingPool,
    uint amount
  ) internal returns (uint coveredAmountInNXM, uint premiumInNXM, uint rewardsInNXM) {

    Product memory product = _products[params.productId];
    uint gracePeriod = _productTypes[product.productType].gracePeriodInDays * 1 days;

    return _stakingPool.allocateStake(
      CoverRequest(
        coverId,
        params.productId,
        amount,
        params.period,
        gracePeriod,
        globalCapacityRatio,
        product.capacityReductionRatio,
        globalRewardsRatio
      )
    );
  }

  function editCover(
    uint coverId,
    BuyCoverParams memory buyCoverParams,
    PoolAllocationRequest[] memory poolAllocations
  ) external payable onlyMember whenNotPaused nonReentrant {

    CoverData memory cover = _coverData[coverId];
    uint lastCoverSegmentIndex = _coverSegments[coverId].length - 1;
    CoverSegment memory lastCoverSegment = coverSegments(coverId, lastCoverSegmentIndex);

    require(ICoverNFT(coverNFT).isApprovedOrOwner(msg.sender, coverId), "Cover: Only owner or approved can edit");
    require(buyCoverParams.period < MAX_COVER_PERIOD, "Cover: Cover period is too long");
    require(buyCoverParams.commissionRatio <= MAX_COMMISSION_RATIO, "Cover: Commission rate is too high");

    // Override cover specific parameters
    buyCoverParams.payoutAsset = cover.payoutAsset;
    buyCoverParams.productId = cover.productId;

    Product memory product = _products[buyCoverParams.productId];
    uint32 deprecatedCoverAssetsBitmap = pool().deprecatedCoverAssetsBitmap();

    // Check that the payout asset is still supported (it may have been deprecated or disabled in the meantime)
    require(
      isAssetSupported(_getSupportedCoverAssets(deprecatedCoverAssetsBitmap, product.coverAssets), buyCoverParams.payoutAsset),
      "Cover: Payout asset is not supported"
    );
    require(
      !_isCoverAssetDeprecated(deprecatedCoverAssetsBitmap, buyCoverParams.paymentAsset),
      "Cover: payment asset deprecated"
    );

    uint refundInCoverAsset = 0;

    if (lastCoverSegment.start + lastCoverSegment.period > uint32(block.timestamp)) { // not expired
      uint32 remainingPeriod = lastCoverSegment.start + lastCoverSegment.period - uint32(block.timestamp);

      {
        uint originalPoolAllocationsCount = coverSegmentAllocations[coverId][lastCoverSegmentIndex].length;

        // Rollback previous cover
        for (uint i = 0; i < originalPoolAllocationsCount; i++) {

          PoolAllocation memory allocation = coverSegmentAllocations[coverId][lastCoverSegmentIndex][i];

          stakingPool(allocation.poolId).deallocateStake(
            cover.productId,
            lastCoverSegment.start,
            lastCoverSegment.period,
            allocation.coverAmountInNXM,
            allocation.premiumInNXM,
            lastCoverSegment.globalRewardsRatio
          );

          coverSegmentAllocations[coverId][lastCoverSegmentIndex][i].premiumInNXM
            *= (lastCoverSegment.period - remainingPeriod) / lastCoverSegment.period;

          // Compute NXM rewards to be rolled back
          uint deallocatedRewardsInNXM = allocation.premiumInNXM
            * remainingPeriod / lastCoverSegment.period
            * lastCoverSegment.globalRewardsRatio / REWARD_DENOMINATOR;

          tokenController().burnStakingPoolNXMRewards(deallocatedRewardsInNXM, allocation.poolId);
        }
      }

      refundInCoverAsset = lastCoverSegment.priceRatio
        * lastCoverSegment.amount
        / PRICE_DENOMINATOR
        * remainingPeriod
        / MAX_COVER_PERIOD;

      // Edit the last cover segment so it ends at the current block
      lastCoverSegment.period = lastCoverSegment.period - remainingPeriod;
    }

    (uint totalPremiumInNXM, uint totalCoveredAmountInPayoutAsset) = _buyCover(buyCoverParams, coverId, poolAllocations);

    handlePaymentAndRefund(buyCoverParams, totalPremiumInNXM, refundInCoverAsset);

    // Update total cover amount for asset if cover tracking is enabled
    if (coverAmountTrackingEnabled) {
       totalActiveCoverInAsset[cover.payoutAsset] =
        totalActiveCoverInAsset[cover.payoutAsset] - lastCoverSegment.amount + totalCoveredAmountInPayoutAsset;
    }

    emit CoverEdited(coverId, cover.productId, lastCoverSegmentIndex + 1, msg.sender);
  }

  function handlePaymentAndRefund(
    BuyCoverParams memory buyCoverParams,
    uint totalPremiumInNXM,
    uint refundInCoverAsset
  ) internal {

    IPool _pool = pool();

    // calculate refundValue in NXM
    uint refundInNXM = refundInCoverAsset * NXM_IN_WEI / _pool.getTokenPrice(buyCoverParams.payoutAsset);

    if (refundInNXM >= totalPremiumInNXM) {
      // no extra charge for the user
      return;
    }

    uint tokenPriceInPaymentAsset = _pool.getTokenPrice(buyCoverParams.paymentAsset);
    uint premiumInPaymentAsset = totalPremiumInNXM * tokenPriceInPaymentAsset / NXM_IN_WEI;
    require(premiumInPaymentAsset <= buyCoverParams.maxPremiumInAsset, "Cover: Price exceeds maxPremiumInAsset");

    if (buyCoverParams.payWithNXM) {
      // requires NXM allowance
      retrieveNXMPayment(
        totalPremiumInNXM - refundInNXM,
        buyCoverParams.commissionRatio,
        buyCoverParams.commissionDestination
      );
      return;
    }

    // calculate the refund value in the payment asset
    uint refundInPaymentAsset = refundInNXM * tokenPriceInPaymentAsset / NXM_IN_WEI;

    // retrieve extra required payment
    retrievePayment(
      premiumInPaymentAsset - refundInPaymentAsset,
      buyCoverParams.paymentAsset,
      buyCoverParams.commissionRatio,
      buyCoverParams.commissionDestination
    );
  }

  function retrievePayment(
    uint premium,
    uint8 paymentAsset,
    uint16 commissionRatio,
    address commissionDestination
  ) internal {

    // add commission
    uint commission = premium * commissionRatio / COMMISSION_DENOMINATOR;

    if (paymentAsset == 0) {

      uint premiumWithCommission = premium + commission;
      require(msg.value >= premiumWithCommission, "Cover: Insufficient ETH sent");

      uint remainder = msg.value - premiumWithCommission;

      if (remainder > 0) {
        // solhint-disable-next-line avoid-low-level-calls
        (bool ok, /* data */) = address(msg.sender).call{value: remainder}("");
        require(ok, "Cover: Returning ETH remainder to sender failed.");
      }

      // send commission
      if (commission > 0) {
        (bool ok, /* data */) = address(commissionDestination).call{value: commission}("");
        require(ok, "Cover: Sending ETH to commission destination failed.");
      }

      return;
    }

    IPool _pool = pool();

    (
      address payoutAsset,
      /*uint8 decimals*/
    ) = _pool.coverAssets(paymentAsset);

    IERC20 token = IERC20(payoutAsset);
    token.safeTransferFrom(msg.sender, address(_pool), premium);

    if (commission > 0) {
      token.safeTransferFrom(msg.sender, commissionDestination, commission);
    }
  }

  function retrieveNXMPayment(uint price, uint commissionRatio, address commissionDestination) internal {

    ITokenController _tokenController = tokenController();

    if (commissionRatio > 0) {
      uint commission = price * commissionRatio / COMMISSION_DENOMINATOR;
      // transfer the commission to the commissionDestination; reverts if commissionDestination is not a member
      _tokenController.operatorTransfer(msg.sender, commissionDestination, commission);
    }

    _tokenController.burnFrom(msg.sender, price);
  }

  function transferCovers(address from, address to, uint256[] calldata coverIds) external override {
    require(
      msg.sender == internalContracts[uint(ID.MR)],
      "Cover: Only MemberRoles is permitted to use operator transfer"
    );

    ICoverNFT coverNFTContract = ICoverNFT(coverNFT);
    for (uint256 i = 0; i < coverIds.length; i++) {
      coverNFTContract.operatorTransferFrom(from, to, coverIds[i]);
    }
  }

  function createStakingPool(
    address manager,
    bool isPrivatePool,
    uint initialPoolFee,
    uint maxPoolFee,
    ProductInitializationParams[] memory productInitializationParams,
    uint depositAmount,
    uint trancheId
  ) external returns (address) {
    CoverUtilsLib.PoolInitializationParams memory poolInitializationParams = CoverUtilsLib.PoolInitializationParams(
      stakingPoolCount,
      manager,
      isPrivatePool,
      initialPoolFee,
      maxPoolFee
    );

    address stakingPoolAddress = CoverUtilsLib.createStakingPool(
      _products,
      poolInitializationParams,
      productInitializationParams,
      depositAmount,
      trancheId,
      master.getLatestAddress("PS")
    );

    emit StakingPoolCreated(stakingPoolAddress, stakingPoolCount, manager, stakingPoolImplementation);

    stakingPoolCount++;

    return stakingPoolAddress;
  }

  function performStakeBurn(
    uint coverId,
    uint segmentId,
    uint burnAmount
  ) external onlyInternal override returns (address /* owner */) {

    ICoverNFT coverNFTContract = ICoverNFT(coverNFT);
    address owner = coverNFTContract.ownerOf(coverId);

    CoverData storage cover = _coverData[coverId];
    CoverSegment memory segment = coverSegments(coverId, segmentId);
    PoolAllocation[] storage allocations = coverSegmentAllocations[coverId][segmentId];

    // increase amountPaidOut only *after* you read the segment
    cover.amountPaidOut += SafeUintCast.toUint96(burnAmount);

    uint allocationCount = allocations.length;
    for (uint i = 0; i < allocationCount; i++) {

      PoolAllocation memory allocation = allocations[i];
      IStakingPool _stakingPool = stakingPool(allocation.poolId);

      uint nxmBurned = allocation.coverAmountInNXM
      * burnAmount / segment.amount
      * GLOBAL_CAPACITY_DENOMINATOR / globalCapacityRatio;

      _stakingPool.burnStake(cover.productId, segment.start, segment.period, nxmBurned);

      uint payoutAmountInNXM = allocation.coverAmountInNXM * burnAmount / segment.amount;
      allocation.coverAmountInNXM -= SafeUintCast.toUint96(payoutAmountInNXM);
    }

    return owner;
  }

  /* ========== VIEWS ========== */

  function stakingPool(uint index) public view returns (IStakingPool) {
    return CoverUtilsLib.stakingPool(index, stakingPoolProxyCodeHash);
  }

  function coverData(uint coverId) external override view returns (CoverData memory) {
    return _coverData[coverId];
  }

  function coverSegments(
    uint coverId,
    uint segmentId
  ) public override view returns (CoverSegment memory) {
    CoverSegment memory segment = _coverSegments[coverId][segmentId];
    uint96 amountPaidOut = _coverData[coverId].amountPaidOut;
    segment.amount = segment.amount >= amountPaidOut
      ? segment.amount - amountPaidOut
      : 0;
    return segment;
  }

  function coverSegmentsCount(uint coverId) external override view returns (uint) {
    return _coverSegments[coverId].length;
  }

  function products(uint id) external override view returns (Product memory) {
    return _products[id];
  }

  function productsCount() external override view returns (uint) {
    return _products.length;
  }

  function productTypes(uint id) external override view returns (ProductType memory) {
    return _productTypes[id];
  }

  /* ========== PRODUCT CONFIGURATION ========== */

  function addProducts(
    Product[] calldata newProducts,
    string[] calldata ipfsMetadata
  ) external override onlyAdvisoryBoard {
    uint initialProductsCount = _products.length;
    for (uint i = 0; i < newProducts.length; i++) {
      _products.push(newProducts[i]);
      emit ProductUpserted(initialProductsCount + i, ipfsMetadata[i]);
    }
  }

  function addProductTypes(
    ProductType[] calldata newProductTypes,
    string[] calldata ipfsMetadata
  ) external override onlyAdvisoryBoard {
    uint initialProuctTypesCount = _productTypes.length;
    for (uint i = 0; i < newProductTypes.length; i++) {
      _productTypes.push(newProductTypes[i]);
      emit ProductTypeUpserted(initialProuctTypesCount + i, ipfsMetadata[i]);
    }
  }

  function editProductsIpfsMetadata(
    uint[] calldata productIds,
    string[] calldata ipfsMetadata
  ) external override onlyAdvisoryBoard {

    for (uint i = 0; i < productIds.length; i++) {
      emit ProductUpserted(productIds[i], ipfsMetadata[i]);
    }
  }

  function setInitialPrices(
    uint[] calldata productIds,
    uint16[] calldata initialPriceRatios
  ) external override onlyAdvisoryBoard {

    require(productIds.length == initialPriceRatios.length, "Cover: Array lengths must not be different");

    for (uint i = 0; i < productIds.length; i++) {
      require(initialPriceRatios[i] >= GLOBAL_MIN_PRICE_RATIO, "Cover: Initial price must be greater than the global min price");
      _products[productIds[i]].initialPriceRatio = initialPriceRatios[i];
    }
  }

  function setCapacityReductionRatio(uint productId, uint16 reduction) external onlyAdvisoryBoard {

    require(reduction <= CAPACITY_REDUCTION_DENOMINATOR, "Cover: LTADeduction must be less than or equal to 100%");
    _products[productId].capacityReductionRatio = reduction;
  }

  /* ========== ACTIVE COVER AMOUNT TRACKING ========== */

  function enableActiveCoverAmountTracking(uint24[] memory assetIds, uint[] memory activeCoverAmountsForAssets) external onlyEmergencyAdmin {

    require(!activeCoverAmountCommitted, "Cover: activeCoverAmountCommitted is already true");
    require(assetIds.length == activeCoverAmountsForAssets.length, "Cover: Array lengths must not be different");

    if (!coverAmountTrackingEnabled) {
      coverAmountTrackingEnabled = true;
    }

    for (uint i = 0; i < assetIds.length; i++) {
      totalActiveCoverInAsset[assetIds[i]] = activeCoverAmountsForAssets[i];
    }
  }

  function commitActiveCoverAmounts() external onlyEmergencyAdmin {

    require(!activeCoverAmountCommitted, "Cover: activeCoverAmountCommitted is already true");
    activeCoverAmountCommitted = true;
  }

  function expireCovers(uint[] calldata coverIds) external {

    for (uint i = 0; i < coverIds.length; i++) {
      expireCover(coverIds[i]);
    }
  }

  function expireCover(uint coverId) public {

    require(coverAmountTrackingEnabled, "Cover: Cover expiring not enabled");

    uint lastCoverSegmentIndex = _coverSegments[coverId].length - 1;
    CoverSegment memory lastCoverSegment = coverSegments(coverId, lastCoverSegmentIndex);

    require(!lastCoverSegment.expired, "Cover: Cover is already expired.");
    require(lastCoverSegment.period + lastCoverSegment.start < block.timestamp, "Cover: Cover is not due to expire yet");
    _coverSegments[coverId][lastCoverSegmentIndex].expired = true;

    CoverData memory cover = _coverData[coverId];
    totalActiveCoverInAsset[cover.payoutAsset] -= lastCoverSegment.amount;

    emit CoverExpired(coverId, lastCoverSegmentIndex);
  }

  /* ========== COVER ASSETS HELPERS ========== */

  function getSupportedCoverAssets(uint productId) public view returns (uint32) {
    return _getSupportedCoverAssets(pool().deprecatedCoverAssetsBitmap(), _products[productId].coverAssets);
  }

  function _getSupportedCoverAssets(
    uint32 deprecatedCoverAssetsBitmap,
    uint32 coverAssetsBitmapForProduct
  ) internal view returns (uint32) {
    coverAssetsBitmapForProduct = coverAssetsBitmapForProduct == 0 ? coverAssetsFallback : coverAssetsBitmapForProduct;
    return coverAssetsBitmapForProduct & ~deprecatedCoverAssetsBitmap;
  }

  function isAssetSupported(uint32 assetsBitMap, uint8 payoutAsset) public pure override returns (bool) {
    return (1 << payoutAsset) & assetsBitMap > 0;
  }

  function _isCoverAssetDeprecated(
    uint32 deprecatedCoverAssetsBitmap,
    uint8 assetId
  ) internal pure returns (bool) {
    return deprecatedCoverAssetsBitmap & (1 << assetId) > 0;
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

  function mcr() internal view returns (IMCR) {
    return IMCR(internalContracts[uint(ID.MC)]);
  }

  function changeDependentContractAddress() external override {
    master = INXMMaster(master);
    internalContracts[uint(ID.P1)] = master.getLatestAddress("P1");
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
    internalContracts[uint(ID.MC)] = master.getLatestAddress("MC");
  }

  /**
     * @param paramNames  An array of elements from UintParams enum
     * @param values An array of the new values, each one corresponding to the parameter
    */
  function updateUintParameters(
    CoverUintParams[] calldata paramNames,
    uint[] calldata values
  ) external onlyGovernance {

    for (uint i = 0; i < paramNames.length; i++) {
      if (paramNames[i] == CoverUintParams.globalCapacityRatio) {
        globalCapacityRatio = uint24(values[i]);
        continue;
      }
      if (paramNames[i] == CoverUintParams.globalRewardsRatio) {
        globalRewardsRatio = uint24(values[i]);
        continue;
      }
      if (paramNames[i] == CoverUintParams.coverAssetsFallback) {
        coverAssetsFallback = uint32(values[i]);
        continue;
      }
    }
  }
}

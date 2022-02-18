// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-v4/proxy/beacon/UpgradeableBeacon.sol";

import "../../utils/SafeUintCast.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/IQuotationData.sol";
import "../../interfaces/IPool.sol";
import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/ICoverNFT.sol";
import "../../interfaces/IProductsV1.sol";
import "../../interfaces/IMCR.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/IStakingPoolBeacon.sol";

import "./MinimalBeaconProxy.sol";

contract Cover is ICover, MasterAwareV2, IStakingPoolBeacon {
  using SafeERC20 for IERC20;

  /* === CONSTANTS ==== */

  uint public constant STAKE_SPEED_UNIT = 100000e18;
  uint public constant PRICE_CURVE_EXPONENT = 7;
  uint public constant MAX_PRICE_PERCENTAGE = 1e20;
  uint public constant BUCKET_SIZE = 7 days;
  uint public constant REWARD_DENOMINATOR = 2;

  uint public constant PRICE_DENOMINATOR = 10000;
  uint public constant COMMISSION_DENOMINATOR = 10000;
  uint public constant CAPACITY_REDUCTION_DENOMINATOR = 10000;

  uint public constant MAX_COVER_PERIOD = 365 days;
  uint public constant MIN_COVER_PERIOD = 30 days;

  uint public constant MAX_COMMISSION_RATIO = 2500; // 25%

  uint public constant GLOBAL_MIN_PRICE_RATIO = 100; // 1%

  IQuotationData internal immutable quotationData;
  IProductsV1 internal immutable productsV1;
  bytes32 public immutable stakingPoolProxyCodeHash;
  address public immutable override coverNFT;
  address public immutable override stakingPoolImplementation;

  /* ========== STATE VARIABLES ========== */

  Product[] internal _products;
  ProductType[] internal _productTypes;

  CoverData[] private _coverData;
  mapping(uint => mapping(uint => PoolAllocation[])) public coverSegmentAllocations;

  /*
    Each Cover has an array of segments. A new segment is created everytime a cover is edited to
    deliniate the different cover periods.
  */
  mapping(uint => CoverSegment[]) private _coverSegments;


  uint24 public globalCapacityRatio;
  uint24 public globalRewardsRatio;
  uint64 public stakingPoolCounter;

  /*
    bit map representing which assets are globally supported for paying for and for paying out covers
    If the the bit at position N is 1 it means asset with index N is supported.this
    Eg. coverAssetsFallback = 3 (in binary 11) means assets at index 0 and 1 are supported.
  */
  uint32 public coverAssetsFallback;

  /*
    Global active cover amount per asset.
   */
  mapping(uint24 => uint96) public totalActiveCoverAmountInAsset;
  mapping(uint24 => mapping(uint => uint96)) public totalActiveCoverInAssetExpiryBucket;
  mapping(uint24 => uint32) public lastGlobalBuckets;


  event StakingPoolCreated(address stakingPoolAddress, address manager, address stakingPoolImplementation);

  /* ========== CONSTRUCTOR ========== */

  constructor(
    IQuotationData _quotationData,
    IProductsV1 _productsV1,
    address _stakingPoolImplementation,
    address _coverNFT,
    address coverProxy
  ) {

    // initialize immutable fields only
    quotationData = _quotationData;
    productsV1 = _productsV1;
    stakingPoolProxyCodeHash = keccak256(
      abi.encodePacked(
        type(MinimalBeaconProxy).creationCode,
        abi.encode(coverProxy)
      )
    );
    stakingPoolImplementation =  _stakingPoolImplementation;
    coverNFT = _coverNFT;
  }

  function initialize() public {
    require(lastGlobalBuckets[0] == 0, "Cover: Already initalized");

    uint32 initialBucket = SafeUintCast.toUint32(block.timestamp / BUCKET_SIZE);
    lastGlobalBuckets[0] = initialBucket;
    lastGlobalBuckets[1] = initialBucket;
  }

  /* === MUTATIVE FUNCTIONS ==== */

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
    (
      /*uint coverId*/,
      address coverOwner,
      address legacyProductId,
      bytes4 currencyCode,
      /*uint sumAssured*/,
      /*uint premiumNXM*/
    ) = quotationData.getCoverDetailsByCoverID1(coverId);
    (
      /*uint coverId*/,
      uint8 status,
      uint sumAssured,
      uint16 coverPeriodInDays,
      uint validUntil
    ) = quotationData.getCoverDetailsByCoverID2(coverId);

    require(fromOwner == coverOwner, "Cover can only be migrated by its owner");
    require(LegacyCoverStatus(status) != LegacyCoverStatus.Migrated, "Cover has already been migrated");
    require(LegacyCoverStatus(status) != LegacyCoverStatus.ClaimAccepted, "A claim has already been accepted");

    {
      (uint claimCount , bool hasOpenClaim,  /*hasAcceptedClaim*/) = tokenController().coverInfo(coverId);
      require(!hasOpenClaim, "Cover has an open V1 claim");
      require(claimCount < 2, "Cover already has 2 claims");
    }

    // Mark cover as migrated to prevent future calls on the same cover
    quotationData.changeCoverStatusNo(coverId, uint8(LegacyCoverStatus.Migrated));


    // mint the new cover
    uint productId = productsV1.getNewProductId(legacyProductId);
    Product memory product = _products[productId];
    ProductType memory productType = _productTypes[product.productType];
    require(
      block.timestamp < validUntil + productType.gracePeriodInDays * 1 days,
      "Cover outside of the grace period"
    );

    uint newCoverId = _coverData.length;

    _coverData.push(
      CoverData(
        uint24(productId),
        currencyCode == "ETH" ? 0 : 1, //payoutAsset
        0 // amountPaidOut
      )
    );

    _coverSegments[newCoverId].push(
      CoverSegment(
        SafeUintCast.toUint96(sumAssured * 10 ** 18),
        SafeUintCast.toUint32(validUntil - coverPeriodInDays * 1 days),
        SafeUintCast.toUint32(coverPeriodInDays * 1 days),
        uint16(0)
      )
    );

    ICoverNFT(coverNFT).safeMint(toNewOwner, newCoverId);
  }

  /// @dev Migrates covers from V1. Meant to be used by EOA Nexus Mutual members
  ///
  /// @param coverIds    Legacy (V1) cover identifiers
  /// @param toNewOwner  The address for which the V2 cover NFT is minted
  function migrateCovers(uint[] calldata coverIds, address toNewOwner) external override {
    for (uint i = 0; i < coverIds.length; i++) {
      _migrateCoverFromOwner(coverIds[i], msg.sender, toNewOwner);
    }
  }

  function buyCover(
    BuyCoverParams memory params,
    PoolAllocationRequest[] memory allocationRequests
  ) external payable override onlyMember returns (uint /*coverId*/) {

    require(_products.length > params.productId, "Cover: Product not found");
    Product memory product = _products[params.productId];
    require(product.initialPriceRatio != 0, "Cover: Product not initialized");
    require(
      isAssetSupported(product.coverAssets, params.payoutAsset),
      "Cover: Payout asset is not supported"
    );
    require(params.period >= MIN_COVER_PERIOD, "Cover: Cover period is too short");
    require(params.period <= MAX_COVER_PERIOD, "Cover: Cover period is too long");
    require(params.commissionRatio <= MAX_COMMISSION_RATIO, "Cover: Commission rate is too high");

    uint totalPremiumInNXM =
      _buyCover(params, _coverData.length, allocationRequests);

    IPool _pool = pool();
    uint tokenPriceInPaymentAsset = _pool.getTokenPrice(params.paymentAsset);
    (, uint8 paymentAssetDecimals, ) = _pool.assets(params.paymentAsset);

    uint premiumInPaymentAsset = totalPremiumInNXM * (tokenPriceInPaymentAsset / 10 ** paymentAssetDecimals);
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

    // push the newly created cover
    _coverData.push(CoverData(
        params.productId,
        params.payoutAsset,
        0 // amountPaidOut
      ));

    uint coverId = _coverData.length - 1;
    ICoverNFT(coverNFT).safeMint(params.owner, coverId);

    updateGlobalActiveCoverAmountPerAsset(params.period, params.amount, params.payoutAsset);

    return coverId;
  }

  function _buyCover(
    BuyCoverParams memory params,
    uint coverId,
    PoolAllocationRequest[] memory allocationRequests
  ) internal returns (uint totalPremiumInNXM) {
    // convert to NXM amount
    uint nxmPriceInPayoutAsset = pool().getTokenPrice(params.payoutAsset);
    uint remainderAmountInNXM = 0;
    uint totalCoverAmountInNXM = 0;


    uint _coverSegmentsCount = _coverSegments[coverId].length;

    for (uint i = 0; i < allocationRequests.length; i++) {

      uint requestedCoverAmountInNXM = allocationRequests[i].coverAmountInAsset * 1e18 / nxmPriceInPayoutAsset;
      requestedCoverAmountInNXM += remainderAmountInNXM;

      (uint coveredAmountInNXM, uint premiumInNXM) = allocateCapacity(
        params,
        stakingPool(allocationRequests[i].poolId),
        requestedCoverAmountInNXM
      );

      remainderAmountInNXM = requestedCoverAmountInNXM - coveredAmountInNXM;
      totalCoverAmountInNXM += coveredAmountInNXM;
      totalPremiumInNXM += premiumInNXM;

      coverSegmentAllocations[coverId][_coverSegmentsCount].push(
        PoolAllocation(allocationRequests[i].poolId, SafeUintCast.toUint96(coveredAmountInNXM), SafeUintCast.toUint96(premiumInNXM))
      );
    }

    _coverSegments[coverId].push(CoverSegment(
        SafeUintCast.toUint96(totalCoverAmountInNXM * nxmPriceInPayoutAsset / 1e18),
        uint32(block.timestamp + 1),
        SafeUintCast.toUint32(params.period),
        SafeUintCast.toUint16(totalPremiumInNXM * PRICE_DENOMINATOR / totalCoverAmountInNXM)
      ));

    return totalPremiumInNXM;
  }

  function allocateCapacity(
    BuyCoverParams memory params,
    IStakingPool _stakingPool,
    uint amount
  ) internal returns (uint coveredAmountInNXM, uint premiumInNXM) {

    Product memory product = _products[params.productId];
    return _stakingPool.allocateCapacity(IStakingPool.AllocateCapacityParams(
      params.productId,
      amount,
      REWARD_DENOMINATOR,
      params.period,
      globalCapacityRatio,
      globalRewardsRatio,
      product.capacityReductionRatio,
      product.initialPriceRatio
    ));
  }

  function editCover(
    uint coverId,
    BuyCoverParams memory buyCoverParams,
    PoolAllocationRequest[] memory poolAllocations
  ) external payable onlyMember {

    CoverData memory cover = _coverData[coverId];
    uint lastCoverSegmentIndex = _coverSegments[coverId].length - 1;
    CoverSegment memory lastCoverSegment = _coverSegments[coverId][lastCoverSegmentIndex];

    require(lastCoverSegment.start + lastCoverSegment.period > block.timestamp, "Cover: cover expired");
    require(buyCoverParams.period < MAX_COVER_PERIOD, "Cover: Cover period is too long");
    require(buyCoverParams.commissionRatio <= MAX_COMMISSION_RATIO, "Cover: Commission rate is too high");
    require(buyCoverParams.payoutAsset == cover.payoutAsset, "Cover: Payout asset mismatch");

    uint32 remainingPeriod = lastCoverSegment.start + lastCoverSegment.period - uint32(block.timestamp);

    PoolAllocation[] storage originalPoolAllocations = coverSegmentAllocations[coverId][lastCoverSegmentIndex];

    {
      uint originalPoolAllocationsCount = originalPoolAllocations.length;

      // rollback previous cover
      for (uint i = 0; i < originalPoolAllocationsCount; i++) {
        stakingPool(originalPoolAllocations[i].poolId).freeCapacity(
          cover.productId,
          lastCoverSegment.period,
          lastCoverSegment.start,
          originalPoolAllocations[i].premiumInNXM / REWARD_DENOMINATOR,
          remainingPeriod,
          originalPoolAllocations[i].coverAmountInNXM
        );
        originalPoolAllocations[i].premiumInNXM =
        originalPoolAllocations[i].premiumInNXM * (lastCoverSegment.period - remainingPeriod) / lastCoverSegment.period;
      }

      rollbackGlobalActiveCoverAmountPerAsset(
        lastCoverSegment.amount, lastCoverSegment.start + lastCoverSegment.period, cover.payoutAsset
      );
    }

    uint refundInCoverAsset =
      lastCoverSegment.priceRatio * lastCoverSegment.amount
      / PRICE_DENOMINATOR * remainingPeriod
      / lastCoverSegment.period;

    // update the price ratio beased on the shorter period
    lastCoverSegment.priceRatio = SafeUintCast.toUint16(lastCoverSegment.priceRatio * remainingPeriod / lastCoverSegment.period);
    // edit cover so it ends at the current block
    lastCoverSegment.period = lastCoverSegment.period - remainingPeriod;

    uint totalPremiumInNXM =
      _buyCover(buyCoverParams, coverId, poolAllocations);

    handlePaymentAndRefund(buyCoverParams, totalPremiumInNXM, refundInCoverAsset, cover.payoutAsset);

    updateGlobalActiveCoverAmountPerAsset(buyCoverParams.period, buyCoverParams.amount, buyCoverParams.payoutAsset);
  }

  function handlePaymentAndRefund(
    BuyCoverParams memory buyCoverParams,
    uint totalPremiumInNXM,
    uint refundInCoverAsset,
    uint payoutAsset
  ) internal {

    IPool _pool = pool();

    // calculate refundValue in NXM
    uint refundInNXM = refundInCoverAsset * 1e18 / _pool.getTokenPrice(payoutAsset);

    if (refundInNXM >= totalPremiumInNXM) {
      // no extra charge for the user
      return;
    }

    uint tokenPriceInPaymentAsset = _pool.getTokenPrice(buyCoverParams.paymentAsset);
    (, uint8 paymentAssetDecimals, ) = _pool.assets(buyCoverParams.paymentAsset);

    uint premiumInPaymentAsset = totalPremiumInNXM * (tokenPriceInPaymentAsset / 10 ** paymentAssetDecimals);
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
    uint refundInPaymentAsset = refundInNXM * (tokenPriceInPaymentAsset / 10 ** paymentAssetDecimals);
      // retrieve extra required payment
    retrievePayment(
      premiumInPaymentAsset - refundInPaymentAsset,
      buyCoverParams.paymentAsset,
      buyCoverParams.commissionRatio,
      buyCoverParams.commissionDestination
    );
  }

  // TODO: implement properly. we need the staking interface for burning.
  function performPayoutBurn(
    uint coverId,
    uint /*segmentId*/,
    uint amount
  ) external onlyInternal override returns (address /* owner */) {

    ICoverNFT coverNFTContract = ICoverNFT(coverNFT);
    address owner = coverNFTContract.ownerOf(coverId);

    CoverData storage cover = _coverData[coverId];
    cover.amountPaidOut += SafeUintCast.toUint96(amount);

    return owner;
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
    /*uint8 decimals*/,
    /*bool deprecated*/
    ) = _pool.assets(paymentAsset);

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

  /* ========== Active cover amount tracking ========== */

  function updateGlobalActiveCoverAmountPerAsset(uint period, uint amountToCover, uint24 assetId) internal {

    uint activeCoverAmount = getGlobalActiveCoverAmountForAsset(assetId);
    uint32 currentBucket = SafeUintCast.toUint32(block.timestamp / BUCKET_SIZE);

    totalActiveCoverAmountInAsset[assetId] = uint96(activeCoverAmount + amountToCover);
    lastGlobalBuckets[assetId] = currentBucket;
    totalActiveCoverInAssetExpiryBucket[assetId][(block.timestamp + period) / BUCKET_SIZE] = uint96(amountToCover);
  }

  function rollbackGlobalActiveCoverAmountPerAsset(uint amountToRollback, uint endTimestamp, uint24 assetId) internal {
    uint bucket = endTimestamp / BUCKET_SIZE;
    totalActiveCoverInAssetExpiryBucket[assetId][bucket] -= uint96(amountToRollback);
  }

  function getGlobalActiveCoverAmountForAsset(uint24 assetId) public view returns (uint) {
    uint currentBucket = SafeUintCast.toUint32(block.timestamp / BUCKET_SIZE);

    uint activeCoverAmount = totalActiveCoverAmountInAsset[assetId];
    uint32 lastBucket = lastGlobalBuckets[assetId];
    while (lastBucket < currentBucket) {
      ++lastBucket;
      activeCoverAmount -= totalActiveCoverInAssetExpiryBucket[assetId][lastBucket];
    }
    return activeCoverAmount;
  }

  /* ========== Staking Pool creation ========== */


  function createStakingPool(address manager) public override {

    address addr = address(new MinimalBeaconProxy{ salt: bytes32(uint(stakingPoolCounter)) }(address(this)));
    IStakingPool(addr).initialize(manager, stakingPoolCounter);

    stakingPoolCounter++;

    emit StakingPoolCreated(addr, manager, stakingPoolImplementation);
  }

  function stakingPool(uint index) public view returns (IStakingPool) {

    bytes32 hash = keccak256(
      abi.encodePacked(bytes1(0xff), address(this), index, stakingPoolProxyCodeHash)
    );
    // cast last 20 bytes of hash to address
    return IStakingPool(address(uint160(uint(hash))));
  }

  function coverData(uint coverId) external override view returns (CoverData memory) {
    return _coverData[coverId];
  }

  function coverSegments(
    uint coverId,
    uint segmentId
  ) external override view returns (CoverSegment memory) {
    CoverSegment memory segment = _coverSegments[coverId][segmentId];
    uint96 amountPaidOut = _coverData[coverId].amountPaidOut;
    segment.amount = segment.amount >= amountPaidOut
      ? segment.amount - amountPaidOut
      : 0;
    return segment;
  }

  function products(uint id) external override view returns (Product memory) {
    return _products[id];
  }

  function productTypes(uint id) external override view returns (ProductType memory) {
    return _productTypes[id];
  }

  function coverSegmentsCount(uint coverId) external override view returns (uint) {
    return _coverSegments[coverId].length;
  }

  /* ========== PRODUCT CONFIGURATION ========== */

  function setGlobalCapacityRatio(uint24 _globalCapacityRatio) external onlyGovernance {
    globalCapacityRatio = _globalCapacityRatio;
  }

  function setGlobalRewardsRatio(uint24 _globalRewardsRatio) external onlyGovernance {
    globalRewardsRatio = _globalRewardsRatio;
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

  function addProducts(Product[] calldata newProducts) external override onlyAdvisoryBoard {
    for (uint i = 0; i < newProducts.length; i++) {
      _products.push(newProducts[i]);
    }
  }

  function addProductTypes(ProductType[] calldata newProductTypes) external override onlyAdvisoryBoard {
    for (uint i = 0; i < newProductTypes.length; i++) {
      _productTypes.push(newProductTypes[i]);
    }
  }

  function setCoverAssetsFallback(uint32 _coverAssetsFallback) external override onlyGovernance {
    coverAssetsFallback = _coverAssetsFallback;
  }

  /* ========== HELPERS ========== */

  function isAssetSupported(uint32 payoutAssetsBitMap, uint8 payoutAsset) public view override returns (bool) {

    if (payoutAssetsBitMap == 0) {
      return (1 << payoutAsset) & coverAssetsFallback > 0;
    }
    return (1 << payoutAsset) & payoutAssetsBitMap > 0;
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
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
    internalContracts[uint(ID.P1)] = master.getLatestAddress("P1");
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
    internalContracts[uint(ID.MC)] = master.getLatestAddress("MC");
  }
}

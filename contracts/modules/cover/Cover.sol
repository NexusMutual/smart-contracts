// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-v4/proxy/beacon/UpgradeableBeacon.sol";
import "@openzeppelin/contracts-v4/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

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

contract Cover is ICover, MasterAwareV2, IStakingPoolBeacon, ReentrancyGuard {
  using SafeERC20 for IERC20;
  using SafeUintCast for uint;

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

  uint public constant GLOBAL_MIN_PRICE_RATIO = 100; // 1%

  uint private constant ONE_NXM = 1e18;

  uint public constant ETH_ASSET_ID = 0;
  uint public constant NXM_ASSET_ID = type(uint8).max;

  // internally we store capacity using 2 decimals
  // 1 nxm of capacity is stored as 100
  uint private constant ALLOCATION_UNITS_PER_NXM = 100;

  // given capacities have 2 decimals
  // smallest unit we can allocate is 1e18 / 100 = 1e16 = 0.01 NXM
  uint private constant NXM_PER_ALLOCATION_UNIT = ONE_NXM / ALLOCATION_UNITS_PER_NXM;

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

  // Each cover has an array of segments. A new segment is created
  // every time a cover is edited to deliniate the different cover periods.
  mapping(uint => CoverSegment[]) private _coverSegments;

  uint24 public globalCapacityRatio;
  uint24 public globalRewardsRatio;
  uint64 public override stakingPoolCount;

  // Bitmap representing which assets are globally supported for buying and for paying out covers
  // If the the bit at position N is 1 it means asset with index N is supported.this
  // Eg. coverAssetsFallback = 3 (in binary 11) means assets at index 0 and 1 are supported.
  uint32 public coverAssetsFallback;

  // TODO: implement using buckets
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

  function initialize(
  ) external {

    require(globalCapacityRatio == 0, "Cover: already initialized");

    globalCapacityRatio = 20000; // x2
    globalRewardsRatio = 5000; // 50%
    coverAssetsFallback = 3; // 0x11 - DAI and ETH
  }

  /* === MUTATIVE FUNCTIONS ==== */

  /// @dev Migrates covers from V1. Meant to be used by EOA Nexus Mutual members
  ///
  /// @param coverIds    Legacy (V1) cover identifiers
  /// @param newOwner  The address for which the V2 cover NFT is minted
  function migrateCovers(
    uint[] calldata coverIds,
    address newOwner
  ) external override returns (uint[] memory newCoverIds) {
    newCoverIds = new uint[](coverIds.length);
    for (uint i = 0; i < coverIds.length; i++) {
      newCoverIds[i] = _migrateCoverFromOwner(coverIds[i], msg.sender, newOwner);
    }
  }

  /// @dev Migrates covers from V1. Meant to be used by Claims.sol and Gateway.sol to allow the
  /// users of distributor contracts to migrate their NFTs.
  ///
  /// @param coverId     V1 cover identifier
  /// @param fromOwner   The address from where this function is called that needs to match the
  /// @param newOwner  The address for which the V2 cover NFT is minted
  function migrateCoverFromOwner(
    uint coverId,
    address fromOwner,
    address newOwner
  ) external override onlyInternal {
    _migrateCoverFromOwner(coverId, fromOwner, newOwner);
  }

  /// @dev Migrates covers from V1
  ///
  /// @param coverId     V1 cover identifier
  /// @param fromOwner   The address from where this function is called that needs to match the
  /// @param newOwner  The address for which the V2 cover NFT is minted
  function _migrateCoverFromOwner(
    uint coverId,
    address fromOwner,
    address newOwner
  ) internal returns (uint) {

    CoverUtilsLib.migrateCoverFromOwner(
      CoverUtilsLib.MigrateParams(
        coverId,
        fromOwner,
        newOwner,
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

    uint newCoverId = _coverData.length - 1;
    emit CoverMigrated(coverId, fromOwner, newOwner, newCoverId);
    return newCoverId;
  }

  function buyCover(
    BuyCoverParams memory params,
    PoolAllocationRequest[] memory allocationRequests
  ) external payable onlyMember nonReentrant whenNotPaused returns (uint coverId) {

    require(params.period >= MIN_COVER_PERIOD, "Cover: Cover period is too short");
    require(params.period <= MAX_COVER_PERIOD, "Cover: Cover period is too long");
    require(params.commissionRatio <= MAX_COMMISSION_RATIO, "Cover: Commission rate is too high");
    require(params.amount > 0, "Cover: amount = 0");

    {
      require(_products.length > params.productId, "Cover: Product not found");

      Product memory product = _products[params.productId];
      require(!product.isDeprecated, "Cover: Product is deprecated");

      uint32 deprecatedCoverAssets = pool().deprecatedCoverAssetsBitmap();
      uint32 supportedCoverAssets = _getSupportedCoverAssets(deprecatedCoverAssets, product.coverAssets);
      require(isAssetSupported(supportedCoverAssets, params.coverAsset), "Cover: Payout asset is not supported");
      require(!_isCoverAssetDeprecated(deprecatedCoverAssets, params.paymentAsset), "Cover: Payment asset deprecated");
    }

    if (params.coverId == type(uint).max) {

      // new cover
      coverId = _coverData.length;
      _coverData.push(CoverData(params.productId, params.coverAsset, 0 /* amountPaidOut */));
      ICoverNFT(coverNFT).mint(params.owner, coverId);

    } else {

      // existing cover
      coverId = params.coverId;
      require(ICoverNFT(coverNFT).isApprovedOrOwner(msg.sender, coverId), "Cover: Only owner or approved can edit");

      CoverData memory cover = _coverData[coverId];
      require(params.coverAsset == cover.coverAsset, "Cover: unexpected coverAsset requested");
      require(params.productId == cover.productId, "Cover: unexpected productId requested");

      uint lastSegmentIndex = _coverSegments[coverId].length - 1;
      CoverSegment memory lastSegment = coverSegments(coverId, lastSegmentIndex);

      // if the last segment is not expired - make it end at the current block
      if (lastSegment.start + lastSegment.period > block.timestamp) {
        _coverSegments[coverId][lastSegmentIndex].period = (block.timestamp - lastSegment.start).toUint32();
        // TODO: figure out how/where should we handle this
        // tokenController().burnStakingPoolNXMRewards(deallocatedRewardsInNXM, allocation.poolId);
      }
    }

    {
      // convert to NXM amount
      uint nxmPriceInCoverAsset = pool().getTokenPrice(params.coverAsset);
      uint segmentId = _coverSegments[coverId].length;

      uint totalCoverAmountInNXM;
      uint premiumInNXM;

      for (uint i = 0; i < allocationRequests.length; i++) {

        require(allocationRequests[i].coverAmountInAsset > 0, "Cover: coverAmountInAsset = 0");

        // converting asset amount to nxm and rounding up to the nearest NXM_PER_ALLOCATION_UNIT
        uint coveredAmountInNXM = Math.roundUp(
          Math.divCeil(allocationRequests[i].coverAmountInAsset * ONE_NXM, nxmPriceInCoverAsset),
          NXM_PER_ALLOCATION_UNIT
        );

        Product memory product = _products[params.productId];

        AllocationRequest memory allocationRequest = AllocationRequest(
          params.productId,
          coverId,
          coveredAmountInNXM,
          params.period
        );

        AllocationRequestConfig memory config = AllocationRequestConfig(
          uint(_productTypes[product.productType].gracePeriodInDays) * 1 days,
          globalCapacityRatio,
          product.capacityReductionRatio,
          globalRewardsRatio,
          GLOBAL_MIN_PRICE_RATIO
        );

        premiumInNXM += stakingPool(allocationRequests[i].poolId).allocateCapacity(allocationRequest, config);
        totalCoverAmountInNXM += coveredAmountInNXM;

        coverSegmentAllocations[coverId][segmentId].push(
          PoolAllocation(
            allocationRequests[i].poolId,
            SafeUintCast.toUint96(coveredAmountInNXM)
          )
        );
      }

      uint coverAmountInCoverAsset = totalCoverAmountInNXM * nxmPriceInCoverAsset / ONE_NXM;

      _coverSegments[coverId].push(
        CoverSegment(
          coverAmountInCoverAsset.toUint96(), // amount
          uint32(block.timestamp + 1), // start
          SafeUintCast.toUint32(params.period), // period
          _productTypes[_products[params.productId].productType].gracePeriodInDays,
          globalRewardsRatio
        )
      );

      retrievePayment(
        premiumInNXM,
        params.paymentAsset,
        params.maxPremiumInAsset,
        params.commissionRatio,
        params.commissionDestination
      );

      // TODO: implement using buckets
      totalActiveCoverInAsset[params.coverAsset] += coverAmountInCoverAsset;

      emit CoverEdited(coverId, params.productId, segmentId, msg.sender, params.ipfsData);
    }
  }

  function retrievePayment(
    uint premiumInNxm,
    uint8 paymentAsset,
    uint maxPremiumInAsset,
    uint16 commissionRatio,
    address commissionDestination
  ) internal {

    // NXM payment
    if (paymentAsset == NXM_ASSET_ID) {
      require(premiumInNxm <= maxPremiumInAsset, "Cover: Price exceeds maxPremiumInAsset");

      ITokenController _tokenController = tokenController();
      _tokenController.burnFrom(msg.sender, premiumInNxm);

      if (commissionRatio > 0) {
        uint commissionInNxm = premiumInNxm * commissionRatio / COMMISSION_DENOMINATOR;
        // commission transfer reverts if the commissionDestination is not a member
        _tokenController.operatorTransfer(msg.sender, commissionDestination, commissionInNxm);
      }

      return;
    }

    IPool _pool = pool();
    uint premiumInPaymentAsset = _pool.getTokenPrice(paymentAsset) * premiumInNxm / ONE_NXM;
    uint commission = premiumInPaymentAsset * commissionRatio / COMMISSION_DENOMINATOR;

    require(premiumInPaymentAsset <= maxPremiumInAsset, "Cover: Price exceeds maxPremiumInAsset");

    // ETH payment
    if (paymentAsset == ETH_ASSET_ID) {

      uint premiumWithCommission = premiumInPaymentAsset + commission;
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

    (address coverAsset, /*uint8 decimals*/) = _pool.coverAssets(paymentAsset);
    IERC20 token = IERC20(coverAsset);
    token.safeTransferFrom(msg.sender, address(_pool), premiumInPaymentAsset);

    if (commission > 0) {
      token.safeTransferFrom(msg.sender, commissionDestination, commission);
    }
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
    uint trancheId,
    string calldata ipfsDescriptionHash
  ) external returns (address) {
    CoverUtilsLib.PoolInitializationParams memory poolInitializationParams = CoverUtilsLib.PoolInitializationParams(
      stakingPoolCount,
      manager,
      isPrivatePool,
      initialPoolFee,
      maxPoolFee,
      GLOBAL_MIN_PRICE_RATIO
    );

    address stakingPoolAddress = CoverUtilsLib.createStakingPool(
      _products,
      poolInitializationParams,
      productInitializationParams,
      depositAmount,
      trancheId,
      master.getLatestAddress("PS"),
      ipfsDescriptionHash
    );

    emit StakingPoolCreated(
      stakingPoolAddress,
      stakingPoolCount,
      manager,
      stakingPoolImplementation
    );

    stakingPoolCount++;

    return stakingPoolAddress;
  }

  function burnStake(
    uint coverId,
    uint segmentId,
    uint burnAmount
  ) external onlyInternal override returns (address /* owner */) {

    CoverData storage cover =_coverData[coverId];
    CoverSegment memory segment = coverSegments(coverId, segmentId);
    PoolAllocation[] storage allocations = coverSegmentAllocations[coverId][segmentId];

    // TODO: implement using buckets
    // totalActiveCoverInAsset[cover.coverAsset] -= burnAmount;

    // increase amountPaidOut only *after* you read the segment
    cover.amountPaidOut += SafeUintCast.toUint96(burnAmount);

    uint allocationCount = allocations.length;
    for (uint i = 0; i < allocationCount; i++) {

      PoolAllocation memory allocation = allocations[i];

      uint burnAmountInNXM = allocation.coverAmountInNXM
        * burnAmount / segment.amount
        * GLOBAL_CAPACITY_DENOMINATOR / globalCapacityRatio;

      stakingPool(i).burnStake(cover.productId, segment.start, segment.period, burnAmountInNXM);

      uint payoutAmountInNXM = allocation.coverAmountInNXM * burnAmount / segment.amount;
      allocations[i].coverAmountInNXM -= SafeUintCast.toUint96(payoutAmountInNXM);
    }

    return ICoverNFT(coverNFT).ownerOf(coverId);
  }

  /* ========== VIEWS ========== */

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

  function getProducts() external view returns (Product[] memory) {
    return _products;
  }

  function productTypes(uint id) external override view returns (ProductType memory) {
    return _productTypes[id];
  }

  /* ========== PRODUCT CONFIGURATION ========== */

  function setProducts(ProductParam[] calldata productParams) external override onlyAdvisoryBoard {
    uint32 _coverAssetsFallback = coverAssetsFallback;
    uint productTypesCount = _productTypes.length;

    for (uint i = 0; i < productParams.length; i++) {
      ProductParam calldata param = productParams[i];
      Product calldata product = param.product;
      require(product.productType < productTypesCount, "Cover: Invalid productType");
      require(
        areAssetsSupported(product.coverAssets, _coverAssetsFallback),
        "Cover: Unsupported cover assets"
      );
      require(
        product.initialPriceRatio >= GLOBAL_MIN_PRICE_RATIO,
        "Cover: initialPriceRatio < GLOBAL_MIN_PRICE_RATIO"
      );
      require(
        product.initialPriceRatio <= PRICE_DENOMINATOR,
        "Cover: initialPriceRatio > 100%"
      );
      require(
        product.capacityReductionRatio <= CAPACITY_REDUCTION_DENOMINATOR,
        "Cover: capacityReductionRatio > 100%"
      );

      // New product has id == uint256.max
      if (param.productId == type(uint256).max) {
        emit ProductSet(_products.length, param.ipfsMetadata);
        _products.push(product);
        continue;
      }

      // existing product
      require(param.productId < _products.length, "Cover: Product doesnt exist. Set id to uint256.max to add it");
      Product storage newProductValue = _products[param.productId];
      newProductValue.isDeprecated = product.isDeprecated;
      newProductValue.coverAssets = product.coverAssets;
      newProductValue.initialPriceRatio = product.initialPriceRatio;
      newProductValue.capacityReductionRatio = product.capacityReductionRatio;

      if (bytes(param.ipfsMetadata).length > 0) {
        emit ProductSet(param.productId, param.ipfsMetadata);
      }
    }
  }

  function setProductTypes(ProductTypeParam[] calldata productTypeParams) external onlyAdvisoryBoard {

    for (uint i = 0; i < productTypeParams.length; i++) {
      ProductTypeParam calldata param = productTypeParams[i];

      // New product has id == uint256.max
      if (param.productTypeId == type(uint256).max) {
        emit ProductTypeSet(_productTypes.length, param.ipfsMetadata);
        _productTypes.push(param.productType);
        continue;
      }

      require(param.productTypeId < _productTypes.length, "Cover: ProductType doesnt exist. Set id to uint256.max to add it");
      _productTypes[param.productTypeId].gracePeriodInDays = param.productType.gracePeriodInDays;
      emit ProductTypeSet(param.productTypeId, param.ipfsMetadata);
    }
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

  function isAssetSupported(uint32 assetsBitMap, uint8 coverAsset) public pure override returns (bool) {
    return (1 << coverAsset) & assetsBitMap > 0;
  }

  function getPriceAndCapacityRatios(uint[] calldata productIds) public view returns (
    uint _globalCapacityRatio,
    uint _globalMinPriceRatio,
    uint[] memory _initialPrices,
    uint[] memory _capacityReductionRatios
  ) {
    _globalMinPriceRatio = GLOBAL_MIN_PRICE_RATIO;
    _globalCapacityRatio = uint(globalCapacityRatio);
    _capacityReductionRatios = new uint[](productIds.length);
    _initialPrices  = new uint[](productIds.length);

    for (uint i = 0; i < productIds.length; i++) {
      Product memory product = _products[productIds[i]];
      require(product.initialPriceRatio > 0, "Cover: Product deprecated or not initialized");
      _initialPrices[i] = uint(product.initialPriceRatio);
      _capacityReductionRatios[i] = uint(product.capacityReductionRatio);
    }
  }

  function _isCoverAssetDeprecated(
    uint32 deprecatedCoverAssetsBitmap,
    uint8 assetId
  ) internal pure returns (bool) {
    return deprecatedCoverAssetsBitmap & (1 << assetId) > 0;
  }


  /// @dev Returns true if the assetsBitMap set is included in the coverAssetFallback set
  ///
  /// @param assetsBitMap the assets bitmap for a product
  /// @param coverAssetFallback  The coverAssetFallback as defined for the storage var with the same name
  function areAssetsSupported(uint32 assetsBitMap, uint32 coverAssetFallback) public pure returns (bool) {
    return assetsBitMap & bitwiseNegate(coverAssetFallback) == 0;
  }

  function bitwiseNegate(uint32 value) internal pure returns (uint32) {
    return value ^ 0xffffffff;
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

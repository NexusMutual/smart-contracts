
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

  uint public constant MAX_COMMISSION_RATE = 2500; // 25%

  uint public constant GLOBAL_MIN_PRICE_RATIO = 100; // 1%

  IQuotationData internal immutable quotationData;
  IProductsV1 internal immutable productsV1;
  bytes32 public immutable stakingPoolProxyCodeHash;
  address public override stakingPoolImplementation;

  /* ========== STATE VARIABLES ========== */

  Product[] public override products;
  ProductType[] public override productTypes;

  CoverData[] private coverData;
  mapping(uint => mapping(uint => CoverChunk[])) public coverChunksForCoverSegments;

  /*
    Each Cover has an array of segments. A new segment is created everytime a cover is edited to
    deliniate the different cover periods.
  */
  mapping(uint => CoverSegment[]) coverSegments;

  uint32 public globalCapacityRatio;
  uint32 public globalRewardsRatio;

  address public override coverNFT;
  uint public stakingPoolCounter;

  /*
    bit map representing which assets are globally supported for paying for and for paying out covers
    If the the bit at position N is 1 it means asset with index N is supported.this
    Eg. coverAssetsFallback = 3 (in binary 11) means assets at index 0 and 1 are supported.
  */
  uint32 public coverAssetsFallback;


  event StakingPoolCreated(address stakingPoolAddress, address manager, address stakingPoolImplementation);

  /* ========== CONSTRUCTOR ========== */

  constructor(IQuotationData _quotationData, IProductsV1 _productsV1, address _stakingPoolImplementation) {

    quotationData = _quotationData;
    productsV1 = _productsV1;
    stakingPoolProxyCodeHash = keccak256(
      abi.encodePacked(
        type(MinimalBeaconProxy).creationCode,
        abi.encode(address(this))
      )
    );
    stakingPoolImplementation =  _stakingPoolImplementation;
  }

  function initialize(address _coverNFT) public {
    require(coverNFT == address(0), "Cover: already initialized");
    coverNFT = _coverNFT;
  }

  /* === MUTATIVE FUNCTIONS ==== */

  /// @dev Migrates covers from V1 to Cover.sol, meant to be used by Claims.sol and Gateway.sol to
  /// allow the users of distributor contracts to migrate their NFTs.
  ///
  /// @param coverId     V1 cover identifier
  /// @param fromOwner   The address from where this function is called that needs to match the
  /// @param toNewOwner  The address for which the V2 cover NFT is minted
  function migrateCoverFromOwner(
    uint coverId,
    address fromOwner,
    address toNewOwner
  ) public override onlyInternal {
    (
      /*uint coverId*/,
      address coverOwner,
      address legacyProductId,
      bytes4 currencyCode,
      /*uint sumAssured*/,
      uint premiumNXM
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
    require(block.timestamp < validUntil, "Cover expired");

    {
      (uint claimCount , bool hasOpenClaim,  /*hasAcceptedClaim*/) = tokenController().coverInfo(coverId);
      require(!hasOpenClaim, "Cover has an open V1 claim");
      require(claimCount < 2, "Cover already has 2 claims");
    }

    // Mark cover as migrated to prevent future calls on the same cover
    quotationData.changeCoverStatusNo(coverId, uint8(LegacyCoverStatus.Migrated));


    // mint the new cover

    coverData.push(
      CoverData(
        productsV1.getNewProductId(legacyProductId), // productId
        currencyCode == "ETH" ? 0 : 1, //payoutAsset
        0 // amountPaidOut
      )
    );

    coverSegments[coverId].push(
      CoverSegment(
        SafeUintCast.toUint96(sumAssured * 10 ** 18),
        uint32(block.timestamp + 1),
        SafeUintCast.toUint32(coverPeriodInDays * 1 days),
        uint16(0)
      )
    );

    ICoverNFT(coverNFT).safeMint(
      toNewOwner,
      coverData.length - 1 // newCoverId
    );
  }

  /// @dev Migrates covers from V1 to Cover.sol, meant to be used my EOA members
  ///
  /// @param coverId     Legacy (V1) cover identifier
  /// @param toNewOwner  The address for which the V2 cover NFT is minted
  function migrateCover(uint coverId, address toNewOwner) external override {
    migrateCoverFromOwner(coverId, msg.sender, toNewOwner);
  }

  function buyCover(
    BuyCoverParams memory params,
    CoverChunkRequest[] memory coverChunkRequests
  ) external payable override onlyMember returns (uint /*coverId*/) {

    Product memory product = products[params.productId];
    require(product.initialPriceRatio != 0, "Cover: Product not initialized");
    require(
      assetIsSupported(product.coverAssets, params.payoutAsset),
      "Cover: Payout asset is not supported"
    );
    require(params.period >= MIN_COVER_PERIOD, "Cover: Cover period is too short");
    require(params.period <= MAX_COVER_PERIOD, "Cover: Cover period is too long");
    require(params.commissionRatio <= MAX_COMMISSION_RATE, "Cover: Commission rate is too high");

    (uint premiumInPaymentAsset, uint totalPremiumInNXM) = _buyCover(params, coverData.length, coverChunkRequests);
    require(premiumInPaymentAsset <= params.maxPremiumInAsset, "Cover: Price exceeds maxPremiumInAsset");

    if (params.payWithNXM) {
      retrieveNXMPayment(totalPremiumInNXM, params.commissionRatio, params.commissionDestination);
    } else {
      retrievePayment(premiumInPaymentAsset, params);
    }

    // push the newly created cover
    coverData.push(CoverData(
        params.productId,
        params.payoutAsset,
        0 // amountPaidOut
      ));

    uint coverId = coverData.length - 1;
    ICoverNFT(coverNFT).safeMint(params.owner, coverId);

    return coverId;
  }

  function _buyCover(
    BuyCoverParams memory params,
    uint coverId,
    CoverChunkRequest[] memory coverChunkRequests
  ) internal returns (uint, uint) {
    // convert to NXM amount
    uint nxmPriceInPayoutAsset = pool().getTokenPrice(params.payoutAsset);
    uint totalPremiumInNXM = 0;
    uint totalCoverAmountInNXM = 0;
    uint remainderAmountInNXM = 0;

    for (uint i = 0; i < coverChunkRequests.length; i++) {

      uint requestedCoverAmountInNXM = coverChunkRequests[i].coverAmountInAsset * 1e18 / nxmPriceInPayoutAsset;
      requestedCoverAmountInNXM += remainderAmountInNXM;

      (uint coveredAmountInNXM, uint premiumInNXM) = allocateCapacity(
        params,
        stakingPool(coverChunkRequests[i].poolId),
        requestedCoverAmountInNXM
      );

      remainderAmountInNXM = requestedCoverAmountInNXM - coveredAmountInNXM;
      totalCoverAmountInNXM += coveredAmountInNXM;
      totalPremiumInNXM += premiumInNXM;

      coverChunksForCoverSegments[coverId][coverSegments[coverId].length].push(
        CoverChunk(coverChunkRequests[i].poolId, SafeUintCast.toUint96(coveredAmountInNXM), SafeUintCast.toUint96(premiumInNXM))
      );
    }

    coverSegments[coverId].push(CoverSegment(
        SafeUintCast.toUint96(totalCoverAmountInNXM * nxmPriceInPayoutAsset / 1e18),
        uint32(block.timestamp + 1),
        SafeUintCast.toUint32(params.period),
        SafeUintCast.toUint16(totalPremiumInNXM * PRICE_DENOMINATOR / totalCoverAmountInNXM)
      ));

    uint coverId = coverData.length - 1;
    ICoverNFT(coverNFT).safeMint(params.owner, coverId);

    uint premiumInPaymentAsset = totalPremiumInNXM * pool().getTokenPrice(params.paymentAsset) / 1e18;
    return (premiumInPaymentAsset, totalPremiumInNXM);
  }

  function allocateCapacity(
    BuyCoverParams memory params,
    IStakingPool stakingPool,
    uint amount
  ) internal returns (uint, uint) {

    Product memory product = products[params.productId];
    return stakingPool.allocateCapacity(IStakingPool.AllocateCapacityParams(
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
    CoverChunkRequest[] memory coverChunkRequests
  ) external payable onlyMember {

    CoverData memory cover = coverData[coverId];
    uint lastCoverSegmentIndex = coverSegments[coverId].length - 1;
    CoverSegment memory lastCoverSegment = coverSegments[coverId][lastCoverSegmentIndex];

    require(lastCoverSegment.start + lastCoverSegment.period > block.timestamp, "Cover: cover expired");
    require(buyCoverParams.period < MAX_COVER_PERIOD, "Cover: Cover period is too long");
    require(buyCoverParams.commissionRatio <= MAX_COMMISSION_RATE, "Cover: Commission rate is too high");

    uint32 remainingPeriod = lastCoverSegment.start + lastCoverSegment.period - uint32(block.timestamp);

    (, uint8 paymentAssetDecimals, ) = pool().assets(buyCoverParams.paymentAsset);

    CoverChunk[] storage originalCoverChunks = coverChunksForCoverSegments[coverId][lastCoverSegmentIndex];

    {
      uint totalPreviousCoverAmountInNXM = 0;
      // rollback previous cover
      for (uint i = 0; i < originalCoverChunks.length; i++) {
        IStakingPool stakingPool = stakingPool(originalCoverChunks[i].poolId);

        stakingPool.freeCapacity(
          cover.productId,
          lastCoverSegment.period,
          lastCoverSegment.start,
          originalCoverChunks[i].premiumInNXM / REWARD_DENOMINATOR,
          remainingPeriod,
          originalCoverChunks[i].coverAmountInNXM
        );
        totalPreviousCoverAmountInNXM += originalCoverChunks[i].coverAmountInNXM;
        originalCoverChunks[i].premiumInNXM =
        originalCoverChunks[i].premiumInNXM * (lastCoverSegment.period - remainingPeriod) / lastCoverSegment.period;
      }
    }

    uint refundInCoverAsset =
      lastCoverSegment.priceRatio * lastCoverSegment.amount
      / PRICE_DENOMINATOR * remainingPeriod
      / lastCoverSegment.period;

    // edit cover so it ends at the current block
    lastCoverSegment.period = lastCoverSegment.period - remainingPeriod;
    lastCoverSegment.priceRatio = SafeUintCast.toUint16(lastCoverSegment.priceRatio * remainingPeriod / lastCoverSegment.period);

    (uint premiumInPaymentAsset, uint totalPremiumInNXM) =
      _buyCover(buyCoverParams, coverId, coverChunkRequests);

    require(premiumInPaymentAsset <= buyCoverParams.maxPremiumInAsset, "Cover: Price exceeds maxPremiumInAsset");

    uint refundInNXM = refundInCoverAsset * 1e18 / pool().getTokenPrice(cover.payoutAsset);

    if (buyCoverParams.payWithNXM) {
      uint refundInNXM = refundInCoverAsset * 1e18 / pool().getTokenPrice(cover.payoutAsset);
      if (refundInNXM < totalPremiumInNXM) {
        // requires NXM allowance
        retrieveNXMPayment(totalPremiumInNXM - refundInNXM, buyCoverParams.commissionRatio, buyCoverParams.commissionDestination);
      }
    } else {
      uint refundInPaymentAsset =
      refundInNXM
      * (pool().getTokenPrice(buyCoverParams.payoutAsset) / 10 ** paymentAssetDecimals);

      if (refundInPaymentAsset < premiumInPaymentAsset) {
        // retrieve extra required payment
        retrievePayment(premiumInPaymentAsset - refundInPaymentAsset, buyCoverParams);
      }
    }
  }

  function performPayoutBurn(
    uint coverId,
    uint amount
  ) external onlyInternal override returns (address /* owner */) {

    ICoverNFT coverNFTContract = ICoverNFT(coverNFT);
    address owner = coverNFTContract.ownerOf(coverId);

    CoverData storage cover = coverData[coverId];
    cover.amountPaidOut += SafeUintCast.toUint96(amount);

    return owner;
  }


  function retrievePayment(
    uint premium,
    BuyCoverParams memory buyParams
  ) internal {

    // add commission
    uint commission = premium * buyParams.commissionRatio / COMMISSION_DENOMINATOR;
    uint premiumWithCommission = premium + commission;

    if (buyParams.paymentAsset == 0) {
      require(msg.value >= premiumWithCommission, "Cover: Insufficient ETH sent");
      uint remainder = msg.value - premiumWithCommission;

      if (remainder > 0) {
        // solhint-disable-next-line avoid-low-level-calls
        (bool ok, /* data */) = address(msg.sender).call{value: remainder}("");
        require(ok, "Cover: Returning ETH remainder to sender failed.");
      }

      // send commission
      if (commission > 0) {
        (bool ok, /* data */) = address(buyParams.commissionDestination).call{value: commission}("");
        require(ok, "Cover: Sending ETH to commission destination failed.");
      }

      return;
    }

    IPool pool = pool();

    (
    address payoutAsset,
    /*uint8 decimals*/,
    /*bool deprecated*/
    ) = pool.assets(buyParams.paymentAsset);

    IERC20 token = IERC20(payoutAsset);
    token.safeTransferFrom(msg.sender, address(pool), premium);

    if (commission > 0) {
      token.safeTransfer(buyParams.commissionDestination, commission);
    }
  }

  function retrieveNXMPayment(uint price, uint commissionRatio, address commissionDestination) internal {

    ITokenController tokenController = tokenController();

    if (commissionRatio > 0) {
      uint commission = price * commissionRatio / COMMISSION_DENOMINATOR;
      // transfer the commission to the commissionDestination; reverts if commissionDestination is not a member
      tokenController.token().transferFrom(msg.sender, commissionDestination, commission);
    }

    tokenController.burnFrom(msg.sender, price);
  }

  /* ========== Staking Pool creation ========== */


  function createStakingPool(address manager) public {

    address addr = address(new MinimalBeaconProxy{ salt: bytes32(stakingPoolCounter) }(address(this)));
    IStakingPool(addr).initialize(manager);

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

  function covers(uint id) external view override returns (uint24, uint8, uint96, uint32, uint32, uint16) {
    CoverData memory cover = coverData[id];
    CoverSegment memory lastCoverSegment = coverSegments[id][coverSegments[id].length - 1];
    return (
      cover.productId,
      cover.payoutAsset,
      lastCoverSegment.amount,
      lastCoverSegment.start,
      lastCoverSegment.period,
      lastCoverSegment.priceRatio
    );
  }

  /* ========== PRODUCT CONFIGURATION ========== */

  function setGlobalCapacityRatio(uint32 _globalCapacityRatio) external onlyGovernance {
    globalCapacityRatio = _globalCapacityRatio;
  }

  function setGlobalRewardsRatio(uint32 _globalRewardsRatio) external onlyGovernance {
    globalRewardsRatio = _globalRewardsRatio;
  }

  function setInitialPrice(uint productId, uint16 initialPriceRatio) external onlyAdvisoryBoard {

    require(initialPriceRatio >= GLOBAL_MIN_PRICE_RATIO, "Cover: Initial price must be greater than the global min price");
    products[productId].initialPriceRatio = initialPriceRatio;
  }

  function setCapacityReductionRatio(uint productId, uint16 reduction) external onlyAdvisoryBoard {
    require(reduction <= CAPACITY_REDUCTION_DENOMINATOR, "Cover: LTADeduction must be less than or equal to 100%");
    products[productId].capacityReductionRatio = reduction;
  }

  function addProduct(Product calldata product) external onlyAdvisoryBoard {
    products.push(product);
  }

  function setCoverAssetsFallback(uint32 _coverAssetsFallback) external onlyGovernance {
    coverAssetsFallback = _coverAssetsFallback;
  }

  /* ========== HELPERS ========== */

  function assetIsSupported(uint32 payoutAssetsBitMap, uint8 payoutAsset) public returns (bool) {

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
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
  }
}

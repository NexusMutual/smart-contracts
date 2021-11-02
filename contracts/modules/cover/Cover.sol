
import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
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
import "hardhat/console.sol";

contract Cover is ICover, MasterAwareV2 {

  /* === CONSTANTS ==== */

  uint public REWARD_BPS = 5000;
  uint public constant PERCENTAGE_CHANGE_PER_DAY_BPS = 100;
  uint public constant BASIS_PRECISION = 10000;
  uint public constant STAKE_SPEED_UNIT = 100000e18;
  uint public constant PRICE_CURVE_EXPONENT = 7;
  uint public constant MAX_PRICE_PERCENTAGE = 1e20;
  uint public constant BUCKET_SIZE = 7 days;
  IQuotationData internal immutable quotationData;
  IProductsV1 internal immutable productsV1;

  /* ========== STATE VARIABLES ========== */

  Product[] public override products;
  ProductType[] public override productTypes;

  CoverData[] public override covers;
  mapping(uint => CoverChunk[]) public coverChunksForCover;

  mapping(uint => uint) initialPrices;

  mapping(uint => uint96) public override activeCoverAmountInNXM;

  mapping(uint => mapping(uint => ProductBucket)) productBuckets;
  mapping(uint => uint) lastProductBucket;

  uint32 public capacityFactor;
  // [todo] Remove this and use covers.length instead
  uint32 public coverCount;

  address public override coverNFT;

  /*
    bit map representing which assets are globally supported for paying for and for paying out covers
    If the the bit at position N is 1 it means asset with index N is supported.this
    Eg. coverAssetsFallback = 3 (in binary 11) means assets at index 0 and 1 are supported.
  */
  uint public coverAssetsFallback;

  /*
    (productId, poolAddress) => lastPrice
    Last base prices at which a cover was sold by a pool for a particular product.
  */
  mapping(uint => mapping(address => LastPrice)) lastPrices;

  /* ========== CONSTRUCTOR ========== */

  constructor(IQuotationData _quotationData, IProductsV1 _productsV1) {
    quotationData = _quotationData;
    productsV1 = _productsV1;
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
    covers.push(
      CoverData(
        productsV1.getNewProductId(legacyProductId), // productId
        currencyCode == "ETH" ? 0 : 1, //payoutAsset
        uint96(sumAssured * 10 ** 18),
        uint32(block.timestamp + 1),
        uint32(coverPeriodInDays * 24 * 60 * 60),
        uint16(0)
      )
    );

    ICoverNFT(coverNFT).safeMint(
      toNewOwner,
      covers.length - 1 // newCoverId
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

    require(initialPrices[params.productId] != 0, "Cover: product not initialized");
    require(
      assetIsSupported(products[params.productId].coverAssets, params.payoutAsset),
      "Cover: Payout asset is not supported"
    );

    (uint coverId, uint premiumInPaymentAsset, uint totalPremiumInNXM) = _buyCover(params, coverChunkRequests);
    require(premiumInPaymentAsset <= params.maxPremiumInAsset, "Cover: Price exceeds maxPremiumInAsset");

    if (params.payWithNXM) {
      tokenController().burnFrom(msg.sender, totalPremiumInNXM);
    } else {
      retrievePayment(premiumInPaymentAsset, params.payoutAsset);

      // mint 10% of paid premium value to user
      tokenController().mint(params.owner, totalPremiumInNXM / 10);
    }
    
    return coverId;
  }

  function _buyCover(
    BuyCoverParams memory params,
    CoverChunkRequest[] memory coverChunkRequests
  ) internal returns (uint, uint, uint) {
    // convert to NXM amount
    uint payoutAssetTokenPrice = pool().getTokenPrice(params.payoutAsset);

    uint totalPremiumInNXM = 0;
    uint totalCoverAmountInNXM = 0;
    for (uint i = 0; i < coverChunkRequests.length; i++) {

      uint requestedCoverAmountInNXM = coverChunkRequests[i].coverAmountInAsset * 1e18 / payoutAssetTokenPrice;

      (uint coveredAmountInNXM, uint premiumInNXM) = buyCoverFromPool(
        IStakingPool(coverChunkRequests[i].poolAddress),
        params.productId,
        requestedCoverAmountInNXM,
        params.period
      );

      // carry over the amount that was not covered by the current pool to the next cover
      if (coveredAmountInNXM < requestedCoverAmountInNXM && i + 1 < coverChunkRequests.length) {

        uint remainder = (requestedCoverAmountInNXM - uint96(coveredAmountInNXM)) * payoutAssetTokenPrice / 1e18;
        coverChunkRequests[i + 1].coverAmountInAsset += remainder;
      } else if (coveredAmountInNXM < requestedCoverAmountInNXM) {
        revert("Not enough available capacity");
      }

      totalCoverAmountInNXM += coveredAmountInNXM;
      totalPremiumInNXM += premiumInNXM;

      coverChunksForCover[coverCount].push(
        CoverChunk(coverChunkRequests[i].poolAddress, uint96(coveredAmountInNXM), uint96(premiumInNXM))
      );
    }

    updateActiveCoverAmountInNXM(params.productId, params.period, totalCoverAmountInNXM);

    uint coverId = covers.length;
    covers.push(CoverData(
        params.productId,
        params.payoutAsset,
        uint96(totalCoverAmountInNXM * payoutAssetTokenPrice / 1e18),
        uint32(block.timestamp + 1),
        uint32(params.period),
        uint16(totalPremiumInNXM * BASIS_PRECISION / totalCoverAmountInNXM)
      ));

    ICoverNFT(coverNFT).safeMint(params.owner, coverId);

    uint premiumInPaymentAsset = totalPremiumInNXM * pool().getTokenPrice(params.paymentAsset) / 1e18;
    return (coverId, premiumInPaymentAsset, totalPremiumInNXM);
  }

  function buyCoverFromPool(
    IStakingPool stakingPool,
    uint24 productId,
    uint amountToCover,
    uint32 period
  ) internal returns (uint, uint) {

    uint availableCapacity = stakingPool.getAvailableCapacity(productId, capacityFactor);

    uint coveredAmount = amountToCover > availableCapacity ? availableCapacity : amountToCover;

    (uint basePrice, uint premiumInNXM) = getPrice(coveredAmount, period, productId, stakingPool);
    lastPrices[productId][address(stakingPool)] = LastPrice(uint96(basePrice), uint32(block.timestamp));

    stakingPool.buyCover(
      productId,
      coveredAmount,
      REWARD_BPS * premiumInNXM / BASIS_PRECISION,
      period,
      capacityFactor
    );

    return (coveredAmount, premiumInNXM);
  }

  function editCover(
    uint coverId,
    BuyCoverParams memory buyCoverParams,
    CoverChunkRequest[] memory coverChunkRequests
  ) external payable onlyMember returns (uint /*coverId*/) {

    CoverData memory cover = covers[coverId];
    require(cover.start + cover.period > block.timestamp, "Cover: cover expired");

    uint32 remainingPeriod = cover.start + cover.period - uint32(block.timestamp);

    (, uint8 paymentAssetDecimals, ) = pool().assets(buyCoverParams.paymentAsset);

    CoverChunk[] storage originalCoverChunks = coverChunksForCover[coverId];

    {
      uint totalPreviousCoverAmountInNXM = 0;
      // rollback previous cover
      for (uint i = 0; i < originalCoverChunks.length; i++) {
        IStakingPool stakingPool = IStakingPool(originalCoverChunks[i].poolAddress);

        stakingPool.reducePeriod(
          cover.productId,
          cover.period,
          cover.start,
          REWARD_BPS * originalCoverChunks[i].premiumInNXM / BASIS_PRECISION,
          remainingPeriod,
          originalCoverChunks[i].coverAmountInNXM
        );
        totalPreviousCoverAmountInNXM += originalCoverChunks[i].coverAmountInNXM;
        originalCoverChunks[i].premiumInNXM =
        originalCoverChunks[i].premiumInNXM * (cover.period - remainingPeriod) / cover.period;
      }

      rollbackActiveCoverAmount(cover.productId, remainingPeriod, totalPreviousCoverAmountInNXM);
    }

    uint refundInCoverAsset = cover.priceRatio * cover.amount / BASIS_PRECISION * remainingPeriod / cover.period;

    // edit cover so it ends at the current block
    cover.period = cover.period - remainingPeriod;
    cover.priceRatio = uint16(cover.priceRatio * remainingPeriod / cover.period);

    (uint newCoverId, uint premiumInPaymentAsset, uint totalPremiumInNXM) = _buyCover(buyCoverParams, coverChunkRequests);

    require(premiumInPaymentAsset <= buyCoverParams.maxPremiumInAsset, "Cover: Price exceeds maxPremiumInAsset");

    uint refundInNXM = refundInCoverAsset * 1e18 / pool().getTokenPrice(cover.payoutAsset);

    if (buyCoverParams.payWithNXM) {
      uint refundInNXM = refundInCoverAsset * 1e18 / pool().getTokenPrice(cover.payoutAsset);
      if (refundInNXM < totalPremiumInNXM) {
        // requires NXM allowance
        tokenController().burnFrom(msg.sender, totalPremiumInNXM - refundInNXM);
      }
    } else {
      uint refundInPaymentAsset =
      refundInNXM
      * (pool().getTokenPrice(buyCoverParams.payoutAsset) / 10 ** paymentAssetDecimals);

      if (refundInPaymentAsset < premiumInPaymentAsset) {
        // retrieve extra required payment
        retrievePayment(premiumInPaymentAsset - refundInPaymentAsset, buyCoverParams.paymentAsset);

        // mint 10% of paid premium value to user
        tokenController().mint(msg.sender, (totalPremiumInNXM - refundInNXM) / 10);
      }
    }

    return newCoverId;
  }

  function updateActiveCoverAmountInNXM(uint productId, uint period, uint amountToCoverInNXM) internal {
    uint currentBucket = block.timestamp / BUCKET_SIZE;

    uint activeCoverAmount = activeCoverAmountInNXM[productId];
    uint lastBucket = lastProductBucket[productId];
    while (lastBucket < currentBucket) {
      ++lastBucket;
      activeCoverAmount -= productBuckets[productId][lastBucket].coverAmountExpiring;
    }

    activeCoverAmountInNXM[productId] = uint96(activeCoverAmount + amountToCoverInNXM);
    require(activeCoverAmountInNXM[productId] < mcr().getMCR() / 5, "Cover: Total cover amount exceeds 20% of MCR");

    lastProductBucket[productId] = lastBucket;

    productBuckets[productId][(block.timestamp + period) / BUCKET_SIZE].coverAmountExpiring = uint96(amountToCoverInNXM);
  }

  function rollbackActiveCoverAmount(uint productId, uint period, uint amountInNXM) internal {
    productBuckets[productId][(block.timestamp + period) / BUCKET_SIZE].coverAmountExpiring -= uint96(amountInNXM);
  }

  function performPayoutBurn(
    uint coverId,
    uint amount
  ) external onlyInternal override returns (address /* owner */) {
    ICoverNFT coverNFTContract = ICoverNFT(coverNFT);
    address owner = coverNFTContract.ownerOf(coverId);
    CoverData memory cover = covers[coverId];
    CoverData memory newCover = CoverData(
      cover.productId,
      cover.payoutAsset,
      uint96(cover.amount - amount),
      uint32(block.timestamp + 1),
      cover.start + cover.period - uint32(block.timestamp),
      cover.priceRatio
    );

    covers[coverCount++] = newCover;

    coverNFTContract.burn(coverId);
    coverNFTContract.safeMint(owner, coverCount - 1);
    return owner;
  }


  function retrievePayment(uint totalPrice, uint8 payoutAssetIndex) internal {

    if (payoutAssetIndex == 0) {
      require(msg.value >= totalPrice, "Cover: Insufficient ETH sent");
      uint remainder = msg.value - totalPrice;

      if (remainder > 0) {
        // solhint-disable-next-line avoid-low-level-calls
        (bool ok, /* data */) = address(msg.sender).call{value: remainder}("");
        require(ok, "Cover: Returning ETH remainder to sender failed.");
      }
    } else {
      (address payoutAsset, /* uint8 decimals */ , /* */) = pool().assets(payoutAssetIndex);
      IERC20 token = IERC20(payoutAsset);
      token.transferFrom(msg.sender, address(this), totalPrice);
    }
  }

  /* ========== PRICE CALCULATION ========== */

  function getPrice(uint amount, uint period, uint productId, IStakingPool stakingPool) public view returns (uint, uint) {

    uint96 lastPrice = lastPrices[productId][address(stakingPool)].value;
    uint basePrice = interpolatePrice(
      lastPrice != 0 ? lastPrice : initialPrices[productId],
      stakingPool.getTargetPrice(productId),
      lastPrices[productId][address(stakingPool)].lastUpdateTime,
      block.timestamp
    );

    uint pricePercentage = calculatePrice(
      amount,
      basePrice,
      stakingPool.getUsedCapacity(productId),
      stakingPool.getCapacity(productId, capacityFactor)
    );

    uint price = pricePercentage * amount / MAX_PRICE_PERCENTAGE * period / 365 days;

    return (basePrice, price);
  }

  /**
    Price changes towards targetPrice from lastPrice by maximum of 1% a day per every 100k NXM staked
  */
  function interpolatePrice(
    uint lastPrice,
    uint targetPrice,
    uint lastPriceUpdate,
    uint currentTimestamp
  ) public pure returns (uint) {

    uint percentageChange =
      (currentTimestamp - lastPriceUpdate) / 1 days * PERCENTAGE_CHANGE_PER_DAY_BPS;

    if (targetPrice > lastPrice) {
      return targetPrice;
    } else {
      return lastPrice - (lastPrice - targetPrice) * percentageChange / BASIS_PRECISION;
    }
  }

  function calculatePrice(
    uint amount,
    uint basePrice,
    uint activeCover,
    uint capacity
  ) public pure returns (uint) {

    return (calculatePriceIntegralAtPoint(
      basePrice,
      activeCover + amount,
      capacity
    ) -
    calculatePriceIntegralAtPoint(
      basePrice,
      activeCover,
      capacity
    )) / amount;
  }

  function calculatePriceIntegralAtPoint(
    uint basePrice,
    uint activeCover,
    uint capacity
  ) public pure returns (uint) {
    uint actualPrice = basePrice * activeCover;
    for (uint i = 0; i < PRICE_CURVE_EXPONENT; i++) {
      actualPrice = actualPrice * activeCover / capacity;
    }
    actualPrice = actualPrice / 8 + basePrice * activeCover;

    return actualPrice;
  }

  /* ========== PRODUCT CONFIGURATION ========== */

  function setCapacityFactor(uint32 _capacityFactor) external onlyGovernance {
    capacityFactor = _capacityFactor;
  }

  function setInitialPrice(uint productId, uint initialPrice) external onlyAdvisoryBoard {
    initialPrices[productId] = initialPrice;
  }

  function addProduct(Product calldata product) external onlyAdvisoryBoard {

    products.push(product);
    lastProductBucket[products.length - 1] = block.timestamp / BUCKET_SIZE;
  }

  function setCoverAssetsFallback(uint _coverAssetsFallback) external onlyGovernance {
    coverAssetsFallback = _coverAssetsFallback;
  }

  /* ========== HELPERS ========== */

  function assetIsSupported(uint payoutAssetsBitMap, uint8 payoutAsset) public returns (bool) {

    if (payoutAssetsBitMap == 0) {
      return 1 << payoutAsset & coverAssetsFallback > 0;
    }
    return 1 << payoutAsset & payoutAssetsBitMap > 0;
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


import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-v4/proxy/beacon/UpgradeableBeacon.sol";

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

  uint public constant GLOBAL_MIN_PRICE = 100; // 1%

  IQuotationData internal immutable quotationData;
  IProductsV1 internal immutable productsV1;
  bytes32 public immutable stakingPoolProxyCodeHash;
  address public override stakingPoolImplementation;

  /* ========== STATE VARIABLES ========== */

  Product[] public override products;
  ProductType[] public override productTypes;

  CoverData[] public override covers;
  mapping(uint => CoverChunk[]) public coverChunksForCover;

  mapping(uint => uint) initialPrices;

  mapping(uint => uint) public capacityReductionRatios;

  uint32 public globalCapacityRatio;
  uint32 public globalRewardsRatio;

  address public override coverNFT;
  uint public stakingPoolCounter;

  /*
    bit map representing which assets are globally supported for paying for and for paying out covers
    If the the bit at position N is 1 it means asset with index N is supported.this
    Eg. coverAssetsFallback = 3 (in binary 11) means assets at index 0 and 1 are supported.
  */
  uint public coverAssetsFallback;


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
    covers.push(
      CoverData(
        productsV1.getNewProductId(legacyProductId), // productId
        currencyCode == "ETH" ? 0 : 1, //payoutAsset
        uint96(sumAssured * 10 ** 18),
        uint32(block.timestamp + 1),
        uint32(coverPeriodInDays * 1 days),
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

    require(initialPrices[params.productId] != 0, "Cover: Product not initialized");
    require(
      assetIsSupported(products[params.productId].coverAssets, params.payoutAsset),
      "Cover: Payout asset is not supported"
    );
    require(params.period >= MIN_COVER_PERIOD, "Cover: Cover period is too short");
    require(params.period <= MAX_COVER_PERIOD, "Cover: Cover period is too long");
    require(params.commissionRatio <= MAX_COMMISSION_RATE, "Cover: Commission rate is too high");

    (uint coverId, uint premiumInPaymentAsset, uint totalPremiumInNXM) = _buyCover(params, coverChunkRequests);
    require(premiumInPaymentAsset <= params.maxPremiumInAsset, "Cover: Price exceeds maxPremiumInAsset");

    if (params.payWithNXM) {
      retrieveNXMPayment(totalPremiumInNXM, params.commissionRatio, params.commissionDestination);
    } else {
      retrievePayment(premiumInPaymentAsset, params);
    }

    return coverId;
  }

  function _buyCover(
    BuyCoverParams memory params,
    CoverChunkRequest[] memory coverChunkRequests
  ) internal returns (uint, uint, uint) {
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

      coverChunksForCover[covers.length].push(
        CoverChunk(coverChunkRequests[i].poolId, uint96(coveredAmountInNXM), uint96(premiumInNXM))
      );
    }

    require(remainderAmountInNXM == 0, "Not enough available capacity");

    covers.push(CoverData(
        params.productId,
        params.payoutAsset,
        uint96(totalCoverAmountInNXM * nxmPriceInPayoutAsset / 1e18),
        uint32(block.timestamp + 1),
        uint32(params.period),
        uint16(totalPremiumInNXM * PRICE_DENOMINATOR / totalCoverAmountInNXM)
      ));

    uint coverId = covers.length - 1;
    ICoverNFT(coverNFT).safeMint(params.owner, coverId);

    uint premiumInPaymentAsset = totalPremiumInNXM * pool().getTokenPrice(params.paymentAsset) / 1e18;
    return (coverId, premiumInPaymentAsset, totalPremiumInNXM);
  }

  function allocateCapacity(
    BuyCoverParams memory params,
    IStakingPool stakingPool,
    uint amount
  ) internal returns (uint, uint) {

    return stakingPool.allocateCapacity(IStakingPool.AllocateCapacityParams(
        params.productId,
        amount,
        REWARD_DENOMINATOR,
        params.period,
        globalCapacityRatio,
        globalRewardsRatio,
        capacityReductionRatios[params.productId],
        initialPrices[params.productId]
      ));
  }

  function editCover(
    uint coverId,
    BuyCoverParams memory buyCoverParams,
    CoverChunkRequest[] memory coverChunkRequests
  ) external payable onlyMember returns (uint /*coverId*/) {

    // TODO: consider implementation using segments instead of minting a new NFT

    CoverData memory cover = covers[coverId];
    require(cover.start + cover.period > block.timestamp, "Cover: cover expired");
    require(buyCoverParams.period < MAX_COVER_PERIOD, "Cover: Cover period is too long");
    require(buyCoverParams.commissionRatio <= MAX_COMMISSION_RATE, "Cover: Commission rate is too high");

    uint32 remainingPeriod = cover.start + cover.period - uint32(block.timestamp);

    (, uint8 paymentAssetDecimals, ) = pool().assets(buyCoverParams.paymentAsset);

    CoverChunk[] storage originalCoverChunks = coverChunksForCover[coverId];

    {
      uint totalPreviousCoverAmountInNXM = 0;
      // rollback previous cover
      for (uint i = 0; i < originalCoverChunks.length; i++) {
        IStakingPool stakingPool = stakingPool(originalCoverChunks[i].poolId);

        stakingPool.freeCapacity(
          cover.productId,
          cover.period,
          cover.start,
          originalCoverChunks[i].premiumInNXM / REWARD_DENOMINATOR,
          remainingPeriod,
          originalCoverChunks[i].coverAmountInNXM
        );
        totalPreviousCoverAmountInNXM += originalCoverChunks[i].coverAmountInNXM;
        originalCoverChunks[i].premiumInNXM =
        originalCoverChunks[i].premiumInNXM * (cover.period - remainingPeriod) / cover.period;
      }
    }

    uint refundInCoverAsset = cover.priceRatio * cover.amount / PRICE_DENOMINATOR * remainingPeriod / cover.period;

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

    return newCoverId;
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

    covers.push(newCover);

    coverNFTContract.burn(coverId);
    coverNFTContract.safeMint(owner, covers.length - 1);
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

  /* ========== PRODUCT CONFIGURATION ========== */

  function setGlobalCapacityRatio(uint32 _globalCapacityRatio) external onlyGovernance {
    globalCapacityRatio = _globalCapacityRatio;
  }

  function setGlobalRewardsRatio(uint32 _globalRewardsRatio) external onlyGovernance {
    globalRewardsRatio = _globalRewardsRatio;
  }

  function setInitialPrice(uint productId, uint initialPrice) external onlyAdvisoryBoard {

    require(initialPrice >= GLOBAL_MIN_PRICE, "Cover: Initial price must be greater than the global min price");
    initialPrices[productId] = initialPrice;
  }

  function setCapacityReductionRatio(uint productId, uint deduction) external onlyAdvisoryBoard {
    require(deduction <= CAPACITY_REDUCTION_DENOMINATOR, "Cover: LTADeduction must be less than or equal to 100%");
    capacityReductionRatios[productId] = deduction;
  }

  function addProduct(Product calldata product) external onlyAdvisoryBoard {
    products.push(product);
  }

  function setCoverAssetsFallback(uint _coverAssetsFallback) external onlyGovernance {
    coverAssetsFallback = _coverAssetsFallback;
  }

  /* ========== HELPERS ========== */

  function assetIsSupported(uint payoutAssetsBitMap, uint8 payoutAsset) public returns (bool) {

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

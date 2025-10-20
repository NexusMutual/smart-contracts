// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import "../../abstract/EIP712.sol";
import "../../abstract/Multicall.sol";
import "../../abstract/ReentrancyGuard.sol";
import "../../abstract/RegistryAware.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/ICoverNFT.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IStakingNFT.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/ITokenController.sol";
import "../../libraries/Math.sol";
import "../../libraries/SafeUintCast.sol";
import "../../libraries/StakingPoolLibrary.sol";

contract Cover is ICover, EIP712, RegistryAware, ReentrancyGuard, Multicall {
  using SafeERC20 for IERC20;
  using SafeUintCast for uint;

  /* ========== STATE VARIABLES ========== */

  uint[9] private __unused_0; // slots 0 - 8

  mapping(uint assetId => ActiveCover) public activeCover;
  mapping(uint assetId => mapping(uint bucketId => uint amount)) internal activeCoverExpirationBuckets;

  uint[2] private __unused_11; // slots 11 - 12

  mapping(uint coverId => CoverData) private _coverData;
  mapping(uint coverId => PoolAllocation[]) private _poolAllocations;
  mapping(uint coverId => CoverReference) private _coverReference;
  mapping(uint coverId => string ipfsMetadata) private _coverMetadata;

  mapping(uint coverId => Ri) private _coverRi;
  mapping(uint providerId => RiConfig) private _riProviderConfigs;
  address public riSigner;

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

  IPool public immutable pool;
  ITokenController public immutable tokenController;
  ICoverProducts public immutable coverProducts;
  ICoverNFT public immutable override coverNFT;
  IStakingNFT public immutable override stakingNFT;
  address public immutable override stakingPoolFactory;
  address public immutable override stakingPoolImplementation;
  address public immutable claims;

  /* ========== CONSTRUCTOR ========== */

  constructor(
    address _registry,
    address _stakingPoolImplementation,
    address _verifyingAddress
  ) RegistryAware(_registry) EIP712("NexusMutualCover", "1.0.0", _verifyingAddress) {

    // fetch deps
    coverNFT = ICoverNFT(fetch(C_COVER_NFT));
    coverProducts = ICoverProducts(fetch(C_COVER_PRODUCTS));
    pool = IPool(fetch(C_POOL));
    stakingNFT = IStakingNFT(fetch(C_STAKING_NFT));
    stakingPoolFactory = fetch(C_STAKING_POOL_FACTORY);
    tokenController = ITokenController(fetch(C_TOKEN_CONTROLLER));

    // store staking pool implementation
    stakingPoolImplementation = _stakingPoolImplementation;
  }

  /* === MUTATIVE FUNCTIONS ==== */

  /// @dev Entrypoint for users buying a cover by interacting with this contract directly
  function buyCover(
    BuyCoverParams memory params,
    PoolAllocationRequest[] memory poolAllocationRequests
  ) external payable onlyMember returns (uint coverId) {

    if (params.coverId != 0) {
      require(coverNFT.isApprovedOrOwner(msg.sender, params.coverId), OnlyOwnerOrApproved());
      require(_coverRi[params.coverId].amount == 0, WrongCoverEditEntrypoint());
    }

    coverId = _buyCover(
      params,
      poolAllocationRequests,
      0, // no riPremium
      address(0) // no riPremiumDestination
    );

    emit CoverBought(
      coverId,
      params.coverId != 0 ? params.coverId : coverId,
      registry.getMemberId(msg.sender),
      params.productId
    );

    return coverId;
  }

  /// @dev Entrypoint for LimitOrders contract
  function executeCoverBuy(
    BuyCoverParams memory params,
    PoolAllocationRequest[] memory poolAllocationRequests,
    address buyer
  ) external payable onlyContracts(C_LIMIT_ORDERS) returns (uint coverId) {

    if (params.coverId != 0) {
      require(coverNFT.isApprovedOrOwner(buyer, params.coverId), OnlyOwnerOrApproved());
      require(_coverRi[params.coverId].amount == 0, WrongCoverEditEntrypoint());
    }

    coverId = _buyCover(
      params,
      poolAllocationRequests,
      0, // no riPremium
      address(0) // no riPremiumDestination
    );

    emit CoverBought(
      coverId,
      params.coverId != 0 ? params.coverId : coverId,
      registry.getMemberId(buyer),
      params.productId
    );

    return coverId;
  }

  /// @dev Entrypoint for Users buying cover with ri
  function buyCoverWithRi(
    BuyCoverParams memory params,
    PoolAllocationRequest[] memory poolAllocationRequests,
    RiRequest memory riRequest
  ) external payable onlyMember returns (uint coverId) {

    if (params.coverId != 0) {
      require(coverNFT.isApprovedOrOwner(msg.sender, params.coverId), OnlyOwnerOrApproved());
    } else {
      // ri amount should be non-zero on first cover buy, but allowed to be zero on edits
      require(riRequest.amount > 0, RiAmountIsZero());
    }

    RiConfig storage riConfig = _riProviderConfigs[riRequest.providerId];
    address riPremiumDestination = riConfig.premiumDestination;
    uint nonce = riConfig.nextNonce++; // SLOAD + SSTORE

    require(riPremiumDestination != address(0), InvalidRiConfig());

    bytes memory message = abi.encode(
      keccak256(
        abi.encodePacked(
          "RiQuote(",
          "uint256 coverId,",
          "uint24 productId,",
          "uint256 providerId,",
          "uint256 amount,",
          "uint256 premium,",
          "uint32 period,",
          "uint8 coverAsset,",
          "uint256 nonce)"
        )
      ),
      params.coverId,
      params.productId,
      riRequest.providerId,
      riRequest.amount,
      riRequest.premium,
      params.period,
      params.coverAsset,
      nonce
    );

    require(recoverSigner(message, riRequest.signature) == riSigner, InvalidSignature());
    require(params.paymentAsset == params.coverAsset, InvalidPaymentAsset());

    coverId = _buyCover(params, poolAllocationRequests, riRequest.premium, riPremiumDestination);

    _coverRi[coverId].providerId = riRequest.providerId.toUint24();
    _coverRi[coverId].amount = riRequest.amount.toUint96();

    emit CoverBought(
      coverId,
      params.coverId != 0 ? params.coverId : coverId,
      registry.getMemberId(msg.sender),
      params.productId
    );

    return coverId;
  }

  function _buyCover(
    BuyCoverParams memory params,
    PoolAllocationRequest[] memory poolAllocationRequests,
    uint riPremiumInPaymentAsset,
    address riPremiumDestination
  ) internal nonReentrant whenNotPaused(PAUSE_COVER) returns (uint coverId) {

    require(params.period >= MIN_COVER_PERIOD, CoverPeriodTooShort());
    require(params.period <= MAX_COVER_PERIOD, CoverPeriodTooLong());
    require(params.commissionRatio <= MAX_COMMISSION_RATIO, CommissionRateTooHigh());

    // using riPremium as a proxy for the riAmount
    require(params.amount != 0 || riPremiumInPaymentAsset != 0, CoverAmountIsZero());

    // can pay with cover asset or nxm only
    require(params.paymentAsset == params.coverAsset || params.paymentAsset == NXM_ASSET_ID, InvalidPaymentAsset());

    // new cover
    coverId = coverNFT.mint(params.owner);
    _coverMetadata[coverId] = params.ipfsData;

    uint premiumInPaymentAsset;

    {
      uint nxmPriceInCoverAsset = pool.getInternalTokenPriceInAssetAndUpdateTwap(params.coverAsset);
      uint amountDueInNXM = _createCover(params, poolAllocationRequests, coverId, nxmPriceInCoverAsset);
      premiumInPaymentAsset = nxmPriceInCoverAsset * amountDueInNXM / ONE_NXM;
    }

    _retrievePayment(
      params.paymentAsset,
      premiumInPaymentAsset,
      riPremiumInPaymentAsset,
      params.maxPremiumInAsset + riPremiumInPaymentAsset,
      riPremiumDestination,
      params.commissionRatio,
      params.commissionDestination
    );
  }

  function _createCover(
    BuyCoverParams memory params,
    PoolAllocationRequest[] memory poolAllocationRequests,
    uint coverId,
    uint nxmPriceInCoverAsset
  ) internal returns (uint amountDueInNXM) {

    uint previousCoverAmount;
    uint previousCoverExpiration;
    uint refundedPremium;

    if (params.coverId != 0) {

      CoverReference memory coverReference = getCoverReference(params.coverId);
      require(coverReference.originalCoverId == params.coverId, MustBeOriginalCoverId(coverReference.originalCoverId));

      CoverData memory cover = _coverData[coverReference.latestCoverId];
      previousCoverAmount = cover.amount;
      previousCoverExpiration = cover.start + cover.period;

      require(block.timestamp < previousCoverExpiration, ExpiredCoversCannotBeEdited());
      require(params.coverAsset == cover.coverAsset, CoverAssetMismatch());

      refundedPremium = _requestDeallocation(
        cover,
        coverReference.latestCoverId,
        previousCoverExpiration - block.timestamp // remaining period
      );

      // mark previous cover as ending now
      cover.period = (block.timestamp - cover.start).toUint32();
      _coverData[coverReference.latestCoverId] = cover;

      _coverReference[coverId].originalCoverId = params.coverId.toUint32();
      _coverReference[params.coverId].latestCoverId = coverId.toUint32();
    }

    AllocationRequest memory allocationRequest;

    {
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

    (uint coverAmountInCoverAsset, uint totalPremiumInNxm) = _requestAllocation(
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

    // cap refund at new cover premium
    return totalPremiumInNxm > refundedPremium
      ? totalPremiumInNxm - refundedPremium
      : 0;
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
    uint totalPremiumInNXM
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

      totalPremiumInNXM += premiumInNXM;
      totalCoverAmountInNXM += coverAmountInNXM;
    }

    totalCoverAmountInCoverAsset = totalCoverAmountInNXM * nxmPriceInCoverAsset / ONE_NXM;

    return (totalCoverAmountInCoverAsset, totalPremiumInNXM);
  }

  function _requestDeallocation(
    CoverData memory cover,
    uint coverId,
    uint remainingPeriod
  ) internal returns (uint refundedPremium) {

    uint allocationsLength = _poolAllocations[coverId].length;

    for (uint allocationIndex = 0; allocationIndex < allocationsLength; allocationIndex++) {
      // fetch allocation
      PoolAllocation memory allocation = _poolAllocations[coverId][allocationIndex];

      // refund = premium * remaining_period / cover_period
      refundedPremium += allocation.premiumInNXM * remainingPeriod / cover.period;

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

    return refundedPremium;
  }

  function _retrievePayment(
    uint paymentAsset,
    uint premium,
    uint riPremium,
    uint maxAmountInAsset,
    address riPremiumDestination,
    uint commissionRatio,
    address commissionDestination
  ) internal {

    uint totalPremium = premium + riPremium;
    uint totalPremiumWithCommission = totalPremium * COMMISSION_DENOMINATOR / (COMMISSION_DENOMINATOR - commissionRatio);
    uint commission = totalPremiumWithCommission - totalPremium;

    require(totalPremiumWithCommission <= maxAmountInAsset, PriceExceedsMaxPremiumInAsset());
    require(msg.value == 0 || paymentAsset == ETH_ASSET_ID, UnexpectedEthSent());

    // NXM payment
    if (paymentAsset == NXM_ASSET_ID) {

      // no ri premium when paying with nxm
      require(riPremium == 0, UnexpectedRiPremium());

      tokenController.burnFrom(msg.sender, premium);

      if (commission > 0) {
        // commission transfer reverts if the commissionDestination is not a member
        tokenController.operatorTransfer(msg.sender, commissionDestination, commission);
      }

      return;
    }

    // ETH payment
    if (paymentAsset == ETH_ASSET_ID) {

      require(msg.value >= totalPremiumWithCommission, InsufficientEthSent());

      uint remainder = msg.value - totalPremiumWithCommission;

      if (premium > 0) {
        // send premium in eth to the pool
        // solhint-disable-next-line avoid-low-level-calls
        (bool ok, /* data */) = address(pool).call{value: premium}("");
        require(ok, ETHTransferFailed(address(pool), premium));
      }

      if (riPremium > 0) {
        // solhint-disable-next-line avoid-low-level-calls
        (bool ok, /* data */) = address(riPremiumDestination).call{value: riPremium}("");
        require(ok, ETHTransferFailed(riPremiumDestination, riPremium));
      }

      // send commission
      if (commission > 0) {
        (bool ok, /* data */) = address(commissionDestination).call{value: commission}("");
        require(ok, ETHTransferFailed(commissionDestination, commission));
      }

      if (remainder > 0) {
        // solhint-disable-next-line avoid-low-level-calls
        (bool ok, /* data */) = address(msg.sender).call{value: remainder}("");
        require(ok, ETHTransferFailed(msg.sender, remainder));
      }

      return;
    }

    address coverAsset = pool.getAsset(paymentAsset).assetAddress;
    IERC20 token = IERC20(coverAsset);

    if (premium > 0) {
      token.safeTransferFrom(msg.sender, address(pool), premium);
    }

    if (riPremium > 0) {
      token.safeTransferFrom(msg.sender, riPremiumDestination, riPremium);
    }

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

  function burnStake(uint coverId, uint payoutAmountInAsset) external onlyContracts(C_CLAIMS) override {

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
  }

  /* ========== VIEWS ========== */

  function getCoverData(uint coverId) external override view returns (CoverData memory) {
    return _coverData[coverId];
  }

  function getCoverRi(uint coverId) external override view returns (Ri memory) {
    return _coverRi[coverId];
  }

  function getCoverDataWithRi(uint coverId) external override view returns (CoverData memory, Ri memory) {
    return (_coverData[coverId], _coverRi[coverId]);
  }

  function getCoverReference(uint coverId) public override view returns(CoverReference memory coverReference) {
    coverReference = _coverReference[coverId];
    coverReference.originalCoverId = coverReference.originalCoverId != 0 ? coverReference.originalCoverId : coverId.toUint32();
    coverReference.latestCoverId = coverReference.latestCoverId != 0 ? coverReference.latestCoverId : coverId.toUint32();
  }

  function getCoverDataWithReference(uint coverId) external override view returns (CoverData memory, CoverReference memory) {
    return (_coverData[coverId], getCoverReference(coverId));
  }

  function getCoverMetadata(uint coverId) external override view returns (string memory) {
    return _coverMetadata[coverId];
  }

  function getPoolAllocations(uint coverId) external override view returns (PoolAllocation[] memory) {
    return _poolAllocations[coverId];
  }

  function getCoverDataCount() external override view returns (uint) {
    return coverNFT.totalSupply();
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

    Asset memory asset = pool.getAsset(assetId);

    return asset.isCoverAsset && !asset.isAbandoned;
  }

  function stakingPool(uint poolId) public view returns (IStakingPool) {
    return IStakingPool(
      StakingPoolLibrary.getAddress(address(stakingPoolFactory), poolId)
    );
  }

  function setRiSigner(address _riSigner) external onlyContracts(C_GOVERNOR) {
    riSigner = _riSigner;
  }

  function setRiConfig(uint providerId, address premiumDestination) external onlyContracts(C_GOVERNOR) {
    _riProviderConfigs[providerId].premiumDestination = premiumDestination;
  }

  function changeCoverNFTDescriptor(address _coverNFTDescriptor) external onlyContracts(C_GOVERNOR) {
    coverNFT.changeNFTDescriptor(_coverNFTDescriptor);
  }

  function changeStakingNFTDescriptor(address _stakingNFTDescriptor) external onlyContracts(C_GOVERNOR) {
    stakingNFT.changeNFTDescriptor(_stakingNFTDescriptor);
  }

  // one-time migration function

  error IpfsMetadataAlreadySet();

  function populateIpfsMetadata(
    uint[] memory coverIds,
    string[] memory ipfsMetadata
  ) external onlyAdvisoryBoard() {
    for (uint i = 0; i < coverIds.length; i++) {
      require(bytes(_coverMetadata[coverIds[i]]).length == 0, IpfsMetadataAlreadySet());
      _coverMetadata[coverIds[i]] = ipfsMetadata[i];
    }
  }

}

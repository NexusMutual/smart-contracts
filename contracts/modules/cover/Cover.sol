// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "@openzeppelin/contracts-v4/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";

import "../../abstract/MasterAwareV2.sol";
import "../../abstract/Multicall.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/ICoverNFT.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IStakingNFT.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/IStakingPoolBeacon.sol";
import "../../interfaces/IStakingPoolFactory.sol";
import "../../interfaces/ITokenController.sol";
import "../../libraries/Math.sol";
import "../../libraries/SafeUintCast.sol";
import "../../libraries/StakingPoolLibrary.sol";
import "../../interfaces/IStakingProducts.sol";
import "../../interfaces/ICoverProducts.sol";
import "../../libraries/Math.sol";
import "hardhat/console.sol";

contract Cover is ICover, MasterAwareV2, IStakingPoolBeacon, ReentrancyGuard, Multicall {
  using SafeERC20 for IERC20;
  using SafeUintCast for uint;

  /* ========== STATE VARIABLES ========== */

  mapping(uint => CoverData) private _coverData;

  // cover id => segment id => pool allocations array
  mapping(uint => mapping(uint => PoolAllocation[])) public coverSegmentAllocations;



  // Each cover has an array of segments. A new segment is created
  // every time a cover is edited to deliniate the different cover periods.
  mapping(uint => CoverSegment[]) private _coverSegments;

  // assetId => { lastBucketUpdateId, totalActiveCoverInAsset }
  mapping(uint => ActiveCover) public activeCover;
  // assetId => bucketId => amount
  mapping(uint => mapping(uint => uint)) internal activeCoverExpirationBuckets;

  /* ========== CONSTANTS ========== */

  uint private constant GLOBAL_CAPACITY_RATIO = 20000; // 2
  uint private constant GLOBAL_REWARDS_RATIO = 5000; // 50%

  uint private constant PRICE_DENOMINATOR = 10000;
  uint private constant COMMISSION_DENOMINATOR = 10000;
  uint private constant CAPACITY_REDUCTION_DENOMINATOR = 10000;
  uint private constant GLOBAL_CAPACITY_DENOMINATOR = 10_000;
  uint private constant REWARD_DENOMINATOR = 10_000;
  uint private constant COVER_ALLOCATION_RATIO_DENOMINATOR = 10_000;

  uint private constant MAX_COVER_PERIOD = 365 days;
  uint private constant MIN_COVER_PERIOD = 28 days;
  uint private constant BUCKET_SIZE = 7 days;
  // this constant is used for calculating the normalized yearly percentage cost of cover
  uint private constant ONE_YEAR = 365 days;

  uint public constant MAX_COMMISSION_RATIO = 3000; // 30%

  uint public constant GLOBAL_MIN_PRICE_RATIO = 100; // 1%

  uint private constant ONE_NXM = 1e18;

  uint private constant ETH_ASSET_ID = 0;
  uint private constant NXM_ASSET_ID = type(uint8).max;

  // internally we store capacity using 2 decimals
  // 1 nxm of capacity is stored as 100
  uint private constant ALLOCATION_UNITS_PER_NXM = 100;

  // given capacities have 2 decimals
  // smallest unit we can allocate is 1e18 / 100 = 1e16 = 0.01 NXM
  uint public constant NXM_PER_ALLOCATION_UNIT = ONE_NXM / ALLOCATION_UNITS_PER_NXM;

  ICoverNFT public immutable override coverNFT;
  IStakingNFT public immutable override stakingNFT;
  IStakingPoolFactory public immutable override stakingPoolFactory;
  address public immutable stakingPoolImplementation;

  /* ========== CONSTRUCTOR ========== */

  constructor(
    ICoverNFT _coverNFT,
    IStakingNFT _stakingNFT,
    IStakingPoolFactory _stakingPoolFactory,
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

    // check only for a new cover
    if (params.coverId == 0 && params.period < MIN_COVER_PERIOD) {
      revert CoverPeriodTooShort();
    }

    // check only for a new cover
    if (params.coverId == 0 && params.period > MAX_COVER_PERIOD) {
      revert CoverPeriodTooLong();
    }

    if (params.commissionRatio > MAX_COMMISSION_RATIO) {
      revert CommissionRateTooHigh();
    }

    if (params.amount == 0) {
      revert CoverAmountIsZero();
    }

    uint segmentId;

    AllocationRequest memory allocationRequest;
    {

      ICoverProducts _coverProducts = coverProducts();
      if (_coverProducts.productsCount() <= params.productId) {
        revert ProductDoesntExist();
      }

      Product memory product = _coverProducts.products(params.productId);

      if (product.isDeprecated) {
        revert ProductDoesntExistOrIsDeprecated();
      }

      if (!isCoverAssetSupported(params.coverAsset, product.coverAssets)) {
        revert CoverAssetNotSupported();
      }

      allocationRequest.productId = params.productId;
      allocationRequest.coverId = coverId;
      allocationRequest.period = params.period;
      allocationRequest.gracePeriod = _coverProducts.productTypes(product.productType).gracePeriod;
      allocationRequest.useFixedPrice = product.useFixedPrice;
      allocationRequest.globalCapacityRatio = GLOBAL_CAPACITY_RATIO;
      allocationRequest.capacityReductionRatio = product.capacityReductionRatio;
      allocationRequest.rewardRatio = GLOBAL_REWARDS_RATIO;
      allocationRequest.globalMinPrice = GLOBAL_MIN_PRICE_RATIO;
    }

    uint nxmPriceInCoverAsset = pool().getTokenPriceInAsset(params.coverAsset);

    uint previousSegmentAmount;

    uint coverAmountInCoverAsset;
    uint amountDueInNXM;

    if (params.coverId == 0) {

      // new cover
      coverId = coverNFT.mint(params.owner);
      _coverData[coverId] = CoverData(params.productId, params.coverAsset, 0 /* amountPaidOut */);

      allocationRequest.coverId = coverId;
      // for a new cover, the first segment the remaining period and new period are the requested period
      allocationRequest.remainingPeriod = uint32(allocationRequest.period);
      allocationRequest.newPeriod = uint32(allocationRequest.period);

      (coverAmountInCoverAsset, amountDueInNXM) = requestAllocationsForNewCover(
        allocationRequest,
        poolAllocationRequests,
        nxmPriceInCoverAsset
      );
    } else {

      // existing cover
      coverId = params.coverId;

      if (!coverNFT.isApprovedOrOwner(msg.sender, coverId)) {
        revert OnlyOwnerOrApproved();
      }

      CoverData memory cover = _coverData[coverId];

      if (params.coverAsset != cover.coverAsset) {
        revert UnexpectedCoverAsset();
      }

      if (params.productId != cover.productId) {
        revert UnexpectedProductId();
      }

      segmentId = _coverSegments[coverId].length;
      CoverSegment memory lastSegment = coverSegmentWithRemainingAmount(coverId, segmentId - 1);

      // require last segment not to be expired
      if (lastSegment.start + lastSegment.period <= block.timestamp) {
        revert ExpiredCoversCannotBeEdited();
      }

      uint remainingPeriod = lastSegment.start + lastSegment.period - block.timestamp + 1;

      console.log("remainingPeriod", remainingPeriod);
      console.log("params.period", params.period);
      if (params.period + remainingPeriod < MIN_COVER_PERIOD) {
        revert CoverPeriodTooShort();
      }

      if (params.period + remainingPeriod > MAX_COVER_PERIOD) {
        revert CoverPeriodTooLong();
      }

      allocationRequest.previousStart = lastSegment.start;

      console.log("lastSegment.start", lastSegment.start);
      console.log("lastSegment.period", lastSegment.period);
      allocationRequest.previousExpiration = lastSegment.start + lastSegment.period;
      allocationRequest.previousRewardsRatio = lastSegment.globalRewardsRatio;

      allocationRequest.remainingPeriod = uint32(remainingPeriod);
      // when editing a cover the new period is the remaining period + the requested period
      allocationRequest.newPeriod = uint32(allocationRequest.period + allocationRequest.remainingPeriod);

      // mark previous cover as ending now
      _coverSegments[coverId][segmentId - 1].period = (block.timestamp - lastSegment.start).toUint32();

      // remove cover amount from from expiration buckets
      uint bucketAtExpiry = Math.divCeil(lastSegment.start + lastSegment.period, BUCKET_SIZE);

      console.log("lastSegment.start", lastSegment.start);
      console.log("lastSegment.period", lastSegment.period);
      console.log("bucketAtExpiry", bucketAtExpiry);
      activeCoverExpirationBuckets[params.coverAsset][bucketAtExpiry] -= lastSegment.amount;
      previousSegmentAmount += lastSegment.amount;

      allocationRequest.coverId = coverId;

      (coverAmountInCoverAsset, amountDueInNXM) = requestEditAllocations(
        allocationRequest,
        poolAllocationRequests,
        AllocationParams(
          nxmPriceInCoverAsset,
          previousSegmentAmount,
          segmentId
        )
      );
    }

    if (coverAmountInCoverAsset < params.amount) {
      revert InsufficientCoverAmountAllocated();
    }
    
    {
      _coverSegments[coverId].push(
        CoverSegment(
          coverAmountInCoverAsset.toUint96(), // cover amount in cover asset
          block.timestamp.toUint32(), // start
          allocationRequest.newPeriod, // period
          allocationRequest.gracePeriod.toUint32(),
          GLOBAL_REWARDS_RATIO.toUint24(),
          GLOBAL_CAPACITY_RATIO.toUint24()
        )
      );
    }

    // Update totalActiveCover
    {
      ActiveCover memory _activeCover = activeCover[params.coverAsset];

      uint currentBucketId = block.timestamp / BUCKET_SIZE;
      uint totalActiveCover = _activeCover.totalActiveCoverInAsset;

      if (totalActiveCover != 0) {
        totalActiveCover -= getExpiredCoverAmount(
          params.coverAsset,
          _activeCover.lastBucketUpdateId,
          currentBucketId
        );
      }

      totalActiveCover -= previousSegmentAmount;
      totalActiveCover += coverAmountInCoverAsset;

      _activeCover.lastBucketUpdateId = currentBucketId.toUint64();
      _activeCover.totalActiveCoverInAsset = totalActiveCover.toUint192();

      // update total active cover in storage
      activeCover[params.coverAsset] = _activeCover;

      // update amount to expire at the end of this cover segment
      uint bucketAtExpiry = Math.divCeil(block.timestamp + allocationRequest.newPeriod, BUCKET_SIZE);
      activeCoverExpirationBuckets[params.coverAsset][bucketAtExpiry] += coverAmountInCoverAsset;
    }

    // can pay with cover asset or nxm only
    if (params.paymentAsset != params.coverAsset && params.paymentAsset != NXM_ASSET_ID) {
      revert InvalidPaymentAsset();
    }

    retrievePayment(
      amountDueInNXM,
      params.paymentAsset,
      nxmPriceInCoverAsset,
      params.maxPremiumInAsset,
      params.commissionRatio,
      params.commissionDestination
    );

    emit CoverEdited(coverId, params.productId, segmentId, msg.sender, params.ipfsData);
  }

  function expireCover(uint coverId) external {

    uint segmentId = _coverSegments[coverId].length - 1;
    CoverSegment memory lastSegment = coverSegmentWithRemainingAmount(coverId, segmentId);
    CoverData memory cover = _coverData[coverId];
    uint expiration = lastSegment.start + lastSegment.period;

    if (expiration > block.timestamp) {
      revert CoverNotYetExpired(coverId);
    }

    for (
      uint allocationIndex = 0;
      allocationIndex < coverSegmentAllocations[coverId][segmentId].length;
      allocationIndex++
    ) {
      PoolAllocation memory allocation =  coverSegmentAllocations[coverId][segmentId][allocationIndex];
      AllocationRequest memory allocationRequest;
      // editing just the needed props for deallocation
      allocationRequest.productId = cover.productId;
      allocationRequest.allocationId = allocation.allocationId;
      allocationRequest.previousStart = lastSegment.start;
      allocationRequest.previousExpiration = expiration;

      stakingProducts().stakingPool(allocation.poolId).requestAllocation(
        0, // amount
        0, // previous coverAmount in NXM repriced
        allocationRequest
      );

    }

    uint currentBucketId = block.timestamp / BUCKET_SIZE;
    uint bucketAtExpiry = Math.divCeil(expiration, BUCKET_SIZE);

    if (currentBucketId < bucketAtExpiry) {
      // remove cover amount from from expiration buckets
      activeCoverExpirationBuckets[cover.coverAsset][bucketAtExpiry] -= lastSegment.amount;
    }
  }

  function requestAllocationsForNewCover(
    AllocationRequest memory allocationRequest,
    PoolAllocationRequest[] memory poolAllocationRequests,
    uint nxmPriceInCoverAsset
  ) internal returns (
    uint totalCoverAmountInCoverAsset,
    uint totalAmountDueInNXM
  ) {

    uint totalCoverAmountInNXM;

    for (uint i = 0; i < poolAllocationRequests.length; i++) {

      // converting asset amount to nxm and rounding up to the nearest NXM_PER_ALLOCATION_UNIT
      uint coverAmountInNXM = getNXMForAssetAmount(
        poolAllocationRequests[i].coverAmountInAsset,
        nxmPriceInCoverAsset
      );

    (uint premiumInNXM, uint allocationId) = stakingProducts().stakingPool(poolAllocationRequests[i].poolId).requestAllocation(
        coverAmountInNXM,
        0, // previousAllocationAmountInNXMRepriced
        allocationRequest
      );

      // TODO: consider what happens if user creates lots of segments with small amounts
      coverSegmentAllocations[allocationRequest.coverId][0].push(
        PoolAllocation(
          poolAllocationRequests[i].poolId,
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

  function requestEditAllocations(
    AllocationRequest memory allocationRequest,
    PoolAllocationRequest[] memory poolAllocationRequests,
    AllocationParams memory params
  ) internal returns (
    uint totalCoverAmountInCoverAsset,
    uint totalAmountDueInNXM
  ) {

    RequestAllocationVariables memory vars; // = RequestAllocationVariables(0, 0, 0, 0);

    vars.previousPoolAllocationsLength = coverSegmentAllocations[allocationRequest.coverId][params.segmentId - 1].length;

    vars.previousPoolAllocations = new PoolAllocation[](vars.previousPoolAllocationsLength);

    for (uint i = 0; i < vars.previousPoolAllocationsLength; i++) {
      vars.previousPoolAllocations[i] = coverSegmentAllocations[allocationRequest.coverId][params.segmentId - 1][i];

      vars.previousTotalCoverAmountInNXM += vars.previousPoolAllocations[i].coverAmountInNXM;
    }

    uint oldSegmentAmountInNXMRepriced = getNXMForAssetAmount(
      params.previousSegmentAmount, params.nxmPriceInCoverAsset
    );

    for (uint i = 0; i < poolAllocationRequests.length; i++) {
      // if there is a previous segment and this index is present on it
      if (vars.previousPoolAllocationsLength > i) {
        PoolAllocation memory previousPoolAllocation = vars.previousPoolAllocations[i];

        // poolAllocationRequests must match the pools in the previous segment
        if (previousPoolAllocation.poolId != poolAllocationRequests[i].poolId) {
          revert UnexpectedPoolId();
        }

        // check if this request should be skipped, keeping the previous allocation
        if (poolAllocationRequests[i].skip) {
          coverSegmentAllocations[allocationRequest.coverId][params.segmentId].push(previousPoolAllocation);
          vars.totalCoverAmountInNXM += previousPoolAllocation.coverAmountInNXM;
          continue;
        }

        vars.previousPremiumInNXM = previousPoolAllocation.premiumInNXM;

        // get stored allocation id
        allocationRequest.allocationId = previousPoolAllocation.allocationId;

        uint poolAllocationRatio =
          previousPoolAllocation.coverAmountInNXM
          * COVER_ALLOCATION_RATIO_DENOMINATOR
          / vars.previousTotalCoverAmountInNXM;

        vars.previousAllocationAmountInNXMRepriced =
          poolAllocationRatio * oldSegmentAmountInNXMRepriced
          / COVER_ALLOCATION_RATIO_DENOMINATOR;

      } else {
        // request new allocation id
        allocationRequest.allocationId = 0;

        // zero out previous premium or refund
        vars.previousPremiumInNXM = 0;

        vars.previousAllocationAmountInNXMRepriced = 0;
      }

      // converting asset amount to nxm and rounding up to the nearest NXM_PER_ALLOCATION_UNIT
      uint coverAmountInNXM = getNXMForAssetAmount(
        poolAllocationRequests[i].coverAmountInAsset,
        params.nxmPriceInCoverAsset
      );

      (uint premiumInNXM, uint allocationId) = stakingProducts().stakingPool(poolAllocationRequests[i].poolId).requestAllocation(
        coverAmountInNXM,
        vars.previousAllocationAmountInNXMRepriced,
        allocationRequest
      );

      console.log("pool allocation", i);
      console.log("premiumInNXM", premiumInNXM);

      // omit deallocated pools from the segment
      if (coverAmountInNXM != 0) {
        coverSegmentAllocations[allocationRequest.coverId][params.segmentId].push(
          PoolAllocation(
            poolAllocationRequests[i].poolId,
            coverAmountInNXM.toUint96(),
            // TODO: should be full amount or only the amount paid for editing?
            premiumInNXM.toUint96(),
            allocationId.toUint24()
          )
        );
      }

      totalAmountDueInNXM += premiumInNXM;
      vars.totalCoverAmountInNXM += coverAmountInNXM;
    }

    totalCoverAmountInCoverAsset = vars.totalCoverAmountInNXM * params.nxmPriceInCoverAsset / ONE_NXM;

    return (totalCoverAmountInCoverAsset, totalAmountDueInNXM);
  }

  function getNXMForAssetAmount(uint amountInCoverAsset, uint nxmPriceInCoverAsset) pure internal returns (uint) {
    return Math.roundUp(
      Math.divCeil(amountInCoverAsset * ONE_NXM, nxmPriceInCoverAsset),
      NXM_PER_ALLOCATION_UNIT
    );
  }

  function retrievePayment(
    uint premiumInNxm,
    uint paymentAsset,
    uint nxmPriceInCoverAsset,
    uint maxPremiumInAsset,
    uint16 commissionRatio,
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


    console.log("premiumWithCommission", premiumWithCommission);
    console.log("maxPremiumInAsset", maxPremiumInAsset);
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

  function addLegacyCover(
    uint productId,
    uint coverAsset,
    uint amount,
    uint start,
    uint period,
    address newOwner
  ) external onlyInternal returns (uint coverId) {

    ICoverProducts _coverProducts = coverProducts();
    ProductType memory productType = _coverProducts.productTypes(_coverProducts.products(productId).productType);

    // uses the current v2 grace period
    if (block.timestamp >= start + period + productType.gracePeriod) {
      revert CoverOutsideOfTheGracePeriod();
    }

    coverId = coverNFT.mint(newOwner);
    _coverData[coverId] = CoverData(productId.toUint24(), coverAsset.toUint8(), 0 /* amountPaidOut */);

    uint bucketAtExpiry = Math.divCeil((start + period), BUCKET_SIZE);
    activeCoverExpirationBuckets[coverAsset][bucketAtExpiry] += amount;
    activeCover[coverAsset].totalActiveCoverInAsset += amount.toUint192();

    _coverSegments[coverId].push(
      CoverSegment(
        amount.toUint96(),
        start.toUint32(),
        period.toUint32(),
        productType.gracePeriod,
        0, // global rewards ratio
        1
      )
    );

    emit CoverEdited(coverId, productId, 0, msg.sender, "");

    return coverId;
  }

  // Gets the total amount of active cover that is currently expired for this asset
  function getExpiredCoverAmount(
    uint coverAsset,
    uint lastUpdateId,
    uint currentBucketId
  ) internal view returns (uint amountExpired) {

    while (lastUpdateId < currentBucketId) {
      ++lastUpdateId;
      amountExpired += activeCoverExpirationBuckets[coverAsset][lastUpdateId];
    }

    return amountExpired;
  }

  function burnStake(
    uint coverId,
    uint segmentId,
    uint payoutAmountInAsset
  ) external onlyInternal override returns (address /* coverOwner */) {

    CoverData storage cover = _coverData[coverId];
    ActiveCover storage _activeCover = activeCover[cover.coverAsset];
    CoverSegment memory segment = coverSegmentWithRemainingAmount(coverId, segmentId);
    PoolAllocation[] storage allocations = coverSegmentAllocations[coverId][segmentId];

    // update expired buckets and calculate the amount of active cover that should be burned
    {
      uint coverAsset = cover.coverAsset;
      uint lastUpdateBucketId = _activeCover.lastBucketUpdateId;
      uint currentBucketId = block.timestamp / BUCKET_SIZE;

      uint burnedSegmentBucketId = Math.divCeil((segment.start + segment.period), BUCKET_SIZE);
      uint activeCoverToExpire = getExpiredCoverAmount(coverAsset, lastUpdateBucketId, currentBucketId);

      // if the segment has not expired - it's still accounted for in total active cover
      if (burnedSegmentBucketId > currentBucketId) {
        uint amountToSubtract = Math.min(payoutAmountInAsset, segment.amount);
        activeCoverToExpire += amountToSubtract;
        activeCoverExpirationBuckets[coverAsset][burnedSegmentBucketId] -= amountToSubtract.toUint192();
      }

      _activeCover.totalActiveCoverInAsset -= activeCoverToExpire.toUint192();
      _activeCover.lastBucketUpdateId = currentBucketId.toUint64();
    }

    // increase amountPaidOut only *after* you read the segment
    cover.amountPaidOut += payoutAmountInAsset.toUint96();

    IStakingProducts _stakingProducts = stakingProducts();
    for (uint i = 0; i < allocations.length; i++) {
      PoolAllocation memory allocation = allocations[i];

      uint deallocationAmountInNXM = allocation.coverAmountInNXM * payoutAmountInAsset / segment.amount;
      uint burnAmountInNxm = deallocationAmountInNXM * GLOBAL_CAPACITY_DENOMINATOR / segment.globalCapacityRatio;

      allocations[i].coverAmountInNXM -= deallocationAmountInNXM.toUint96();
      allocations[i].premiumInNXM -= (allocation.premiumInNXM * payoutAmountInAsset / segment.amount).toUint96();

      BurnStakeParams memory params = BurnStakeParams(
        allocation.allocationId,
        cover.productId,
        segment.start,
        segment.period,
        deallocationAmountInNXM
      );

      uint poolId = allocations[i].poolId;
      _stakingProducts.stakingPool(poolId).burnStake(burnAmountInNxm, params);
    }

    return coverNFT.ownerOf(coverId);
  }

  /* ========== VIEWS ========== */

  function coverData(uint coverId) external override view returns (CoverData memory) {
    return _coverData[coverId];
  }

  function coverSegmentWithRemainingAmount(
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

  function coverSegments(uint coverId) external override view returns (CoverSegment[] memory) {
    return _coverSegments[coverId];
  }

  function coverSegmentsCount(uint coverId) external override view returns (uint) {
    return _coverSegments[coverId].length;
  }

  function coverDataCount() external override view returns (uint) {
    return coverNFT.totalSupply();
  }

  /* ========== COVER ASSETS HELPERS ========== */

  function totalActiveCoverInAsset(uint assetId) public view returns (uint) {
    return uint(activeCover[assetId].totalActiveCoverInAsset);
  }

  function globalCapacityRatio() external pure returns (uint) {
    return GLOBAL_CAPACITY_RATIO;
  }

  function globalRewardsRatio() external pure returns (uint) {
    return GLOBAL_REWARDS_RATIO;
  }

  function getPriceAndCapacityRatios(uint[] calldata productIds) external view returns (
    uint _globalCapacityRatio,
    uint _globalMinPriceRatio,
    uint[] memory _initialPrices,
    uint[] memory _capacityReductionRatios
  ) {
    _globalMinPriceRatio = GLOBAL_MIN_PRICE_RATIO;
    _globalCapacityRatio = GLOBAL_CAPACITY_RATIO;
    _capacityReductionRatios = new uint[](productIds.length);
    _initialPrices = new uint[](productIds.length);

    ICoverProducts _coverProducts = coverProducts();
    for (uint i = 0; i < productIds.length; i++) {
      uint productId = productIds[i];

      if (productId >= _coverProducts.productsCount()) {
        revert ProductDoesntExist();
      }

      _initialPrices[i] = uint(_coverProducts.products(productId).initialPriceRatio);
      _capacityReductionRatios[i] = uint(_coverProducts.products(productId).capacityReductionRatio);
    }
  }

  function isCoverAssetSupported(uint assetId, uint productCoverAssetsBitmap) internal view returns (bool) {

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

  function stakingProducts() internal view returns (IStakingProducts) {
    return IStakingProducts(getInternalContractAddress(ID.SP));
  }

  function coverProducts() internal view returns (ICoverProducts) {
    return ICoverProducts(getInternalContractAddress(ID.CP));
  }

  function changeDependentContractAddress() external override {
    internalContracts[uint(ID.P1)] = master.getLatestAddress("P1");
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
    internalContracts[uint(ID.SP)] = master.getLatestAddress("SP");
    internalContracts[uint(ID.CP)] = master.getLatestAddress("CP");
  }
}

// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/IStakingPool.sol";
import "../../../libraries/Math.sol";
import "../../generic/StakingPoolGeneric.sol";

contract COMockStakingPool is StakingPoolGeneric {

  uint internal activeStake;
  uint internal rewardPerSecond;
  bool public override isPrivatePool;
  uint8 internal poolFee;
  uint8 internal maxPoolFee;
  uint internal accNxmPerRewardsShare;
  uint internal rewardsPerSecond;
  uint internal stakeSharesSupply;

  mapping(uint => mapping(uint => Deposit)) internal deposits;
  mapping(uint => ExpiredTranche) internal expiredTranches;

  mapping (uint => uint) public usedCapacity;
  mapping (uint => uint) public stakedAmount;

  mapping (uint => uint) public mockPrices;

  uint public constant MAX_PRICE_RATIO = 10_000;
  uint constant REWARDS_DENOMINATOR = 10_000;
  uint public constant GLOBAL_MIN_PRICE_RATIO = 100; // 1%
  uint public constant ONE_NXM = 1 ether;
  uint public constant ALLOCATION_UNITS_PER_NXM = 100;
  uint public constant NXM_PER_ALLOCATION_UNIT = ONE_NXM / ALLOCATION_UNITS_PER_NXM;
  uint public constant TARGET_PRICE_DENOMINATOR = 100_00;

  uint internal poolId;

  string public ipfsHash;
  uint public burnStakeCalledWithAmount;
  BurnStakeParams public burnStakeCalledWithParams;

  struct StakedProduct {
    uint16 lastEffectiveWeight;
    uint8 targetWeight;
    uint96 targetPrice;
    uint96 bumpedPrice;
    uint32 bumpedPriceUpdateTime;
  }

  // product id => StakedProduct
  mapping(uint => StakedProduct) public products;

  function initialize(
    bool _isPrivatePool,
    uint _initialPoolFee,
    uint _maxPoolFee,
    uint _poolId
  ) external override {
    isPrivatePool = _isPrivatePool;
    poolFee = uint8(_initialPoolFee);
    maxPoolFee = uint8(_maxPoolFee);
    poolId = uint40(_poolId);
  }

  function requestAllocation(
    uint amount,
    uint /*previousPremium*/,
    AllocationRequest calldata request
  ) external override returns (uint premium, uint allocationId) {

    usedCapacity[request.productId] += amount;

    premium = request.useFixedPrice
      ? calculateFixedPricePremium(amount, request.period, mockPrices[request.productId])
      : calculatePremium(mockPrices[request.productId], amount, request.period);

    return (premium, allocationId);
  }

  function calculateFixedPricePremium(
    uint coverAmount,
    uint period,
    uint fixedPrice
  ) public pure returns (uint) {

    // NOTE: the actual function takes coverAmount scaled down by NXM_PER_ALLOCATION_UNIT as an argument
    coverAmount = Math.divCeil(coverAmount, NXM_PER_ALLOCATION_UNIT);

    uint premiumPerYear =
      coverAmount
      * NXM_PER_ALLOCATION_UNIT
      * fixedPrice
      / TARGET_PRICE_DENOMINATOR;

    return premiumPerYear * period / 365 days;
  }

  function calculatePremium(uint priceRatio, uint coverAmount, uint period) public pure returns (uint) {
    return priceRatio * coverAmount / MAX_PRICE_RATIO * period / 365 days;
  }

  function stake(uint /*amount*/) external {
    activeStake = activeStake;
  }

  function processExpirations(bool) external override {
    activeStake = activeStake;
    revert("CoverMockStakingPool: not callable");
  }

  function getAvailableCapacity(uint productId, uint capacityFactor) external view returns (uint) {
    return stakedAmount[productId] * capacityFactor - usedCapacity[productId];
  }

  function getCapacity(uint productId, uint capacityFactor) external view returns (uint) {
    return stakedAmount[productId] * capacityFactor;
  }

  function getUsedCapacity(uint productId) external view returns (uint) {
    return usedCapacity[productId];
  }

  function getStake(uint productId) external view returns (uint) {
    return stakedAmount[productId];
  }

  function setUsedCapacity(uint productId, uint amount) external {
    usedCapacity[productId] = amount;
  }

  function setStake(uint productId, uint amount) external {
    stakedAmount[productId] = amount;
  }

  function setPrice(uint productId, uint price) external {
    mockPrices[productId] = price;
  }

  function changeMasterAddress(address payable _a) external {
    // noop
  }

  function changeDependentContractAddress() external {
    // noop
  }

  function burnStake(uint amount, BurnStakeParams calldata params) external override {
    // no-op
    burnStakeCalledWithAmount = amount;
    burnStakeCalledWithParams = params;
  }

  function depositTo(
    uint /*amount*/,
    uint /*trancheId*/,
    uint /*requestTokenId*/,
    address /*destination*/
  ) external override returns (uint /* tokenId */) {
    activeStake = activeStake;
    revert("CoverMockStakingPool: not callable");
  }

  function withdraw(
    uint /*tokenId*/,
    bool /*withdrawStake*/,
    bool /*withdrawRewards*/,
    uint[] memory /*trancheIds*/
  ) public override returns (uint /*withdrawnStake*/, uint /*withdrawnRewards*/) {
    activeStake = activeStake;
    revert("CoverMockStakingPool: not callable");
  }

  function setPoolFee(uint /* newFee */) external override {
    activeStake = activeStake;
    revert("CoverMockStakingPool: not callable");
  }

  function setPoolPrivacy(bool /* isPrivatePool */) external override {
    activeStake = activeStake;
    revert("CoverMockStakingPool: not callable");
  }

  function multicall(bytes[] calldata) external returns (bytes[] memory) {
    activeStake = activeStake;
    revert("CoverMockStakingPool: not callable");
  }

  function getAccNxmPerRewardsShare() external override pure returns (uint) {
    return 0;
  }

  function getLastAccNxmUpdate() external override pure returns (uint) {
    return 0;
  }

  function getActiveStake() external override pure returns (uint) {
    return 0;
  }

  function getDeposit(uint /*tokenId*/, uint /*trancheId*/) external override pure returns (
    uint lastAccNxmPerRewardShare,
    uint pendingRewards,
    uint stakeShares,
    uint rewardsShares
  ) {
    return (0, 0, 0, 0);
  }

  function getExpiredTranche(uint /*trancheId*/) external override pure returns (
    uint accNxmPerRewardShareAtExpiry,
    uint stakeAmountAtExpiry,
    uint stakeShareSupplyAtExpiry
  ) {
    return (0, 0, 0);
  }

  function getMaxPoolFee() external override view returns (uint) {
    return maxPoolFee;
  }

  function getPoolFee() external override view returns (uint) {
    return poolFee;
  }

  function getPoolId() external override view returns (uint) {
    return poolId;
  }

  function manager() external override pure returns (address) {
    return address(0);
  }

  function getProduct(uint /*productId*/) external pure returns (
    uint lastEffectiveWeight,
    uint targetWeight,
    uint targetPrice,
    uint bumpedPrice,
    uint bumpedPriceUpdateTime
  ) {
    return (0, 0, 0, 0, 0);
  }

  function getRewardPerSecond() external override pure returns (uint) {
    return 0;
  }

  function getStakeSharesSupply() external override pure returns (uint) {
    return 0;
  }

  function getRewardsSharesSupply() external override pure returns (uint) {
    return 0;
  }

  function getFirstActiveTrancheId() external override pure returns (uint) {
    return 0;
  }

  function getFirstActiveBucketId() external override pure returns (uint) {
    return 0;
  }

  function getNextAllocationId() external override pure returns (uint) {
    return 0;
  }

  function getTotalTargetWeight() external pure returns (uint) {
    return 0;
  }

  function getTotalEffectiveWeight() external pure returns (uint) {
    return 0;
  }

  function getTranche(uint /*trancheId*/) external override pure returns (
    uint stakeShares,
    uint rewardsShares
  ) {
    return (0, 0);
  }

  function isHalted() external override pure returns (bool) {
    return false;
  }
}

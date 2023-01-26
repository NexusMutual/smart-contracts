// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "../../interfaces/IStakingPool.sol";
import "../../modules/staking/StakingPool.sol";
import "../Tokens/ERC721Mock.sol";

contract CoverMockStakingPool is IStakingPool {

  struct BurnStakeCalledWithRequest {
    uint coverId;
    uint period;
    uint previousStart;
    uint previousExpiration;
  }

  uint public activeStake;
  uint public rewardPerSecond;
  bool public isPrivatePool;
  uint8 public poolFee;
  uint8 public maxPoolFee;
  uint public accNxmPerRewardsShare;
  uint public rewardsPerSecond;
  uint public stakeSharesSupply;

  mapping(uint => mapping(uint => Deposit)) public deposits;
  mapping(uint => ExpiredTranche) public expiredTranches;

  mapping (uint => uint) public usedCapacity;
  mapping (uint => uint) public stakedAmount;

  // product id => StakedProduct
  mapping(uint => StakedProduct) public products;
  mapping (uint => uint) public mockPrices;

  uint public constant MAX_PRICE_RATIO = 10_000;
  uint constant REWARDS_DENOMINATOR = 10_000;
  uint public constant GLOBAL_MIN_PRICE_RATIO = 100; // 1%
  uint public constant ONE_NXM = 1 ether;
  uint public constant ALLOCATION_UNITS_PER_NXM = 100;
  uint public constant NXM_PER_ALLOCATION_UNIT = ONE_NXM / ALLOCATION_UNITS_PER_NXM;
  uint public constant TARGET_PRICE_DENOMINATOR = 100_00;

  uint public poolId;
  address public manager;

  uint public burnStakeCalledWithAmount;
  BurnStakeParams public burnStakeCalledWithParams;

  function initialize(
    address _manager,
    bool _isPrivatePool,
    uint _initialPoolFee,
    uint _maxPoolFee,
    ProductInitializationParams[] calldata params,
    uint _poolId,
    string calldata /* ipfsDescriptionHash */
  ) external {
    _isPrivatePool;
    _initialPoolFee;
    _maxPoolFee;
    params;
    manager = _manager;
    poolId = _poolId;
  }

  function requestAllocation(
    uint amount,
    uint /*previousPremium*/,
    AllocationRequest calldata request
  ) external override returns (uint premium, uint allocationId) {
    usedCapacity[request.productId] += amount;
    if (request.useFixedPrice) {
      return (calculateFixedPricePremium(amount, request.period, mockPrices[request.productId]), allocationId);
    }
    return (calculatePremium(mockPrices[request.productId], amount, request.period), allocationId);
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

  function setProducts(StakedProductParam[] memory /*params*/) external {
    manager = manager;
  }

  function calculatePremium(uint priceRatio, uint coverAmount, uint period) public pure returns (uint) {
    return priceRatio * coverAmount / MAX_PRICE_RATIO * period / 365 days;
  }

  function stake(uint /*amount*/) external {
    manager = manager;
  }

  function processExpirations(bool) external {
    manager = manager;
    revert("CoverMockStakingPool: not callable");
  }

  function getAvailableCapacity(uint productId, uint capacityFactor) external /*override*/ view returns (uint) {
    return stakedAmount[productId] * capacityFactor - usedCapacity[productId];
  }

  function getCapacity(uint productId, uint capacityFactor) external /*override*/ view returns (uint) {
    return stakedAmount[productId] * capacityFactor;
  }

  function getUsedCapacity(uint productId) external /*override*/ view returns (uint) {
    return usedCapacity[productId];
  }

  function getTargetPrice(uint productId) external /*override*/ view returns (uint) {
    return products[productId].targetPrice;
  }

  function getStake(uint productId) external /*override*/ view returns (uint) {
    return stakedAmount[productId];
  }

  function setUsedCapacity(uint productId, uint amount) external {
    usedCapacity[productId] = amount;
  }

    function setTargetPrice(uint productId, uint amount) external {
    products[productId].targetPrice = uint96(amount);
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

  function burnStake(uint amount, BurnStakeParams calldata params) external {
    // no-op
    burnStakeCalledWithAmount = amount;
    burnStakeCalledWithParams = params;
  }

  function depositTo(
    uint /*amount*/,
    uint /*trancheId*/,
    uint /*requestTokenId*/,
    address /*destination*/
  ) external returns (uint /* tokenId */) {
    manager = manager;
    revert("CoverMockStakingPool: not callable");
  }

  function withdraw(
    uint /*tokenId*/,
    bool /*withdrawStake*/,
    bool /*withdrawRewards*/,
    uint[] memory /*trancheIds*/
  ) public returns (uint /*withdrawnStake*/, uint /*withdrawnRewards*/) {
    manager = manager;
    revert("CoverMockStakingPool: not callable");
  }

  function setPoolFee(uint /* newFee */) external {
    manager = manager;
    revert("CoverMockStakingPool: not callable");
  }

  function setPoolPrivacy(bool /* isPrivatePool */) external {
    manager = manager;
    revert("CoverMockStakingPool: not callable");
  }

  function multicall(bytes[] calldata) external returns (bytes[] memory) {
    manager = manager;
    revert("CoverMockStakingPool: not callable");
  }

  function getAccNxmPerRewardsShare() external pure returns (uint) {
    return 0;
  }

  function getLastAccNxmUpdate() external pure returns (uint) {
    return 0;
  }

  function getActiveStake() external pure returns (uint) {
    return 0;
  }

  function getDeposit(uint /*tokenId*/, uint /*trancheId*/) external pure returns (
    uint lastAccNxmPerRewardShare,
    uint pendingRewards,
    uint stakeShares,
    uint rewardsShares
  ) {
    return (0, 0, 0, 0);
  }

  function getExpiredTranche(uint /*trancheId*/) external pure returns (
    uint accNxmPerRewardShareAtExpiry,
    uint stakeAmountAtExpiry,
    uint stakeShareSupplyAtExpiry
  ) {
    return (0, 0, 0);
  }

  function getMaxPoolFee() external pure returns (uint) {
    return 0;
  }

  function getPoolFee() external pure returns (uint) {
    return 0;
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

  function getRewardPerSecond() external pure returns (uint) {
    return 0;
  }

  function getStakeSharesSupply() external pure returns (uint) {
    return 0;
  }

  function getRewardsSharesSupply() external pure returns (uint) {
    return 0;
  }

  function getFirstActiveTrancheId() external pure returns (uint) {
    return 0;
  }

  function getFirstActiveBucketId() external pure returns (uint) {
    return 0;
  }

  function getNextAllocationId() external pure returns (uint) {
    return 0;
  }

  function getTotalTargetWeight() external pure returns (uint) {
    return 0;
  }

  function getTotalEffectiveWeight() external pure returns (uint) {
    return 0;
  }

  function getTranche(uint /*trancheId*/) external pure returns (
    uint stakeShares,
    uint rewardsShares
  ) {
    return (0, 0);
  }

  function isHalted() external pure returns (bool) {
    return false;
  }

}

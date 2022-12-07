// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/utils/Strings.sol";
import "../../interfaces/IStakingPool.sol";
import "../../modules/staking/StakingPool.sol";
import "../Tokens/ERC721Mock.sol";

contract CoverMockStakingPool is IStakingPool, ERC721Mock {

  /* immutables */
  address public immutable memberRoles;

  mapping (uint => uint) public usedCapacity;
  mapping (uint => uint) public stakedAmount;
  // product id => StakedProduct
  mapping(uint => StakedProduct) public products;
  mapping (uint => uint) public mockPrices;

  uint public constant MAX_PRICE_RATIO = 10_000;
  uint constant REWARDS_DENOMINATOR = 10_000;
  uint public constant GLOBAL_MIN_PRICE_RATIO = 100; // 1%

  uint public poolId;
  // erc721 supply
  uint public totalSupply;
  address public manager;

  uint public burnStakeCalledWith;

  constructor (
    address /* _nxm */,
    address /* _coverContract */,
    ITokenController /* _tokenController */,
    address _memberRoles
  ) ERC721Mock("Nexus Mutual Staking Pool", "NMSPT")
  {
    memberRoles = _memberRoles;
  }

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
    _mint(_manager, totalSupply++);
    poolId = _poolId;
  }

  function operatorTransferFrom(address from, address to, uint256 amount) external /*override*/ {
    require(msg.sender == memberRoles, "StakingPool: Caller is not MemberRoles");
    _operatorTransferFrom(from, to, amount);
  }

  function requestAllocation(
    uint amount,
    uint /*previousPremium*/,
    AllocationRequest calldata request
  ) external override returns (uint premium) {
    usedCapacity[request.productId] += amount;
    return calculatePremium(mockPrices[request.productId], amount, request.period);
  }

  function setProducts(StakedProductParam[] memory params) external {
    totalSupply = totalSupply;
    params;
  }

  function calculatePremium(uint priceRatio, uint coverAmount, uint period) public pure returns (uint) {
    return priceRatio * coverAmount / MAX_PRICE_RATIO * period / 365 days;
  }

  function stake(uint amount) external {
    _mint(msg.sender, amount);
  }

  // used to transfer all nfts when a user switches the membership to a new address
  function operatorTransfer(
    address from,
    address to,
    uint[] calldata tokenIds
  ) external {
    uint length = tokenIds.length;
    for (uint i = 0; i < length; i++) {
      safeTransferFrom(from, to, tokenIds[i]);
    }
  }

  function processExpirations(bool) external {
    totalSupply = totalSupply;
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

  function burnStake(uint amount) external {
    // no-op
    burnStakeCalledWith = amount;
  }

  function depositTo(
    uint /*amount*/,
    uint /*trancheId*/,
    uint /*requestTokenId*/,
    address /*destination*/
  ) external returns (uint /* tokenId */) {
    totalSupply = totalSupply;
    revert("CoverMockStakingPool: not callable");
  }

  function withdraw(
    uint /*tokenId*/,
    bool /*withdrawStake*/,
    bool /*withdrawRewards*/,
    uint[] memory /*trancheIds*/
  ) public returns (uint /*withdrawnStake*/, uint /*withdrawnRewards*/) {
    totalSupply = totalSupply;
    revert("CoverMockStakingPool: not callable");
  }

  function setPoolFee(uint /* newFee */) external {
    totalSupply = totalSupply;
    revert("CoverMockStakingPool: not callable");
  }

  function setPoolPrivacy(bool /* isPrivatePool */) external {
    totalSupply = totalSupply;
    revert("CoverMockStakingPool: not callable");
  }

  function getActiveStake() external view returns (uint) {
    block.timestamp;
    revert("CoverMockStakingPool: not callable");
  }

  function getProductStake(uint /* productId */, uint /* coverExpirationDate */) external view returns (uint) {
    block.timestamp;
    revert("CoverMockStakingPool: not callable");
  }

  function getFreeProductStake(uint /* productId */, uint /* coverExpirationDate */) external view returns (uint) {
    block.timestamp;
    revert("CoverMockStakingPool: not callable");
  }

  function getAllocatedProductStake(uint /* productId */) external view returns (uint) {
    block.timestamp;
    revert("CoverMockStakingPool: not callable");
  }

}

// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-v4/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts-v4/utils/Strings.sol";

import "../../interfaces/IStakingPool.sol";

abstract contract CoverMockStakingPool is IStakingPool, ERC721 {

  /* immutables */
  ERC20 public immutable nxm;
  address public immutable coverContract;
  address public immutable memberRoles;
  uint public poolId;

  mapping (uint => uint) public usedCapacity;
  mapping (uint => uint) public stakedAmount;
  mapping (uint => uint) public targetPrices;

  mapping (uint => uint) public mockPrices;

  address public /*override*/ manager;

  constructor (address _nxm, address _coverContract, address _memberRoles)
  ERC721("Nexus Mutual Staking Pool", "NMSPT") {
    nxm = ERC20(_nxm);
    coverContract = _coverContract;
    memberRoles = _memberRoles;
  }

  function name() public view override returns (string memory) {
    return string(abi.encodePacked(super.name(), " ", Strings.toString(poolId)));
  }

  function initialize(address _manager, uint _poolId) external /*override*/ {
    manager = _manager;
    poolId = _poolId;
  }

  function operatorTransferFrom(address from, address to, uint256 amount) external /*override*/ {
    require(msg.sender == memberRoles, "StakingPool: Caller is not MemberRoles");
    _transfer(from, to, amount);
  }

  function allocateCapacity(
    uint productId,
    uint amountInNXM,
    uint period,
    uint rewardRatio,
    uint initialPriceRatio
  ) external /*override*/ returns (uint coveredAmountInNXM, uint premiumInNXM) {
    period;
    rewardRatio;
    initialPriceRatio;
    usedCapacity[productId] += amountInNXM;
    return (amountInNXM, mockPrices[productId] * amountInNXM / 10000);
  }

  function stake(uint amount) external {
    _mint(msg.sender, amount);
  }

  function freeCapacity(
    uint productId,
    uint previousPeriod,
    uint previousStartTime,
    uint previousRewardAmount,
    uint periodReduction,
    uint coveredAmount
  ) external /*override*/ {
    // no-op
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
    return targetPrices[productId];
  }
  function getStake(uint productId) external /*override*/ view returns (uint) {
    return stakedAmount[productId];
  }

  function setUsedCapacity(uint productId, uint amount) external {
    usedCapacity[productId] = amount;
  }
  function setTargetPrice(uint productId, uint amount) external {
    targetPrices[productId] = amount;
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

}

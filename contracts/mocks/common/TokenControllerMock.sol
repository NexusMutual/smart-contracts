// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/INXMToken.sol";
import "../generic/TokenControllerGeneric.sol";

interface ICover {
  function stakingPool(uint poolId) external view returns (address);
}

contract TokenControllerMock is TokenControllerGeneric, MasterAwareV2 {

  address public addToWhitelistLastCalledWtih;
  address public removeFromWhitelistLastCalledWtih;

  mapping(uint => StakingPoolNXMBalances) public _stakingPoolNXMBalances;

  mapping(uint => address) internal stakingPoolManagers;

  mapping(address => bool) public _isStakingPoolManager;

  mapping(address => mapping (bytes32 => uint)) public _tokensLocked;

  mapping(address => uint) public _withdrawableCoverNotes;

  mapping(address => uint) public _pendingRewards;

  constructor(address _tokenAddress) {
    token = INXMToken(_tokenAddress);
  }

  function mint(address _member, uint256 _amount) public override onlyInternal {
    token.mint(_member, _amount);
  }

  function burnFrom(address _of, uint amount) public override onlyInternal returns (bool) {
    return token.burnFrom(_of, amount);
  }

  function addToWhitelist(address _member) public override onlyInternal {
    addToWhitelistLastCalledWtih = _member;
  }

  function removeFromWhitelist(address _member) public override onlyInternal {
    removeFromWhitelistLastCalledWtih = _member;
  }

  /* ========== DEPENDENCIES ========== */

  function cover() internal view returns (ICover) {
    return ICover(internalContracts[uint(ID.CO)]);
  }

  function changeDependentContractAddress() public {
    internalContracts[uint(ID.CO)] = master.getLatestAddress("CO");
  }

  function operatorTransfer(address _from, address _to, uint _value) onlyInternal external override returns (bool) {
    require(
      msg.sender == master.getLatestAddress("PS") || msg.sender == master.getLatestAddress("CO"),
      "Call is only allowed from PooledStaking or Cover address"
    );
    require(token.operatorTransfer(_from, _value), "Operator transfer failed");
    require(token.transfer(_to, _value), "Internal transfer failed");
    return true;
  }

  function mintStakingPoolNXMRewards(uint amount, uint poolId) external override {
    _stakingPoolNXMBalances[poolId].rewards += uint128(amount);
    token.mint(address(this), amount);
  }

  function burnStakingPoolNXMRewards(uint amount, uint poolId) external override {
    _stakingPoolNXMBalances[poolId].rewards -= uint128(amount);
    token.burn(amount);
  }

  function depositStakedNXM(address from, uint amount, uint poolId) external override {
    _stakingPoolNXMBalances[poolId].deposits += uint128(amount);
    token.operatorTransfer(from, amount);
  }

  function withdrawNXMStakeAndRewards(address to, uint stakeToWithdraw, uint rewardsToWithdraw, uint poolId) external override {
    _stakingPoolNXMBalances[poolId].deposits -= uint128(stakeToWithdraw);
    _stakingPoolNXMBalances[poolId].rewards -= uint128(rewardsToWithdraw);
    token.transfer(to, stakeToWithdraw + rewardsToWithdraw);
  }

  function burnStakedNXM(uint amount, uint poolId) external override {
    _stakingPoolNXMBalances[poolId].deposits -= uint128(amount);
    token.burn(amount);
  }

  function setContractAddresses(address payable coverAddr, address payable tokenAddr) public {
    internalContracts[uint(ID.CO)] = coverAddr;
    token = INXMToken(tokenAddr);
  }

  function setStakingPoolManager(uint poolId, address manager) external {
    stakingPoolManagers[poolId] = manager;
  }

  function getStakingPoolManager(uint poolId) external override view returns (address) {
    return stakingPoolManagers[poolId];
  }

  function assignStakingPoolManager(uint poolId, address manager) external override {
    stakingPoolManagers[poolId] = manager;
  }

  event TransferStakingPoolsOwnershipCalledWith(address from, address to);

  function transferStakingPoolsOwnership(address from, address to) external override {
    emit TransferStakingPoolsOwnershipCalledWith(from, to);
  }

  function setIsStakingPoolManager(address member, bool isManager) external {
    _isStakingPoolManager[member] = isManager;
  }

  function setTokensLocked(address member, bytes32 reason, uint amount) external {
    _tokensLocked[member][reason] = amount;
  }

  function setWithdrawableCoverNotes(address member, uint amount) external {
    _withdrawableCoverNotes[member] = amount;
  }

  function setPendingRewards(address member, uint amount) external {
    _pendingRewards[member] = amount;
  }

  function tokensLocked(address member, bytes32 reason) external override view returns (uint) {
    return _tokensLocked[member][reason];
  }

  function getWithdrawableCoverNotes(address member) external override view returns (
    uint[] memory /* coverIds */,
    bytes32[] memory /* lockReasons */,
    uint amount
  ) {
    uint[] memory coverIds;
    bytes32[] memory lockReasons;
    return (coverIds, lockReasons, _withdrawableCoverNotes[member]);
  }

  function getPendingRewards(address member) external override view returns (uint) {
    return _pendingRewards[member];
  }

  function stakingPoolNXMBalances(uint poolId) external override view returns(uint128 rewards, uint128 deposits) {
    StakingPoolNXMBalances memory balances = _stakingPoolNXMBalances[poolId];
    return (balances.rewards, balances.deposits);
  }

  function isStakingPoolManager(address manager) external override view returns (bool) {
    return _isStakingPoolManager[manager];
  }

  /* unused functions */

  modifier unused {
    require(false, "Unexpected TokenControllerMock call");
    _;
  }

  function burnLockedTokens(address, bytes32, uint256) unused external {}

  function releaseLockedTokens(address _of, bytes32 _reason, uint256 _amount) unused external {}
}

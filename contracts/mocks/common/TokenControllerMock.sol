// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../interfaces/INXMToken.sol";
import "../generic/TokenControllerGeneric.sol";

contract TokenControllerMock is TokenControllerGeneric {

  address public addToWhitelistLastCalledWith;
  address public removeFromWhitelistLastCalledWith;

  mapping(uint => StakingPoolNXMBalances) public _stakingPoolNXMBalances;

  mapping(uint => address) internal stakingPoolManagers;

  mapping(address => bool) public _isStakingPoolManager;

  mapping(address => mapping (bytes32 => uint)) public _tokensLocked;

  mapping(address => uint) public _pendingRewards;

  constructor(address _tokenAddress) {
    token = INXMToken(_tokenAddress);
  }

  function mint(address _member, uint256 _amount) public override {
    token.mint(_member, _amount);
  }

  function burnFrom(address _of, uint amount) public override returns (bool) {
    return token.burnFrom(_of, amount);
  }

  function addToWhitelist(address _member) public override {
    addToWhitelistLastCalledWith = _member;
  }

  function removeFromWhitelist(address _member) public override {
    removeFromWhitelistLastCalledWith = _member;
  }

  /* ========== DEPENDENCIES ========== */

  function operatorTransfer(address _from, address _to, uint _value) external override returns (bool) {
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

  function setPendingRewards(address member, uint amount) external {
    _pendingRewards[member] = amount;
  }

  function tokensLocked(address member, bytes32 reason) external override view returns (uint) {
    return _tokensLocked[member][reason];
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

}

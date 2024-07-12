// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import {ICover} from "../../../interfaces/ICover.sol";
import {INXMMaster} from "../../../interfaces/INXMMaster.sol";
import {IStakingNFT} from "../../../interfaces/IStakingNFT.sol";
import {IStakingPool} from "../../../interfaces/IStakingPool.sol";
import {IStakingProducts} from "../../../interfaces/IStakingProducts.sol";
import {IStakingPoolFactory} from "../../../interfaces/IStakingPoolFactory.sol";
import {IStakingViewer} from "../../../interfaces/IStakingViewer.sol";
import {StakingPoolLibrary} from "../../../libraries/StakingPoolLibrary.sol";

contract NVMockStakingViewer is IStakingViewer {

  uint public constant TRANCHE_DURATION = 91 days;
  uint public constant MAX_ACTIVE_TRANCHES = 8;
  uint public constant ONE_NXM = 1 ether;
  uint public constant TRANCHE_ID_AT_DEPLOY = 213;
  uint public constant MAX_UINT = type(uint).max;
  AggregatedTokens aggregatedTokens;

  /* ========== SETTERS ========== */

  function setAggregatedTokens(uint _totalActiveStake, uint _totalExpiredStake, uint _totalRewards) public {
    aggregatedTokens = AggregatedTokens({
      totalActiveStake: _totalActiveStake,
      totalExpiredStake: _totalExpiredStake,
      totalRewards: _totalRewards
    });
  }

  /* ========== VIEWS ========== */

  function getAggregatedTokens(uint[] calldata) public view returns (AggregatedTokens memory) {
    return aggregatedTokens;
  }

  /* ========== NOT YET IMPLEMENTED ========== */

  function _cover() internal pure returns (ICover) {
    revert("_cover not yet implemented");
  }

  function _stakingProducts() internal pure returns (IStakingProducts) {
    revert("_stakingProducts not yet implemented");
  }

  function stakingPool(uint) public pure returns (IStakingPool) {
    revert("stakingPool not yet implemented");
  }

  /* ========== STAKING POOL ========== */

  function getPool(uint) public pure returns (Pool memory) {
    revert("getPool not yet implemented");
  }

  function getPools(uint[] memory) public pure returns (Pool[] memory) {
    revert("getPools not yet implemented");
  }

  function getAllPools() public pure returns (Pool[] memory) {
    revert("getAllPools not yet implemented");
  }

  function getProductPools(uint) public pure returns (Pool[] memory) {
    revert("getProductPools not yet implemented");
  }

  /* ========== PRODUCTS ========== */

  function getPoolProducts(uint) public pure returns (StakingProduct[] memory) {
    revert("getPoolProducts not yet implemented");
  }

  /* ========== TOKENS AND DEPOSITS ========== */

  function getStakingPoolsOf(uint[] memory) public pure returns (TokenPoolMap[] memory) {
    revert("getStakingPoolsOf not yet implemented");
  }

  function _getToken(uint, uint) internal pure returns (Token memory) {
    revert("_getToken not yet implemented");
  }

  function getToken(uint) public pure returns (Token memory) {
    revert("getToken not yet implemented");
  }

  function getTokens(uint[] memory) public pure returns (Token[] memory) {
    revert("getTokens not yet implemented");
  }

  function getManagedStakingPools(address) public pure returns (Pool[] memory) {
    revert("getManagedStakingPools not yet implemented");
  }

  function getManagerTokenRewardsByAddr(address) public pure returns (Token[] memory) {
    revert("getManagerTokenRewardsByAddr not yet implemented");
  }

  function getManagerTotalRewards(address) public pure returns (uint) {
    revert("getManagerTotalRewards not yet implemented");
  }

  function getManagerPoolsAndRewards(address) external pure returns (ManagerPoolsAndRewards memory) {
    revert("getManagerPoolsAndRewards not yet implemented");
  }

  function getManagerRewards(uint[] memory) external pure returns (Token[] memory) {
    revert("getManagerRewards not yet implemented");
  }

  function processExpirationsFor(uint[] memory) external pure {
    revert("processExpirationsFor not yet implemented");
  }

  function processExpirations(uint[] memory) public pure {
    revert("processExpirations not yet implemented");
  }

  function _getMatchingPools(address) internal pure returns (Pool[] memory, uint) {
    revert("_getMatchingPools not yet implemented");
  }
}

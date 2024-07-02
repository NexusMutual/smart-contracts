// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../interfaces/ITokenController.sol";

contract TokenControllerGeneric is ITokenController {

  INXMToken public token;

  mapping(uint => CoverInfo) public coverInfo;

  function withdrawCoverNote(
    address,
    uint[] calldata,
    uint[] calldata
  ) external pure {
    revert("Unsupported");
  }

  function changeOperator(address) external pure {
    revert("Unsupported");
  }

  function operatorTransfer(address, address, uint) external virtual returns (bool) {
    revert("Unsupported");
  }

  function burnFrom(address, uint) external virtual returns (bool) {
    revert("Unsupported");
  }

  function addToWhitelist(address) external virtual {
    revert("Unsupported");
  }

  function removeFromWhitelist(address) external virtual {
    revert("Unsupported");
  }

  function mint(address, uint) external virtual {
    revert("Unsupported");
  }

  function lockForMemberVote(address, uint) external pure {
    revert("Unsupported");
  }

  function withdrawClaimAssessmentTokens(address[] calldata) external pure {
    revert("Unsupported");
  }

  function getLockReasons(address) external pure returns (bytes32[] memory) {
    revert("Unsupported");
  }

  function totalSupply() external virtual view returns (uint) {
    revert("Unsupported");
  }

  function totalBalanceOf(address) external pure returns (uint) {
    revert("Unsupported");
  }

  function totalBalanceOfWithoutDelegations(address) external pure returns (uint) {
    revert("Unsupported");
  }

  function getTokenPrice() external pure returns (uint) {
    revert("Unsupported");
  }

  function getStakingPoolManager(uint) external virtual view returns (address) {
    revert("Unsupported");
  }

  function getManagerStakingPools(address) external pure returns (uint[] memory) {
    revert("Unsupported");
  }

  function isStakingPoolManager(address) external virtual view returns (bool) {
    revert("Unsupported");
  }

  function getStakingPoolOwnershipOffer(uint) external pure returns (address, uint) {
    revert("Unsupported");
  }

  function transferStakingPoolsOwnership(address, address) external virtual {
    revert("Unsupported");
  }

  function assignStakingPoolManager(uint, address) external virtual {
    revert("Unsupported");
  }

  function createStakingPoolOwnershipOffer(uint, address, uint) external pure {
    revert("Unsupported");
  }

  function acceptStakingPoolOwnershipOffer(uint) external pure {
    revert("Unsupported");
  }

  function cancelStakingPoolOwnershipOffer(uint) external pure {
    revert("Unsupported");
  }

  function mintStakingPoolNXMRewards(uint, uint) external virtual {
    revert("Unsupported");
  }

  function burnStakingPoolNXMRewards(uint, uint) external virtual {
    revert("Unsupported");
  }

  function depositStakedNXM(address, uint, uint) external virtual {
    revert("Unsupported");
  }

  function withdrawNXMStakeAndRewards(address, uint, uint, uint) external virtual {
    revert("Unsupported");
  }

  function burnStakedNXM(uint, uint) external virtual {
    revert("Unsupported");
  }

  function stakingPoolNXMBalances(uint) external virtual view returns(uint128, uint128) {
    revert("Unsupported");
  }

  function tokensLocked(address, bytes32) external virtual view returns (uint256) {
    revert("Unsupported");
  }

  function getWithdrawableCoverNotes(address) external virtual view returns (
    uint[] memory,
    bytes32[] memory,
    uint
  ) {
    revert("Unsupported");
  }

  function getPendingRewards(address) external virtual view returns (uint) {
    revert("Unsupported");
  }
}

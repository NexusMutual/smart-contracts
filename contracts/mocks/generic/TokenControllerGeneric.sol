// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../interfaces/ITokenController.sol";

contract TokenControllerGeneric is ITokenController {

  INXMToken public immutable token;

  function changeOperator(address) external pure {
    revert("changeOperator unsupported");
  }

  function operatorTransfer(address, address, uint) external virtual returns (bool) {
    revert("operatorTransfer unsupported");
  }

  function burnFrom(address, uint) external virtual returns (bool) {
    revert("burnFrom unsupported");
  }

  function addToWhitelist(address) external virtual {
    revert("addToWhitelist unsupported");
  }

  function removeFromWhitelist(address) external virtual {
    revert("removeFromWhitelist unsupported");
  }

  function switchMembership(address, address, bool) external virtual {
    revert("switchMembershipAddressWithTransfer unsupported");
  }

  function mint(address, uint) external virtual {
    revert("mint unsupported");
  }

  function lockForMemberVote(address, uint) external virtual {
    revert("lockForMemberVote unsupported");
  }

  function withdrawClaimAssessmentTokens(address[] calldata) external pure {
    revert("withdrawClaimAssessmentTokens unsupported");
  }

  function getLockReasons(address) external pure returns (bytes32[] memory) {
    revert("getLockReasons unsupported");
  }

  function totalSupply() external virtual view returns (uint) {
    revert("totalSupply unsupported");
  }

  function totalBalanceOf(address) external view virtual returns (uint) {
    revert("totalBalanceOf unsupported");
  }

  function totalBalanceOfWithoutDelegations(address) external pure returns (uint) {
    revert("totalBalanceOfWithoutDelegations unsupported");
  }

  function getTokenPrice() external pure returns (uint) {
    revert("getTokenPrice unsupported");
  }

  function getStakingPoolManager(uint) external virtual view returns (address) {
    revert("getStakingPoolManager unsupported");
  }

  function getManagerStakingPools(address) external pure returns (uint[] memory) {
    revert("getManagerStakingPools unsupported");
  }

  function isStakingPoolManager(address) external virtual view returns (bool) {
    revert("isStakingPoolManager unsupported");
  }

  function getStakingPoolOwnershipOffer(uint) external pure returns (address, uint) {
    revert("getStakingPoolOwnershipOffer unsupported");
  }

  function transferStakingPoolsOwnership(address, address) external virtual {
    revert("transferStakingPoolsOwnership unsupported");
  }

  function assignStakingPoolManager(uint, address) external virtual {
    revert("assignStakingPoolManager unsupported");
  }

  function createStakingPoolOwnershipOffer(uint, address, uint) external pure {
    revert("createStakingPoolOwnershipOffer unsupported");
  }

  function acceptStakingPoolOwnershipOffer(uint) external pure {
    revert("acceptStakingPoolOwnershipOffer unsupported");
  }

  function cancelStakingPoolOwnershipOffer(uint) external pure {
    revert("cancelStakingPoolOwnershipOffer unsupported");
  }

  function mintStakingPoolNXMRewards(uint, uint) external virtual {
    revert("mintStakingPoolNXMRewards unsupported");
  }

  function burnStakingPoolNXMRewards(uint, uint) external virtual {
    revert("burnStakingPoolNXMRewards unsupported");
  }

  function depositStakedNXM(address, uint, uint) external virtual {
    revert("depositStakedNXM unsupported");
  }

  function withdrawNXMStakeAndRewards(address, uint, uint, uint) external virtual {
    revert("withdrawNXMStakeAndRewards unsupported");
  }

  function burnStakedNXM(uint, uint) external virtual {
    revert("burnStakedNXM unsupported");
  }

  function stakingPoolNXMBalances(uint) external virtual view returns(uint128, uint128) {
    revert("stakingPoolNXMBalances unsupported");
  }

  function tokensLocked(address, bytes32) external virtual view returns (uint256) {
    revert("tokensLocked unsupported");
  }

  function getPendingRewards(address) external virtual view returns (uint) {
    revert("getPendingRewards unsupported");
  }

  function withdrawNXM(
    StakingPoolDeposit[] calldata,
    StakingPoolManagerReward[] calldata,
    uint,
    WithdrawAssessment calldata
  ) external virtual {
    revert("withdrawNXM unsupported");
  }
}

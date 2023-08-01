// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/INXMToken.sol";
import "../../interfaces/ITokenController.sol";

contract RammMockTokenController is  ITokenController {

  INXMToken public token;

  constructor(address tokenAddres) {
    token = INXMToken(tokenAddres);
  }

  function operatorTransfer(address _from, address _to, uint _value) external returns (bool) {
    token.operatorTransfer(_from, _value);
    token.transfer(_to, _value);
    return true;
  }

  function mint(address _to, uint _value) external {
    token.mint(_to, _value);
  }

  function burnFrom(address _from, uint _value) external returns (bool) {
    token.burnFrom(_from, _value);
    return true;
  }

  function totalSupply() public override view returns (uint256) {
    return token.totalSupply();
  }

  /* ====== NOT NEEDED FUNCTIONS ====== */

  function withdrawNXMStakeAndRewards(address, uint, uint, uint) external pure {
    revert("Unsupported");
  }

  function withdrawClaimAssessmentTokens(address[] calldata) external pure {
    revert("Unsupported");
  }

  function acceptStakingPoolOwnershipOffer(uint) external pure {
    revert("Unsupported");
  }

  function addToWhitelist(address) external pure {
    revert("Unsupported");
  }

  function assignStakingPoolManager(uint, address) external pure {
    revert("Unsupported");
  }

  function burnStakedNXM(uint, uint) external pure {
    revert("Unsupported");
  }

  function burnStakingPoolNXMRewards(uint, uint) external pure {
    revert("Unsupported");
  }

  function cancelStakingPoolOwnershipOffer(uint) external pure {
    revert("Unsupported");
  }

  function changeOperator(address) external pure {
    revert("Unsupported");
  }

  function coverInfo(uint) external pure returns (uint16, bool, bool, uint96) {
    revert("Unsupported");
  }

  function createStakingPoolOwnershipOffer(uint, address, uint) external pure {
    revert("Unsupported");
  }

  function depositStakedNXM(address, uint, uint) external pure {
    revert("Unsupported");
  }

  function getLockReasons(address) external pure returns (bytes32[] memory) {
    revert("Unsupported");
  }

  function getManagerStakingPools(address) external pure returns (uint[] memory){
    revert("Unsupported");
  }

  function getPendingRewards(address) external pure returns (uint) {
    revert("Unsupported");
  }

  function getStakingPoolManager(uint) external pure returns (address) {
    revert("Unsupported");
  }

  function getStakingPoolOwnershipOffer(uint) external pure returns (address, uint) {
    revert("Unsupported");
  }

  function getTokenPrice() external pure returns (uint) {
    revert("Unsupported");
  }

  function getWithdrawableCoverNotes(address) external pure returns (uint[] memory, bytes32[] memory, uint) {
    revert("Unsupported");
  }

  function isStakingPoolManager(address) external pure returns (bool){
    revert("Unsupported");
  }

  function lockForMemberVote(address, uint) external pure {
    revert("Unsupported");
  }

  function mintStakingPoolNXMRewards(uint, uint) external pure {
    revert("Unsupported");
  }

  function removeFromWhitelist(address) external pure {
    revert("Unsupported");
  }

  function stakingPoolNXMBalances(uint) external pure returns(uint128, uint128) {
    revert("Unsupported");
  }

  function tokensLocked(address, bytes32) external pure returns (uint256) {
    revert("Unsupported");
  }

  function totalBalanceOf(address) external pure returns (uint) {
    revert("Unsupported");
  }

  function totalBalanceOfWithoutDelegations(address) external pure returns (uint) {
    revert("Unsupported");
  }

  function transferStakingPoolsOwnership(address, address) external pure {
    revert("Unsupported");
  }

  function withdrawCoverNote(address, uint[] calldata, uint[] calldata) external pure {
    revert("Unsupported");
  }
}

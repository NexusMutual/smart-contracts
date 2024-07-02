// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../interfaces/IGovernance.sol";

contract GovernanceGeneric is IGovernance {

  function createProposal(string calldata, string calldata, string calldata,uint) external pure {
    revert("Unsupported");
  }

  function updateProposal(uint, string calldata, string calldata, string calldata) external pure {
    revert("Unsupported");
  }

  function categorizeProposal(uint, uint, uint) external pure {
    revert("Unsupported");
  }

  function submitProposalWithSolution(uint, string calldata, bytes calldata) external pure {
    revert("Unsupported");
  }

  function createProposalwithSolution(
    string calldata,
    string calldata,
    string calldata,
    uint,
    string calldata,
    bytes calldata
  ) external pure {
    revert("Unsupported");
  }

  function submitVote(uint, uint) external pure {
    revert("Unsupported");
  }

  function submitVoteWithoutDelegations(uint, uint) external pure {
    revert("Unsupported");
  }

  function closeProposal(uint) external pure {
    revert("Unsupported");
  }

  function tokenHoldingTime() external pure returns (uint) {
    revert("Unsupported");
  }

  function claimReward(address, uint) external pure returns (uint) {
    revert("Unsupported");
  }

  function proposal(uint) external pure returns (uint, uint, uint, uint, uint) {
    revert("Unsupported");
  }

  function canCloseProposal(uint) external pure returns (uint) {
    revert("Unsupported");
  }

  function allowedToCatgorize() external pure returns (uint) {
    revert("Unsupported");
  }

  function getPendingReward(address) external pure returns (uint) {
    revert("Unsupported");
  }

  function getFollowers(address) external pure returns (uint[] memory) {
    revert("Unsupported");
  }

  function followerDelegation(address) external pure returns (uint) {
    revert("Unsupported");
  }

  function allDelegation(uint) external pure returns (address, address, uint) {
    revert("Unsupported");
  }

}

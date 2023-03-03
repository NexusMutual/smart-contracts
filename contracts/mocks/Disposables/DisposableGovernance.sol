// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.17;

import "../../modules/governance/Governance.sol";

contract DisposableGovernance is Governance {

  /* disposable initialization function */

  // mainnet param values added in comments
  function initialize(
    uint _tokenHoldingTime, // 3 days
    uint _maxDraftTime, // 14 days
    uint _maxVoteWeigthPer, // 5
    uint _maxFollowers, // 40
    uint _specialResolutionMajPerc, // 75
    uint _actionWaitingTime // 1 day
  ) external {

    require(!constructorCheck);
    constructorCheck = true;

    totalProposals = 1;
    allVotes.push(ProposalVote(address(0), 0, 0));
    allDelegation.push(DelegateVote(address(0), address(0), now));
    roleIdAllowedToCatgorize = uint(IMemberRoles.Role.AdvisoryBoard);

    tokenHoldingTime = _tokenHoldingTime;
    maxDraftTime = _maxDraftTime;
    maxVoteWeigthPer = _maxVoteWeigthPer;
    maxFollowers = _maxFollowers;
    specialResolutionMajPerc = _specialResolutionMajPerc;
    actionWaitingTime = _actionWaitingTime;
  }

}

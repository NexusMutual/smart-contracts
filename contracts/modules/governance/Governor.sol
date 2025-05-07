// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../abstract/RegistryAware.sol";
import "../../abstract/Multicall.sol";
import "../../interfaces/IGovernor.sol";
import "../../interfaces/IRegistry.sol";
import "../../interfaces/ITokenController.sol";
import "../../libraries/SafeUintCast.sol";

contract Governor is IGovernor, RegistryAware, Multicall {
  using SafeUintCast for uint;

  /* ========== storage ========== */

  uint public proposalCount;

  mapping(uint proposalId => Proposal) internal proposals;

  mapping(uint proposalId => string) internal descriptions;

  mapping(uint proposalId => Transaction[]) internal transactions;

  mapping(uint proposalId => Tally) internal tallies;

  mapping(uint memberId => mapping(uint proposalId => uint weight)) internal votes;

  /* ========== immutables and constants ========== */

  ITokenController public immutable tokenController;

  uint public constant TIMELOCK_PERIOD = 12 hours;
  uint public constant VOTING_PERIOD = 3 days;
  uint public constant ADVISORY_BOARD_THRESHOLD = 3;
  uint public constant MEMBER_VOTE_QUORUM_PERCENTAGE = 15; // 15% of token supply
  uint public constant PROPOSAL_THRESHOLD = 100 ether; // minimum 100 tokens to open an AB swap proposal

  /* ========== logic ========== */

  constructor(address _registry) RegistryAware(_registry) {
    tokenController = ITokenController(fetch(C_TOKEN_CONTROLLER));
  }

  function _getVoteWeight(address voter) internal view returns (uint) {
    // TODO: consider implementing a cap percentage
    uint weight = tokenController.totalBalanceOf(voter) + 1 ether;
    return weight;
  }

  function _lockTokenTransfers(address voter, uint deadline) internal {
    uint duration = deadline - block.timestamp;
    tokenController.lockForMemberVote(voter, duration);
  }

  function propose(
    Transaction[] calldata txs,
    string calldata description
  ) external {
    require(registry.isAdvisoryBoardMember(msg.sender), OnlyAdvisoryBoardMember());
    _propose(ProposalKind.AdvisoryBoard, txs, description);
  }

  function proposeAdvisoryBoardSwap(
    AdvisoryBoardSwap[] memory swaps,
    string calldata description
  ) external {

    require(registry.isMember(msg.sender), NotMember());

    // prevent spam
    uint weight = _getVoteWeight(msg.sender);
    require(weight > PROPOSAL_THRESHOLD, ProposalThresholdNotMet());

    Transaction[] memory txs = new Transaction[](swaps.length);

    for (uint i = 0; i < swaps.length; i++) {

      require(swaps[i].from != swaps[i].to, InvalidAdvisoryBoardSwap());
      require(swaps[i].from != 0 && swaps[i].to != 0, InvalidAdvisoryBoardSwap());

      txs[i] = Transaction({
        target: address(registry),
        value: 0,
        data: abi.encodeWithSelector(registry.swapAdvisoryBoardMember.selector, swaps[i].from, swaps[i].to)
      });
    }

    _propose(ProposalKind.Member, txs, description);
  }

  function _propose(
    ProposalKind kind,
    Transaction[] memory txs,
    string memory description
  ) internal {

    Proposal memory proposal = Proposal({
      kind: kind,
      proposedAt: block.timestamp.toUint32(),
      voteBefore: (block.timestamp + VOTING_PERIOD).toUint32(),
      executeAfter: (block.timestamp + VOTING_PERIOD + TIMELOCK_PERIOD).toUint32(),
      status: ProposalStatus.Proposed
    });

    uint proposalId = ++proposalCount;
    proposals[proposalId] = proposal;
    descriptions[proposalId] = description;

    for (uint i = 0; i < txs.length; i++) {
      transactions[proposalId].push(txs[i]);
    }

    emit ProposalCreated(proposalId, kind, description);
  }

  function cancel(uint proposalId) external {

    require(registry.isAdvisoryBoardMember(msg.sender), OnlyAdvisoryBoardMember());

    Proposal memory proposal = proposals[proposalId];
    require(proposal.proposedAt > 0, ProposalNotFound());
    require(proposal.kind == ProposalKind.AdvisoryBoard, CannotCancelMemberProposal());
    require(proposal.status != ProposalStatus.Executed, ProposalAlreadyExecuted());
    require(proposal.status != ProposalStatus.Canceled, ProposalIsCanceled());
    // todo: consider checking if it's actually in proposed status

    proposal.status = ProposalStatus.Canceled;
    proposals[proposalId] = proposal;

    emit ProposalCanceled(proposalId);
  }

  function vote(uint proposalId, VoteType choice) external {

    Proposal memory proposal = proposals[proposalId];
    require(proposal.proposedAt > 0, ProposalNotFound());
    require(block.timestamp < proposal.voteBefore, VotePeriodHasEnded());
    require(proposal.status != ProposalStatus.Executed, ProposalAlreadyExecuted());
    require(proposal.status != ProposalStatus.Canceled, ProposalIsCanceled());

    uint memberId = registry.getMemberId(msg.sender);
    require(memberId > 0, NotMember());
    require(votes[memberId][proposalId] == 0, AlreadyVoted());

    bool isAbProposal = proposal.kind == ProposalKind.AdvisoryBoard;
    uint voterId = isAbProposal
      ? registry.getAdvisoryBoardSeat(msg.sender)
      : registry.getMemberId(msg.sender);
    require(voterId > 0, NotAuthorizedToVote());

    uint weight = isAbProposal ? 1 :_getVoteWeight(msg.sender);
    votes[memberId][proposalId] = weight;

    if (choice == VoteType.For) {
      tallies[proposalId].forVotes += weight.toUint128();
    }

    if (choice == VoteType.Against) {
      tallies[proposalId].againstVotes += weight.toUint128();
    }

    if (choice == VoteType.Abstain) {
      tallies[proposalId].abstainVotes += weight.toUint128();
    }

    if (isAbProposal && tallies[proposalId].forVotes >= ADVISORY_BOARD_THRESHOLD) {
      // start the timelock if the AB proposal has met the threshold
      proposal.executeAfter = (block.timestamp + TIMELOCK_PERIOD).toUint32();
    }

    emit VoteCast(proposalId, proposal.kind, voterId, choice, weight);
  }

  function _performCall(address target, uint value, bytes memory data, uint txIndex) internal {

    // if data is not empty - the target is assumed to be a contract
    require(data.length == 0 || target.code.length != 0, TargetIsNotAContract());

    (bool ok, bytes memory returndata) = target.call{value: value}(data);

    if (ok) {
      return;
    }

    uint size = returndata.length;

    if (size == 0) {
      revert RevertedWithoutReason(txIndex);
    }

    // bubble up the revert reason
    assembly {
      revert(add(returndata, 0x20), size)
    }
  }

  function execute(uint proposalId) external payable {

    Proposal memory proposal = proposals[proposalId];
    require(proposal.proposedAt > 0, ProposalNotFound());
    require(proposal.status != ProposalStatus.Executed, ProposalAlreadyExecuted());
    require(proposal.status != ProposalStatus.Canceled, ProposalIsCanceled());

    bool isAbProposal = proposal.kind == ProposalKind.AdvisoryBoard;
    require(isAbProposal || registry.isMember(msg.sender), NotMember());
    require(!isAbProposal || registry.isAdvisoryBoardMember(msg.sender), OnlyAdvisoryBoardMember());
    require(block.timestamp > proposal.executeAfter, TimelockHasNotEnded());

    Tally memory tally = tallies[proposalId];
    require(tally.forVotes > tally.againstVotes, VoteTalliedAgainst());

    if (isAbProposal) {
      require(tally.forVotes >= ADVISORY_BOARD_THRESHOLD, VoteThresholdNotMet());
    } else {
      uint quorum = tokenController.totalSupply() * MEMBER_VOTE_QUORUM_PERCENTAGE / 100;
      uint totalVotes = tally.forVotes + tally.againstVotes + tally.abstainVotes;
      require(totalVotes >= quorum, VoteQuorumNotMet());
    }

    Transaction[] memory txs = transactions[proposalId];

    for (uint i = 0; i < txs.length; i++) {
      _performCall(txs[i].target, txs[i].value, txs[i].data, i);
    }

    proposal.status = ProposalStatus.Executed;
    proposals[proposalId] = proposal;

    emit ProposalExecuted(proposalId);
  }

}

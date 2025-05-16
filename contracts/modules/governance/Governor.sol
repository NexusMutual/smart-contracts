// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../interfaces/IGovernor.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../libraries/SafeUintCast.sol";

contract Governor is IGovernor {
  using SafeUintCast for uint;

  /* ========== storage ========== */

  uint public proposalCount;

  mapping(uint proposalId => Proposal) internal proposals;

  mapping(uint proposalId => string) internal descriptions;

  mapping(uint proposalId => Transaction[]) internal transactions;

  mapping(uint proposalId => Tally) internal tallies;

  mapping(address voter => mapping(uint proposalId => uint weight)) internal votes;

  /* ========== immutables and constants ========== */

  ITokenController public immutable tokenController;
  IMemberRoles public immutable memberRoles;

  uint public constant TIMELOCK_PERIOD = 12 hours;
  uint public constant VOTING_PERIOD = 3 days;
  uint public constant ADVISORY_BOARD_QUORUM = 3;
  uint public constant PROPOSAL_THRESHOLD = 100 ether; // minimum 100 tokens to open an AB swap proposal

  /* ========== logic ========== */

  modifier onlyGovernor() {
    require(msg.sender == address(this), OnlyGovernor());
    _;
  }

  modifier onlyAdvisoryBoard() {
    require(memberRoles.isAdvisoryBoardMember(msg.sender), OnlyAdvisoryBoardMember());
    _;
  }

  modifier onlyMember() {
    require(memberRoles.isMember(msg.sender), OnlyMember());
    _;
  }

  constructor(address _memberRoles, address _tokenController) {
    tokenController = ITokenController(_tokenController);
    memberRoles = _memberRoles;
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
  ) external onlyAdvisoryBoard {
    _propose(VoteKind.AdvisoryBoard, txs, description);
  }

  function proposeAdvisoryBoardSwap(
    AdvisoryBoardSwap[] memory swaps,
    string calldata description
  ) external onlyMember {

    // prevent spam
    uint weight = _getVoteWeight(msg.sender);
    require(weight > PROPOSAL_THRESHOLD, ThresholdNotMet());

    Transaction[] memory txs = new Transaction[](swaps.length);

    for (uint i = 0; i < swaps.length; i++) {

      require(swaps[i].remove != swaps[i].add, InvalidAdvisoryBoardSwap());
      require(swaps[i].remove != address(0) && swaps[i].add != address(0), InvalidAdvisoryBoardSwap());

      txs[i] = Transaction({
        target: address(memberRoles),
        value: 0,
        data: abi.encodeWithSelector(memberRoles.replaceAdvisoryBoardMember.selector, swaps[i].remove, swaps[i].add)
      });
    }

    _propose(VoteKind.Member, txs, description);
  }

  function _propose(
    VoteKind kind,
    Transaction[] memory txs,
    string memory description
  ) internal {

    Proposal memory proposal = Proposal({
      kind: kind,
      proposedAt: block.timestamp.toUint32(),
      voteStartsAt: (block.timestamp + TIMELOCK_PERIOD).toUint32(),
      voteEndsAt: (block.timestamp + TIMELOCK_PERIOD + VOTING_PERIOD).toUint32(),
      status: ProposalStatus.Proposed
    });

    uint proposalId = ++proposalCount;
    proposals[proposalId] = proposal;
    transactions[proposalId] = txs;
    descriptions[proposalId] = description;

    emit ProposalCreated(proposalId, kind, description);
  }

  function cancel(uint proposalId) external onlyAdvisoryBoard {

    Proposal memory proposal = proposals[proposalId];
    require(proposal.proposedAt > 0, ProposalNotFound());
    require(proposal.kind == VoteKind.AdvisoryBoard, CannotCancelMemberProposal());
    require(proposal.status != ProposalStatus.Executed, ProposalAlreadyExecuted());
    require(proposal.status != ProposalStatus.Canceled, ProposalIsCanceled());
    // todo: consider checking if it's actually in proposed status

    proposal.status = ProposalStatus.Canceled;
    proposals[proposalId] = proposal;

    emit ProposalCanceled(proposalId);
  }

  function vote(uint proposalId, bool support) external {

    Proposal memory proposal = proposals[proposalId];
    require(proposal.proposedAt > 0, ProposalNotFound());
    require(block.timestamp >= proposal.voteStartsAt, ProposalNotStarted());
    require(block.timestamp < proposal.voteEndsAt, ProposalExpired());
    require(proposal.status != ProposalStatus.Executed, ProposalAlreadyExecuted());
    require(proposal.status != ProposalStatus.Canceled, ProposalIsCanceled());

    require(votes[msg.sender][proposalId] == 0, AlreadyVoted());

    // bug: make sure it's AB if vote kind is AB
    // todo: remember to let ABs vote as members on full mmeber vote proposals
    bool isAbVote = proposal.kind == VoteKind.AdvisoryBoard && memberRoles.isAdvisoryBoardMember(msg.sender);
    uint weight = isAbVote ? 1 :_getVoteWeight(msg.sender);

    votes[msg.sender][proposalId] = weight;

    if (support) {
      tallies[proposalId].forVotes += weight.toUint128();
    } else {
      tallies[proposalId].againstVotes += weight.toUint128();
    }

    emit VoteCast(proposalId, msg.sender, support, weight);
  }

  function _performCall(uint value, address target, bytes memory data, uint txIndex) internal {

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

    Tally memory tally = tallies[proposalId];
    require(tally.forVotes > tally.againstVotes, VoteTalliedAgainst());

    if (proposal.kind == VoteKind.Member) {
      require(block.timestamp > proposal.voteEndsAt, VotePeriodNotEnded());
      // todo: quorum check
    }

    if (proposal.kind == VoteKind.AdvisoryBoard) {
      require(memberRoles.isAdvisoryBoardMember(msg.sender), OnlyAdvisoryBoardMember());
      require(block.timestamp > proposal.voteEndsAt, VotePeriodNotEnded());
      require(tally.forVotes >= ADVISORY_BOARD_QUORUM, VoteQuorumNotMet());
    }

    Transaction[] memory txs = transactions[proposalId];

    for (uint i = 0; i < txs.length; i++) {
      _performCall(txs[i].value, txs[i].target, txs[i].data, i);
    }

    proposal.status = ProposalStatus.Executed;
    proposals[proposalId] = proposal;

    emit ProposalExecuted(proposalId);
  }

}

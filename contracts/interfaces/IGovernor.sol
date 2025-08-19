// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IGovernor {

  enum ProposalKind {
    AdvisoryBoard,
    Member
  }

  enum Choice {
    Against,
    For,
    Abstain
  }

  enum ProposalStatus {
    Proposed,
    Executed,
    Canceled
  }

  struct Proposal { // 112 bits
    ProposalKind kind;
    ProposalStatus status;
    uint32 proposedAt;
    uint32 voteBefore;
    uint32 executeAfter;
  }

  struct Transaction {
    address target;
    uint96 value;
    bytes data;
  }

  struct Vote {
    Choice choice;
    uint96 weight;
  }

  struct Tally {
    uint96 againstVotes;
    uint96 forVotes;
    uint96 abstainVotes;
  }

  struct AdvisoryBoardSwap {
    uint from; // memberId
    uint to; // memberId
  }

  function propose(Transaction[] calldata transactions, string calldata description) external;
  function execute(uint proposalId) external payable;

  function getProposal(uint proposalId) external view returns (Proposal memory);
  // function getProposals(uint start, uint end) external view returns (Proposal[] memory, Transaction[][] memory);
  // function getVotes(uint proposalId, address account) external view returns (uint);
  // function getVotesAt(uint proposalId, address account, uint blockNumber) external view returns (uint);
  // function getTally(uint proposalId) external view returns (Tally memory);
  // function getTallies(uint start, uint end) external view returns (Tally[] memory);

  event ProposalExecuted(uint proposalId);
  event VoteCast(uint indexed proposalId, ProposalKind indexed kind, uint indexed voterId, Choice choice, uint weight);
  event AdvisoryBoardMemberReplaced(address oldAddress, address newAddress);
  event ProposalCanceled(uint proposalId);
  event ProposalCreated(uint proposalId, ProposalKind kind, string description);

  error InvalidAdvisoryBoardSwap();
  error AlreadyAdvisoryBoardMember();
  error OnlyAdvisoryBoardMember();
  error OnlyGovernor();
  error NotMember();
  error NotAuthorizedToVote();

  error ProposalNotFound();
  error ProposalAlreadyExecuted();
  error ProposalIsCanceled();

  // voting
  error VotePeriodHasEnded();
  error VoteTalliedAgainst();
  error VoteThresholdNotMet();
  error VoteQuorumNotMet();
  error ProposalThresholdNotMet();
  error AlreadyVoted();

  // cancellation
  error CannotCancelMemberProposal();

  // execution
  error ExecutionPeriodHasEnded();
  error TimelockHasNotEnded();
  error TargetIsNotAContract();

}

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

  function propose(Transaction[] calldata transactions, string calldata description) external returns (uint proposalId);
  function execute(uint proposalId) external payable;

  function getVoteWeight(address voter) external view returns (uint);

  function getProposal(uint proposalId) external view returns (Proposal memory);
  function getProposalDescription(uint proposalId) external view returns (string memory);
  function getProposalTransactions(uint proposalId) external view returns (Transaction[] memory);
  function getProposalTally(uint proposalId) external view returns (Tally memory);
  function getProposalWithDetails(uint _proposalId) external view returns (
    uint proposalId,
    Proposal memory,
    string memory,
    Transaction[] memory,
    Tally memory
  );
  function getVote(uint proposalId, uint memberId) external view returns (Vote memory);

  event ProposalExecuted(uint proposalId);
  event VoteCast(uint indexed proposalId, ProposalKind indexed kind, uint indexed voterId, Choice choice, uint weight);
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

// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IGovernor {

  enum VoteKind {
    AdvisoryBoard,
    Member
  }

  enum ProposalStatus {
    Proposed,
    Executed,
    Canceled
  }

  struct Proposal { // 112 bits
    VoteKind kind;
    ProposalStatus status;
    uint32 proposedAt;
    uint32 voteStartsAt;
    uint32 voteEndsAt;
  }

  struct Transaction {
    address target;
    uint96 value;
    bytes data;
  }

  struct Tally {
    uint128 forVotes;
    uint128 againstVotes;
  }

  struct AdvisoryBoardSwap {
    address remove;
    address add;
  }

  function propose(Transaction[] calldata transactions, string calldata description) external;
  function execute(uint proposalId) external payable;

  // function getProposal(uint proposalId) external view returns (Proposal memory, Transaction[] memory);
  // function getProposals(uint start, uint end) external view returns (Proposal[] memory, Transaction[][] memory);
  // function getVotes(uint proposalId, address account) external view returns (uint);
  // function getVotesAt(uint proposalId, address account, uint blockNumber) external view returns (uint);
  // function getTally(uint proposalId) external view returns (Tally memory);
  // function getTallies(uint start, uint end) external view returns (Tally[] memory);

  event ProposalExecuted(uint proposalId);
  event VoteCast(uint proposalId, address account, bool support, uint weight);
  event AdvisoryBoardMemberReplaced(address oldAddress, address newAddress);
  event ProposalCanceled(uint proposalId);
  event ProposalCreated(uint proposalId, VoteKind kind, string description);

  error InvalidAdvisoryBoardSwap();
  error AlreadyAdvisoryBoardMember();
  error OnlyAdvisoryBoardMember();
  error OnlyGovernor();
  error OnlyMember();

  error ProposalNotFound();
  error ProposalExpired();
  error ProposalAlreadyExecuted();
  error ProposalNotStarted();
  error ProposalIsCanceled();

  // voting
  error VotePeriodNotEnded();
  error VoteTalliedAgainst();
  error VoteQuorumNotMet();
  error ThresholdNotMet();
  error AlreadyVoted();

  // cancellation
  error CannotCancelMemberProposal();

  // execution
  error OnlyFirstProposal();
  error RevertedWithoutReason(uint index);
  error TargetIsNotAContract();

}

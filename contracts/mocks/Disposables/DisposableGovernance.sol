pragma solidity ^0.5.0;

/*
 * Due to the bytecode size limit on the Governance contract,
 * we don't inherit it but just copy the state variables here instead
 * to allow a safe upgrade from the disposable to the normal contract
 */

import "../../modules/governance/Governance.sol";
import "../../modules/governance/MemberRoles.sol";
import "../../modules/governance/ProposalCategory.sol";
import "../../modules/governance/external/IGovernance.sol";
import "../../modules/token/TokenController.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract DisposableGovernance is IGovernance, Iupgradable {

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
    roleIdAllowedToCatgorize = uint(MemberRoles.Role.AdvisoryBoard);

    tokenHoldingTime = _tokenHoldingTime;
    maxDraftTime = _maxDraftTime;
    maxVoteWeigthPer = _maxVoteWeigthPer;
    maxFollowers = _maxFollowers;
    specialResolutionMajPerc = _specialResolutionMajPerc;
    actionWaitingTime = _actionWaitingTime;
  }

  /* structs used in state variables */

  struct ProposalData {
    uint propStatus;
    uint finalVerdict;
    uint category;
    uint commonIncentive;
    uint dateUpd;
    address owner;
  }

  struct ProposalVote {
    address voter;
    uint proposalId;
    uint dateAdd;
  }

  struct VoteTally {
    mapping(uint => uint) memberVoteValue;
    mapping(uint => uint) abVoteValue;
    uint voters;
  }

  struct DelegateVote {
    address follower;
    address leader;
    uint lastUpd;
  }

  /* copied state variables */

  ProposalVote[] internal allVotes;
  DelegateVote[] public allDelegation;

  mapping(uint => ProposalData) internal allProposalData;
  mapping(uint => bytes[]) internal allProposalSolutions;
  mapping(address => uint[]) internal allVotesByMember;
  mapping(uint => mapping(address => bool)) public rewardClaimed;
  mapping(address => mapping(uint => uint)) public memberProposalVote;
  mapping(address => uint) public followerDelegation;
  mapping(address => uint) internal followerCount;
  mapping(address => uint[]) internal leaderDelegation;
  mapping(uint => VoteTally) public proposalVoteTally;
  mapping(address => bool) public isOpenForDelegation;
  mapping(address => uint) public lastRewardClaimed;

  bool internal constructorCheck;
  uint public tokenHoldingTime;
  uint internal roleIdAllowedToCatgorize;
  uint internal maxVoteWeigthPer;
  uint internal specialResolutionMajPerc;
  uint internal maxFollowers;
  uint internal totalProposals;
  uint internal maxDraftTime;

  MemberRoles internal memberRole;
  ProposalCategory internal proposalCategory;
  TokenController internal tokenInstance;

  mapping(uint => uint) public proposalActionStatus;
  mapping(uint => uint) internal proposalExecutionTime;
  mapping(uint => mapping(address => bool)) public proposalRejectedByAB;
  mapping(uint => uint) internal actionRejectedCount;

  bool internal actionParamsInitialised;
  uint internal actionWaitingTime;

  function changeDependentContractAddress() public {
    tokenInstance = TokenController(ms.dAppLocker());
    memberRole = MemberRoles(ms.getLatestAddress("MR"));
    proposalCategory = ProposalCategory(ms.getLatestAddress("PC"));
  }

  /* function required for Iupgradable and IGovernance implementation */

  function createProposal(string calldata, string calldata, string calldata, uint) external {}

  function updateProposal(uint, string calldata, string calldata, string calldata) external {}

  function categorizeProposal(uint, uint, uint) external {}

  function submitProposalWithSolution(uint, string calldata, bytes calldata) external {}

  function createProposalwithSolution(string calldata, string calldata, string calldata, uint, string calldata, bytes calldata) external {}

  function submitVote(uint, uint) external {}

  function closeProposal(uint) external {}

  function claimReward(address, uint) external returns (uint) {return 0;}

  function proposal(uint) external view returns (uint, uint, uint, uint, uint) {return (0, 0, 0, 0, 0);}

  function canCloseProposal(uint) public view returns (uint) {return 0;}

  function allowedToCatgorize() public view returns (uint) {return 0;}
}

// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/token/ERC721/IERC721Receiver.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IAssessment.sol";
import "../../abstract/MasterAwareV2.sol";
import "../../libraries/Assessment/AssessmentClaimsLib.sol";
import "../../libraries/Assessment/AssessmentGovernanceActionsLib.sol";
import "../../libraries/Assessment/AssessmentIncidentsLib.sol";
import "../../libraries/Assessment/AssessmentVoteLib.sol";

/**
 *  Provides a way for cover owners to submit claims and redeem the payouts and facilitates
 *  assessment processes where members decide the outcome of the events that lead to potential
 *  payouts.
 */
contract Assessment is IAssessment, MasterAwareV2 {

  /* ========== STATE VARIABLES ========== */

  INXMToken internal immutable nxm;

  Configuration public config;

  // Stake states of users. (See Stake struct)
  mapping(address => Stake) public override stakeOf;

  // Votes of users. (See Vote struct)
  mapping(address => Vote[]) public override votesOf;

  // Mapping used to determine if a user has already voted, using a vote hash as a key
  mapping(address => mapping(uint => bool)) public override hasAlreadyVotedOn;

  // An array of merkle tree roots used to indicate fraudulent assessors. Each root represents a
  // fraud attempt by one or multiple addresses. Once the root is submitted by adivsory board
  // members through governance, burnFraud uses this root to burn the fraudulent assessors' stakes
  // and correct the outcome of the poll.
  bytes32[] internal fraudMerkleRoots;
  mapping(uint => Poll) internal fraudSnapshot;

  Claim[] public override claims;
  address[] public override claimants;

  Incident[] public override incidents;
  mapping(uint104 => AffectedToken) internal tokenAffectedByIncident;

  /* ========== CONSTRUCTOR ========== */

  constructor(address masterAddress) {
    // [todo] Move to intiialize function
    // The minimum cover premium is 2.6%. 20% of the cover premium is: 2.6% * 20% = 0.52%
    config.rewardRatio = 52; // 0.52%
    config.incidentExpectedPayoutRatio = 3000; // 30%
    config.claimAssessmentDepositRatio = 500; // 5% i.e. 0.05 ETH submission flat fee
    config.minVotingPeriodDays = 3; // days
    config.maxVotingPeriodDays = 30; // days
    config.payoutCooldownDays = 1; //days
    master = INXMMaster(masterAddress);
    nxm = INXMToken(master.tokenAddress());
  }

  /* ========== VIEWS ========== */

  function getVoteCountOfAssessor(address assessor) external override view returns (uint) {
    return votesOf[assessor].length;
  }

  function getClaimsCount() external override view returns (uint) {
    return claims.length;
  }

  function getIncidentsCount() external override view returns (uint) {
    return incidents.length;
  }

  /* === MUTATIVE FUNCTIONS ==== */

  /**
   *  Submits a claim for assessment
   *
   *  @dev This function requires an ETH submission fee. See: _getSubmissionFee()
   *
   *  @param coverId          Cover identifier
   *  @param requestedAmount  The amount expected to be received at payout
   *  @param hasProof         When true, a ProofSubmitted event is emitted with ipfsProofHash.
   *                          When false, no ProofSubmitted event is emitted to save gas if the
   *                          cover wording doesn't enforce a proof of loss.
   *  @param ipfsProofHash    The IPFS hash required for proof of loss. It is ignored if hasProof
   *                          is false
   */
  function submitClaim(
    uint24 coverId,
    uint96 requestedAmount,
    bool hasProof ,
    string calldata ipfsProofHash
  ) external payable override onlyMember {
    AssessmentClaimsLib.submitClaim(
      config,
      internalContracts,
      claims,
      claimants,
      coverId,
      requestedAmount,
      hasProof ,
      ipfsProofHash
    );

  }

  function submitIncident(
    uint24 productId,
    uint96 priceBefore,
    uint32 date
  ) external override {
    (
      AffectedToken memory affectedToken,
      Incident memory incident
    ) = AssessmentIncidentsLib.getIncidentToSubmit(
      config,
      IMemberRoles(getInternalContractAddress(ID.MR)),
      productId,
      priceBefore,
      date
    );

    AssessmentIncidentsLib.saveIncident(
      incident,
      incidents,
      affectedToken,
      tokenAffectedByIncident
    );
  }

  function depositStake(uint96 amount) external override onlyMember {
    stakeOf[msg.sender].amount += amount;
    ITokenController(getInternalContractAddress(ID.TC))
      .operatorTransfer(msg.sender, address(this), amount);
  }

  function withdrawReward(address user, uint104 untilIndex) external override {
    AssessmentVoteLib.withdrawReward(
      config,
      nxm,
      user,
      untilIndex,
      stakeOf,
      votesOf,
      claims,
      incidents
    );
  }

  function withdrawStake(uint96 amount) external override onlyMember {
    AssessmentVoteLib.withdrawStake(config, nxm, stakeOf, votesOf, amount);
  }

  function redeemClaimPayout(uint104 id) external override {
    AssessmentClaimsLib.redeemClaimPayout(
      config,
      internalContracts,
      claims,
      claimants,
      id
    );
  }

  function redeemIncidentPayout(uint104 incidentId, uint32 coverId, uint depeggedTokens)
  external override onlyMember {
    AssessmentIncidentsLib.redeemIncidentPayout(
      internalContracts,
      incidents[incidentId],
      coverId,
      depeggedTokens
    );
  }

  function redeemCoverForDeniedClaim(uint coverId, uint claimId)
  external override {
    AssessmentClaimsLib.redeemCoverForDeniedClaim(
    config,
    internalContracts,
    claims,
    claimants,
    coverId,
    claimId
    );
  }

  // [todo] Check how many times poll is loaded from storage
  function castVote(uint8 eventType, uint104 id, bool accepted) external override onlyMember {
    AssessmentVoteLib.castVote(
    config,
    eventType,
    id,
    accepted,
    stakeOf,
    votesOf,
    hasAlreadyVotedOn,
    claims,
    incidents
    );
  }

  function submitFraud(bytes32 root) external override onlyGovernance {
    fraudMerkleRoots.push(root);
  }

  function burnFraud(
    uint256 rootIndex,
    bytes32[] calldata proof,
    address fraudulentAssessor,
    uint256 lastFraudulentVoteIndex,
    uint96 burnAmount,
    uint16 fraudCount,
    uint256 voteBatchSize
  ) external override {
    require(AssessmentGovernanceActionsLib.isFraudProofValid(
      fraudMerkleRoots[rootIndex],
      proof,
      fraudulentAssessor,
      lastFraudulentVoteIndex,
      burnAmount,
      fraudCount
    ), "Invalid merkle proof");

    AssessmentGovernanceActionsLib.processFraudResolution(
      config,
      lastFraudulentVoteIndex,
      burnAmount,
      fraudCount,
      voteBatchSize,
      fraudulentAssessor,
      stakeOf,
      votesOf,
      pollFraudOfEvent,
      claims,
      incidents
    );
  }

  function updateUintParameters(UintParams[] calldata paramNames, uint[] calldata values)
  external override onlyGovernance {
    config = AssessmentGovernanceActionsLib.getUpdatedUintParameters(config, paramNames, values);
  }

  // [todo] Since this function is called every time contracts change,
  // all internal contracts could be stored here to avoid calls to master when
  // using onlyInternal or simply making a call to another contract.
  // What I have in mind is that every time this function is called, everything should
  // be wiped out and replaced with what is passed as calldata by master. This function
  // should only be callable by master.
  function changeDependentContractAddress() external override {
    master = INXMMaster(master);
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
    internalContracts[uint(ID.P1)] = master.getLatestAddress("P1");
    internalContracts[uint(ID.CO)] = master.getLatestAddress("CO");
  }

  // Required to receive NFTS
  function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
  external pure override returns (bytes4) {
    return IERC721Receiver.onERC721Received.selector;
  }

}

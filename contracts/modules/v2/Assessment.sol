// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../interfaces/INXMToken.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IAssessment.sol";
import "../../abstract/MasterAwareV2.sol";
import "../../libraries/Assessment/AssessmentClaimsLib.sol";
import "../../libraries/Assessment/AssessmentGovernanceActionsLib.sol";
import "../../libraries/Assessment/AssessmentIncidentsLib.sol";
import "../../libraries/Assessment/AssessmentUtilsLib.sol";
import "../../libraries/Assessment/AssessmentVoteLib.sol";

/**
 *  Provides a way for cover owners to submit claims and redeem the payouts and facilitates
 *  assessment processes where members decide the outcome of the events that lead to potential
 *  payouts.
 */
contract Assessment is IAssessment, MasterAwareV2 {

  /* ========== STATE VARIABLES ========== */

  INXMToken internal immutable nxm;

  Configuration public CONFIG;

  // ERC20 addresses of supported payout assetss (See Asset enum)
  mapping(uint => address) internal addressOfAsset;

  // Stake states of users. (See Stake struct)
  mapping(address => Stake) public override stakeOf;

  // Votes of users. (See Vote struct)
  mapping(address => Vote[]) public override votesOf;

  // Mapping used to determine if a user has already voted, using a vote hash as a key
  mapping(bytes32 => bool) public override hasAlreadyVotedOn;

  // An array of merkle tree roots used to indicate fraudulent assessors. Each root represents a
  // fraud attempt by one or multiple addresses. Once the root is submitted by adivsory board
  // members through governance, burnFraud uses this root to burn the fraudulent assessors' stakes
  // and correct the outcome of the poll.
  bytes32[] internal fraudMerkleRoots;
  mapping(uint8 => mapping(uint104 => Poll)) internal pollFraudOfEvent;

  Claim[] public override claims;

  Incident[] public override incidents;
  mapping(uint104 => address) internal incidentProponent;
  mapping(uint104 => AffectedToken) internal tokenAffectedByIncident;

  /* ========== CONSTRUCTOR ========== */

  constructor (address masterAddress, address dai, address eth) {
    // [todo] Move to intiialize function
    // The minimum cover premium is 2.6%. 20% of the cover premium is: 2.6% * 20% = 0.52%
    CONFIG.REWARD_PERC = 52;

    CONFIG.INCIDENT_IMPACT_ESTIMATE_PERC = 30; // 30%
    CONFIG.MIN_VOTING_PERIOD_DAYS = 3; // days
    CONFIG.MAX_VOTING_PERIOD_DAYS = 30; // days
    CONFIG.PAYOUT_COOLDOWN_DAYS = 1; //days
    CONFIG.CLAIM_ASSESSMENT_DEPOSIT_PERC = 500; // 5% i.e. 0.05 ETH submission flat fee
    CONFIG.INCIDENT_ASSESSMENT_DEPOSIT_PERC = 0;
    addressOfAsset[uint(Asset.ETH)] = eth;
    addressOfAsset[uint(Asset.DAI)] = dai;
    master = INXMMaster(masterAddress);
    nxm = INXMToken(master.tokenAddress());
  }

  /* ========== VIEWS ========== */

  function tokenController() internal view returns (ITokenController) {
    return ITokenController(getInternalContractAddress(ID.TC));
  }

  function memberRoles() internal view returns (IMemberRoles) {
    return IMemberRoles(getInternalContractAddress(ID.MR));
  }

  function pool() internal view returns (IPool) {
    return IPool(getInternalContractAddress(ID.P1));
  }

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
   *  @param withProof        When true, a ProofSubmitted event is emitted with ipfsProofHash.
   *                          When false, no ProofSubmitted event is emitted to save gas if the
   *                          cover wording doesn't enforce a proof of loss.
   *  @param ipfsProofHash    The IPFS hash required for proof of loss. It is ignored if withProof
   *                          is false
   */
  function submitClaim(
    uint24 coverId,
    uint96 requestedAmount,
    bool withProof,
    string calldata ipfsProofHash
  ) external payable onlyMember {
    AssessmentClaimsLib.submitClaim(
      CONFIG,
      coverId,
      requestedAmount,
      withProof,
      ipfsProofHash,
      claims
    );

  }

  function submitIncident(
    uint24 productId,
    uint96 priceBefore,
    uint32 date
  ) external {
    (
      AffectedToken memory affectedToken,
      Incident memory incident
    ) = AssessmentIncidentsLib.getIncidentToSubmit(
      CONFIG,
      memberRoles(),
      productId,
      priceBefore,
      date
    );

    AssessmentIncidentsLib.saveIncident (
      incident,
      incidents,
      affectedToken,
      tokenAffectedByIncident,
      incidentProponent
    );
  }

  function depositStake (uint96 amount) external onlyMember {
    Stake storage stake = stakeOf[msg.sender];
    stake.amount += amount;
    nxm.transferFrom(msg.sender, address(this), amount);
  }

  function withdrawReward (address user, uint104 untilIndex) external {
    AssessmentVoteLib.withdrawReward(
      CONFIG,
      nxm,
      user,
      untilIndex,
      stakeOf,
      votesOf,
      claims,
      incidents
    );
  }

  function withdrawStake (uint96 amount) external onlyMember {
    AssessmentVoteLib.withdrawStake(CONFIG, nxm, stakeOf, votesOf, amount);
  }

  function redeemClaimPayout (uint104 id) external {
    AssessmentClaimsLib.redeemClaimPayout(
      CONFIG,
      pool(),
      memberRoles(),
      id,
      claims,
      addressOfAsset
    );
  }

  function redeemIncidentPayout (uint104 incidentId, uint32 coverId, uint payoutAmount) external {
    AssessmentIncidentsLib.redeemIncidentPayout(
      pool(),
      memberRoles(),
      incidents[incidentId],
      coverId,
      payoutAmount,
      addressOfAsset
    );
  }

  // [todo] Check how many times poll is loaded from storage
  function castVote (uint8 eventType, uint104 id, bool accepted) external onlyMember {
    AssessmentVoteLib.castVote(
    CONFIG,
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

  function submitFraud (bytes32 root) external onlyGovernance {
    fraudMerkleRoots.push(root);
  }

  function burnFraud (
    uint256 rootIndex,
    bytes32[] calldata proof,
    address fraudulentAssessor,
    uint256 lastFraudulentVoteIndex,
    uint96 burnAmount,
    uint16 fraudCount,
    uint256 voteBatchSize
  ) external {
    require(AssessmentGovernanceActionsLib.isFraudProofValid(
      fraudMerkleRoots[rootIndex],
      proof,
      fraudulentAssessor,
      lastFraudulentVoteIndex,
      burnAmount,
      fraudCount
    ), "Invalid merkle proof");

    AssessmentGovernanceActionsLib.processFraudResolution(
      CONFIG,
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

  function updateUintParameters (UintParams[] calldata paramNames, uint[] calldata values)
  external onlyGovernance {
    CONFIG = AssessmentGovernanceActionsLib.getUpdatedUintParameters(CONFIG, paramNames, values);
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
  }

}

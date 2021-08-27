// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/utils/cryptography/MerkleProof.sol";
import "../../interfaces/IAssessment.sol";

library AssessmentGovernanceActionsLib {

  function getUpdatedUintParameters (
    IAssessment.Configuration memory config,
    IAssessment.UintParams[] calldata paramNames,
    uint[] calldata values
  ) external pure returns (IAssessment.Configuration memory) {
    for (uint i = 0; i < paramNames.length; i++) {
      if (paramNames[i] == IAssessment.UintParams.rewardRatio) {
        config.rewardRatio = uint16(values[i]);
        continue;
      }
      if (paramNames[i] == IAssessment.UintParams.incidentExpectedPayoutRatio) {
        config.incidentExpectedPayoutRatio = uint16(values[i]);
        continue;
      }
      if (paramNames[i] == IAssessment.UintParams.minVotingPeriodDays) {
        config.minVotingPeriodDays = uint8(values[i]);
        continue;
      }
      if (paramNames[i] == IAssessment.UintParams.maxVotingPeriodDays) {
        config.maxVotingPeriodDays = uint8(values[i]);
        continue;
      }
      if (paramNames[i] == IAssessment.UintParams.payoutCooldownDays) {
        config.payoutCooldownDays = uint8(values[i]);
        continue;
      }
      if (paramNames[i] == IAssessment.UintParams.claimAssessmentDepositRatio) {
        config.claimAssessmentDepositRatio = uint16(values[i]);
        continue;
      }
    }
    return config;
  }

  function getFraudulentAssessorLeaf (
    address account,
    uint256 lastFraudulentVoteIndex,
    uint96 burnAmount,
    uint16 fraudCount
  ) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(account, lastFraudulentVoteIndex, burnAmount, fraudCount));
  }

  function isFraudProofValid(
    bytes32 root,
    bytes32[] calldata proof,
    address fraudulentAssessor,
    uint256 lastFraudulentVoteIndex,
    uint96 burnAmount,
    uint16 fraudCount
  ) external pure returns (bool) {
    return MerkleProof.verify(proof, root,
     getFraudulentAssessorLeaf(
        fraudulentAssessor,
        lastFraudulentVoteIndex,
        burnAmount,
        fraudCount
      )
    );
  }

  function processFraudulentVote (
    IAssessment.Configuration calldata config,
    IAssessment.Vote memory vote,
    IAssessment.Claim[] storage claims,
    IAssessment.Incident[] storage incidents,
    mapping(uint8 => mapping(uint104 => IAssessment.Poll)) storage pollFraudOfEvent
  ) internal {

    IAssessment.Poll memory poll = assessments[vote.pollId].poll;
    {
      if (uint32(block.timestamp) >= poll.end + config.payoutCooldownDays * 1 days) {
        // Once the cooldown period ends the poll result is final
        return;
      }
    }

    {
      IAssessment.Poll memory pollFraud = pollFraudOfEvent[vote.eventType][vote.eventId];

      // Check if pollFraud exists. The start date is guaranteed to be > 0 in any poll.
      if (pollFraud.start == 0) {
        // Copy the current poll results before correction starts
        pollFraudOfEvent[vote.eventType][vote.eventId] = poll;
      }
    }

    {
      if (vote.accepted) {
        poll.accepted -= vote.tokenWeight;
      } else {
        poll.denied -= vote.tokenWeight;
      }

      if (poll.end < uint32(block.timestamp) + 1 days) {
        poll.end = uint32(block.timestamp) + 1 days;
      }
    }

    assessments[vote.pollId].poll = poll;
  }

  function processFraudResolution (
    IAssessment.Configuration calldata config,
    uint256 lastFraudulentVoteIndex,
    uint96 burnAmount,
    uint16 fraudCount,
    uint256 voteBatchSize,
    address fraudulentAssessor,
    mapping(address => IAssessment.Stake) storage stakeOf,
    mapping(address => IAssessment.Vote[]) storage votesOf,
    mapping(uint8 => mapping(uint104 => IAssessment.Poll)) storage pollFraudOfEvent,
    IAssessment.Claim[] storage claims,
    IAssessment.Incident[] storage incidents
  ) external {
    IAssessment.Stake memory stake = stakeOf[fraudulentAssessor];

    // Make sure we don't burn beyong lastFraudulentVoteIndex
    uint processUntil = stake.rewardsWithdrawnUntilIndex + voteBatchSize;
    if ( processUntil >= lastFraudulentVoteIndex){
      processUntil = lastFraudulentVoteIndex + 1;
    }

    for (uint j = stake.rewardsWithdrawnUntilIndex; j < processUntil; j++) {
      processFraudulentVote(config, votesOf[fraudulentAssessor][j], claims, incidents, pollFraudOfEvent);
    }

    if (fraudCount == stake.fraudCount) {
      // Burns an assessor only once for each merkle root, no matter how many times this function
      // runs on the same account. When a transaction is too big to fit in one block, it is batched
      // in multiple transactions according to voteBatchSize. After burning the tokens, fraudCount
      // is incremented. If another merkle root is submitted that contains the same addres, the leaf
      // should use the updated fraudCount stored in the Stake struct as input.
      //nxm.burn(uint(stake.amount));
      // [todo] Burn the maximum between burnAmount and stake.amount
      stake.amount -= burnAmount;
      stake.fraudCount++;
    }

    stake.rewardsWithdrawnUntilIndex = uint104(processUntil);
    stakeOf[fraudulentAssessor] = stake;

  }
}

const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

const { AssessmentOutcome } = nexus.constants;

/**
 * Helper function to have all assessors vote on a claim
 * @param {Object} assessment - Assessment contract instance
 * @param {Object} registry - Registry contract instance
 * @param {Array} assessors - Array of assessor signers
 * @param {number} claimId - The claim ID
 * @param {string} ipfsHash - IPFS hash for the vote
 * @param {boolean} vote - Vote value (true for accept, false for deny)
 * @returns {Promise<Array>} Array of assessor signers for the claim
 */
async function allAssessorsVote(assessment, registry, assessors, claimId, ipfsHash, vote = true) {
  // Get the group assessors for this claim
  const { assessingGroupId: groupId } = await assessment.getAssessment(claimId);
  const groupAssessors = await assessment.getGroupAssessors(groupId);

  // Create a reverse lookup for member ID to address
  const memberIdToAddr = {};
  for (const assessor of assessors) {
    const id = await registry.getMemberId(assessor.address);
    memberIdToAddr[id.toString()] = assessor.address;
  }

  // Map group assessor member IDs to actual signer objects
  const validAssessors = groupAssessors.map(mid => {
    const addr = memberIdToAddr[mid.toString()];
    return assessors.find(a => a.address === addr);
  });

  // All assessors vote
  const allCastVote = validAssessors.map(assessor => assessment.connect(assessor).castVote(claimId, vote, ipfsHash));
  await Promise.all(allCastVote);

  return validAssessors;
}

describe('closeVotingEarly', function () {
  it('should revert for invalid claim ID', async function () {
    const { contracts } = await loadFixture(setup);
    const { assessment } = contracts;
    const invalidClaimId = 999;

    const closeVotingEarly = assessment.closeVotingEarly(invalidClaimId);
    await expect(closeVotingEarly).to.be.revertedWithCustomError(assessment, 'InvalidClaimId');
  });

  it('should revert when voting period has already ended', async function () {
    const { contracts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID } = constants;

    // Fast forward past the voting period
    const block = await ethers.provider.getBlock('latest');
    if (!block) {
      throw new Error('Block not found');
    }
    const votingPeriod = await assessment.minVotingPeriod();
    await time.increase(BigInt(block.timestamp) + votingPeriod + 1n);

    const closeVotingEarly = assessment.closeVotingEarly(CLAIM_ID);
    await expect(closeVotingEarly).to.be.revertedWithCustomError(assessment, 'VotingAlreadyClosed');
  });

  it('should revert when no assessors have voted', async function () {
    const { contracts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID } = constants;

    const closeVotingEarly = assessment.closeVotingEarly(CLAIM_ID);
    await expect(closeVotingEarly).to.be.revertedWithCustomError(assessment, 'NotEverybodyVoted');
  });

  it('should revert when only some assessors have voted', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID, IPFS_HASH } = constants;
    const [firstAssessor] = accounts.assessors;

    // Only one assessor votes
    await assessment.connect(firstAssessor).castVote(CLAIM_ID, true, IPFS_HASH);

    // Verify not all assessors have voted
    const { assessingGroupId: groupId } = await assessment.getAssessment(CLAIM_ID);
    const assessorCount = await assessment.getGroupAssessorCount(groupId);
    const assessmentData = await assessment.getAssessment(CLAIM_ID);
    const totalVotes = assessmentData.acceptVotes + assessmentData.denyVotes;
    expect(totalVotes).to.be.lt(assessorCount);

    const closeVotingEarly = assessment.closeVotingEarly(CLAIM_ID);
    await expect(closeVotingEarly).to.be.revertedWithCustomError(assessment, 'NotEverybodyVoted');
  });

  it('should succeed when all assessors have voted', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { IPFS_HASH, CLAIM_ID } = constants;
    const { assessors } = accounts;

    // All assessors vote
    const validAssessors = await allAssessorsVote(assessment, registry, assessors, CLAIM_ID, IPFS_HASH, true);

    // Close voting early
    const [firstAssessor] = validAssessors;
    const tx = await assessment.connect(firstAssessor).closeVotingEarly(CLAIM_ID);

    // Get the exact block timestamp when the transaction was mined
    const { blockNumber } = await tx.wait();
    const block = await ethers.provider.getBlock(blockNumber);
    const expectedVotingEndTime = block?.timestamp;

    const assessmentData = await assessment.getAssessment(CLAIM_ID);
    expect(assessmentData.votingEnd).to.equal(expectedVotingEndTime);
  });

  it('should succeed with empty assessor group and result in DRAW status', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;
    const { CLAIM_ID, ASSESSOR_GROUP_ID } = constants;

    // Remove all assessors from the existing group to make it empty
    const assessorMemberIds = await Promise.all(accounts.assessors.map(a => contracts.registry.getMemberId(a.address)));
    await Promise.all(
      assessorMemberIds.map(assessorMemberId =>
        assessment.connect(governanceAccount).removeAssessorFromGroup(assessorMemberId, ASSESSOR_GROUP_ID),
      ),
    );

    // Verify the group is now empty
    const groupAssessors = await assessment.getGroupAssessors(ASSESSOR_GROUP_ID);
    expect(groupAssessors.length).to.equal(0);

    // Close voting early should succeed (0 votes == 0 required votes)
    const closeVotingTx = await assessment.closeVotingEarly(CLAIM_ID);
    const closeVotingReceipt = await closeVotingTx.wait();
    const closeVotingBlock = await ethers.provider.getBlock(closeVotingReceipt.blockNumber);
    if (!closeVotingBlock) {
      throw new Error('Block not found');
    }
    const closeVotingTimestamp = closeVotingBlock.timestamp;

    // Verify the assessment was updated correctly
    const assessmentData = await assessment.getAssessment(CLAIM_ID);
    expect(assessmentData.votingEnd).to.equal(closeVotingTimestamp);
    expect(assessmentData.acceptVotes).to.equal(0);
    expect(assessmentData.denyVotes).to.equal(0);

    // Advance time past the cooldown period to see DRAW status
    const { cooldownPeriod } = assessmentData;
    await time.increase(Number(BigInt(closeVotingTimestamp) + BigInt(cooldownPeriod) + 1n));

    // verify outcome is DRAW (0 accept == 0 deny votes)
    const { outcome } = await contracts.claims.getClaimDetails(CLAIM_ID);
    expect(outcome).to.equal(AssessmentOutcome.Draw);

    // Verify event was emitted
    await expect(closeVotingTx).to.emit(assessment, 'VotingEndChanged').withArgs(CLAIM_ID, closeVotingTimestamp);
  });

  it('should update votingEnd to current timestamp', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { IPFS_HASH, CLAIM_ID } = constants;
    const { assessors } = accounts;

    // All assessors vote
    await allAssessorsVote(assessment, registry, assessors, CLAIM_ID, IPFS_HASH, true);

    // Get original voting end time
    const originalAssessment = await assessment.getAssessment(CLAIM_ID);
    const originalVotingEnd = originalAssessment.votingEnd;

    // Close voting early
    const [assessor] = assessors;
    const tx = await assessment.connect(assessor).closeVotingEarly(CLAIM_ID);

    // Get the exact block timestamp when the transaction was mined
    const { blockNumber } = await tx.wait();
    const block = await ethers.provider.getBlock(blockNumber);
    const expectedTimestamp = block?.timestamp;

    // Verify voting end time has been adjusted
    const updatedAssessment = await assessment.getAssessment(CLAIM_ID);
    expect(updatedAssessment.votingEnd).to.be.lt(originalVotingEnd);
    expect(updatedAssessment.votingEnd).to.equal(expectedTimestamp);
  });

  it('should emit VotingEndChanged event', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { IPFS_HASH, CLAIM_ID } = constants;
    const { assessors } = accounts;

    // All assessors vote
    await allAssessorsVote(assessment, registry, assessors, CLAIM_ID, IPFS_HASH, false);

    // Close voting early and check for event
    const [assessor] = assessors;
    const tx = assessment.connect(assessor).closeVotingEarly(CLAIM_ID);

    // Get the transaction receipt to find the exact timestamp
    const receipt = await (await tx).wait();
    const block = await ethers.provider.getBlock(receipt.blockNumber);
    const expectedTimestamp = block?.timestamp;

    await expect(tx).to.emit(assessment, 'VotingEndChanged').withArgs(CLAIM_ID, expectedTimestamp);
  });

  it('should allow anyone to call closeVotingEarly', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { IPFS_HASH, CLAIM_ID } = constants;
    const { assessors, nonMembers } = accounts;

    // All assessors vote
    await allAssessorsVote(assessment, registry, assessors, CLAIM_ID, IPFS_HASH, true);

    // Get original voting end time
    const originalAssessment = await assessment.getAssessment(CLAIM_ID);
    const originalVotingEnd = originalAssessment.votingEnd;

    // Non-member calls closeVotingEarly - should succeed
    const [nonMember] = nonMembers;
    const tx = await assessment.connect(nonMember).closeVotingEarly(CLAIM_ID);

    // Get the exact block timestamp when the transaction was mined
    const { blockNumber } = await tx.wait();
    const block = await ethers.provider.getBlock(blockNumber);
    const expectedTimestamp = block?.timestamp;

    // Verify voting end time has been adjusted
    const updatedAssessment = await assessment.getAssessment(CLAIM_ID);
    expect(updatedAssessment.votingEnd).to.be.lt(originalVotingEnd);
    expect(updatedAssessment.votingEnd).to.equal(expectedTimestamp);
  });

  it('should prevent double closing', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { IPFS_HASH, CLAIM_ID } = constants;
    const { assessors } = accounts;

    // All assessors vote
    await allAssessorsVote(assessment, registry, assessors, CLAIM_ID, IPFS_HASH, false);

    // Close voting early first time - should succeed
    const [assessor] = assessors;
    await assessment.connect(assessor).closeVotingEarly(CLAIM_ID);

    // Try to close again - should fail
    const secondClose = assessment.connect(assessor).closeVotingEarly(CLAIM_ID);
    await expect(secondClose).to.be.revertedWithCustomError(assessment, 'VotingAlreadyClosed');
  });
});

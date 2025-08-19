const { ethers } = require('hardhat');
const { expect } = require('chai');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

describe('extendVotingPeriod', function () {
  it('should revert when called by non-governor contract', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID } = constants;
    const [assessor] = accounts.assessors;

    const extendVotingPeriod = assessment.connect(assessor).extendVotingPeriod(CLAIM_ID);
    await expect(extendVotingPeriod).to.be.revertedWithCustomError(assessment, 'Unauthorized');
  });

  it('should revert for invalid claim ID', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;
    const invalidClaimId = 999;

    const extendVotingPeriod = assessment.connect(governanceAccount).extendVotingPeriod(invalidClaimId);
    await expect(extendVotingPeriod).to.be.revertedWithCustomError(assessment, 'InvalidClaimId');
  });

  it('should revert when cooldown period has already passed', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID, MIN_VOTING_PERIOD, PRODUCT_TYPE_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    // Get the cooldown period for this product type
    const cooldownPeriod = await assessment.payoutCooldown(PRODUCT_TYPE_ID);

    // Move time forward to beyond the cooldown period (voting period + cooldown period + 1)
    const block = await ethers.provider.getBlock('latest');
    if (!block) {
      throw new Error('Block not found');
    }
    const timeAfterCooldown = BigInt(block.timestamp) + MIN_VOTING_PERIOD + cooldownPeriod + 1n;
    await time.increaseTo(timeAfterCooldown);

    const extendVotingPeriod = assessment.connect(governanceAccount).extendVotingPeriod(CLAIM_ID);
    await expect(extendVotingPeriod)
      .to.be.revertedWithCustomError(assessment, 'AssessmentCooldownPassed')
      .withArgs(CLAIM_ID);
  });

  it('should successfully reset voting period during voting phase', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID, MIN_VOTING_PERIOD } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    // Get the current assessment
    const assessmentBefore = await assessment.getAssessment(CLAIM_ID);
    expect(assessmentBefore.votingEnd).to.be.greaterThan(0);

    // Extend the voting period
    const extendTx = await assessment.connect(governanceAccount).extendVotingPeriod(CLAIM_ID);
    const extendBlock = await ethers.provider.getBlock(extendTx.blockNumber);
    if (!extendBlock) {
      throw new Error('Block not found');
    }
    const expectedNewEnd = BigInt(extendBlock.timestamp) + MIN_VOTING_PERIOD;

    // Verify the new voting end time
    const assessmentAfter = await assessment.getAssessment(CLAIM_ID);
    expect(assessmentAfter.votingEnd).to.equal(expectedNewEnd);
  });

  it('should successfully reset voting period during cooldown phase', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID, MIN_VOTING_PERIOD } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    // Move time forward to cooldown period but not beyond
    const block = await ethers.provider.getBlock('latest');
    if (!block) {
      throw new Error('Block not found');
    }
    const timeInCooldown = BigInt(block.timestamp) + MIN_VOTING_PERIOD - 1n;
    await time.increaseTo(timeInCooldown);

    // Extend the voting period
    const extendTx = await assessment.connect(governanceAccount).extendVotingPeriod(CLAIM_ID);
    const extendBlock = await ethers.provider.getBlock(extendTx.blockNumber);
    if (!extendBlock) {
      throw new Error('Block not found');
    }
    const expectedNewEnd = BigInt(extendBlock.timestamp) + MIN_VOTING_PERIOD;

    // Verify the new voting end time
    const assessmentAfter = await assessment.getAssessment(CLAIM_ID);
    expect(assessmentAfter.votingEnd).to.equal(expectedNewEnd);
  });

  it('should emit VotingEndChanged event', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID, MIN_VOTING_PERIOD } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    // Extend the voting period
    const extendTx = await assessment.connect(governanceAccount).extendVotingPeriod(CLAIM_ID);
    const extendBlock = await ethers.provider.getBlock(extendTx.blockNumber);
    if (!extendBlock) {
      throw new Error('Block not found');
    }
    const expectedNewEnd = BigInt(extendBlock.timestamp) + MIN_VOTING_PERIOD;

    await expect(extendTx).to.emit(assessment, 'VotingEndChanged').withArgs(CLAIM_ID, expectedNewEnd);
  });

  it('should handle time advance correctly', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID, MIN_VOTING_PERIOD } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    // Move time forward significantly
    const block = await ethers.provider.getBlock('latest');
    if (!block) {
      throw new Error('Block not found');
    }
    const advancedTime = BigInt(block.timestamp) + MIN_VOTING_PERIOD / 2n;
    await time.increaseTo(advancedTime);

    // Extend the voting period
    const extendTx = await assessment.connect(governanceAccount).extendVotingPeriod(CLAIM_ID);
    const extendBlock = await ethers.provider.getBlock(extendTx.blockNumber);
    if (!extendBlock) {
      throw new Error('Block not found');
    }
    const expectedNewEnd = BigInt(extendBlock.timestamp) + MIN_VOTING_PERIOD;

    // Verify the new voting end time
    const assessmentAfter = await assessment.getAssessment(CLAIM_ID);
    expect(assessmentAfter.votingEnd).to.equal(expectedNewEnd);
  });

  it('should allow voting after reset even if original period had ended', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { CLAIM_ID, MIN_VOTING_PERIOD } = constants;
    const [governanceAccount] = accounts.governanceContracts;
    const [assessor1] = accounts.assessors;

    // Move time forward to after original voting period
    const block = await ethers.provider.getBlock('latest');
    if (!block) {
      throw new Error('Block not found');
    }
    const timeAfterOriginalPeriod = BigInt(block.timestamp) + MIN_VOTING_PERIOD + 1n;
    await time.increaseTo(timeAfterOriginalPeriod);

    // Try to cast a vote - this should fail since period ended
    const ipfsHash = ethers.solidityPackedKeccak256(['string'], ['vote-metadata']);
    const castVoteBeforeReset = assessment.connect(assessor1).castVote(CLAIM_ID, true, ipfsHash);
    await expect(castVoteBeforeReset).to.be.revertedWithCustomError(assessment, 'VotingPeriodEnded');

    // Reset the voting period
    await assessment.connect(governanceAccount).extendVotingPeriod(CLAIM_ID);

    // Cast vote should should now succeed
    await assessment.connect(assessor1).castVote(CLAIM_ID, true, ipfsHash);

    // Verify the vote was recorded
    const assessorAddress = await assessor1.getAddress();
    const assessorMemberId = await registry.getMemberId(assessorAddress);
    const ballot = await assessment.ballotOf(CLAIM_ID, assessorMemberId);
    expect(ballot.support).to.equal(true);
  });

  it('should handle multiple resets correctly', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID, MIN_VOTING_PERIOD } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    // First reset voting period
    const firstResetTx = await assessment.connect(governanceAccount).extendVotingPeriod(CLAIM_ID);
    const firstResetBlock = await ethers.provider.getBlock(firstResetTx.blockNumber);
    if (!firstResetBlock) {
      throw new Error('Block not found');
    }
    const firstExpectedVotingEnd = BigInt(firstResetBlock.timestamp) + MIN_VOTING_PERIOD;

    let currentAssessment = await assessment.getAssessment(CLAIM_ID);
    expect(currentAssessment.votingEnd).to.equal(firstExpectedVotingEnd);

    // Move time forward slightly
    const advancedTime = BigInt(firstResetBlock.timestamp) + MIN_VOTING_PERIOD / 2n;
    await time.increaseTo(advancedTime);

    // Second reset
    const secondResetTx = await assessment.connect(governanceAccount).extendVotingPeriod(CLAIM_ID);
    const secondResetBlock = await ethers.provider.getBlock(secondResetTx.blockNumber);
    if (!secondResetBlock) {
      throw new Error('Block not found');
    }
    const secondExpectedVotingEnd = BigInt(secondResetBlock.timestamp) + MIN_VOTING_PERIOD;

    currentAssessment = await assessment.getAssessment(CLAIM_ID);
    expect(currentAssessment.votingEnd).to.equal(secondExpectedVotingEnd);

    // Second reset should extend the voting period further
    expect(secondExpectedVotingEnd).to.be.gt(firstExpectedVotingEnd);
  });
});

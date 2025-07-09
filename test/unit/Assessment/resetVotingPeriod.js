const { ethers } = require('hardhat');
const { expect } = require('chai');
const { setTime } = require('./helpers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

const { solidityKeccak256 } = ethers.utils;

describe('resetVotingPeriod', function () {
  it('should revert when called by non-governor contract', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID } = constants;
    const [assessor] = accounts.assessors;

    const resetVotingPeriod = assessment.connect(assessor).resetVotingPeriod(CLAIM_ID);
    await expect(resetVotingPeriod).to.be.revertedWithCustomError(assessment, 'Unauthorized');
  });

  it('should revert for invalid claim ID', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;
    const invalidClaimId = 999;

    const resetVotingPeriod = assessment.connect(governanceAccount).resetVotingPeriod(invalidClaimId);
    await expect(resetVotingPeriod).to.be.revertedWithCustomError(assessment, 'InvalidClaimId');
  });

  it('should revert when cooldown period has already passed', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID, PRODUCT_TYPE_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    // Set time after cooldown period has passed
    const { timestamp } = await ethers.provider.getBlock('latest');
    const VOTING_PERIOD = await assessment.votingPeriod();
    const COOLDOWN_PERIOD = await assessment.payoutCooldown(PRODUCT_TYPE_ID);

    await setTime(timestamp + VOTING_PERIOD.toNumber() + COOLDOWN_PERIOD.toNumber() + 1);

    const resetVotingPeriod = assessment.connect(governanceAccount).resetVotingPeriod(CLAIM_ID);
    await expect(resetVotingPeriod)
      .to.be.revertedWithCustomError(assessment, 'AssessmentCooldownPassed')
      .withArgs(CLAIM_ID);
  });

  it('should successfully reset voting period during voting phase', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    // Get original voting end time
    const originalAssessment = await assessment.getAssessment(CLAIM_ID);
    const originalVotingEnd = originalAssessment.votingEnd;

    // Set time within voting period
    const { timestamp } = await ethers.provider.getBlock('latest');
    await setTime(timestamp + 60 * 60); // 1 hour forward

    const tx = await assessment.connect(governanceAccount).resetVotingPeriod(CLAIM_ID);
    await expect(tx).to.not.be.reverted;

    // Check that voting end time has been extended
    const newAssessment = await assessment.getAssessment(CLAIM_ID);
    const newVotingEnd = newAssessment.votingEnd;

    // Calculate exact expected voting end time
    const { blockNumber } = await tx.wait();
    const block = await ethers.provider.getBlock(blockNumber);
    const VOTING_PERIOD = await assessment.votingPeriod();
    const expectedVotingEnd = block.timestamp + VOTING_PERIOD.toNumber();

    expect(newVotingEnd).to.equal(expectedVotingEnd);
    expect(newVotingEnd).to.be.gt(originalVotingEnd);
  });

  it('should successfully reset voting period during cooldown phase', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    // Set time past voting period but before cooldown period ends
    const { timestamp } = await ethers.provider.getBlock('latest');
    const VOTING_PERIOD = await assessment.votingPeriod();
    await setTime(timestamp + VOTING_PERIOD.toNumber() + 60); // Just past voting period

    const tx = await assessment.connect(governanceAccount).resetVotingPeriod(CLAIM_ID);
    await expect(tx).to.not.be.reverted;

    // Check that voting end time has been reset to exact value
    const newAssessment = await assessment.getAssessment(CLAIM_ID);
    const { blockNumber } = await tx.wait();
    const block = await ethers.provider.getBlock(blockNumber);
    const expectedVotingEnd = block.timestamp + VOTING_PERIOD.toNumber();
    expect(newAssessment.votingEnd).to.equal(expectedVotingEnd);
  });

  it('should emit AssessmentVotingEndChanged event', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    // Execute the transaction and get the receipt
    const tx = await assessment.connect(governanceAccount).resetVotingPeriod(CLAIM_ID);
    const receipt = await tx.wait();

    // Find the AssessmentVotingEndChanged event
    const event = receipt.events?.find(e => e.event === 'AssessmentVotingEndChanged');
    expect(event?.args[0]).to.equal(CLAIM_ID);

    // The new voting end time should be block timestamp + voting period
    const { blockNumber } = await tx.wait();
    const block = await ethers.provider.getBlock(blockNumber);
    const votingPeriod = await assessment.votingPeriod();
    expect(event?.args[1]).to.equal(block.timestamp + votingPeriod.toNumber());
  });

  it('should reset voting period even if votes have been already cast', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;
    const [assessor1, assessor2] = accounts.assessors;

    // Cast some votes first
    const ipfsHash = solidityKeccak256(['string'], ['test-metadata']);
    await Promise.all([
      assessment.connect(assessor1).castVote(CLAIM_ID, true, ipfsHash),
      assessment.connect(assessor2).castVote(CLAIM_ID, false, ipfsHash),
    ]);

    // Verify votes have been registered
    const assessmentAfterVoting = await assessment.getAssessment(CLAIM_ID);
    expect(assessmentAfterVoting.acceptVotes).to.equal(1);
    expect(assessmentAfterVoting.denyVotes).to.equal(1);

    // Get vote counts before reset
    const assessmentBefore = await assessment.getAssessment(CLAIM_ID);
    expect(assessmentBefore.acceptVotes).to.equal(1);
    expect(assessmentBefore.denyVotes).to.equal(1);

    // Reset voting period
    const tx = await assessment.connect(governanceAccount).resetVotingPeriod(CLAIM_ID);
    await expect(tx).to.not.be.reverted;

    // Votes should remain unchanged
    const assessmentAfter = await assessment.getAssessment(CLAIM_ID);
    expect(assessmentAfter.acceptVotes).to.equal(1);
    expect(assessmentAfter.denyVotes).to.equal(1);

    const { blockNumber } = await tx.wait();
    const block = await ethers.provider.getBlock(blockNumber);
    const votingPeriod = await assessment.votingPeriod();
    expect(assessmentAfter.votingEnd).to.equal(block.timestamp + votingPeriod.toNumber());
  });

  it('should allow voting after reset even if original period had ended', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;
    const [assessor1, assessor2] = accounts.assessors;

    // Fast forward past voting period but before cooldown ends
    const { timestamp } = await ethers.provider.getBlock('latest');
    const VOTING_PERIOD = await assessment.votingPeriod();
    await setTime(timestamp + VOTING_PERIOD.toNumber() + 60);

    // Try to cast a vote - this should fail since period ended
    const ipfsHash = solidityKeccak256(['string'], ['test-metadata']);
    const castVoteBeforeReset = assessment.connect(assessor1).castVote(CLAIM_ID, true, ipfsHash);
    await expect(castVoteBeforeReset).to.be.revertedWithCustomError(assessment, 'VotingPeriodEnded');

    // Reset voting period
    await assessment.connect(governanceAccount).resetVotingPeriod(CLAIM_ID);

    // Now voting should work again
    await Promise.all([
      assessment.connect(assessor1).castVote(CLAIM_ID, false, ipfsHash),
      assessment.connect(assessor2).castVote(CLAIM_ID, true, ipfsHash),
    ]);
  });

  it('should handle multiple resets correctly', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    // First reset voting period
    const firstTx = await assessment.connect(governanceAccount).resetVotingPeriod(CLAIM_ID);
    const firstResetAssessment = await assessment.getAssessment(CLAIM_ID);

    // Calculate expected first reset value
    const { blockNumber: firstBlockNumber } = await firstTx.wait();
    const firstBlock = await ethers.provider.getBlock(firstBlockNumber);
    const votingPeriod = await assessment.votingPeriod();
    const expectedFirstVotingEnd = firstBlock.timestamp + votingPeriod.toNumber();
    expect(firstResetAssessment.votingEnd).to.equal(expectedFirstVotingEnd);

    // Move time forward slightly
    const { timestamp } = await ethers.provider.getBlock('latest');
    await setTime(timestamp + 3600); // 1 hour

    // Second reset
    const secondTx = await assessment.connect(governanceAccount).resetVotingPeriod(CLAIM_ID);
    const secondResetAssessment = await assessment.getAssessment(CLAIM_ID);

    // Calculate expected second reset value
    const { blockNumber: secondBlockNumber } = await secondTx.wait();
    const secondBlock = await ethers.provider.getBlock(secondBlockNumber);
    const expectedSecondVotingEnd = secondBlock.timestamp + votingPeriod.toNumber();
    expect(secondResetAssessment.votingEnd).to.equal(expectedSecondVotingEnd);

    // Second reset should extend the voting period further (exact comparison)
    expect(expectedSecondVotingEnd).to.be.gt(expectedFirstVotingEnd);
  });
});

const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');
const { setTime } = require('./helpers');

const AssessmentStatus = {
  VOTING: 0,
  COOLDOWN: 1,
  ACCEPTED: 2,
  DENIED: 3,
  DRAW: 4,
};

describe('getAssessmentResult', function () {
  it('should revert if claim ID is invalid (no assessment exists)', async function () {
    const { contracts } = await loadFixture(setup);
    const { assessment } = contracts;

    // Try to get result for non-existent claim
    const invalidClaimId = 999;
    const getAssessmentResult = assessment.getAssessmentResult(invalidClaimId);

    await expect(getAssessmentResult).to.be.revertedWithCustomError(assessment, 'InvalidClaimId');
  });

  it('should return VOTING status when current time is before voting end', async function () {
    const { contracts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID } = constants;

    const [cooldownEnd, status] = await assessment.getAssessmentResult(CLAIM_ID);
    const assessmentData = await assessment.getAssessment(CLAIM_ID);
    const expectedCooldownEnd = assessmentData.votingEnd + assessmentData.cooldownPeriod;

    expect(cooldownEnd).to.equal(expectedCooldownEnd);
    expect(status).to.equal(AssessmentStatus.VOTING);
  });

  it('should return COOLDOWN status when voting ended but cooldown has not passed', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID, IPFS_HASH } = constants;
    const [assessor1, assessor2, assessor3] = accounts.assessors;

    // Cast some votes to end the voting period
    await Promise.all([
      assessment.connect(assessor1).castVote(CLAIM_ID, true, IPFS_HASH),
      assessment.connect(assessor2).castVote(CLAIM_ID, true, IPFS_HASH),
      assessment.connect(assessor3).castVote(CLAIM_ID, false, IPFS_HASH),
    ]);

    const assessmentData = await assessment.getAssessment(CLAIM_ID);
    const expectedCooldownEndTime = assessmentData.votingEnd + assessmentData.cooldownPeriod;

    // Set time to just after voting ends but before cooldown passes
    await setTime(assessmentData.votingEnd + 1);

    const [cooldownEnd, status] = await assessment.getAssessmentResult(CLAIM_ID);

    expect(cooldownEnd).to.equal(expectedCooldownEndTime);
    expect(status).to.equal(AssessmentStatus.COOLDOWN);
  });

  it('should return ACCEPTED status when accept votes > deny votes and cooldown passed', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID, IPFS_HASH } = constants;
    const [assessor1, assessor2, assessor3] = accounts.assessors;

    // Cast more accept votes than deny votes
    await Promise.all([
      assessment.connect(assessor1).castVote(CLAIM_ID, true, IPFS_HASH),
      assessment.connect(assessor2).castVote(CLAIM_ID, true, IPFS_HASH),
      assessment.connect(assessor3).castVote(CLAIM_ID, false, IPFS_HASH),
    ]);

    const assessmentData = await assessment.getAssessment(CLAIM_ID);
    const cooldownEndTime = assessmentData.votingEnd + assessmentData.cooldownPeriod;

    // Set time past cooldown period
    await setTime(cooldownEndTime + 1);

    const [cooldownEnd, status] = await assessment.getAssessmentResult(CLAIM_ID);
    expect(cooldownEnd).to.equal(cooldownEndTime);
    expect(status).to.equal(AssessmentStatus.ACCEPTED);
  });

  it('should return DENIED status when deny votes > accept votes and cooldown passed', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID, IPFS_HASH } = constants;
    const [assessor1, assessor2, assessor3] = accounts.assessors;

    // Cast more deny votes than accept votes
    await Promise.all([
      assessment.connect(assessor1).castVote(CLAIM_ID, false, IPFS_HASH),
      assessment.connect(assessor2).castVote(CLAIM_ID, false, IPFS_HASH),
      assessment.connect(assessor3).castVote(CLAIM_ID, true, IPFS_HASH),
    ]);

    const assessmentData = await assessment.getAssessment(CLAIM_ID);
    const cooldownEndTime = assessmentData.votingEnd + assessmentData.cooldownPeriod;

    // Set time past cooldown period
    await setTime(cooldownEndTime + 1);

    const [cooldownEnd, status] = await assessment.getAssessmentResult(CLAIM_ID);
    expect(cooldownEnd).to.equal(cooldownEndTime);
    expect(status).to.equal(AssessmentStatus.DENIED);
  });

  it('should return DRAW status when accept votes = deny votes and cooldown passed', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID, IPFS_HASH } = constants;
    const [assessor1, assessor2] = accounts.assessors;

    // Cast equal accept and deny votes
    await assessment.connect(assessor1).castVote(CLAIM_ID, true, IPFS_HASH);
    await assessment.connect(assessor2).castVote(CLAIM_ID, false, IPFS_HASH);

    const assessmentData = await assessment.getAssessment(CLAIM_ID);
    const cooldownEndTime = assessmentData.votingEnd + assessmentData.cooldownPeriod;

    // Set time past cooldown period
    await setTime(cooldownEndTime + 1);

    const [cooldownEnd, status] = await assessment.getAssessmentResult(CLAIM_ID);

    expect(cooldownEnd).to.equal(cooldownEndTime);
    expect(status).to.equal(AssessmentStatus.DRAW);
  });

  it('should return DRAW status when no votes cast and cooldown passed', async function () {
    const { contracts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID } = constants;

    // No votes cast (both accept and deny votes = 0)

    const assessmentData = await assessment.getAssessment(CLAIM_ID);
    const cooldownEndTime = assessmentData.votingEnd + assessmentData.cooldownPeriod;

    // Set time past cooldown period
    await setTime(cooldownEndTime + 1);

    const [cooldownEnd, status] = await assessment.getAssessmentResult(CLAIM_ID);

    expect(cooldownEnd).to.equal(cooldownEndTime);
    expect(status).to.equal(AssessmentStatus.DRAW);
  });

  it('should calculate cooldownEnd correctly with different cooldown periods', async function () {
    const { contracts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID, PRODUCT_TYPE_ID } = constants;

    // Get the assessment data for the existing claim
    const assessmentData = await assessment.getAssessment(CLAIM_ID);
    const [cooldownEnd, status] = await assessment.getAssessmentResult(CLAIM_ID);

    // Verify that cooldownEnd is calculated as votingEnd + cooldownPeriod
    const expectedCooldownEnd = assessmentData.votingEnd.add ?
      assessmentData.votingEnd.add(assessmentData.cooldownPeriod) :
      ethers.BigNumber.from(assessmentData.votingEnd).add(assessmentData.cooldownPeriod);
    expect(cooldownEnd).to.equal(expectedCooldownEnd);

    // Verify the cooldown period matches the expected value from payoutCooldown
    const expectedCooldownPeriod = await assessment.payoutCooldown(PRODUCT_TYPE_ID);
    expect(assessmentData.cooldownPeriod).to.equal(expectedCooldownPeriod);
  });

  it('should handle assessment status transitions correctly over time', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID, IPFS_HASH } = constants;
    const [assessor1] = accounts.assessors;

    const assessmentData = await assessment.getAssessment(CLAIM_ID);
    const expectedCooldownEnd = assessmentData.votingEnd + assessmentData.cooldownPeriod;

    // Initially should be VOTING
    let [cooldownEnd, status] = await assessment.getAssessmentResult(CLAIM_ID);
    expect(cooldownEnd).to.equal(expectedCooldownEnd);
    expect(status).to.equal(AssessmentStatus.VOTING);

    // Cast a vote to create a non-draw scenario
    await assessment.connect(assessor1).castVote(CLAIM_ID, true, IPFS_HASH);

    // Set time to just after voting ends but before cooldown passes - should be COOLDOWN
    await setTime(assessmentData.votingEnd + 1);
    [cooldownEnd, status] = await assessment.getAssessmentResult(CLAIM_ID);
    expect(cooldownEnd).to.equal(expectedCooldownEnd);
    expect(status).to.equal(AssessmentStatus.COOLDOWN);

    // Set time past cooldown - should be ACCEPTED
    const cooldownEndTime = assessmentData.votingEnd + assessmentData.cooldownPeriod;
    await setTime(cooldownEndTime + 1);
    [cooldownEnd, status] = await assessment.getAssessmentResult(CLAIM_ID);
    expect(cooldownEnd).to.equal(expectedCooldownEnd);
    expect(status).to.equal(AssessmentStatus.ACCEPTED);
  });
});

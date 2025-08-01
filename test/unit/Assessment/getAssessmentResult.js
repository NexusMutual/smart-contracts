const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');
const { setTime } = require('./helpers');

const ONE_DAY = 24 * 60 * 60;

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

    const [status, payoutRedemptionEnd, cooldownEnd] = await assessment.getAssessmentResult(CLAIM_ID);
    const assessmentData = await assessment.getAssessment(CLAIM_ID);
    const expectedCooldownEnd = BigInt(assessmentData.votingEnd) + BigInt(assessmentData.cooldownPeriod);
    const expectedPayoutRedemptionEnd = expectedCooldownEnd + BigInt(assessmentData.payoutRedemptionPeriod);

    expect(cooldownEnd).to.equal(expectedCooldownEnd);
    expect(payoutRedemptionEnd).to.equal(expectedPayoutRedemptionEnd);
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

    const { votingEnd, cooldownPeriod, payoutRedemptionPeriod } = await assessment.getAssessment(CLAIM_ID);
    const expectedCooldownEnd = BigInt(votingEnd) + BigInt(cooldownPeriod);
    const expectedPayoutRedemptionEnd = expectedCooldownEnd + BigInt(payoutRedemptionPeriod);

    // Set time to just after voting ends but before cooldown passes
    await setTime(votingEnd + 1n);

    const [status, payoutRedemptionEnd, cooldownEnd] = await assessment.getAssessmentResult(CLAIM_ID);

    expect(cooldownEnd).to.equal(expectedCooldownEnd);
    expect(payoutRedemptionEnd).to.equal(expectedPayoutRedemptionEnd);
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

    const { votingEnd, cooldownPeriod, payoutRedemptionPeriod } = await assessment.getAssessment(CLAIM_ID);
    const expectedCooldownEnd = BigInt(votingEnd) + BigInt(cooldownPeriod);
    const expectedPayoutRedemptionEnd = expectedCooldownEnd + BigInt(payoutRedemptionPeriod);

    // Set time past cooldown period
    await setTime(expectedCooldownEnd + 1n);

    const [status, payoutRedemptionEnd, cooldownEnd] = await assessment.getAssessmentResult(CLAIM_ID);
    expect(cooldownEnd).to.equal(expectedCooldownEnd);
    expect(payoutRedemptionEnd).to.equal(expectedPayoutRedemptionEnd);
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

    const { votingEnd, cooldownPeriod, payoutRedemptionPeriod } = await assessment.getAssessment(CLAIM_ID);
    const cooldownEndTime = BigInt(votingEnd) + BigInt(cooldownPeriod);
    const expectedPayoutRedemptionEnd = cooldownEndTime + BigInt(payoutRedemptionPeriod);

    // Set time past cooldown period
    await setTime(cooldownEndTime + 1n);

    const [status, payoutRedemptionEnd, cooldownEnd] = await assessment.getAssessmentResult(CLAIM_ID);
    expect(cooldownEnd).to.equal(cooldownEndTime);
    expect(payoutRedemptionEnd).to.equal(expectedPayoutRedemptionEnd);
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

    const { votingEnd, cooldownPeriod, payoutRedemptionPeriod } = await assessment.getAssessment(CLAIM_ID);
    const expectedCooldownEnd = BigInt(votingEnd) + BigInt(cooldownPeriod);
    const expectedPayoutRedemptionEnd = expectedCooldownEnd + BigInt(payoutRedemptionPeriod);

    // Set time past cooldown period
    await setTime(expectedCooldownEnd + 1n);

    const [status, payoutRedemptionEnd, cooldownEnd] = await assessment.getAssessmentResult(CLAIM_ID);

    expect(cooldownEnd).to.equal(expectedCooldownEnd);
    expect(payoutRedemptionEnd).to.equal(expectedPayoutRedemptionEnd);
    expect(status).to.equal(AssessmentStatus.DRAW);
  });

  it('should return DRAW status when no votes cast and cooldown passed', async function () {
    const { contracts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID } = constants;

    // No votes cast (both accept and deny votes = 0)

    const { votingEnd, cooldownPeriod, payoutRedemptionPeriod } = await assessment.getAssessment(CLAIM_ID);
    const expectedCooldownEnd = BigInt(votingEnd) + BigInt(cooldownPeriod);
    const expectedPayoutRedemptionEnd = expectedCooldownEnd + BigInt(payoutRedemptionPeriod);

    // Set time past cooldown period
    await setTime(expectedCooldownEnd + 1n);

    const [status, payoutRedemptionEnd, cooldownEnd] = await assessment.getAssessmentResult(CLAIM_ID);

    expect(cooldownEnd).to.equal(expectedCooldownEnd);
    expect(payoutRedemptionEnd).to.equal(expectedPayoutRedemptionEnd);
    expect(status).to.equal(AssessmentStatus.DRAW);
  });

  it('should return different cooldown and payout redemption periods for different product types', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, claims } = contracts;
    const { IPFS_HASH } = constants;
    const [governanceAccount] = accounts.governanceContracts;
    const [coverOwner] = accounts.members;

    const ASSESSOR_GROUP_ID = await assessment.getGroupsCount();

    const productType2CooldownPeriod = 2 * ONE_DAY;
    const productType2PayoutRedemptionPeriod = 20 * ONE_DAY;

    const productType3CooldownPeriod = 3 * ONE_DAY;
    const productType3PayoutRedemptionPeriod = 30 * ONE_DAY;

    // Set assessment data for two different product types with different periods
    await assessment.connect(governanceAccount).setAssessmentDataForProductTypes(
      [2], // product type 2
      productType2CooldownPeriod,
      productType2PayoutRedemptionPeriod,
      ASSESSOR_GROUP_ID,
    );

    await assessment.connect(governanceAccount).setAssessmentDataForProductTypes(
      [3], // product type 3
      productType3CooldownPeriod,
      productType3PayoutRedemptionPeriod,
      ASSESSOR_GROUP_ID,
    );

    // Create a second claim with product type 2 (mock submitClaim sets product type to coverId)
    const COVER_ID_2 = 2;
    const CLAIM_ID_2 = 2;
    await claims.connect(coverOwner).submitClaim(COVER_ID_2, ethers.parseEther('1'), IPFS_HASH);

    const COVER_ID_3 = 3;
    const CLAIM_ID_3 = 3;
    await claims.connect(coverOwner).submitClaim(COVER_ID_3, ethers.parseEther('1'), IPFS_HASH);

    // Should have different values for claims with different product types
    const [status2, payoutRedemptionEnd2, cooldownEnd2] = await assessment.getAssessmentResult(CLAIM_ID_2);
    const [status3, payoutRedemptionEnd3, cooldownEnd3] = await assessment.getAssessmentResult(CLAIM_ID_3);

    expect(status2).to.equal(AssessmentStatus.VOTING);
    expect(status3).to.equal(AssessmentStatus.VOTING);

    // Get assessment data for calculations
    const claimAssessmentData2 = await assessment.getAssessment(CLAIM_ID_2);
    const claimAssessmentData3 = await assessment.getAssessment(CLAIM_ID_3);

    // Verify getAssessmentResult calculations are correct for each claim
    const expectedCooldownEnd2 = BigInt(claimAssessmentData2.votingEnd) + BigInt(productType2CooldownPeriod);
    const expectedPayoutRedemptionEnd2 = expectedCooldownEnd2 + BigInt(productType2PayoutRedemptionPeriod);

    const expectedCooldownEnd3 = BigInt(claimAssessmentData3.votingEnd) + BigInt(productType3CooldownPeriod);
    const expectedPayoutRedemptionEnd3 = expectedCooldownEnd3 + BigInt(productType3PayoutRedemptionPeriod);

    expect(cooldownEnd2).to.equal(expectedCooldownEnd2);
    expect(payoutRedemptionEnd2).to.equal(expectedPayoutRedemptionEnd2);

    expect(cooldownEnd3).to.equal(expectedCooldownEnd3);
    expect(payoutRedemptionEnd3).to.equal(expectedPayoutRedemptionEnd3);

    expect(cooldownEnd2).to.not.equal(cooldownEnd3);
    expect(payoutRedemptionEnd2).to.not.equal(payoutRedemptionEnd3);
  });
});

const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

describe('getAssessment', function () {
  it('should return correct assessment data for existing claim', async function () {
    const { contracts, constants } = await loadFixture(setup);
    const { assessment, claims } = contracts;
    const { ASSESSOR_GROUP_ID, CLAIM_ID } = constants;

    const assessmentData = await assessment.getAssessment(CLAIM_ID);
    const cooldownPeriod = await claims.cooldownPeriod();
    const expectedVotingPeriod = await assessment.minVotingPeriod();

    expect(assessmentData.assessingGroupId).to.equal(ASSESSOR_GROUP_ID);
    expect(assessmentData.cooldownPeriod).to.equal(cooldownPeriod);

    const currentBlock = await ethers.provider.getBlock('latest');
    if (!currentBlock) {
      throw new Error('Block not found');
    }
    expect(assessmentData.start).to.equal(BigInt(currentBlock.timestamp));

    // VotingEnd should be start + votingPeriod
    const expectedVotingEnd = assessmentData.start + expectedVotingPeriod;
    expect(assessmentData.votingEnd).to.equal(expectedVotingEnd);

    expect(assessmentData.acceptVotes).to.equal(0);
    expect(assessmentData.denyVotes).to.equal(0);
  });

  it('should return zero values for non-existent claim', async function () {
    const { contracts } = await loadFixture(setup);
    const { assessment } = contracts;
    const INVALID_CLAIM_ID = 999;

    const assessmentData = await assessment.getAssessment(INVALID_CLAIM_ID);

    expect(assessmentData.assessingGroupId).to.equal(0);
    expect(assessmentData.cooldownPeriod).to.equal(0);
    expect(assessmentData.start).to.equal(0);
    expect(assessmentData.votingEnd).to.equal(0);
    expect(assessmentData.acceptVotes).to.equal(0);
    expect(assessmentData.denyVotes).to.equal(0);
  });

  it('should reflect vote counts after votes are cast', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { IPFS_HASH } = constants;
    const CLAIM_ID = 1;
    const [assessor1, assessor2] = accounts.assessors;

    const assessmentDataBeforeVotes = await assessment.getAssessment(CLAIM_ID);
    expect(assessmentDataBeforeVotes.acceptVotes).to.equal(0);
    expect(assessmentDataBeforeVotes.denyVotes).to.equal(0);

    // Cast votes
    await Promise.all([
      assessment.connect(assessor1).castVote(CLAIM_ID, true, IPFS_HASH),
      assessment.connect(assessor2).castVote(CLAIM_ID, false, IPFS_HASH),
    ]);

    const assessmentData = await assessment.getAssessment(CLAIM_ID);

    expect(assessmentData.acceptVotes).to.equal(1);
    expect(assessmentData.denyVotes).to.equal(1);
  });
});

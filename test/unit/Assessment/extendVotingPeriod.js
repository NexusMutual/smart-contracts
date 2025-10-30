const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

const { PAUSE_ASSESSMENTS, PAUSE_CLAIMS } = nexus.constants.PauseTypes;

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

  const assessmentPeriods = [
    {
      name: 'during voting phase',
      timeOffset: MIN_VOTING_PERIOD => MIN_VOTING_PERIOD / 2n,
    },
    {
      name: 'during cooldown phase',
      timeOffset: (MIN_VOTING_PERIOD, cooldownPeriod) => MIN_VOTING_PERIOD + cooldownPeriod / 2n,
    },
    {
      name: 'after cooldown phase',
      timeOffset: (MIN_VOTING_PERIOD, cooldownPeriod) => MIN_VOTING_PERIOD + cooldownPeriod + 1n,
    },
  ];

  assessmentPeriods.forEach(period => {
    it(`should successfully extend voting period ${period.name}`, async function () {
      const { contracts, accounts, constants } = await loadFixture(setup);
      const { assessment, registry } = contracts;
      const { CLAIM_ID, MIN_VOTING_PERIOD, IPFS_HASH } = constants;
      const [governanceAccount] = accounts.governanceContracts;
      const [assessor1] = accounts.assessors;

      const { cooldownPeriod } = await assessment.getAssessment(CLAIM_ID);

      // set time
      const block = await ethers.provider.getBlock('latest');
      const targetTime = BigInt(block.timestamp) + period.timeOffset(MIN_VOTING_PERIOD, cooldownPeriod);
      await time.increaseTo(targetTime);

      // extendVotingPeriod
      const extendTx = await assessment.connect(governanceAccount).extendVotingPeriod(CLAIM_ID);
      const extendBlock = await ethers.provider.getBlock(extendTx.blockNumber);
      const expectedNewEnd = BigInt(extendBlock.timestamp) + MIN_VOTING_PERIOD;

      // verify the new voting end time and event
      const assessmentAfter = await assessment.getAssessment(CLAIM_ID);
      expect(assessmentAfter.votingEnd).to.equal(expectedNewEnd);
      await expect(extendTx).to.emit(assessment, 'VotingEndChanged').withArgs(CLAIM_ID, expectedNewEnd);

      // castVote should should now succeed
      await assessment.connect(assessor1).castVote(CLAIM_ID, true, IPFS_HASH);

      // verify the vote was recorded
      const assessorAddress = await assessor1.getAddress();
      const assessorMemberId = await registry.getMemberId(assessorAddress);
      const ballot = await assessment.ballotOf(CLAIM_ID, assessorMemberId);
      expect(ballot.support).to.equal(true);
    });
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

  it('should work while contracts are paused', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { CLAIM_ID, MIN_VOTING_PERIOD, IPFS_HASH } = constants;
    const [governanceAccount] = accounts.governanceContracts;
    const [assessor] = accounts.assessors;

    // pause both Assessment and Claims contracts
    await registry.confirmPauseConfig(PAUSE_ASSESSMENTS | PAUSE_CLAIMS);

    // extendVotingPeriod should work even when paused
    const extendTx = await assessment.connect(governanceAccount).extendVotingPeriod(CLAIM_ID);
    const extendBlock = await ethers.provider.getBlock(extendTx.blockNumber);
    const expectedNewEnd = BigInt(extendBlock.timestamp) + MIN_VOTING_PERIOD;

    await expect(extendTx).to.emit(assessment, 'VotingEndChanged').withArgs(CLAIM_ID, expectedNewEnd);

    // verify the voting period was extended
    const assessmentExtended = await assessment.getAssessment(CLAIM_ID);
    expect(assessmentExtended.votingEnd).to.equal(expectedNewEnd);

    // castVote should fail due to pause
    const castVote = assessment.connect(assessor).castVote(CLAIM_ID, true, IPFS_HASH);
    await expect(castVote).to.be.revertedWithCustomError(assessment, 'Paused');

    // unpause and cast vote
    await registry.confirmPauseConfig(0); // 0 = no pause
    await assessment.connect(assessor).castVote(CLAIM_ID, true, IPFS_HASH);

    // verify vote was recorded
    const assessorAddress = await assessor.getAddress();
    const assessorMemberId = await registry.getMemberId(assessorAddress);
    const ballot = await assessment.ballotOf(CLAIM_ID, assessorMemberId);
    expect(ballot.support).to.equal(true);

    const assessmentAfter = await assessment.getAssessment(CLAIM_ID);
    expect(assessmentAfter.acceptVotes).to.equal(1);
    expect(assessmentAfter.denyVotes).to.equal(0);
  });
});

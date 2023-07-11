const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

const { parseEther } = ethers.utils;
const { Zero } = ethers.constants;
const daysToSeconds = days => days * 24 * 60 * 60;

describe('startAssessment', function () {
  it('returns the index of the newly created assessment', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, yieldTokenIncidents } = fixture.contracts;
    const [member] = fixture.accounts.members;
    const [governance] = fixture.accounts.governanceContracts;

    const { timestamp } = await ethers.provider.getBlock('latest');

    {
      await individualClaims.connect(member).submitClaim(0, 0, parseEther('100'), '');
      const { assessmentId } = await individualClaims.claims(0);
      expect(assessmentId).to.be.equal(0);
    }

    {
      await yieldTokenIncidents
        .connect(governance)
        .submitIncident(0, parseEther('1'), timestamp, parseEther('1000'), '');
      const { assessmentId } = await yieldTokenIncidents.incidents(0);
      expect(assessmentId).to.be.equal(1);
    }

    {
      await individualClaims.connect(member).submitClaim(2, 0, parseEther('100'), '');
      const { assessmentId } = await individualClaims.claims(1);
      expect(assessmentId).to.be.equal(2);
    }

    {
      await individualClaims.connect(member).submitClaim(3, 0, parseEther('100'), '');
      const { assessmentId } = await individualClaims.claims(2);
      expect(assessmentId).to.be.equal(3);
    }

    {
      await yieldTokenIncidents
        .connect(governance)
        .submitIncident(0, parseEther('1'), timestamp, parseEther('1000'), '');
      const { assessmentId } = await yieldTokenIncidents.incidents(1);
      expect(assessmentId).to.be.equal(4);
    }
  });

  it('stores assessmentDepositInETH and totalRewardInNXM', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, yieldTokenIncidents, assessment } = fixture.contracts;
    const [member] = fixture.accounts.members;
    const [governance] = fixture.accounts.governanceContracts;
    const { timestamp } = await ethers.provider.getBlock('latest');

    {
      await individualClaims.connect(member).submitClaim(0, 0, parseEther('100'), '');
      const { assessmentDepositInETH, totalRewardInNXM } = await assessment.assessments(0);
      const { rewardRatio } = await individualClaims.config();
      expect(assessmentDepositInETH).to.be.equal(0);
      expect(totalRewardInNXM).to.be.equal(parseEther('100').mul(rewardRatio).div('10000'));
    }

    {
      const expectedPayoutInNXM = parseEther('1000');
      await yieldTokenIncidents
        .connect(governance)
        .submitIncident(0, parseEther('1'), timestamp, expectedPayoutInNXM, '');
      const { assessmentDepositInETH, totalRewardInNXM } = await assessment.assessments(1);
      const { rewardRatio } = await yieldTokenIncidents.config();
      // For now AB doesn't require a deposit to submit yieldTokenIncidents
      expect(assessmentDepositInETH).to.be.equal(Zero);
      expect(totalRewardInNXM).to.be.equal(expectedPayoutInNXM.mul(rewardRatio).div(10000));
    }
  });

  it('stores a poll that starts at the block timestamp and ends after minVotingPeriodInDays', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, yieldTokenIncidents, assessment } = fixture.contracts;
    const [member] = fixture.accounts.members;
    const [governance] = fixture.accounts.governanceContracts;

    {
      await individualClaims.connect(member).submitClaim(0, 0, parseEther('100'), '');
      const { timestamp } = await ethers.provider.getBlock('latest');
      const { poll } = await assessment.assessments(0);
      const { minVotingPeriodInDays } = await assessment.config();
      expect(poll.start).to.be.equal(timestamp);
      expect(poll.end).to.be.equal(timestamp + daysToSeconds(minVotingPeriodInDays));
      expect(poll.accepted).to.be.equal(0);
      expect(poll.denied).to.be.equal(0);
    }

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await yieldTokenIncidents.connect(governance).submitIncident(0, parseEther('1'), timestamp, Zero, '');
      const { poll } = await assessment.assessments(0);
      const { minVotingPeriodInDays } = await assessment.config();
      expect(poll.start).to.be.equal(timestamp);
      expect(poll.end).to.be.equal(timestamp + daysToSeconds(minVotingPeriodInDays));
      expect(poll.accepted).to.be.equal(0);
      expect(poll.denied).to.be.equal(0);
    }
  });

  it('reverts if caller is not an internal contract', async function () {
    const fixture = await loadFixture(setup);
    const { assessment } = fixture.contracts;
    const [member] = fixture.accounts.members;

    await expect(assessment.connect(member).startAssessment(parseEther('100'), parseEther('10'))).to.be.revertedWith(
      'Caller is not an internal contract',
    );
  });
});

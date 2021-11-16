const { ethers } = require('hardhat');
const { expect } = require('chai');
const { daysToSeconds } = require('./helpers');

const { parseEther } = ethers.utils;
const { Zero } = ethers.constants;

describe('startAssessment', function () {
  it('returns the index of the newly created assessment', async function () {
    const { claims, incidents } = this.contracts;
    const [user] = this.accounts.members;
    const [AB] = this.accounts.advisoryBoardMembers;
    const { timestamp } = await ethers.provider.getBlock('latest');

    {
      await claims.connect(user).submitClaim(0, parseEther('100'), '');
      const { assessmentId } = await claims.claims(0);
      expect(assessmentId).to.be.equal(0);
    }

    {
      await incidents.connect(AB).submitIncident(0, parseEther('1'), timestamp, parseEther('1000'));
      const { assessmentId } = await incidents.incidents(0);
      expect(assessmentId).to.be.equal(1);
    }

    {
      await claims.connect(user).submitClaim(2, parseEther('100'), '');
      const { assessmentId } = await claims.claims(1);
      expect(assessmentId).to.be.equal(2);
    }

    {
      await claims.connect(user).submitClaim(3, parseEther('100'), '');
      const { assessmentId } = await claims.claims(2);
      expect(assessmentId).to.be.equal(3);
    }

    {
      await incidents.connect(AB).submitIncident(0, parseEther('1'), timestamp, parseEther('1000'));
      const { assessmentId } = await incidents.incidents(1);
      expect(assessmentId).to.be.equal(4);
    }
  });

  it('stores assessmentDeposit and totalReward', async function () {
    const { claims, incidents, assessment } = this.contracts;
    const [user] = this.accounts.members;
    const [AB] = this.accounts.advisoryBoardMembers;
    const { timestamp } = await ethers.provider.getBlock('latest');

    {
      await claims.connect(user).submitClaim(0, parseEther('100'), '');
      const { assessmentDeposit, totalReward } = await assessment.assessments(0);
      const { rewardRatio } = await claims.config();
      expect(assessmentDeposit).to.be.equal(0);
      expect(totalReward).to.be.equal(
        parseEther('100')
          .mul(rewardRatio)
          .div('10000'),
      );
    }

    {
      const activeCoverAmountInNXM = parseEther('1000');
      await incidents.connect(AB).submitIncident(0, parseEther('1'), timestamp, activeCoverAmountInNXM);
      const { assessmentDeposit, totalReward } = await assessment.assessments(1);
      const { rewardRatio, incidentExpectedPayoutRatio } = await incidents.config();

      // For now being AB only, it doesn't require a deposit to submit incidents
      expect(assessmentDeposit).to.be.equal(Zero);
      expect(totalReward).to.be.equal(
        activeCoverAmountInNXM
          .mul(rewardRatio)
          .div(10000)
          .mul(incidentExpectedPayoutRatio)
          .div(10000),
      );
    }
  });

  it('stores assessmentDeposit and totalReward', async function () {
    const { claims, incidents, assessment } = this.contracts;
    const [user] = this.accounts.members;
    const [AB] = this.accounts.advisoryBoardMembers;
    const { timestamp } = await ethers.provider.getBlock('latest');

    {
      await claims.connect(user).submitClaim(0, parseEther('100'), '');
      const { assessmentDeposit, totalReward } = await assessment.assessments(0);
      const { rewardRatio } = await claims.config();
      expect(assessmentDeposit).to.be.equal(0);
      expect(totalReward).to.be.equal(
        parseEther('100')
          .mul(rewardRatio)
          .div('10000'),
      );
    }

    {
      const activeCoverAmountInNXM = parseEther('1000');
      await incidents.connect(AB).submitIncident(0, parseEther('1'), timestamp, activeCoverAmountInNXM);
      const { assessmentDeposit, totalReward } = await assessment.assessments(1);
      const { rewardRatio, incidentExpectedPayoutRatio } = await incidents.config();
      expect(assessmentDeposit).to.be.equal(Zero); // For now AB doesn't require a deposit to submit incidents
      expect(totalReward).to.be.equal(
        activeCoverAmountInNXM
          .mul(rewardRatio)
          .div(10000)
          .mul(incidentExpectedPayoutRatio)
          .div(10000),
      );
    }
  });

  it('stores a poll that starts at the block timestamp and ends after minVotingPeriodDays', async function () {
    const { claims, incidents, assessment } = this.contracts;
    const [user] = this.accounts.members;
    const [AB] = this.accounts.advisoryBoardMembers;

    {
      await claims.connect(user).submitClaim(0, parseEther('100'), '');
      const { timestamp } = await ethers.provider.getBlock('latest');
      const { poll } = await assessment.assessments(0);
      const { minVotingPeriodDays } = await assessment.config();
      expect(poll.start).to.be.equal(timestamp);
      expect(poll.end).to.be.equal(timestamp + daysToSeconds(minVotingPeriodDays));
      expect(poll.accepted).to.be.equal(0);
      expect(poll.denied).to.be.equal(0);
    }

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await incidents.connect(AB).submitIncident(0, parseEther('1'), timestamp, Zero);
      const { poll } = await assessment.assessments(0);
      const { minVotingPeriodDays } = await assessment.config();
      expect(poll.start).to.be.equal(timestamp);
      expect(poll.end).to.be.equal(timestamp + daysToSeconds(minVotingPeriodDays));
      expect(poll.accepted).to.be.equal(0);
      expect(poll.denied).to.be.equal(0);
    }
  });
});

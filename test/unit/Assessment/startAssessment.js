const { ethers } = require('hardhat');
const { expect } = require('chai');
const { setTime, daysToSeconds } = require('./helpers');

const { parseEther } = ethers.utils;

describe('startAssessment', function () {
  it('returns the index of the newly created assessment', async function () {
    const { claims, incidents } = this.contracts;
    const [user] = this.accounts.members;
    const [AB] = this.accounts.advisoryBoardMembers;
    const { timestamp } = await ethers.provider.getBlock('latest');

    {
      await claims.connect(user).submitClaim(0, parseEther('100'), false, '');
      const { assessmentId } = await claims.claims(0);
      expect(assessmentId).to.be.equal(0);
    }

    {
      await incidents.connect(AB).submitIncident(0, parseEther('1'), timestamp, parseEther('1000'));
      const { assessmentId } = await incidents.incidents(0);
      expect(assessmentId).to.be.equal(1);
    }

    {
      await claims.connect(user).submitClaim(2, parseEther('100'), false, '');
      const { assessmentId } = await claims.claims(1);
      expect(assessmentId).to.be.equal(2);
    }

    {
      await claims.connect(user).submitClaim(3, parseEther('100'), false, '');
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
    assert(false, '[todo]');
  });
});

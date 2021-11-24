const { ethers } = require('hardhat');
const { time } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const { parseEther } = ethers.utils;

describe('submitIncident', function () {
  it('reverts if the product uses a different redeem method', async function () {
    const { incidents } = this.contracts;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;

    {
      const productId = 0;
      const currentTime = await time.latest();
      await expect(
        incidents.connect(advisoryBoard).submitIncident(productId, parseEther('1.1'), currentTime.toNumber()),
      ).to.be.revertedWith('Invalid redeem method');
    }

    {
      const productId = 1;
      const currentTime = await time.latest();
      await expect(
        incidents.connect(advisoryBoard).submitIncident(productId, parseEther('1.1'), currentTime.toNumber()),
      ).to.be.revertedWith('Invalid redeem method');
    }
  });

  it('calls startAssessment and stores the returned assessmentId in the incident', async function () {
    const { incidents } = this.contracts;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;

    {
      const productId = 2;
      const currentTime = await time.latest();
      await incidents.connect(advisoryBoard).submitIncident(productId, parseEther('1.1'), currentTime.toNumber());
      const expectedAssessmentId = 0;
      const { assessmentId } = await incidents.incidents(0);
      expect(assessmentId).to.be.equal(expectedAssessmentId);
    }

    {
      const productId = 2;
      const currentTime = await time.latest();
      await incidents.connect(advisoryBoard).submitIncident(productId, parseEther('1.1'), currentTime.toNumber());
      const expectedAssessmentId = 1;
      const { assessmentId } = await incidents.incidents(1);
      expect(assessmentId).to.be.equal(expectedAssessmentId);
    }
  });

  it('pushes an incident with productId, date and priceBefore to incidents', async function () {
    const { incidents } = this.contracts;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;

    const expectedProductId = 2;
    const currentTime = await time.latest();
    const expectedPriceBefore = parseEther('1.1');
    await incidents
      .connect(advisoryBoard)
      .submitIncident(expectedProductId, expectedPriceBefore, currentTime.toNumber());
    const { productId, date, priceBefore } = await incidents.incidents(0);
    expect(productId).to.be.equal(expectedProductId);
    expect(date).to.be.equal(currentTime.toNumber());
    expect(priceBefore).to.be.equal(expectedPriceBefore);
  });

  it('calculates the totalReward using the active cover amount', async function () {
    const { assessment, incidents, cover } = this.contracts;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;

    const productId = 2;
    const currentTime = await time.latest();
    const activeCoverAmountInNXM = await cover.activeCoverAmountInNXM(productId);
    await incidents.connect(advisoryBoard).submitIncident(productId, parseEther('1.1'), currentTime.toNumber());
    const expectedTotalReward = activeCoverAmountInNXM
      .mul(this.config.incidentExpectedPayoutRatio)
      .mul(this.config.rewardRatio)
      .div(10000)
      .div(10000);
    const { totalReward } = await assessment.assessments(0);
    expect(totalReward).to.be.equal(expectedTotalReward);
  });

  it('calculates the totalReward capped at config.maxRewardInNXM', async function () {
    const { assessment, incidents, cover } = this.contracts;
    const [advisoryBoard] = this.accounts.advisoryBoardMembers;

    await cover.setActiveCoverAmountInNXM(2, parseEther('100000000'));
    const productId = 2;
    const currentTime = await time.latest();
    await incidents.connect(advisoryBoard).submitIncident(productId, parseEther('1.1'), currentTime.toNumber());
    const expectedTotalReward = parseEther(this.config.maxRewardInNXM.toString());
    const { totalReward } = await assessment.assessments(0);
    expect(totalReward).to.be.equal(expectedTotalReward);
  });
});

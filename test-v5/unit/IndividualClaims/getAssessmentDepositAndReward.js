const { ethers } = require('hardhat');
const { expect } = require('chai');

const { ASSET } = require('./helpers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

const { parseEther } = ethers.utils;
const daysToSeconds = days => days * 24 * 60 * 60;

describe('getAssessmentDepositAndReward', function () {
  it('returns a total reward in NXM no greater than maxRewardInNXM', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims } = fixture.contracts;
    const { maxRewardInNxm } = fixture.config;

    {
      const [, totalReward] = await individualClaims.getAssessmentDepositAndReward(
        parseEther('1'),
        daysToSeconds(30),
        ASSET.ETH,
      );
      expect(totalReward).to.be.lte(maxRewardInNxm);
    }
    {
      const [, totalReward] = await individualClaims.getAssessmentDepositAndReward(
        parseEther('79228162514.26433759354395033600'), // Max uint96
        daysToSeconds(365),
        ASSET.ETH,
      );
      expect(totalReward).to.be.lte(maxRewardInNxm);
    }
    {
      const [, totalReward] = await individualClaims.getAssessmentDepositAndReward(
        parseEther('1'),
        daysToSeconds(30),
        ASSET.DAI,
      );
      expect(totalReward).to.be.lte(maxRewardInNxm);
    }
    {
      const [, totalReward] = await individualClaims.getAssessmentDepositAndReward(
        parseEther('79228162514.26433759354395033600'), // Max uint96
        daysToSeconds(365),
        ASSET.DAI,
      );
      expect(totalReward).to.be.lte(maxRewardInNxm);
    }
  });

  it('returns a deposit of at least config.minAssessmentDepositRatio * 1 ETH', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims } = fixture.contracts;
    const { minAssessmentDepositRatio } = fixture.config;
    const minDeposit = parseEther('1').mul(minAssessmentDepositRatio).div('10000');

    {
      const [deposit] = await individualClaims.getAssessmentDepositAndReward(1, daysToSeconds(30), ASSET.ETH);
      expect(deposit).to.be.gte(minDeposit);
    }
    {
      const [deposit] = await individualClaims.getAssessmentDepositAndReward(1, daysToSeconds(30), ASSET.DAI);
      expect(deposit).to.be.gte(minDeposit);
    }
    {
      const [deposit] = await individualClaims.getAssessmentDepositAndReward(100, daysToSeconds(30), ASSET.ETH);
      expect(deposit).to.be.gte(minDeposit);
    }
    {
      const [deposit] = await individualClaims.getAssessmentDepositAndReward(10000, daysToSeconds(30), ASSET.ETH);
      expect(deposit).to.be.gte(minDeposit);
    }
    {
      const [deposit] = await individualClaims.getAssessmentDepositAndReward(
        parseEther('79228162514.26433759354395033600'), // Max uint96
        daysToSeconds(365),
        ASSET.ETH,
      );
      expect(deposit).to.be.gte(minDeposit);
    }
  });

  it('totalReward increases proportionately to the requestedAmount', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims } = fixture.contracts;

    {
      const [, totalReward1] = await individualClaims.getAssessmentDepositAndReward(1, daysToSeconds(30), ASSET.ETH);
      const [, totalReward2] = await individualClaims.getAssessmentDepositAndReward(
        100000,
        daysToSeconds(30),
        ASSET.ETH,
      );
      expect(totalReward2).to.be.gt(totalReward1);
      const [, totalReward3] = await individualClaims.getAssessmentDepositAndReward(
        100000000,
        daysToSeconds(30),
        ASSET.ETH,
      );
      expect(totalReward3).to.be.gt(totalReward2);
      const [, totalReward4] = await individualClaims.getAssessmentDepositAndReward(
        parseEther('1'),
        daysToSeconds(30),
        ASSET.ETH,
      );
      expect(totalReward4).to.be.gt(totalReward3);
    }
  });

  it('totalReward increases proportionately to the coverPeriod', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims } = fixture.contracts;

    {
      const [, totalReward1] = await individualClaims.getAssessmentDepositAndReward(
        parseEther('10'),
        daysToSeconds(30),
        ASSET.ETH,
      );
      const [, totalReward2] = await individualClaims.getAssessmentDepositAndReward(
        parseEther('10'),
        daysToSeconds(60),
        ASSET.ETH,
      );
      expect(totalReward2).to.be.gt(totalReward1);
      const [, totalReward3] = await individualClaims.getAssessmentDepositAndReward(
        parseEther('10'),
        daysToSeconds(90),
        ASSET.ETH,
      );
      expect(totalReward3).to.be.gt(totalReward2);
      const [, totalReward4] = await individualClaims.getAssessmentDepositAndReward(
        parseEther('10'),
        daysToSeconds(365),
        ASSET.ETH,
      );
      expect(totalReward4).to.be.gt(totalReward3);
    }
  });

  it('the NXM equivalent of the deposit should always cover the totalReward', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, pool } = fixture.contracts;
    const nxmPriceInETH = await pool.getInternalTokenPriceInAsset(ASSET.ETH);
    {
      const [deposit, totalReward1] = await individualClaims.getAssessmentDepositAndReward(
        1,
        daysToSeconds(30),
        ASSET.ETH,
      );
      expect(deposit.mul(nxmPriceInETH)).to.be.gte(totalReward1);
    }
    {
      const [deposit, totalReward1] = await individualClaims.getAssessmentDepositAndReward(
        1,
        daysToSeconds(30),
        ASSET.DAI,
      );
      expect(deposit.mul(nxmPriceInETH)).to.be.gte(totalReward1);
    }
    {
      const [deposit, totalReward1] = await individualClaims.getAssessmentDepositAndReward(
        parseEther('1'),
        daysToSeconds(30),
        ASSET.ETH,
      );
      expect(deposit.mul(nxmPriceInETH)).to.be.gte(totalReward1);
    }
    {
      const [deposit, totalReward1] = await individualClaims.getAssessmentDepositAndReward(
        parseEther('1'),
        daysToSeconds(30),
        ASSET.DAI,
      );
      expect(deposit.mul(nxmPriceInETH)).to.be.gte(totalReward1);
    }
    {
      const [deposit, totalReward1] = await individualClaims.getAssessmentDepositAndReward(
        parseEther('100000000'),
        daysToSeconds(365),
        ASSET.ETH,
      );
      expect(deposit.mul(nxmPriceInETH)).to.be.gte(totalReward1);
    }
    {
      const [deposit, totalReward1] = await individualClaims.getAssessmentDepositAndReward(
        parseEther('79228162514.26433759354395033600'), // Max uint96
        daysToSeconds(365),
        ASSET.DAI,
      );
      expect(deposit.mul(nxmPriceInETH)).to.be.gte(totalReward1);
    }
    {
      const [deposit, totalReward1] = await individualClaims.getAssessmentDepositAndReward(
        parseEther('79228162514.26433759354395033600'), // Max uint96
        daysToSeconds(365),
        ASSET.DAI,
      );
      expect(deposit.mul(nxmPriceInETH)).to.be.gte(totalReward1);
    }
  });
});

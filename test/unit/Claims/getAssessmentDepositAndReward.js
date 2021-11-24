const { ethers } = require('hardhat');
const { assert } = require('chai');

const { daysToSeconds, ASSET } = require('./helpers');

const { parseEther } = ethers.utils;

describe('getAssessmentDepositAndReward', function () {
  it('returns a total reward in NXM no greater than config.maxRewardInNXM', async function () {
    const { claims } = this.contracts;
    const { maxRewardInNXM } = await claims.config();
    const max = parseEther(maxRewardInNXM.toString());

    {
      const [, /* deposit */ totalReward] = await claims.getAssessmentDepositAndReward(
        parseEther('1'),
        daysToSeconds(30),
        ASSET.ETH,
      );
      assert(totalReward.lte(max));
    }
    {
      const [, /* deposit */ totalReward] = await claims.getAssessmentDepositAndReward(
        parseEther('79228162514.26433759354395033600'), // Max uint96
        daysToSeconds(365),
        ASSET.ETH,
      );
      assert(totalReward.lte(max));
    }
    {
      const [, /* deposit */ totalReward] = await claims.getAssessmentDepositAndReward(
        parseEther('1'),
        daysToSeconds(30),
        ASSET.DAI,
      );
      assert(totalReward.lte(max));
    }
    {
      const [, /* deposit */ totalReward] = await claims.getAssessmentDepositAndReward(
        parseEther('79228162514.26433759354395033600'), // Max uint96
        daysToSeconds(365),
        ASSET.DAI,
      );
      assert(totalReward.lte(max));
    }
  });

  it('returns a deposit of at least config.minAssessmentDepositRatio * 1 ETH', async function () {
    const { claims } = this.contracts;
    const { minAssessmentDepositRatio } = await claims.config();
    const minDeposit = parseEther('1')
      .mul(minAssessmentDepositRatio)
      .div('10000');

    {
      const [deposit] = await claims.getAssessmentDepositAndReward(1, daysToSeconds(30), ASSET.ETH);
      assert(deposit.gte(minDeposit));
    }
    {
      const [deposit] = await claims.getAssessmentDepositAndReward(1, daysToSeconds(30), ASSET.DAI);
      assert(deposit.gte(minDeposit));
    }
    {
      const [deposit] = await claims.getAssessmentDepositAndReward(100, daysToSeconds(30), ASSET.ETH);
      assert(deposit.gte(minDeposit));
    }
    {
      const [deposit] = await claims.getAssessmentDepositAndReward(10000, daysToSeconds(30), ASSET.ETH);
      assert(deposit.gte(minDeposit));
    }
    {
      const [deposit] = await claims.getAssessmentDepositAndReward(
        parseEther('79228162514.26433759354395033600'), // Max uint96
        daysToSeconds(365),
        ASSET.ETH,
      );
      assert(deposit.gte(minDeposit));
    }
  });

  it('totalReward increases proportionately to the requestedAmount', async function () {
    const { claims } = this.contracts;

    {
      const [, /* deposit */ totalReward1] = await claims.getAssessmentDepositAndReward(
        1,
        daysToSeconds(30),
        ASSET.ETH,
      );
      const [, /* deposit */ totalReward2] = await claims.getAssessmentDepositAndReward(
        100000,
        daysToSeconds(30),
        ASSET.ETH,
      );
      assert(totalReward2.gt(totalReward1));
      const [, /* deposit */ totalReward3] = await claims.getAssessmentDepositAndReward(
        100000000,
        daysToSeconds(30),
        ASSET.ETH,
      );
      assert(totalReward3.gt(totalReward2));
      const [, /* deposit */ totalReward4] = await claims.getAssessmentDepositAndReward(
        parseEther('1'),
        daysToSeconds(30),
        ASSET.ETH,
      );
      assert(totalReward4.gt(totalReward3));
    }
  });

  it('totalReward increases proportionately to the coverPeriod', async function () {
    const { claims } = this.contracts;

    {
      const [, /* deposit */ totalReward1] = await claims.getAssessmentDepositAndReward(
        parseEther('10'),
        daysToSeconds(30),
        ASSET.ETH,
      );
      const [, /* deposit */ totalReward2] = await claims.getAssessmentDepositAndReward(
        parseEther('10'),
        daysToSeconds(60),
        ASSET.ETH,
      );
      assert(totalReward2.gt(totalReward1));
      const [, /* deposit */ totalReward3] = await claims.getAssessmentDepositAndReward(
        parseEther('10'),
        daysToSeconds(90),
        ASSET.ETH,
      );
      assert(totalReward3.gt(totalReward2));
      const [, /* deposit */ totalReward4] = await claims.getAssessmentDepositAndReward(
        parseEther('10'),
        daysToSeconds(365),
        ASSET.ETH,
      );
      assert(totalReward4.gt(totalReward3));
    }
  });

  it('the NXM equivalent of the deposit should always cover the totalReward', async function () {
    const { claims, pool } = this.contracts;
    const nxmPriceInETH = await pool.getTokenPrice(ASSET.ETH);
    {
      const [deposit, totalReward1] = await claims.getAssessmentDepositAndReward(1, daysToSeconds(30), ASSET.ETH);
      assert(deposit.mul(nxmPriceInETH).gte(totalReward1));
    }
    {
      const [deposit, totalReward1] = await claims.getAssessmentDepositAndReward(1, daysToSeconds(30), ASSET.DAI);
      assert(deposit.mul(nxmPriceInETH).gte(totalReward1));
    }
    {
      const [deposit, totalReward1] = await claims.getAssessmentDepositAndReward(
        parseEther('1'),
        daysToSeconds(30),
        ASSET.ETH,
      );
      assert(deposit.mul(nxmPriceInETH).gte(totalReward1));
    }
    {
      const [deposit, totalReward1] = await claims.getAssessmentDepositAndReward(
        parseEther('1'),
        daysToSeconds(30),
        ASSET.DAI,
      );
      assert(deposit.mul(nxmPriceInETH).gte(totalReward1));
    }
    {
      const [deposit, totalReward1] = await claims.getAssessmentDepositAndReward(
        parseEther('100000000'),
        daysToSeconds(365),
        ASSET.ETH,
      );
      assert(deposit.mul(nxmPriceInETH).gte(totalReward1));
    }
    {
      const [deposit, totalReward1] = await claims.getAssessmentDepositAndReward(
        parseEther('79228162514.26433759354395033600'), // Max uint96
        daysToSeconds(365),
        ASSET.DAI,
      );
      assert(deposit.mul(nxmPriceInETH).gte(totalReward1));
    }
    {
      const [deposit, totalReward1] = await claims.getAssessmentDepositAndReward(
        parseEther('79228162514.26433759354395033600'), // Max uint96
        daysToSeconds(365),
        ASSET.DAI,
      );
      assert(deposit.mul(nxmPriceInETH).gte(totalReward1));
    }
  });
});

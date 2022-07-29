const { assert, expect } = require('chai');
const {
  ethers: {
    utils: { parseEther },
  },
} = require('hardhat');
const { buyCoverOnOnePool } = require('./helpers');
const { bnEqual } = require('../utils').helpers;

describe('totalActiveCoverInAsset', function () {

  const ethCoverBuyFixture = {
    productId: 0,
    payoutAsset: 0, // ETH
    period: 3600 * 24 * 30, // 30 days

    amount: parseEther('1000'),

    targetPriceRatio: '260',
    priceDenominator: '10000',
    activeCover: parseEther('8000'),
    capacity: parseEther('10000'),
    capacityFactor: '10000',
  };

  const daiCoverBuyFixture = {
    productId: 0,
    payoutAsset: 1, // DAI
    period: 3600 * 24 * 30, // 30 days

    amount: parseEther('1000'),

    targetPriceRatio: '260',
    priceDenominator: '10000',
    activeCover: parseEther('8000'),
    capacity: parseEther('10000'),
    capacityFactor: '10000',
  };

  it('should compute active cover amount for ETH correctly after cover purchase', async function () {
    const { cover } = this;

    const {
      emergencyAdmin,
    } = this.accounts;


    const {
      payoutAsset,
      amount,
    } = ethCoverBuyFixture;

    await cover.connect(emergencyAdmin).enableActiveCoverAmountTracking([], []);

    await cover.connect(emergencyAdmin).commitActiveCoverAmounts();

    await buyCoverOnOnePool.call(this, ethCoverBuyFixture);

    const activeCoverAmount = await cover.totalActiveCoverInAsset(payoutAsset);
    bnEqual(activeCoverAmount, amount);
  });

  it('should compute active cover amount for DAI correctly after cover purchase', async function () {
    const { cover, dai } = this;

    const {
      members: [member1],
      emergencyAdmin
    } = this.accounts;

    const {
      payoutAsset,
      amount,
    } = daiCoverBuyFixture;


    await cover.connect(emergencyAdmin).enableActiveCoverAmountTracking([], []);

    await cover.connect(emergencyAdmin).commitActiveCoverAmounts();

    await dai.mint(member1.address, parseEther('100000'));

    await dai.connect(member1).approve(cover.address, parseEther('100000'));

    await buyCoverOnOnePool.call(this, daiCoverBuyFixture);

    const activeCoverAmount = await cover.totalActiveCoverInAsset(payoutAsset);
    bnEqual(activeCoverAmount, amount);
  });

});

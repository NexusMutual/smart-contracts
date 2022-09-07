const { assert, expect } = require('chai');
const {
  ethers: {
    utils: { parseEther },
  },
} = require('hardhat');
const { buyCoverOnOnePool } = require('./helpers');
const { bnEqual } = require('../utils').helpers;
const { time } = require('@openzeppelin/test-helpers');

describe('expireCover', function () {
  const ethCoverBuyFixture = {
    productId: 0,
    coverAsset: 0, // ETH
    period: 3600 * 24 * 30, // 30 days

    amount: parseEther('1000'),

    targetPriceRatio: '260',
    priceDenominator: '10000',
    activeCover: parseEther('8000'),
    capacity: parseEther('10000'),
    capacityFactor: '10000',
  };

  it('expires cover and reduces active cover amount', async function () {
    const { cover } = this;

    const { emergencyAdmin } = this.accounts;

    const { coverAsset } = ethCoverBuyFixture;

    await cover.connect(emergencyAdmin).enableActiveCoverAmountTracking([], []);

    await cover.connect(emergencyAdmin).commitActiveCoverAmounts();

    await buyCoverOnOnePool.call(this, ethCoverBuyFixture);

    await time.increase(ethCoverBuyFixture.period + 1);

    const coverId = 0;

    await cover.expireCover(0);

    const activeCoverAmountAfterExpiry = await cover.totalActiveCoverInAsset(coverAsset);
    bnEqual(activeCoverAmountAfterExpiry, parseEther('0'));

    const segmentId = '0';
    const segment = await cover.coverSegments(coverId, segmentId);
    assert(segment.expired, true);
  });

  it('reverts when attempting to expire twice', async function () {
    const { cover } = this;

    const { emergencyAdmin } = this.accounts;

    await cover.connect(emergencyAdmin).enableActiveCoverAmountTracking([], []);

    await cover.connect(emergencyAdmin).commitActiveCoverAmounts();

    await buyCoverOnOnePool.call(this, ethCoverBuyFixture);

    await time.increase(ethCoverBuyFixture.period + 1);

    await cover.expireCover(0);

    await expect(cover.expireCover(0)).to.be.revertedWith('Cover: Cover is already expired.');
  });

  it('reverts when cover expiry is not enabled', async function () {
    const { cover } = this;

    await buyCoverOnOnePool.call(this, ethCoverBuyFixture);

    await time.increase(ethCoverBuyFixture.period);

    await expect(cover.expireCover(0)).to.be.revertedWith('Cover: Cover expiring not enabled');
  });

  it('reverts when cover is not due to expire', async function () {
    const { cover } = this;

    const { emergencyAdmin } = this.accounts;

    await cover.connect(emergencyAdmin).enableActiveCoverAmountTracking([], []);

    await cover.connect(emergencyAdmin).commitActiveCoverAmounts();

    await buyCoverOnOnePool.call(this, ethCoverBuyFixture);

    await time.increase(ethCoverBuyFixture.period - 3600);

    await expect(cover.expireCover(0)).to.be.revertedWith('Cover: Cover is not due to expire yet');
  });
});

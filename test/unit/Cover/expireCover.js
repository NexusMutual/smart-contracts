const { expect } = require('chai');
const {
  ethers: {
    utils: { parseEther },
  },
} = require('hardhat');
const { buyCoverOnOnePool } = require('./helpers');
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

    await cover.expireCover(coverId);

    const activeCoverAmountAfterExpiry = await cover.totalActiveCoverInAsset(coverAsset);
    expect(activeCoverAmountAfterExpiry).to.be.equal(0);

    const segmentId = '0';
    const segment = await cover.coverSegments(coverId, segmentId);
    expect(segment.expired).to.be.equal(true);
  });

  it('allows anyone to call this method', async function () {
    const { cover } = this;

    const {
      generalPurpose: [anyone],
      emergencyAdmin,
    } = this.accounts;

    const { coverAsset } = ethCoverBuyFixture;

    await cover.connect(emergencyAdmin).enableActiveCoverAmountTracking([], []);

    await cover.connect(emergencyAdmin).commitActiveCoverAmounts();

    await buyCoverOnOnePool.call(this, ethCoverBuyFixture);

    await time.increase(ethCoverBuyFixture.period + 1);

    const coverId = 0;

    await cover.connect(anyone).expireCover(coverId);

    const activeCoverAmountAfterExpiry = await cover.totalActiveCoverInAsset(coverAsset);
    expect(activeCoverAmountAfterExpiry).to.be.equal(0);

    const segmentId = '0';
    const segment = await cover.coverSegments(coverId, segmentId);
    expect(segment.expired).to.be.equal(true);
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

  it('reverts if invalid cover id', async function () {
    const { cover } = this;

    const { emergencyAdmin } = this.accounts;

    await cover.connect(emergencyAdmin).enableActiveCoverAmountTracking([], []);
    await cover.connect(emergencyAdmin).commitActiveCoverAmounts();

    const coverId = 150;

    // Reverts when trying to get last cover segment index
    // panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)
    await expect(cover.expireCover(coverId)).to.be.revertedWithPanic('0x11');
  });

  it('emits CoverExpired event', async function () {
    const { cover } = this;

    const { emergencyAdmin } = this.accounts;

    await cover.connect(emergencyAdmin).enableActiveCoverAmountTracking([], []);
    await cover.connect(emergencyAdmin).commitActiveCoverAmounts();

    await buyCoverOnOnePool.call(this, ethCoverBuyFixture);
    await time.increase(ethCoverBuyFixture.period + 1);

    const coverId = 0;

    await expect(cover.expireCover(coverId)).to.emit(cover, 'CoverExpired').withArgs(coverId, 0);
  });
});

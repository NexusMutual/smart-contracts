const { ethers } = require('hardhat');
const { assertCoverFields, buyCoverOnOnePool } = require('./helpers');
const { bnEqual } = require('../utils').helpers;

const { parseEther } = ethers.utils;
const gracePeriodInDays = 120;

describe('performStakeBurn', function () {
  const coverBuyFixture = {
    productId: 0,
    coverAsset: 0, // ETH
    period: 3600 * 24 * 30, // 30 days

    amount: parseEther('1000'),

    targetPriceRatio: 260,
    priceDenominator: 10000,
    activeCover: parseEther('5000'),
    capacity: parseEther('10000'),
    capacityFactor: '10000',
  };

  it('should perform a burn a cover with 1 segment and 1 pool allocation', async function () {
    const { cover } = this;

    const {
      internalContracts: [internal1],
      emergencyAdmin,
    } = this.accounts;

    const { productId, coverAsset, period, amount, targetPriceRatio } = coverBuyFixture;

    await cover.connect(emergencyAdmin).enableActiveCoverAmountTracking([], []);
    await cover.connect(emergencyAdmin).commitActiveCoverAmounts();

    const { segmentId, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const burnAmountDivisor = 2;

    const burnAmount = coverBuyFixture.amount.div(burnAmountDivisor);
    const remainingAmount = amount.sub(burnAmount);

    const segmentAllocation = await cover.coverSegmentAllocations(expectedCoverId, segmentId, '0');

    const expectedBurnAmount = segmentAllocation.coverAmountInNXM.div(burnAmountDivisor);

    await cover.connect(internal1).performStakeBurn(expectedCoverId, segmentId, burnAmount);

    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period,
      amount: remainingAmount,
      targetPriceRatio,
      gracePeriodInDays,
      segmentId,
      amountPaidOut: burnAmount,
    });

    const stakingPool = await ethers.getContractAt('CoverMockStakingPool', await cover.stakingPool(0));

    const burnStakeCalledWith = await stakingPool.burnStakeCalledWith();

    bnEqual(burnStakeCalledWith.productId, productId);
    bnEqual(burnStakeCalledWith.period, period);
    bnEqual(burnStakeCalledWith.amount, expectedBurnAmount);

    const activeCoverAmount = await cover.totalActiveCoverInAsset(coverAsset);
    bnEqual(activeCoverAmount, amount.sub(burnAmount));
  });
});

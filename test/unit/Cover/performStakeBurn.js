const { assert, expect } = require('chai');
const { ethers } = require('hardhat');
const { utils: { parseEther } } = ethers;
const { assertCoverFields,
  buyCoverOnOnePool
} = require('./helpers');
const { bnEqual } = require('../utils').helpers;

describe.skip('performStakeBurn', function () {

  const coverBuyFixture = {
    productId: 0,
    payoutAsset: 0, // ETH
    period: 3600 * 24 * 30, // 30 days

    amount: parseEther('1000'),

    targetPriceRatio: '260',
    priceDenominator: '10000',
    activeCover: parseEther('5000'),
    capacity: parseEther('10000'),
    capacityFactor: '10000',
  };

  it('should perform a burn a cover with 1 segment and 1 pool allocation', async function () {
    const { cover } = this;

    const {
      internalContracts: [internal1]
    } = this.accounts;

    const {
      productId,
      payoutAsset,
      period,
      amount,
      targetPriceRatio
    } = coverBuyFixture;

    const { expectedPremium, segmentId, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);


    const burnAmount = coverBuyFixture.amount.div(2);

    await cover.connect(internal1).performStakeBurn(
      expectedCoverId,
      segmentId,
      burnAmount
    );

    await assertCoverFields(cover, expectedCoverId,
      { productId, payoutAsset, period: period, amount, targetPriceRatio, segmentId },
    );
  });
});

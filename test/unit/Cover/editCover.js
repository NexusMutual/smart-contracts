const { assert } = require('chai');
const { web3, ethers: { utils: { parseEther } } } = require('hardhat');
const { time, expectRevert, constants: { ZERO_ADDRESS } } = require('@openzeppelin/test-helpers');
const { createStakingPool } = require('./helpers');
const { hex, zeroPadRight } = require('../utils').helpers;

const CoverMockStakingPool = artifacts.require('CoverMockStakingPool');

describe('editCover', function () {

  const coverBuyFixture = {
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

  async function buyCover (
    {
      productId,
      payoutAsset,
      period,
      amount,
      targetPriceRatio,
      priceDenominator,
      activeCover,
      capacity,
      capacityFactor,
    },
  ) {
    const { cover } = this;

    const {
      governanceContracts: [gv1],
      members: [member1],
      members: [coverBuyer1, stakingPoolManager],
    } = this.accounts;

    await cover.connect(gv1).setGlobalCapacityRatio(capacityFactor);

    const stakingPool = await createStakingPool(
      cover, productId, capacity, targetPriceRatio, activeCover, stakingPoolManager, stakingPoolManager, targetPriceRatio,
    );

    const expectedPremium = amount.mul(targetPriceRatio).div(priceDenominator);

    const tx = await cover.connect(member1).buyCover(
      {
        owner: coverBuyer1.address,
        productId,
        payoutAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: payoutAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: ZERO_ADDRESS,
      },
      [{ poolId: '0', coverAmountInAsset: amount.toString() }],
      {
        value: expectedPremium,
      },
    );
  }

  it('should edit purchased cover and increase amount', async function () {
    const { cover } = this;

    const {
      members: [member1],
      members: [coverBuyer1],
    } = this.accounts;

    const {
      productId,
      payoutAsset,
      period,
      amount,
      targetPriceRatio,
      priceDenominator,
    } = coverBuyFixture;

    await buyCover.call(this, coverBuyFixture);

    const expectedPremium = amount.mul(targetPriceRatio).div(priceDenominator);
    const expectedCoverId = '0';

    const increasedAmount = amount.mul(2);

    const expectedEditPremium = expectedPremium.mul(2);
    const extraPremium = expectedEditPremium.sub(expectedPremium);

    await cover.connect(member1).editCover(
      expectedCoverId,
      {
        owner: coverBuyer1.address,
        productId,
        payoutAsset,
        amount: increasedAmount,
        period,
        maxPremiumInAsset: expectedEditPremium,
        paymentAsset: payoutAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: ZERO_ADDRESS,
      },
      [{ poolId: '0', coverAmountInAsset: increasedAmount.toString() }],
      {
        value: extraPremium,
      },
    );

    const storedCover = await cover.covers(expectedCoverId);

    await assert.equal(storedCover.productId, productId);
    await assert.equal(storedCover.payoutAsset, payoutAsset);
    await assert.equal(storedCover.period, period);
    await assert.equal(storedCover.amount.toString(), increasedAmount.toString());
    await assert.equal(storedCover.priceRatio.toString(), targetPriceRatio.toString());
  });

  it('should edit purchased cover and increase period', async function () {
    const { cover } = this;

    const {
      members: [member1],
      members: [coverBuyer1],
    } = this.accounts;

    const {
      productId,
      payoutAsset,
      period,
      amount,
      targetPriceRatio,
      priceDenominator,
    } = coverBuyFixture;

    await buyCover.call(this, coverBuyFixture);

    const expectedPremium = amount.mul(targetPriceRatio).div(priceDenominator);
    const expectedCoverId = '0';

    const increasedPeriod = period * 2;

    const expectedEditPremium = expectedPremium.mul(2);
    const extraPremium = expectedEditPremium.sub(expectedPremium);

    await cover.connect(member1).editCover(
      expectedCoverId,
      {
        owner: coverBuyer1.address,
        productId,
        payoutAsset,
        amount,
        period: increasedPeriod,
        maxPremiumInAsset: expectedEditPremium,
        paymentAsset: payoutAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: ZERO_ADDRESS,
      },
      [{ poolId: '0', coverAmountInAsset: amount.toString() }],
      {
        value: extraPremium,
      },
    );

    const storedCover = await cover.covers(expectedCoverId);

    await assert.equal(storedCover.productId, productId);
    await assert.equal(storedCover.payoutAsset, payoutAsset);
    await assert.equal(storedCover.period, increasedPeriod);
    await assert.equal(storedCover.amount.toString(), amount.toString());
    await assert.equal(storedCover.priceRatio.toString(), targetPriceRatio.toString());
  });

  it('should revert when cover is expired', async function () {
    const { cover } = this;

    const {
      members: [member1],
      members: [coverBuyer1],
    } = this.accounts;

    const {
      productId,
      payoutAsset,
      period,
      amount,
      targetPriceRatio,
      priceDenominator,
    } = coverBuyFixture;

    await buyCover.call(this, coverBuyFixture);

    // make cover expire
    await time.increase(period + 3600);

    const expectedCoverId = '0';
    const increasedAmount = amount.mul(2);
    const expectedPremium = amount.mul(targetPriceRatio).div(priceDenominator);
    const expectedEditPremium = expectedPremium.mul(2);
    const extraPremium = expectedEditPremium.sub(expectedPremium);

    await expectRevert(cover.connect(member1).editCover(
      expectedCoverId,
      {
        owner: coverBuyer1.address,
        productId,
        payoutAsset,
        amount: increasedAmount,
        period,
        maxPremiumInAsset: expectedEditPremium,
        paymentAsset: payoutAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: ZERO_ADDRESS,
      },
      [{ poolId: '0', coverAmountInAsset: increasedAmount.toString() }],
      {
        value: extraPremium,
      },
    ), 'Cover: cover expired');
  });

  it('should revert when period is too long', async function () {
    const { cover } = this;

    const {
      members: [member1],
      members: [coverBuyer1],
    } = this.accounts;

    const {
      productId,
      payoutAsset,
      amount,
      targetPriceRatio,
      priceDenominator,
    } = coverBuyFixture;

    await buyCover.call(this, coverBuyFixture);

    const expectedCoverId = '0';
    const increasedAmount = amount.mul(2);
    const expectedPremium = amount.mul(targetPriceRatio).div(priceDenominator);
    const expectedEditPremium = expectedPremium.mul(2);
    const extraPremium = expectedEditPremium.sub(expectedPremium);

    const periodTooLong = 366 * 24 * 3600; // 366 days

    await expectRevert(cover.connect(member1).editCover(
      expectedCoverId,
      {
        owner: coverBuyer1.address,
        productId,
        payoutAsset,
        amount: increasedAmount,
        period: periodTooLong,
        maxPremiumInAsset: expectedEditPremium,
        paymentAsset: payoutAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: ZERO_ADDRESS,
      },
      [{ poolId: '0', coverAmountInAsset: increasedAmount.toString() }],
      {
        value: extraPremium,
      },
    ), 'Cover: Cover period is too long');
  });

  it('should revert when commission rate too high', async function () {
    const { cover } = this;

    const {
      members: [member1],
      members: [coverBuyer1],
    } = this.accounts;

    const {
      productId,
      payoutAsset,
      amount,
      targetPriceRatio,
      priceDenominator,
    } = coverBuyFixture;

    await buyCover.call(this, coverBuyFixture);

    const expectedCoverId = '0';
    const increasedAmount = amount.mul(2);
    const expectedPremium = amount.mul(targetPriceRatio).div(priceDenominator);
    const expectedEditPremium = expectedPremium.mul(2);
    const extraPremium = expectedEditPremium.sub(expectedPremium);

    const periodTooLong = 366 * 24 * 3600; // 366 days

    await expectRevert(cover.connect(member1).editCover(
      expectedCoverId,
      {
        owner: coverBuyer1.address,
        productId,
        payoutAsset,
        amount: increasedAmount,
        period: periodTooLong,
        maxPremiumInAsset: expectedEditPremium,
        paymentAsset: payoutAsset,
        payWitNXM: false,
        commissionRatio: '2600', // too high
        commissionDestination: ZERO_ADDRESS,
      },
      [{ poolId: '0', coverAmountInAsset: increasedAmount.toString() }],
      {
        value: extraPremium,
      },
    ), 'Cover: Cover period is too long');
  });
});

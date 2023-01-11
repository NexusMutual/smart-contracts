const { expect } = require('chai');
const { ethers } = require('hardhat');
const { setNextBlockTime } = require('../utils').evm;

const { parseEther } = ethers.utils;
const { AddressZero } = ethers.constants;
const { daysToSeconds } = require('../../../lib/helpers');
const { assertCoverFields, buyCoverOnOnePool, MAX_COVER_PERIOD, createStakingPool } = require('./helpers');

const gracePeriod = daysToSeconds(120);

describe('editCover', function () {
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

  it('should edit purchased cover and increase amount', async function () {
    const { cover } = this;

    const [coverBuyer] = this.accounts.members;

    const { productId, coverAsset, period, amount, priceDenominator, targetPriceRatio } = coverBuyFixture;

    const { expectedPremium, segment, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const increasedAmount = amount.mul(2);

    const expectedRefund = segment.amount
      .mul(targetPriceRatio)
      .mul(segment.period)
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    const expectedEditPremium = expectedPremium.mul(2);
    const extraPremium = expectedEditPremium.sub(expectedRefund);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: increasedAmount,
        period,
        maxPremiumInAsset: expectedEditPremium.add(1),
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: '0', coverAmountInAsset: increasedAmount.toString() }],
      {
        value: extraPremium.add(1),
      },
    );

    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period,
      amount: increasedAmount,
      gracePeriod,
      segmentId: '1',
      amountPaidOut: 0,
    });
  });

  it('should edit purchased cover and add coverage from a new staking pool', async function () {
    const { cover } = this;

    const [coverBuyer, manager] = this.accounts.members;

    const { productId, coverAsset, period, amount } = coverBuyFixture;

    const { expectedPremium, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    await createStakingPool(
      cover,
      productId,
      parseEther('10000'), // capacity
      coverBuyFixture.targetPriceRatio, // targetPrice
      0, // activeCover
      manager, // creator
      manager, // manager
      coverBuyFixture.targetPriceRatio, // currentPrice
    );

    const buyerBalanceBefore = await ethers.provider.getBalance(coverBuyer.address);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium.add(1),
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [
        { poolId: 0, skip: true, coverAmountInAsset: 0 },
        { poolId: 1, skip: false, coverAmountInAsset: amount },
      ],
      {
        value: expectedPremium.add(1),
      },
    );

    const buyerBalanceAfter = await ethers.provider.getBalance(coverBuyer.address);
    expect(buyerBalanceAfter).to.be.lt(buyerBalanceBefore.sub(expectedPremium));

    const pool0Allocation = await cover.coverSegmentAllocations(expectedCoverId, 1, 0);
    expect(pool0Allocation.poolId).to.be.equal(0);
    const pool1Allocation = await cover.coverSegmentAllocations(expectedCoverId, 1, 1);
    expect(pool1Allocation.poolId).to.be.equal(1);

    expect(pool0Allocation.coverAmountInNXM).to.be.equal(amount);
    expect(pool1Allocation.coverAmountInNXM).to.be.equal(amount);

    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period,
      amount,
      gracePeriod,
      segmentId: '1',
      amountPaidOut: 0,
    });
  });

  it('should edit purchased cover and increase period', async function () {
    const { cover } = this;

    const [coverBuyer] = this.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;

    const { expectedPremium, segment, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const expectedRefund = segment.amount
      .mul(targetPriceRatio)
      .mul(segment.period)
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    const expectedEditPremium = expectedPremium.mul(2);
    const extraPremium = expectedEditPremium.sub(expectedRefund);
    const increasedPeriod = period * 2;
    const amountPaidOut = 0;

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount,
        period: increasedPeriod,
        maxPremiumInAsset: expectedEditPremium.add(10),
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
        amountPaidOut,
      },
      [{ poolId: '0', skip: false, coverAmountInAsset: amount.toString() }],
      {
        value: extraPremium.add(10),
      },
    );

    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period: increasedPeriod,
      amount,
      gracePeriod,
      segmentId: 1,
      amountPaidOut,
    });
  });

  it('should edit purchased cover and increase period and amount', async function () {
    const { cover } = this;

    const [coverBuyer] = this.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;

    await buyCoverOnOnePool.call(this, coverBuyFixture);

    const { expectedPremium, segment, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const expectedRefund = segment.amount
      .mul(targetPriceRatio)
      .mul(segment.period)
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    const expectedEditPremium = expectedPremium.mul(4);
    const extraPremium = expectedEditPremium.sub(expectedRefund);
    const increasedAmount = amount.mul(2);
    const increasedPeriod = period * 2;
    const amountPaidOut = 0;

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: increasedAmount,
        period: increasedPeriod,
        maxPremiumInAsset: expectedEditPremium.add(10),
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
        amountPaidOut,
      },
      [{ poolId: '0', skip: false, coverAmountInAsset: increasedAmount.toString() }],
      {
        value: extraPremium.add(10),
      },
    );

    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period: increasedPeriod,
      amount: increasedAmount,
      gracePeriod,
      segmentId: 1,
      amountPaidOut,
    });
  });

  it('should edit purchased cover and increase period and decrease amount', async function () {
    const { cover } = this;

    const [coverBuyer] = this.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;

    await buyCoverOnOnePool.call(this, coverBuyFixture);

    const { expectedPremium, segment, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const expectedRefund = segment.amount
      .mul(targetPriceRatio)
      .mul(segment.period)
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    const expectedEditPremium = expectedPremium;
    const extraPremium = expectedEditPremium.sub(expectedRefund);
    const decreasedAmount = amount.div(2);
    const increasedPeriod = period * 2;
    const amountPaidOut = 0;

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: decreasedAmount,
        period: increasedPeriod,
        maxPremiumInAsset: expectedEditPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
        amountPaidOut,
      },
      [{ poolId: '0', skip: false, coverAmountInAsset: decreasedAmount.toString() }],
      {
        value: extraPremium,
      },
    );

    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period: increasedPeriod,
      amount: decreasedAmount,
      gracePeriod,
      segmentId: '1',
      amountPaidOut,
    });
  });

  it('should fail to edit an expired cover', async function () {
    const { cover } = this;

    const [coverBuyer] = this.accounts.members;

    const { productId, coverAsset, period, amount } = coverBuyFixture;
    const { expectedPremium, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const increasedAmount = amount.mul(2);
    const expectedEditPremium = expectedPremium.mul(2);
    const extraPremium = expectedEditPremium;
    const amountPaidOut = 0;

    const now = await ethers.provider.getBlock('latest').then(block => block.timestamp);
    await setNextBlockTime(now + period + 3600);

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: expectedCoverId,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount: increasedAmount,
          period,
          maxPremiumInAsset: expectedEditPremium.add(10),
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
          amountPaidOut,
        },
        [{ poolId: '0', skip: true, coverAmountInAsset: increasedAmount }],
        { value: extraPremium.add(10) },
      ),
    ).to.be.revertedWith('Cover: Expired covers cannot be edited');
  });

  it('should revert when period is too long', async function () {
    const { cover } = this;

    const [coverBuyer] = this.accounts.members;

    const { productId, coverAsset, amount, priceDenominator, targetPriceRatio } = coverBuyFixture;

    const { expectedPremium, segment, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const expectedRefund = segment.amount
      .mul(targetPriceRatio)
      .mul(segment.period)
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);
    const increasedAmount = amount.mul(2);
    const expectedEditPremium = expectedPremium.mul(2);
    const extraPremium = expectedEditPremium.sub(expectedRefund);
    const amountPaidOut = 0;

    const periodTooLong = 366 * 24 * 3600; // 366 days

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: expectedCoverId,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount: increasedAmount,
          period: periodTooLong,
          maxPremiumInAsset: expectedEditPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
          amountPaidOut,
        },
        [{ poolId: '0', skip: false, coverAmountInAsset: increasedAmount.toString() }],
        {
          value: extraPremium,
        },
      ),
    ).to.be.revertedWithCustomError(cover, 'CoverPeriodTooLong');
  });

  it('should revert when commission rate too high', async function () {
    const { cover } = this;
    const { MAX_COMMISSION_RATIO } = this.config;

    const [coverBuyer] = this.accounts.members;

    const { productId, coverAsset, amount, period, priceDenominator, targetPriceRatio } = coverBuyFixture;

    await buyCoverOnOnePool.call(this, coverBuyFixture);

    const { expectedPremium, segment, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const expectedRefund = segment.amount
      .mul(targetPriceRatio)
      .mul(segment.period)
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);
    const increasedAmount = amount.mul(2);
    const expectedEditPremium = expectedPremium.mul(2);
    const extraPremium = expectedEditPremium.sub(expectedRefund);
    const amountPaidOut = 0;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: expectedCoverId,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount: increasedAmount,
          period,
          maxPremiumInAsset: expectedEditPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: MAX_COMMISSION_RATIO.add(1), // too high
          commissionDestination: AddressZero,
          ipfsData: '',
          amountPaidOut,
        },
        [{ poolId: '0', skip: false, coverAmountInAsset: increasedAmount.toString() }],
        {
          value: extraPremium,
        },
      ),
    ).to.be.revertedWithCustomError(cover, 'CommissionRateTooHigh');
  });

  it('should store new grace period when editing cover', async function () {
    const { cover } = this;
    const [boardMember] = this.accounts.advisoryBoardMembers;
    const [coverBuyer] = this.accounts.members;

    const { productId, coverAsset, amount, period } = coverBuyFixture;

    // Buy cover
    const { expectedPremium, segment, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    // Edit product gracePeriod
    const productTypeBefore = await cover.productTypes(productId);
    const newGracePeriod = daysToSeconds(1000);

    await cover.connect(boardMember).setProductTypes([[productId, 'ipfs hash', [1, newGracePeriod]]]);
    const productType = await cover.productTypes(productId);
    expect(newGracePeriod).to.be.equal(productType.gracePeriod);

    const now = await ethers.provider.getBlock('latest').then(block => block.timestamp);
    await setNextBlockTime(now + daysToSeconds(1));

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium.add(10),
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: '0', coverAmountInAsset: amount }],
      { value: expectedPremium.add(10) },
    );

    const secondSegment = await cover.coverSegments(expectedCoverId, 1);
    expect(secondSegment.gracePeriod).to.be.equal(newGracePeriod);
    expect(productTypeBefore.gracePeriod).to.be.equal(segment.gracePeriod);
  });
});

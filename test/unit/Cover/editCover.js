const { expect } = require('chai');
const { ethers } = require('hardhat');
const { setNextBlockTime } = require('../utils').evm;

const { parseEther } = ethers.utils;
const { AddressZero } = ethers.constants;

const { assertCoverFields, buyCoverOnOnePool, MAX_COVER_PERIOD } = require('./helpers');
const gracePeriodInDays = 120;

describe('editCover', function () {
  const coverBuyFixture = {
    productId: 0,
    coverAsset: 0, // ETH
    period: 3600 * 24 * 30, // 30 days

    amount: parseEther('1000'),

    targetPriceRatio: '260',
    priceDenominator: '10000',
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
      .mul(segment.priceRatio)
      .mul(segment.period)
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    const expectedEditPremium = expectedPremium.mul(2);
    const extraPremium = expectedEditPremium.sub(expectedRefund);

    const tx = await cover.connect(coverBuyer).editCover(
      expectedCoverId,
      {
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
    await tx.wait();

    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period,
      amount: increasedAmount,
      targetPriceRatio,
      gracePeriodInDays,
      segmentId: '1',
    });
  });

  it('should edit purchased cover and increase period', async function () {
    const { cover } = this;

    const [coverBuyer] = this.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;

    const { expectedPremium, segment, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const expectedRefund = segment.amount
      .mul(segment.priceRatio)
      .mul(segment.period)
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    const expectedEditPremium = expectedPremium.mul(2);
    const extraPremium = expectedEditPremium.sub(expectedRefund);
    const increasedPeriod = period * 2;

    const tx = await cover.connect(coverBuyer).editCover(
      expectedCoverId,
      {
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
      },
      [{ poolId: '0', coverAmountInAsset: amount.toString() }],
      {
        value: extraPremium.add(10),
      },
    );

    await tx.wait();

    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period: increasedPeriod,
      amount,
      targetPriceRatio,
      gracePeriodInDays,
      segmentId: '1',
    });
  });

  it('should edit purchased cover and increase period and amount', async function () {
    const { cover } = this;

    const [coverBuyer] = this.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;

    await buyCoverOnOnePool.call(this, coverBuyFixture);

    const { expectedPremium, segment, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const expectedRefund = segment.amount
      .mul(segment.priceRatio)
      .mul(segment.period)
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    const expectedEditPremium = expectedPremium.mul(4);
    const extraPremium = expectedEditPremium.sub(expectedRefund);
    const increasedAmount = amount.mul(2);
    const increasedPeriod = period * 2;

    const tx = await cover.connect(coverBuyer).editCover(
      expectedCoverId,
      {
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
      },
      [{ poolId: '0', coverAmountInAsset: increasedAmount.toString() }],
      {
        value: extraPremium.add(10),
      },
    );

    await tx.wait();

    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period: increasedPeriod,
      amount: increasedAmount,
      targetPriceRatio,
      gracePeriodInDays,
      segmentId: '1',
    });
  });

  it('should edit purchased cover and increase period and decrease amount', async function () {
    const { cover } = this;

    const [coverBuyer] = this.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;

    await buyCoverOnOnePool.call(this, coverBuyFixture);

    const { expectedPremium, segment, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const expectedRefund = segment.amount
      .mul(segment.priceRatio)
      .mul(segment.period)
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    const expectedEditPremium = expectedPremium;
    const extraPremium = expectedEditPremium.sub(expectedRefund);
    const decreasedAmount = amount.div(2);
    const increasedPeriod = period * 2;

    const tx = await cover.connect(coverBuyer).editCover(
      expectedCoverId,
      {
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
      },
      [{ poolId: '0', coverAmountInAsset: decreasedAmount.toString() }],
      {
        value: extraPremium,
      },
    );

    await tx.wait();

    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period: increasedPeriod,
      amount: decreasedAmount,
      targetPriceRatio,
      gracePeriodInDays,
      segmentId: '1',
    });
  });

  it('should allow editing a cover that is expired offering 0 refund', async function () {
    const { cover } = this;

    const [coverBuyer] = this.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio } = coverBuyFixture;
    const { expectedPremium, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const increasedAmount = amount.mul(2);
    const expectedEditPremium = expectedPremium.mul(2);
    const extraPremium = expectedEditPremium;

    const now = await ethers.provider.getBlock('latest').then(block => block.timestamp);
    await setNextBlockTime(now + period + 3600);

    const tx = await cover.connect(coverBuyer).editCover(
      expectedCoverId,
      {
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
      },
      [{ poolId: '0', coverAmountInAsset: increasedAmount }],
      { value: extraPremium.add(10) },
    );

    await tx.wait();

    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period,
      amount: increasedAmount,
      targetPriceRatio,
      gracePeriodInDays,
      segmentId: '1',
    });
  });

  it('should revert when period is too long', async function () {
    const { cover } = this;

    const [coverBuyer] = this.accounts.members;

    const { productId, coverAsset, amount, priceDenominator } = coverBuyFixture;

    const { expectedPremium, segment, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const expectedRefund = segment.amount
      .mul(segment.priceRatio)
      .mul(segment.period)
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);
    const increasedAmount = amount.mul(2);
    const expectedEditPremium = expectedPremium.mul(2);
    const extraPremium = expectedEditPremium.sub(expectedRefund);

    const periodTooLong = 366 * 24 * 3600; // 366 days

    await expect(
      cover.connect(coverBuyer).editCover(
        expectedCoverId,
        {
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
        },
        [{ poolId: '0', coverAmountInAsset: increasedAmount.toString() }],
        {
          value: extraPremium,
        },
      ),
    ).to.be.revertedWith('Cover: Cover period is too long');
  });

  it('should revert when commission rate too high', async function () {
    const { cover } = this;

    const [coverBuyer] = this.accounts.members;

    const { productId, coverAsset, amount, period, priceDenominator } = coverBuyFixture;

    await buyCoverOnOnePool.call(this, coverBuyFixture);

    const { expectedPremium, segment, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const expectedRefund = segment.amount
      .mul(segment.priceRatio)
      .mul(segment.period)
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);
    const increasedAmount = amount.mul(2);
    const expectedEditPremium = expectedPremium.mul(2);
    const extraPremium = expectedEditPremium.sub(expectedRefund);

    await expect(
      cover.connect(coverBuyer).editCover(
        expectedCoverId,
        {
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount: increasedAmount,
          period,
          maxPremiumInAsset: expectedEditPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: '2600', // too high
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: '0', coverAmountInAsset: increasedAmount.toString() }],
        {
          value: extraPremium,
        },
      ),
    ).to.be.revertedWith('Cover: Commission rate is too high');
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

    const newGracePeriodInDays = 1000;
    await cover.connect(boardMember).editProductTypes([productId], [newGracePeriodInDays], ['ipfs hash']);
    const productType = await cover.productTypes(productId);
    expect(newGracePeriodInDays).to.be.equal(productType.gracePeriodInDays);

    const now = await ethers.provider.getBlock('latest').then(block => block.timestamp);
    await setNextBlockTime(now + period + 3600);

    await cover.connect(coverBuyer).editCover(
      expectedCoverId,
      {
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
    expect(secondSegment.gracePeriodInDays).to.be.equal(newGracePeriodInDays);
    expect(productTypeBefore.gracePeriodInDays).to.be.equal(segment.gracePeriodInDays);
  });
});

const { expect } = require('chai');
const { ethers } = require('hardhat');

const { setNextBlockTime } = require('../utils').evm;
const { daysToSeconds } = require('../utils').helpers;
const { assertCoverFields, buyCoverOnOnePool, MAX_COVER_PERIOD, createStakingPool } = require('./helpers');

const { BigNumber } = ethers;
const { parseEther } = ethers.utils;
const { AddressZero } = ethers.constants;

const gracePeriod = daysToSeconds(120);

describe('editCover', function () {
  const coverBuyFixture = {
    productId: 0,
    coverAsset: 0, // ETH
    period: daysToSeconds(30), // 30 days

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

    const passedPeriod = BigNumber.from(10);
    const { start: startTimestamp } = await cover.coverSegments(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const increasedAmount = amount.mul(2);

    const expectedRefund = segment.amount
      .mul(targetPriceRatio)
      .mul(BigNumber.from(segment.period).sub(passedPeriod))
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
        maxPremiumInAsset: extraPremium.add(1),
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: increasedAmount.toString() }],
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
      segmentId: 1,
    });
  });

  it('should allow to reduce amount', async function () {
    const { cover } = this;

    const [coverBuyer] = this.accounts.members;

    const { productId, coverAsset, period, amount } = coverBuyFixture;

    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const reducedAmount = amount.div(2);

    const expectedEditPremium = 0;

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: reducedAmount,
        period,
        maxPremiumInAsset: expectedEditPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: reducedAmount.toString() }],
      {
        value: 0,
      },
    );

    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period,
      amount: reducedAmount,
      gracePeriod,
      segmentId: 1,
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

    const increasedAmount = amount.mul(2);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: increasedAmount,
        period,
        maxPremiumInAsset: expectedPremium.add(1),
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [
        { poolId: 1, skip: true, coverAmountInAsset: 0 },
        { poolId: 2, skip: false, coverAmountInAsset: amount },
      ],
      {
        value: expectedPremium.add(1),
      },
    );

    const buyerBalanceAfter = await ethers.provider.getBalance(coverBuyer.address);
    expect(buyerBalanceAfter).to.be.lt(buyerBalanceBefore.sub(expectedPremium));

    const pool1Allocation = await cover.coverSegmentAllocations(expectedCoverId, 1, 0);
    expect(pool1Allocation.poolId).to.be.equal(1);
    const pool2Allocation = await cover.coverSegmentAllocations(expectedCoverId, 1, 1);
    expect(pool2Allocation.poolId).to.be.equal(2);

    expect(pool1Allocation.coverAmountInNXM).to.be.equal(amount);
    expect(pool2Allocation.coverAmountInNXM).to.be.equal(amount);

    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period,
      amount: increasedAmount,
      gracePeriod,
      segmentId: 1,
    });
  });

  it('should edit purchased cover and increase period', async function () {
    const { cover } = this;

    const [coverBuyer] = this.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;

    const { expectedPremium, segment, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const passedPeriod = BigNumber.from(10);
    const { start: startTimestamp } = await cover.coverSegments(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const expectedRefund = segment.amount
      .mul(targetPriceRatio)
      .mul(BigNumber.from(segment.period).sub(passedPeriod))
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    const expectedEditPremium = expectedPremium.mul(2);
    const extraPremium = expectedEditPremium.sub(expectedRefund);
    const increasedPeriod = period * 2;

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount,
        period: increasedPeriod,
        maxPremiumInAsset: extraPremium.add(1),
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: 1, skip: false, coverAmountInAsset: amount.toString() }],
      {
        value: extraPremium.add(1),
      },
    );

    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period: increasedPeriod,
      amount,
      gracePeriod,
      segmentId: 1,
    });
  });

  it('should allow to reduce period', async function () {
    const { cover } = this;

    const [coverBuyer] = this.accounts.members;

    const { productId, coverAsset, period, amount } = coverBuyFixture;

    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const reducedPeriod = period - daysToSeconds(1);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount,
        period: reducedPeriod,
        maxPremiumInAsset: 0,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: 1, skip: false, coverAmountInAsset: amount.toString() }],
      {
        value: 0,
      },
    );

    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period: reducedPeriod,
      amount,
      gracePeriod,
      segmentId: 1,
    });
  });

  it('should edit purchased cover and increase period and amount', async function () {
    const { cover } = this;

    const [coverBuyer] = this.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;

    await buyCoverOnOnePool.call(this, coverBuyFixture);

    const { expectedPremium, segment, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const passedPeriod = BigNumber.from(10);
    const { start: startTimestamp } = await cover.coverSegments(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const expectedRefund = segment.amount
      .mul(targetPriceRatio)
      .mul(BigNumber.from(segment.period).sub(passedPeriod))
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    const expectedEditPremium = expectedPremium.mul(4);
    const extraPremium = expectedEditPremium.sub(expectedRefund);
    const increasedAmount = amount.mul(2);
    const increasedPeriod = period * 2;

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: increasedAmount,
        period: increasedPeriod,
        maxPremiumInAsset: extraPremium.add(2),
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: 1, skip: false, coverAmountInAsset: increasedAmount.toString() }],
      {
        value: extraPremium.add(2),
      },
    );

    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period: increasedPeriod,
      amount: increasedAmount,
      gracePeriod,
      segmentId: 1,
    });
  });

  it('should edit purchased cover and increase period and decrease amount', async function () {
    const { cover } = this;

    const [coverBuyer] = this.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;

    await buyCoverOnOnePool.call(this, coverBuyFixture);

    const { expectedPremium, segment, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const passedPeriod = BigNumber.from(10);
    const { start: startTimestamp } = await cover.coverSegments(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const expectedRefund = segment.amount
      .mul(targetPriceRatio)
      .mul(BigNumber.from(segment.period).sub(passedPeriod))
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    const expectedEditPremium = expectedPremium;
    const extraPremium = expectedEditPremium.sub(expectedRefund);
    const decreasedAmount = amount.div(2);
    const increasedPeriod = period * 2;

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: decreasedAmount,
        period: increasedPeriod,
        maxPremiumInAsset: extraPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: 1, skip: false, coverAmountInAsset: decreasedAmount.toString() }],
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
    });
  });

  it('should allow to reduce period and increase amount', async function () {
    const { cover } = this;
    const [coverBuyer] = this.accounts.members;

    const {
      productId,
      coverAsset,
      period: reducedPeriod,
      amount,
      targetPriceRatio,
      priceDenominator,
    } = coverBuyFixture;

    const period = BigNumber.from(reducedPeriod).mul(2);

    await buyCoverOnOnePool.call(this, coverBuyFixture);

    const {
      expectedPremium,
      segment,
      coverId: expectedCoverId,
    } = await buyCoverOnOnePool.call(this, { ...coverBuyFixture, period });

    const { start: startTimestamp } = await cover.coverSegments(expectedCoverId, 0);
    const passedPeriod = BigNumber.from(10);
    const editTimestamp = BigNumber.from(startTimestamp).add(10);

    const expectedRefund = segment.amount
      .mul(targetPriceRatio)
      .mul(BigNumber.from(segment.period).sub(passedPeriod))
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    const increasedAmount = amount.mul(2);
    const expectedPremiumWithoutRefund = expectedPremium; // reduced period by half and increased amount to double
    const extraPremium = expectedPremiumWithoutRefund.sub(expectedRefund);

    await setNextBlockTime(editTimestamp.toNumber());
    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: increasedAmount,
        period: reducedPeriod,
        maxPremiumInAsset: extraPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: 1, skip: false, coverAmountInAsset: increasedAmount.toString() }],
      {
        value: extraPremium,
      },
    );

    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period: reducedPeriod,
      amount: increasedAmount,
      gracePeriod,
      segmentId: 1,
    });
  });

  it('should allow to reduce period and reduce amount', async function () {
    const { cover } = this;

    const [coverBuyer] = this.accounts.members;

    const { productId, coverAsset, period, amount } = coverBuyFixture;

    await buyCoverOnOnePool.call(this, coverBuyFixture);

    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, {
      ...coverBuyFixture,
      period: period * 2,
    });

    const reducedAmount = amount.div(2);
    const reducedPeriod = period;

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: reducedAmount,
        period: reducedPeriod,
        maxPremiumInAsset: 0,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: 1, skip: false, coverAmountInAsset: reducedAmount.toString() }],
      {
        value: 0,
      },
    );

    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period: reducedPeriod,
      amount: reducedAmount,
      gracePeriod,
      segmentId: 1,
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
        },
        [{ poolId: 1, skip: true, coverAmountInAsset: increasedAmount }],
        { value: extraPremium.add(10) },
      ),
    ).to.be.revertedWithCustomError(cover, 'ExpiredCoversCannotBeEdited');
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

    const periodTooLong = daysToSeconds(366);

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
        },
        [{ poolId: 1, skip: false, coverAmountInAsset: increasedAmount.toString() }],
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
        },
        [{ poolId: 1, skip: false, coverAmountInAsset: increasedAmount.toString() }],
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

    await cover.connect(boardMember).setProductTypes([['Product A', productId, 'ipfs hash', [1, newGracePeriod]]]);
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
      [{ poolId: 1, coverAmountInAsset: amount }],
      { value: expectedPremium.add(10) },
    );

    const secondSegment = await cover.coverSegments(expectedCoverId, 1);
    expect(secondSegment.gracePeriod).to.be.equal(newGracePeriod);
    expect(productTypeBefore.gracePeriod).to.be.equal(segment.gracePeriod);
  });

  it('reverts if caller is not NFT owner or approved', async function () {
    const { cover } = this;

    const [coverBuyer, otherUser] = this.accounts.members;

    const { productId, coverAsset, period, amount } = coverBuyFixture;
    const { expectedPremium, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const increasedAmount = amount.mul(2);
    const expectedEditPremium = expectedPremium.mul(2);
    const extraPremium = expectedEditPremium;

    await expect(
      cover.connect(otherUser).buyCover(
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
        },
        [{ poolId: 1, skip: false, coverAmountInAsset: increasedAmount }],
        { value: extraPremium.add(10) },
      ),
    ).to.be.revertedWithCustomError(cover, 'OnlyOwnerOrApproved');
  });

  it('reverts if invalid coverId', async function () {
    const { cover } = this;

    const [coverBuyer] = this.accounts.members;

    const { productId, coverAsset, period, amount } = coverBuyFixture;
    const { expectedPremium, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const increasedAmount = amount.mul(2);
    const expectedEditPremium = expectedPremium.mul(2);
    const extraPremium = expectedEditPremium;

    const invalidCoverId = expectedCoverId.add(100);
    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: invalidCoverId,
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
        [{ poolId: 1, skip: false, coverAmountInAsset: increasedAmount }],
        { value: extraPremium.add(10) },
      ),
    ).to.be.revertedWith('NOT_MINTED');
  });

  it('reverts if period is too short', async function () {
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

    const periodTooShort = daysToSeconds(10);

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: expectedCoverId,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount: increasedAmount,
          period: periodTooShort,
          maxPremiumInAsset: expectedEditPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: 1, skip: false, coverAmountInAsset: increasedAmount.toString() }],
        {
          value: extraPremium,
        },
      ),
    ).to.be.revertedWithCustomError(cover, 'CoverPeriodTooShort');
  });

  it('reverts if calculated premium is bigger than maxPremiumInAsset', async function () {
    const { cover } = this;

    const [coverBuyer] = this.accounts.members;

    const { productId, coverAsset, amount, period, priceDenominator, targetPriceRatio } = coverBuyFixture;

    const { expectedPremium, segment, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const expectedRefund = segment.amount
      .mul(targetPriceRatio)
      .mul(segment.period)
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    const increasedAmount = amount.mul(2);
    const expectedEditPremium = expectedPremium.mul(2);
    const extraPremium = expectedEditPremium.sub(expectedRefund);

    const smallExpectedEditPremium = expectedEditPremium.div(10);

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: expectedCoverId,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount: increasedAmount,
          period,
          maxPremiumInAsset: smallExpectedEditPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: 1, skip: false, coverAmountInAsset: increasedAmount.toString() }],
        {
          value: extraPremium,
        },
      ),
    ).to.be.revertedWithCustomError(cover, 'PriceExceedsMaxPremiumInAsset');
  });

  it('works if caller is the owner of the NFT', async function () {
    const { cover, coverNFT } = this;

    const [coverBuyer] = this.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;
    const { expectedPremium, segment, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const passedPeriod = BigNumber.from(10);
    const { start: startTimestamp } = await cover.coverSegments(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const increasedAmount = amount.mul(2);
    const expectedRefund = segment.amount
      .mul(targetPriceRatio)
      .mul(BigNumber.from(segment.period).sub(passedPeriod))
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    const expectedEditPremium = expectedPremium.mul(2);
    const extraPremium = expectedEditPremium.sub(expectedRefund);

    const coverOwner = await coverNFT.ownerOf(expectedCoverId);
    expect(coverOwner).to.be.equal(coverBuyer.address);

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: expectedCoverId,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount: increasedAmount,
          period,
          maxPremiumInAsset: extraPremium.add(1),
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: 1, skip: false, coverAmountInAsset: increasedAmount }],
        { value: extraPremium.add(1) },
      ),
    ).to.not.be.reverted;
  });

  it('works if caller approved by the owner of the NFT', async function () {
    const { cover, coverNFT } = this;

    const [coverBuyer, otherUser] = this.accounts.members;

    const { productId, coverAsset, period, amount } = coverBuyFixture;
    const { expectedPremium, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const increasedAmount = amount.mul(2);

    const expectedEditPremium = expectedPremium.mul(2);
    const extraPremium = expectedEditPremium;

    const coverOwner = await coverNFT.ownerOf(expectedCoverId);
    expect(coverOwner).to.be.equal(coverBuyer.address);

    await coverNFT.connect(coverBuyer).approve(otherUser.address, expectedCoverId);

    await expect(
      cover.connect(otherUser).buyCover(
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
        [{ poolId: 1, skip: false, coverAmountInAsset: increasedAmount }],
        { value: extraPremium.add(1) },
      ),
    ).to.not.be.reverted;
  });

  it('reverts if incorrect cover asset', async function () {
    const { cover } = this;

    const [coverBuyer] = this.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;
    const { expectedPremium, segment, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const increasedAmount = amount.mul(2);
    const expectedRefund = segment.amount
      .mul(targetPriceRatio)
      .mul(segment.period)
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    const expectedEditPremium = expectedPremium.mul(2);
    const extraPremium = expectedEditPremium.sub(expectedRefund);

    const incorrectCoverAsset = 1;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: expectedCoverId,
          owner: coverBuyer.address,
          productId,
          coverAsset: incorrectCoverAsset,
          amount: increasedAmount,
          period,
          maxPremiumInAsset: expectedEditPremium.add(1),
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: 1, skip: false, coverAmountInAsset: increasedAmount }],
        { value: extraPremium.add(1) },
      ),
    ).to.be.revertedWithCustomError(cover, 'UnexpectedCoverAsset');
  });

  it('reverts if incorrect productId', async function () {
    const { cover } = this;

    const [coverBuyer] = this.accounts.members;

    const { coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;
    const { expectedPremium, segment, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const increasedAmount = amount.mul(2);
    const expectedRefund = segment.amount
      .mul(targetPriceRatio)
      .mul(segment.period)
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    const expectedEditPremium = expectedPremium.mul(2);
    const extraPremium = expectedEditPremium.sub(expectedRefund);

    const incorrectProductId = 1;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: expectedCoverId,
          owner: coverBuyer.address,
          productId: incorrectProductId,
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
        [{ poolId: 1, skip: false, coverAmountInAsset: increasedAmount }],
        { value: extraPremium.add(1) },
      ),
    ).to.be.revertedWithCustomError(cover, 'UnexpectedProductId');
  });

  it('reverts if empty array of allocationRequests', async function () {
    const { cover } = this;

    const [coverBuyer] = this.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;
    const { expectedPremium, segment, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const increasedAmount = amount.mul(2);
    const expectedRefund = segment.amount
      .mul(targetPriceRatio)
      .mul(segment.period)
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    const expectedEditPremium = expectedPremium.mul(2);
    const extraPremium = expectedEditPremium.sub(expectedRefund);

    await expect(
      cover.connect(coverBuyer).buyCover(
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
        [],
        { value: extraPremium.add(1) },
      ),
    ).to.be.revertedWithCustomError(cover, 'InsufficientCoverAmountAllocated');
  });

  it('emits CoverEdited event', async function () {
    const { cover, coverNFT } = this;

    const [coverBuyer] = this.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;
    const {
      expectedPremium,
      segment,
      coverId: expectedCoverId,
      segmentId,
    } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const passedPeriod = BigNumber.from(10);
    const { start: startTimestamp } = await cover.coverSegments(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const increasedAmount = amount.mul(2);
    const expectedRefund = segment.amount
      .mul(targetPriceRatio)
      .mul(BigNumber.from(segment.period).sub(passedPeriod))
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    const expectedEditPremium = expectedPremium.mul(2);
    const extraPremium = expectedEditPremium.sub(expectedRefund);

    const coverOwner = await coverNFT.ownerOf(expectedCoverId);
    expect(coverOwner).to.be.equal(coverBuyer.address);

    const ipfsData = 'test data';
    const newSegmentId = segmentId.add(1);

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: expectedCoverId,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount: increasedAmount,
          period,
          maxPremiumInAsset: extraPremium.add(1),
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData,
        },
        [{ poolId: 1, skip: false, coverAmountInAsset: increasedAmount }],
        { value: extraPremium.add(1) },
      ),
    )
      .to.emit(cover, 'CoverEdited')
      .withArgs(expectedCoverId, productId, newSegmentId, coverBuyer.address, ipfsData);
  });

  it('retrieves the premium difference from the user in ETH', async function () {
    const { cover, pool } = this;

    const [coverBuyer] = this.accounts.members;

    const { productId, coverAsset, period, amount, priceDenominator, targetPriceRatio } = coverBuyFixture;

    const { expectedPremium, segment, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const passedPeriod = BigNumber.from(10);
    const { start: startTimestamp } = await cover.coverSegments(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const increasedAmount = amount.mul(2);

    const expectedRefund = segment.amount
      .mul(targetPriceRatio)
      .mul(BigNumber.from(segment.period).sub(passedPeriod))
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    const expectedEditPremium = expectedPremium.mul(2);
    const extraPremium = expectedEditPremium.sub(expectedRefund).add(1);

    const poolEthBalanceBefore = await ethers.provider.getBalance(pool.address);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: increasedAmount,
        period,
        maxPremiumInAsset: extraPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: increasedAmount.toString() }],
      {
        value: extraPremium,
      },
    );

    const poolEthBalanceAfter = await ethers.provider.getBalance(pool.address);
    expect(poolEthBalanceAfter).to.equal(poolEthBalanceBefore.add(extraPremium));

    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period,
      amount: increasedAmount,
      gracePeriod,
      segmentId: 1,
    });
  });

  it('retrieves the premium difference from the user in NXM', async function () {
    const { cover, nxm, tokenController } = this;

    const [coverBuyer] = this.accounts.members;

    const { productId, coverAsset, period, amount, priceDenominator, targetPriceRatio } = coverBuyFixture;

    const NXM_ASSET_ID = 255;

    await nxm.mint(coverBuyer.address, parseEther('1000'));
    await nxm.connect(coverBuyer).approve(tokenController.address, parseEther('1000'));

    const { expectedPremium, segment, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const passedPeriod = BigNumber.from(10);
    const { start: startTimestamp } = await cover.coverSegments(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const increasedAmount = amount.mul(2);

    const expectedRefund = segment.amount
      .mul(targetPriceRatio)
      .mul(BigNumber.from(segment.period).sub(passedPeriod))
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    const expectedEditPremium = expectedPremium.mul(2);
    const extraPremium = expectedEditPremium.sub(expectedRefund).add(1);

    const userBalanceBefore = await nxm.balanceOf(coverBuyer.address);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: increasedAmount,
        period,
        maxPremiumInAsset: extraPremium,
        paymentAsset: NXM_ASSET_ID,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: increasedAmount.toString() }],
      {
        value: 0,
      },
    );

    const userBalanceAfter = await nxm.balanceOf(coverBuyer.address);

    expect(userBalanceAfter).to.equal(userBalanceBefore.sub(extraPremium));

    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period,
      amount: increasedAmount,
      gracePeriod,
      segmentId: 1,
    });
  });

  it('allows editing the cover multiple times against multiple staking pools', async function () {
    const { cover } = this;

    const [coverBuyer, manager] = this.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;

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

    const increasedCoverAmount = amount.mul(2);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: increasedCoverAmount,
        period,
        maxPremiumInAsset: expectedPremium.add(1),
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [
        { poolId: 1, skip: true, coverAmountInAsset: 0 },
        { poolId: 2, skip: false, coverAmountInAsset: amount },
      ],
      {
        value: expectedPremium.add(1),
      },
    );

    const buyerBalanceAfter = await ethers.provider.getBalance(coverBuyer.address);
    expect(buyerBalanceAfter).to.be.lt(buyerBalanceBefore.sub(expectedPremium));

    const firstEditSegment = 1;
    const segment = await cover.coverSegments(expectedCoverId, firstEditSegment);

    {
      const pool1Allocation = await cover.coverSegmentAllocations(expectedCoverId, firstEditSegment, 0);
      expect(pool1Allocation.poolId).to.be.equal(1);
      expect(pool1Allocation.coverAmountInNXM).to.be.equal(amount);

      const pool2Allocation = await cover.coverSegmentAllocations(expectedCoverId, firstEditSegment, 1);
      expect(pool2Allocation.poolId).to.be.equal(2);
      expect(pool2Allocation.coverAmountInNXM).to.be.equal(amount);

      await assertCoverFields(cover, expectedCoverId, {
        productId,
        coverAsset,
        period,
        amount: increasedCoverAmount,
        gracePeriod,
        segmentId: firstEditSegment,
      });
    }

    const passedPeriod = BigNumber.from(10);
    const { start: startTimestamp } = await cover.coverSegments(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const increasedPoolAmount = amount.mul(2);

    const expectedRefund = segment.amount
      .mul(targetPriceRatio)
      .mul(BigNumber.from(segment.period).sub(passedPeriod))
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    const expectedEditPremium = expectedPremium.mul(2).mul(2);
    const extraPremium = expectedEditPremium.sub(expectedRefund);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: increasedPoolAmount.mul(2),
        period,
        maxPremiumInAsset: extraPremium.add(1),
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [
        { poolId: 1, skip: false, coverAmountInAsset: increasedPoolAmount },
        { poolId: 2, skip: false, coverAmountInAsset: increasedPoolAmount },
      ],
      {
        value: extraPremium.add(1),
      },
    );

    const secondEditSegment = 2;

    {
      const pool1Allocation = await cover.coverSegmentAllocations(expectedCoverId, secondEditSegment, 0);
      expect(pool1Allocation.poolId).to.be.equal(1);
      expect(pool1Allocation.coverAmountInNXM).to.be.equal(increasedPoolAmount);

      const pool2Allocation = await cover.coverSegmentAllocations(expectedCoverId, secondEditSegment, 1);
      expect(pool2Allocation.poolId).to.be.equal(2);
      expect(pool2Allocation.coverAmountInNXM).to.be.equal(increasedPoolAmount);

      await assertCoverFields(cover, expectedCoverId, {
        productId,
        coverAsset,
        period,
        amount: increasedPoolAmount.mul(2),
        gracePeriod,
        segmentId: secondEditSegment,
      });
    }
  });

  it('creates a segment and does not affect other state all pools are skipped', async function () {
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

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium.mul(2),
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: 1, skip: true, coverAmountInAsset: amount.mul(2) }],
      {
        value: expectedPremium.mul(2),
      },
    );

    const firstEditSegment = 1;
    {
      const pool1Allocation = await cover.coverSegmentAllocations(expectedCoverId, firstEditSegment, 0);
      expect(pool1Allocation.poolId).to.be.equal(1);
      expect(pool1Allocation.coverAmountInNXM).to.be.equal(amount);

      await assertCoverFields(cover, expectedCoverId, {
        productId,
        coverAsset,
        period,
        amount,
        gracePeriod,
        segmentId: firstEditSegment,
      });
    }
  });

  it('reverts if incorrect pool id in request array', async function () {
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

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: expectedCoverId,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: expectedPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: 2, skip: false, coverAmountInAsset: amount }],
        {
          value: expectedPremium,
        },
      ),
    ).to.be.revertedWithCustomError(cover, 'UnexpectedPoolId');
  });

  // TODO: update test after totalActiveCoverInAsset is implemented in buckets
  it.skip('correctly updates totalActiveCoverInAsset', async function () {
    const { cover } = this;

    const [coverBuyer] = this.accounts.members;

    const { productId, coverAsset, period, amount, priceDenominator, targetPriceRatio } = coverBuyFixture;

    {
      const totalActiveCoverInAsset = await cover.totalActiveCoverInAsset(coverAsset);
      expect(totalActiveCoverInAsset).to.equal(0);
    }

    const { expectedPremium, segment, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    {
      const totalActiveCoverInAsset = await cover.totalActiveCoverInAsset(coverAsset);
      expect(totalActiveCoverInAsset).to.equal(amount);
    }

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
      [{ poolId: 1, coverAmountInAsset: increasedAmount.toString() }],
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
      segmentId: 1,
    });

    {
      const totalActiveCoverInAsset = await cover.totalActiveCoverInAsset(coverAsset);
      // This currently fails
      expect(totalActiveCoverInAsset).to.equal(increasedAmount);
    }
  });
});

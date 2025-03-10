const { expect } = require('chai');
const { ethers } = require('hardhat');

const { setNextBlockTime } = require('../utils').evm;
const { daysToSeconds } = require('../utils').helpers;
const { assertCoverFields, buyCoverOnOnePool, MAX_COVER_PERIOD, createStakingPool } = require('./helpers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

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
    const fixture = await loadFixture(setup);
    const { cover } = fixture;
    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, priceDenominator, targetPriceRatio } = coverBuyFixture;
    const { storedCoverData, coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const passedPeriod = BigNumber.from(10);
    const editTimestamp = BigNumber.from(storedCoverData.start).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const increasedAmount = amount.mul(2);

    // premium for the new amount, without refunds
    const expectedNewPremium = increasedAmount
      .mul(targetPriceRatio)
      .mul(period)
      .div(priceDenominator)
      .div(3600 * 24 * 365);

    // refund for the unused period
    const expectedRefund = storedCoverData.amount
      .mul(targetPriceRatio)
      .mul(BigNumber.from(storedCoverData.period).sub(passedPeriod))
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    // difference to pay
    const extraPremium = expectedNewPremium.sub(expectedRefund);

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
      { value: extraPremium },
    );

    const editedCoverId = expectedCoverId.add(1);

    await assertCoverFields(cover, editedCoverId, {
      productId,
      coverAsset,
      period,
      amount: increasedAmount,
      gracePeriod,
    });
  });

  it('should allow to reduce amount', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount } = coverBuyFixture;

    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

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

    const editedCoverId = expectedCoverId.add(1);

    await assertCoverFields(cover, editedCoverId, {
      productId,
      coverAsset,
      period,
      amount: reducedAmount,
      gracePeriod,
      segmentId: 1,
    });
  });

  it('should edit purchased cover and add coverage from a new staking pool', async function () {
    const fixture = await loadFixture(setup);
    const { cover, stakingProducts } = fixture;
    const [coverBuyer, manager] = fixture.accounts.members;
    const { productId, coverAsset, period, amount, priceDenominator, targetPriceRatio } = coverBuyFixture;

    const { storedCoverData, coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    await createStakingPool(
      stakingProducts,
      productId,
      parseEther('10000'), // capacity
      coverBuyFixture.targetPriceRatio, // targetPrice
      0, // activeCover
      manager, // manager
      coverBuyFixture.targetPriceRatio, // currentPrice
    );

    const buyerBalanceBefore = await ethers.provider.getBalance(coverBuyer.address);

    const passedPeriod = BigNumber.from(10);
    const editTimestamp = BigNumber.from(storedCoverData.start).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const increasedAmount = amount.mul(2);

    // premium for the new amount, without refunds
    const expectedNewPremium = increasedAmount
      .mul(targetPriceRatio)
      .mul(period)
      .div(priceDenominator)
      .div(3600 * 24 * 365);

    // refund for the unused period
    const expectedRefund = storedCoverData.amount
      .mul(targetPriceRatio)
      .mul(BigNumber.from(storedCoverData.period).sub(passedPeriod))
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    // difference to pay
    const extraPremium = expectedNewPremium.sub(expectedRefund);

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
      [
        { poolId: 1, coverAmountInAsset: 0 },
        { poolId: 2, coverAmountInAsset: increasedAmount },
      ],
      {
        value: extraPremium,
      },
    );

    const editedCoverId = expectedCoverId.add(1);

    const buyerBalanceAfter = await ethers.provider.getBalance(coverBuyer.address);
    expect(buyerBalanceAfter).to.be.lt(buyerBalanceBefore.sub(extraPremium));

    const poolAllocations = await cover.getPoolAllocations(editedCoverId);
    expect(poolAllocations.length).to.be.equal(2);
    expect(poolAllocations[0].coverAmountInNXM).to.be.equal(0);
    expect(poolAllocations[1].coverAmountInNXM).to.be.equal(increasedAmount);

    await assertCoverFields(cover, editedCoverId, {
      productId,
      coverAsset,
      period,
      amount: increasedAmount,
      gracePeriod,
    });
  });

  it('should edit purchased cover and increase period', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;

    const { storedCoverData, coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const passedPeriod = BigNumber.from(10);
    const editTimestamp = BigNumber.from(storedCoverData.start).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const expectedRefund = storedCoverData.amount
      .mul(targetPriceRatio)
      .mul(BigNumber.from(storedCoverData.period).sub(passedPeriod))
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    const increasedPeriod = period * 2;

    // premium for the new amount, without refunds
    const expectedEditPremium = amount
      .mul(targetPriceRatio)
      .mul(increasedPeriod)
      .div(priceDenominator)
      .div(3600 * 24 * 365);

    const extraPremium = expectedEditPremium.sub(expectedRefund);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount,
        period: increasedPeriod,
        maxPremiumInAsset: extraPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: amount.toString() }],
      {
        value: extraPremium,
      },
    );

    const editedCoverId = expectedCoverId.add(1);

    await assertCoverFields(cover, editedCoverId, {
      productId,
      coverAsset,
      period: increasedPeriod,
      amount,
      gracePeriod,
    });
  });

  it('should allow to reduce period', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount } = coverBuyFixture;

    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

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
      [{ poolId: 1, coverAmountInAsset: amount.toString() }],
      {
        value: 0,
      },
    );

    const editedCoverId = expectedCoverId.add(1);

    await assertCoverFields(cover, editedCoverId, {
      productId,
      coverAsset,
      period: reducedPeriod,
      amount,
      gracePeriod,
    });
  });

  it('should edit purchased cover and increase period and amount', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;

    const { storedCoverData } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const passedPeriod = BigNumber.from(10);
    const editTimestamp = BigNumber.from(storedCoverData.start).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const expectedRefund = storedCoverData.amount
      .mul(targetPriceRatio)
      .mul(BigNumber.from(storedCoverData.period).sub(passedPeriod))
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    const increasedAmount = amount.mul(2);
    const increasedPeriod = period * 2;

    // premium for the new amount, without refunds
    const expectedEditPremium = increasedAmount
      .mul(targetPriceRatio)
      .mul(increasedPeriod)
      .div(priceDenominator)
      .div(3600 * 24 * 365);

    const extraPremium = expectedEditPremium.sub(expectedRefund);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: increasedAmount,
        period: increasedPeriod,
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

    const editedCoverId = expectedCoverId.add(1);

    await assertCoverFields(cover, editedCoverId, {
      productId,
      coverAsset,
      period: increasedPeriod,
      amount: increasedAmount,
      gracePeriod,
    });
  });

  it('should edit purchased cover and increase period and decrease amount', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;

    await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const { storedCoverData, coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const passedPeriod = BigNumber.from(10);
    const editTimestamp = BigNumber.from(storedCoverData.start).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const expectedRefund = storedCoverData.amount
      .mul(targetPriceRatio)
      .mul(BigNumber.from(storedCoverData.period).sub(passedPeriod))
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    const decreasedAmount = amount.div(2);
    const increasedPeriod = period * 2;

    // premium for the new amount, without refunds
    const expectedEditPremium = decreasedAmount
      .mul(targetPriceRatio)
      .mul(increasedPeriod)
      .div(priceDenominator)
      .div(3600 * 24 * 365);

    const extraPremium = expectedEditPremium.sub(expectedRefund);

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
      [{ poolId: 1, coverAmountInAsset: decreasedAmount.toString() }],
      {
        value: extraPremium,
      },
    );

    const editedCoverId = expectedCoverId.add(1);

    await assertCoverFields(cover, editedCoverId, {
      productId,
      coverAsset,
      period: increasedPeriod,
      amount: decreasedAmount,
      gracePeriod,
      segmentId: '1',
    });
  });

  it('should allow to reduce period and increase amount', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;
    const [coverBuyer] = fixture.accounts.members;

    const {
      productId,
      coverAsset,
      period: reducedPeriod,
      amount,
      targetPriceRatio,
      priceDenominator,
    } = coverBuyFixture;

    const period = BigNumber.from(reducedPeriod).mul(2);

    await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, { ...coverBuyFixture, period });

    const coverData = await cover.getCoverData(expectedCoverId);
    const passedPeriod = BigNumber.from(10);
    const editTimestamp = BigNumber.from(coverData.start).add(10);

    const expectedRefund = coverData.amount
      .mul(targetPriceRatio)
      .mul(BigNumber.from(coverData.period).sub(passedPeriod))
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    const increasedAmount = amount.mul(2);
    const decreasedPeriod = period.div(2);

    // premium for the new amount, without refunds
    const expectedEditPremium = increasedAmount
      .mul(targetPriceRatio)
      .mul(decreasedPeriod)
      .div(priceDenominator)
      .div(3600 * 24 * 365);

    const extraPremium = expectedEditPremium.sub(expectedRefund);

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
      [{ poolId: 1, coverAmountInAsset: increasedAmount.toString() }],
      {
        value: extraPremium,
      },
    );

    const editedCoverId = expectedCoverId.add(1);

    await assertCoverFields(cover, editedCoverId, {
      productId,
      coverAsset,
      period: reducedPeriod,
      amount: increasedAmount,
      gracePeriod,
    });
  });

  it('should allow to reduce period and reduce amount', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount } = coverBuyFixture;

    await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, {
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
      [{ poolId: 1, coverAmountInAsset: reducedAmount.toString() }],
      {
        value: 0,
      },
    );

    const editedCoverId = expectedCoverId.add(1);

    await assertCoverFields(cover, editedCoverId, {
      productId,
      coverAsset,
      period: reducedPeriod,
      amount: reducedAmount,
      gracePeriod,
    });
  });

  it('should fail to edit an expired cover', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, targetPriceRatio, priceDenominator, coverAsset, period, amount } = coverBuyFixture;
    const { storedCoverData, coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const expectedRefund = storedCoverData.amount
      .mul(targetPriceRatio)
      .mul(storedCoverData.period)
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    const increasedAmount = amount.mul(2);

    // premium for the new amount, without refunds
    const expectedEditPremium = increasedAmount
      .mul(targetPriceRatio)
      .mul(period)
      .div(priceDenominator)
      .div(3600 * 24 * 365);

    const extraPremium = expectedEditPremium.sub(expectedRefund);

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
          maxPremiumInAsset: extraPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount }],
        { value: extraPremium },
      ),
    ).to.be.revertedWithCustomError(cover, 'ExpiredCoversCannotBeEdited');
  });

  it('should revert when period is too long', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, amount, priceDenominator, targetPriceRatio } = coverBuyFixture;

    const { storedCoverData, coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const expectedRefund = storedCoverData.amount
      .mul(targetPriceRatio)
      .mul(storedCoverData.period)
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);
    const increasedAmount = amount.mul(2);

    // premium for the new amount, without refunds
    const expectedEditPremium = increasedAmount
      .mul(targetPriceRatio)
      .mul(storedCoverData.period)
      .div(priceDenominator)
      .div(3600 * 24 * 365);
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
      ),
    ).to.be.revertedWithCustomError(cover, 'CoverPeriodTooLong');
  });

  it('should revert when commission rate too high', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;
    const { MAX_COMMISSION_RATIO } = fixture.config;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, amount, period, priceDenominator, targetPriceRatio } = coverBuyFixture;

    // await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const { storedCoverData, coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const expectedRefund = storedCoverData.amount
      .mul(targetPriceRatio)
      .mul(storedCoverData.period)
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);
    const increasedAmount = amount.mul(2);

    // premium for the new amount, without refunds
    const expectedEditPremium = increasedAmount
      .mul(targetPriceRatio)
      .mul(period)
      .div(priceDenominator)
      .div(3600 * 24 * 365);

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
        [{ poolId: 1, coverAmountInAsset: increasedAmount.toString() }],
        {
          value: extraPremium,
        },
      ),
    ).to.be.revertedWithCustomError(cover, 'CommissionRateTooHigh');
  });

  it('should store new grace period when editing cover', async function () {
    const fixture = await loadFixture(setup);
    const { cover, coverProducts } = fixture;
    const [boardMember] = fixture.accounts.advisoryBoardMembers;
    const [coverBuyer] = fixture.accounts.members;

    const { productId, targetPriceRatio, priceDenominator, coverAsset, amount, period } = coverBuyFixture;

    // Buy cover
    const { storedCoverData, coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    // Edit product gracePeriod
    const productTypeBefore = await coverProducts.getProductType(productId);
    const newGracePeriod = daysToSeconds(1000);

    await coverProducts
      .connect(boardMember)
      .setProductTypes([['Product A', productId, 'ipfs hash', [1, newGracePeriod]]]);
    const productType = await coverProducts.getProductType(productId);
    expect(newGracePeriod).to.be.equal(productType.gracePeriod);

    const passedPeriod = BigNumber.from(10);

    const expectedRefund = storedCoverData.amount
      .mul(targetPriceRatio)
      .mul(BigNumber.from(storedCoverData.period).sub(passedPeriod))
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);
    // const increasedAmount = amount.mul(2);

    // premium for the new amount, without refunds
    const expectedEditPremium = amount
      .mul(targetPriceRatio)
      .mul(period)
      .div(priceDenominator)
      .div(3600 * 24 * 365);

    const extraPremium = expectedEditPremium.sub(expectedRefund);

    // const { start: startTimestamp } = await cover.coverSegmentWithRemainingAmount(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(storedCoverData.start).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: extraPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      { value: extraPremium },
    );

    const editedCoverId = expectedCoverId.add(1);
    const editedCoverData = await cover.getCoverData(editedCoverId);

    // const secondSegment = await cover.coverSegmentWithRemainingAmount(expectedCoverId, 1);
    expect(editedCoverData.gracePeriod).to.be.equal(newGracePeriod);
    expect(productTypeBefore.gracePeriod).to.be.equal(storedCoverData.gracePeriod);
  });

  it('reverts if caller is not NFT owner or approved', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;

    const [coverBuyer, otherUser] = fixture.accounts.members;

    const { productId, targetPriceRatio, priceDenominator, coverAsset, period, amount } = coverBuyFixture;
    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const increasedAmount = amount.mul(2);

    // premium for the new amount, without refunds
    const expectedEditPremium = increasedAmount
      .mul(targetPriceRatio)
      .mul(period)
      .div(priceDenominator)
      .div(3600 * 24 * 365);
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
        [{ poolId: 1, coverAmountInAsset: increasedAmount }],
        { value: extraPremium.add(10) },
      ),
    ).to.be.revertedWithCustomError(cover, 'OnlyOwnerOrApproved');
  });

  it('reverts if invalid coverId', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, targetPriceRatio, priceDenominator, coverAsset, period, amount } = coverBuyFixture;
    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const increasedAmount = amount.mul(2);

    // premium for the new amount, without refunds
    const expectedEditPremium = increasedAmount
      .mul(targetPriceRatio)
      .mul(period)
      .div(priceDenominator)
      .div(3600 * 24 * 365);
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
          maxPremiumInAsset: expectedEditPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount }],
        { value: extraPremium },
      ),
    ).to.be.revertedWith('NOT_MINTED');
  });

  it('reverts if period is too short', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, amount, priceDenominator, targetPriceRatio } = coverBuyFixture;

    const { storedCoverData, coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const expectedRefund = storedCoverData.amount
      .mul(targetPriceRatio)
      .mul(storedCoverData.period)
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);
    const increasedAmount = amount.mul(2);

    // premium for the new amount, without refunds
    const expectedEditPremium = increasedAmount
      .mul(targetPriceRatio)
      .mul(storedCoverData.period)
      .div(priceDenominator)
      .div(3600 * 24 * 365);
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
        [{ poolId: 1, coverAmountInAsset: increasedAmount.toString() }],
        {
          value: extraPremium,
        },
      ),
    ).to.be.revertedWithCustomError(cover, 'CoverPeriodTooShort');
  });

  it('reverts if calculated premium is bigger than maxPremiumInAsset', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, amount, period, priceDenominator, targetPriceRatio } = coverBuyFixture;

    const { storedCoverData, coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const expectedRefund = storedCoverData.amount
      .mul(targetPriceRatio)
      .mul(storedCoverData.period)
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    const increasedAmount = amount.mul(2);

    // premium for the new amount, without refunds
    const expectedEditPremium = increasedAmount
      .mul(targetPriceRatio)
      .mul(period)
      .div(priceDenominator)
      .div(3600 * 24 * 365);
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
        [{ poolId: 1, coverAmountInAsset: increasedAmount.toString() }],
        {
          value: extraPremium,
        },
      ),
    ).to.be.revertedWithCustomError(cover, 'PriceExceedsMaxPremiumInAsset');
  });

  it('works if caller is the owner of the NFT', async function () {
    const fixture = await loadFixture(setup);
    const { cover, coverNFT } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;
    const { storedCoverData, coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const passedPeriod = BigNumber.from(10);
    const editTimestamp = BigNumber.from(storedCoverData.start).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const increasedAmount = amount.mul(2);
    const expectedRefund = storedCoverData.amount
      .mul(targetPriceRatio)
      .mul(BigNumber.from(storedCoverData.period).sub(passedPeriod))
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    // premium for the new amount, without refunds
    const expectedEditPremium = increasedAmount
      .mul(targetPriceRatio)
      .mul(period)
      .div(priceDenominator)
      .div(3600 * 24 * 365);

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
          maxPremiumInAsset: extraPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount }],
        { value: extraPremium },
      ),
    ).to.not.be.reverted;
  });

  it('works if caller approved by the owner of the NFT', async function () {
    const fixture = await loadFixture(setup);
    const { cover, coverNFT } = fixture;

    const [coverBuyer, otherUser] = fixture.accounts.members;

    const { productId, targetPriceRatio, priceDenominator, coverAsset, period, amount } = coverBuyFixture;
    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const increasedAmount = amount.mul(2);

    // premium for the new amount, without refunds
    const expectedEditPremium = increasedAmount
      .mul(targetPriceRatio)
      .mul(period)
      .div(priceDenominator)
      .div(3600 * 24 * 365);
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
          maxPremiumInAsset: expectedEditPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount }],
        { value: extraPremium },
      ),
    ).to.not.be.reverted;
  });

  it('reverts if incorrect cover asset', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;
    const { storedCoverData, coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const increasedAmount = amount.mul(2);
    const expectedRefund = storedCoverData.amount
      .mul(targetPriceRatio)
      .mul(storedCoverData.period)
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    // premium for the new amount, without refunds
    const expectedEditPremium = increasedAmount
      .mul(targetPriceRatio)
      .mul(period)
      .div(priceDenominator)
      .div(3600 * 24 * 365);
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
          maxPremiumInAsset: expectedEditPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount }],
        { value: extraPremium },
      ),
    ).to.be.revertedWithCustomError(cover, 'InvalidPaymentAsset');
  });

  it('reverts if incorrect productId', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;
    const { storedCoverData, coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const increasedAmount = amount.mul(2);
    const expectedRefund = storedCoverData.amount
      .mul(targetPriceRatio)
      .mul(storedCoverData.period)
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    // premium for the new amount, without refunds
    const expectedEditPremium = increasedAmount
      .mul(targetPriceRatio)
      .mul(period)
      .div(priceDenominator)
      .div(3600 * 24 * 365);

    const extraPremium = expectedEditPremium.sub(expectedRefund);

    const incorrectProductId = 10;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: expectedCoverId,
          owner: coverBuyer.address,
          productId: incorrectProductId,
          coverAsset,
          amount: increasedAmount,
          period,
          maxPremiumInAsset: expectedEditPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount }],
        { value: extraPremium },
      ),
    ).to.be.revertedWithCustomError(cover, 'ProductNotFound');
  });

  it('reverts if empty array of allocationRequests', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;
    const { storedCoverData, coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const increasedAmount = amount.mul(2);
    const expectedRefund = storedCoverData.amount
      .mul(targetPriceRatio)
      .mul(storedCoverData.period)
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    // premium for the new amount, without refunds
    const expectedEditPremium = increasedAmount
      .mul(targetPriceRatio)
      .mul(period)
      .div(priceDenominator)
      .div(3600 * 24 * 365);

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
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [],
        { value: extraPremium },
      ),
    ).to.be.revertedWithCustomError(cover, 'InsufficientCoverAmountAllocated');
  });

  it('emits CoverEdited event', async function () {
    const fixture = await loadFixture(setup);
    const { cover, coverNFT } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;
    const { storedCoverData, coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const passedPeriod = BigNumber.from(10);
    const editTimestamp = BigNumber.from(storedCoverData.start).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const increasedAmount = amount.mul(2);
    const expectedRefund = storedCoverData.amount
      .mul(targetPriceRatio)
      .mul(BigNumber.from(storedCoverData.period).sub(passedPeriod))
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    // premium for the new amount, without refunds
    const expectedEditPremium = increasedAmount
      .mul(targetPriceRatio)
      .mul(period)
      .div(priceDenominator)
      .div(3600 * 24 * 365);
    const extraPremium = expectedEditPremium.sub(expectedRefund);

    const coverOwner = await coverNFT.ownerOf(expectedCoverId);
    expect(coverOwner).to.be.equal(coverBuyer.address);

    const ipfsData = 'test data';
    const editedCoverId = expectedCoverId.add(1);

    await expect(
      cover.connect(coverBuyer).buyCover(
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
          ipfsData,
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount }],
        { value: extraPremium },
      ),
    )
      .to.emit(cover, 'CoverEdited')
      .withArgs(editedCoverId, productId, 0, coverBuyer.address, ipfsData);
  });

  it('retrieves the premium difference from the user in ETH', async function () {
    const fixture = await loadFixture(setup);
    const { cover, pool } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, priceDenominator, targetPriceRatio } = coverBuyFixture;

    const { storedCoverData, coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const passedPeriod = BigNumber.from(10);
    const editTimestamp = BigNumber.from(storedCoverData.start).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const increasedAmount = amount.mul(2);

    const expectedRefund = storedCoverData.amount
      .mul(targetPriceRatio)
      .mul(BigNumber.from(storedCoverData.period).sub(passedPeriod))
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    // premium for the new amount, without refunds
    const expectedEditPremium = increasedAmount
      .mul(targetPriceRatio)
      .mul(period)
      .div(priceDenominator)
      .div(3600 * 24 * 365);
    const extraPremium = expectedEditPremium.sub(expectedRefund);

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

    const editedCoverId = expectedCoverId.add(1);

    const poolEthBalanceAfter = await ethers.provider.getBalance(pool.address);
    expect(poolEthBalanceAfter).to.equal(poolEthBalanceBefore.add(extraPremium));

    await assertCoverFields(cover, editedCoverId, {
      productId,
      coverAsset,
      period,
      amount: increasedAmount,
      gracePeriod,
    });
  });

  it('retrieves the premium difference from the user in NXM', async function () {
    const fixture = await loadFixture(setup);
    const { cover, nxm, tokenController } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, priceDenominator, targetPriceRatio } = coverBuyFixture;

    const NXM_ASSET_ID = 255;

    await nxm.mint(coverBuyer.address, parseEther('1000'));
    await nxm.connect(coverBuyer).approve(tokenController.address, parseEther('1000'));

    const { storedCoverData, coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const passedPeriod = BigNumber.from(10);
    const editTimestamp = BigNumber.from(storedCoverData.start).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const increasedAmount = amount.mul(2);

    const expectedRefund = storedCoverData.amount
      .mul(targetPriceRatio)
      .mul(BigNumber.from(storedCoverData.period).sub(passedPeriod))
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    // premium for the new amount, without refunds
    const expectedEditPremium = increasedAmount
      .mul(targetPriceRatio)
      .mul(period)
      .div(priceDenominator)
      .div(3600 * 24 * 365);
    const extraPremium = expectedEditPremium.sub(expectedRefund);

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

    const editedCoverId = expectedCoverId.add(1);
    const userBalanceAfter = await nxm.balanceOf(coverBuyer.address);
    expect(userBalanceAfter).to.equal(userBalanceBefore.sub(extraPremium));

    await assertCoverFields(cover, editedCoverId, {
      productId,
      coverAsset,
      period,
      amount: increasedAmount,
      gracePeriod,
    });
  });

  it('allows editing the cover multiple times against multiple staking pools', async function () {
    const fixture = await loadFixture(setup);
    const { cover, stakingProducts } = fixture;

    const [coverBuyer, manager] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;

    const {
      storedCoverData,
      expectedPremium,
      coverId: expectedCoverId,
    } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    await createStakingPool(
      stakingProducts,
      productId,
      parseEther('10000'), // capacity
      coverBuyFixture.targetPriceRatio, // targetPrice
      0, // activeCover
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
        maxPremiumInAsset: expectedPremium.add(1),
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [
        { poolId: 1, coverAmountInAsset: 0 },
        { poolId: 2, coverAmountInAsset: amount },
      ],
      {
        value: expectedPremium.add(1),
      },
    );

    const firstEditId = expectedCoverId.add(1);

    {
      const poolAllocations = await cover.getPoolAllocations(firstEditId);
      expect(poolAllocations[0].poolId).to.be.equal(1);
      expect(poolAllocations[0].coverAmountInNXM).to.be.equal(0);
      expect(poolAllocations[1].poolId).to.be.equal(2);
      expect(poolAllocations[1].coverAmountInNXM).to.be.equal(amount);

      await assertCoverFields(cover, firstEditId, {
        productId,
        coverAsset,
        period,
        amount,
        gracePeriod,
      });
    }

    const passedPeriod = BigNumber.from(10);
    const editTimestamp = BigNumber.from(storedCoverData.start).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const increasedPoolAmount = amount.mul(2);

    const expectedRefund = storedCoverData.amount
      .mul(targetPriceRatio)
      .mul(BigNumber.from(storedCoverData.period).sub(passedPeriod))
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    // premium for the new amount, without refunds
    const expectedEditPremium = increasedPoolAmount
      .mul(targetPriceRatio)
      .mul(period)
      .div(priceDenominator)
      .div(3600 * 24 * 365)
      .mul(2); // for 2 pools

    const extraPremium = expectedEditPremium.sub(expectedRefund);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: increasedPoolAmount.mul(2),
        period,
        maxPremiumInAsset: extraPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [
        { poolId: 1, coverAmountInAsset: increasedPoolAmount },
        { poolId: 2, coverAmountInAsset: increasedPoolAmount },
      ],
      {
        value: extraPremium,
      },
    );

    const secondEditId = firstEditId.add(1);

    {
      const poolAllocations = await cover.getPoolAllocations(secondEditId);
      expect(poolAllocations[0].poolId).to.be.equal(1);
      expect(poolAllocations[0].coverAmountInNXM).to.be.equal(increasedPoolAmount);
      expect(poolAllocations[1].poolId).to.be.equal(2);
      expect(poolAllocations[1].coverAmountInNXM).to.be.equal(increasedPoolAmount);

      await assertCoverFields(cover, secondEditId, {
        productId,
        coverAsset,
        period,
        amount: increasedPoolAmount.mul(2),
        gracePeriod,
      });
    }
  });

  it('reverts if incorrect pool id in request array', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount } = coverBuyFixture;

    const { expectedPremium, coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

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
        [{ poolId: 2, coverAmountInAsset: amount }],
        {
          value: expectedPremium,
        },
      ),
    ).to.be.reverted;
  });

  it('correctly updates totalActiveCoverInAsset', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, priceDenominator, targetPriceRatio } = coverBuyFixture;

    {
      const totalActiveCoverInAsset = await cover.totalActiveCoverInAsset(coverAsset);
      expect(totalActiveCoverInAsset).to.equal(0);
    }

    const { storedCoverData, coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    {
      const totalActiveCoverInAsset = await cover.totalActiveCoverInAsset(coverAsset);
      expect(totalActiveCoverInAsset).to.equal(amount);
    }

    const passedPeriod = BigNumber.from(10);
    const editTimestamp = BigNumber.from(storedCoverData.start).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const increasedAmount = amount.mul(2);

    // premium for the new amount, without refunds
    const expectedNewPremium = increasedAmount
      .mul(targetPriceRatio)
      .mul(period)
      .div(priceDenominator)
      .div(3600 * 24 * 365);

    // refund for the unused period
    const expectedRefund = storedCoverData.amount
      .mul(targetPriceRatio)
      .mul(BigNumber.from(storedCoverData.period).sub(passedPeriod))
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);

    // difference to pay
    const extraPremium = expectedNewPremium.sub(expectedRefund);

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
      [{ poolId: 1, coverAmountInAsset: increasedAmount }],
      {
        value: extraPremium.add(1),
      },
    );

    const editedCoverId = expectedCoverId.add(1);

    await assertCoverFields(cover, editedCoverId, {
      productId,
      coverAsset,
      period,
      amount: increasedAmount,
      gracePeriod,
    });

    const totalActiveCoverInAsset = await cover.totalActiveCoverInAsset(coverAsset);
    expect(totalActiveCoverInAsset).to.equal(increasedAmount);
  });

  it('cover references should have same ids if cover is not edited', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;
    const { coverId: originalCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const coverReference = await cover.getCoverReference(originalCoverId);
    expect(coverReference.originalCoverId).to.equal(originalCoverId);
    expect(coverReference.latestCoverId).to.equal(originalCoverId);
  });

  it('cover references should change after cover edit', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;
    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount } = coverBuyFixture;
    const { coverId: originalCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const reducedPeriod = period - daysToSeconds(1);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: originalCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: 1,
        period: reducedPeriod,
        maxPremiumInAsset: 0,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: amount.toString() }],
    );

    const editedCoverId = originalCoverId.add(1);
    const coverReferenceForOriginalId = await cover.getCoverReference(originalCoverId);
    const coverReferenceForEditedId = await cover.getCoverReference(editedCoverId);

    expect(coverReferenceForOriginalId.originalCoverId).to.equal(originalCoverId);
    expect(coverReferenceForOriginalId.latestCoverId).to.equal(editedCoverId);
    expect(coverReferenceForEditedId.originalCoverId).to.equal(originalCoverId);
  });

  it('cover reference latestCoverId should be correct after 2 edits', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;
    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount } = coverBuyFixture;
    const { coverId: originalCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const reducedPeriodFirstEdit = period - daysToSeconds(1);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: originalCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount,
        period: reducedPeriodFirstEdit,
        maxPremiumInAsset: 0,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: amount.toString() }],
    );

    const reducedPeriodSecondEdit = reducedPeriodFirstEdit - daysToSeconds(1);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: originalCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount,
        period: reducedPeriodSecondEdit,
        maxPremiumInAsset: 0,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: amount.toString() }],
    );

    const lastEditCoverId = originalCoverId.add(2);
    const coverReferenceForOriginalId = await cover.getCoverReference(originalCoverId);
    const coverReferenceForLastEditId = await cover.getCoverReference(lastEditCoverId);

    expect(coverReferenceForOriginalId.originalCoverId).to.equal(originalCoverId);
    expect(coverReferenceForOriginalId.latestCoverId).to.equal(lastEditCoverId);
    expect(coverReferenceForLastEditId.originalCoverId).to.equal(originalCoverId);
  });

  it('cover edit should revert if coverId is not original cover id', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;
    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount } = coverBuyFixture;
    const { coverId: originalCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const reducedPeriodFirstEdit = period - daysToSeconds(1);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: originalCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount,
        period: reducedPeriodFirstEdit,
        maxPremiumInAsset: 0,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: amount.toString() }],
    );

    const editedCoverId = originalCoverId.add(1);

    const reducedPeriodSecondEdit = reducedPeriodFirstEdit - daysToSeconds(1);

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: editedCoverId,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period: reducedPeriodSecondEdit,
          maxPremiumInAsset: 0,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: amount.toString() }],
      ),
    ).to.be.revertedWithCustomError(cover, 'MustBeOriginalCoverId');
  });
});

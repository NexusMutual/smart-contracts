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

function calculateMockEditPremium({
  existingAmount,
  increasedAmount,
  targetPriceRatio,
  period,
  priceDenominator,
  extraPeriod = BigNumber.from(0),
}) {
  const premium = increasedAmount
    .mul(targetPriceRatio)
    .mul(period)
    .div(priceDenominator)
    .div(3600 * 24 * 365);

  const remainingPeriod = BigNumber.from(period).sub(extraPeriod);
  const extraAmount = increasedAmount.sub(existingAmount);

  const extraPremium = premium
    .mul(extraAmount.gt(0) ? extraAmount : BigNumber.from(0))
    .mul(remainingPeriod)
    .div(increasedAmount)
    .div(period)
    .add(premium.mul(extraPeriod).div(period));

  return extraPremium;
}

function calculateRemainingPeriod({ period, passedPeriod }) {
  return BigNumber.from(period).sub(passedPeriod);
}

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
    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const passedPeriod = BigNumber.from(10);
    const { start: startTimestamp } = await cover.coverSegmentWithRemainingAmount(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const increasedAmount = amount.mul(2);

    const remainingPeriod = calculateRemainingPeriod({ period, passedPeriod });

    const extraPremium = calculateMockEditPremium({
      existingAmount: amount,
      increasedAmount,
      targetPriceRatio,
      period: remainingPeriod,
      priceDenominator,
    });

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: increasedAmount,
        period: '0', // no extra period
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

    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period: remainingPeriod,
      amount: increasedAmount,
      gracePeriod,
      segmentId: 1,
    });
  });

  it('should edit purchased cover and add coverage from a new staking pool', async function () {
    const fixture = await loadFixture(setup);
    const { cover, stakingProducts } = fixture;
    const [coverBuyer, manager] = fixture.accounts.members;
    const { productId, coverAsset, period, amount, priceDenominator } = coverBuyFixture;

    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    await createStakingPool(
      stakingProducts,
      productId,
      parseEther('10000'), // capacity
      coverBuyFixture.targetPriceRatio, // targetPrice
      0, // activeCover
      manager, // manager
      coverBuyFixture.targetPriceRatio, // currentPrice
    );

    const passedPeriod = BigNumber.from(10);
    const { start: startTimestamp } = await cover.coverSegmentWithRemainingAmount(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const buyerBalanceBefore = await ethers.provider.getBalance(coverBuyer.address);

    const increasedAmount = amount.mul(2);

    const remainingPeriod = calculateRemainingPeriod({ period, passedPeriod });

    const expectedPremium = calculateMockEditPremium({
      existingAmount: amount,
      increasedAmount,
      targetPriceRatio: coverBuyFixture.targetPriceRatio,
      period: remainingPeriod,
      priceDenominator,
    });

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: increasedAmount,
        period: '0', // no extra period
        maxPremiumInAsset: expectedPremium.add(1),
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [
        { poolId: 1, coverAmountInAsset: amount },
        { poolId: 2, coverAmountInAsset: amount },
      ],
      {
        value: expectedPremium,
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
      period: remainingPeriod,
      amount: increasedAmount,
      gracePeriod,
      segmentId: 1,
    });
  });

  it('should edit purchased cover and increase period', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;

    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const passedPeriod = BigNumber.from(10);
    const { start: startTimestamp } = await cover.coverSegmentWithRemainingAmount(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const remainingPeriod = calculateRemainingPeriod({ period, passedPeriod });

    const extraPeriod = period;
    const increasedPeriod = remainingPeriod.add(extraPeriod);

    const expectedPremium = calculateMockEditPremium({
      existingAmount: amount,
      increasedAmount: amount,
      targetPriceRatio,
      period: increasedPeriod,
      extraPeriod,
      priceDenominator,
    });

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount,
        period: extraPeriod,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: amount.toString() }],
      {
        value: expectedPremium,
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

  it('should edit purchased cover and increase period and amount', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;

    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const passedPeriod = BigNumber.from(10);
    const { start: startTimestamp } = await cover.coverSegmentWithRemainingAmount(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const remainingPeriod = calculateRemainingPeriod({ period, passedPeriod });

    const increasedAmount = amount.mul(3);
    const extraPeriod = period;
    const increasedPeriod = remainingPeriod.add(extraPeriod);

    const expectedPremium = calculateMockEditPremium({
      existingAmount: amount,
      increasedAmount,
      targetPriceRatio,
      period: increasedPeriod,
      extraPeriod,
      priceDenominator,
    });

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: increasedAmount,
        period: extraPeriod,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: increasedAmount.toString() }],
      {
        value: expectedPremium,
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

  it('should fail to edit an expired cover', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, targetPriceRatio, priceDenominator, coverAsset, period, amount } = coverBuyFixture;
    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const increasedAmount = amount.mul(2);

    const expectedPremium = calculateMockEditPremium({
      existingAmount: amount,
      increasedAmount,
      targetPriceRatio,
      period,
      extraPeriod: BigNumber.from('0'),
      priceDenominator,
    });

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
          maxPremiumInAsset: expectedPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount }],
        { value: expectedPremium },
      ),
    ).to.be.revertedWithCustomError(cover, 'ExpiredCoversCannotBeEdited');
  });

  it('should revert when period is too long', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, amount, priceDenominator, targetPriceRatio, period } = coverBuyFixture;

    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const passedPeriod = BigNumber.from(10);
    const { start: startTimestamp } = await cover.coverSegmentWithRemainingAmount(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const remainingPeriod = calculateRemainingPeriod({ period, passedPeriod });

    const periodTooLong = daysToSeconds(366);

    const extraPeriod = periodTooLong;
    const increasedPeriod = remainingPeriod.add(extraPeriod);

    const expectedPremium = calculateMockEditPremium({
      existingAmount: amount,
      increasedAmount: amount,
      targetPriceRatio,
      period: increasedPeriod,
      extraPeriod: BigNumber.from('0'),
      priceDenominator,
    });

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: expectedCoverId,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period: extraPeriod,
          maxPremiumInAsset: expectedPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: amount.toString() }],
        {
          value: expectedPremium,
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

    await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const increasedAmount = amount.mul(2);

    const expectedPremium = calculateMockEditPremium({
      existingAmount: amount,
      increasedAmount,
      targetPriceRatio,
      period,
      extraPeriod: BigNumber.from('0'),
      priceDenominator,
    });

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
          period: BigNumber.from(0),
          maxPremiumInAsset: expectedPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: MAX_COMMISSION_RATIO.add(1), // too high
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount.toString() }],
        {
          value: expectedPremium,
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
    const { segment, coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    // Edit product gracePeriod
    const productTypeBefore = await coverProducts.productTypes(productId);
    const newGracePeriod = daysToSeconds(1000);

    await coverProducts
      .connect(boardMember)
      .setProductTypes([['Product A', productId, 'ipfs hash', [1, newGracePeriod]]]);
    const productType = await coverProducts.productTypes(productId);
    expect(newGracePeriod).to.be.equal(productType.gracePeriod);

    const passedPeriod = BigNumber.from(10);

    const { start: startTimestamp } = await cover.coverSegmentWithRemainingAmount(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const increasedAmount = amount.mul(2);

    const expectedPremium = calculateMockEditPremium({
      existingAmount: amount,
      increasedAmount,
      targetPriceRatio,
      period,
      extraPeriod: BigNumber.from('0'),
      priceDenominator,
    });

    await cover.connect(coverBuyer).buyCover(
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
      [{ poolId: 1, coverAmountInAsset: amount }],
      { value: expectedPremium },
    );

    const secondSegment = await cover.coverSegmentWithRemainingAmount(expectedCoverId, 1);
    expect(secondSegment.gracePeriod).to.be.equal(newGracePeriod);
    expect(productTypeBefore.gracePeriod).to.be.equal(segment.gracePeriod);
  });

  it('reverts if caller is not NFT owner or approved', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;

    const [coverBuyer, otherUser] = fixture.accounts.members;

    const { productId, targetPriceRatio, priceDenominator, coverAsset, period, amount } = coverBuyFixture;
    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const passedPeriod = BigNumber.from(10);
    const { start: startTimestamp } = await cover.coverSegmentWithRemainingAmount(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const increasedAmount = amount.mul(2);

    const remainingPeriod = calculateRemainingPeriod({ period, passedPeriod });

    const extraPremium = calculateMockEditPremium({
      existingAmount: amount,
      increasedAmount,
      targetPriceRatio,
      period: remainingPeriod,
      priceDenominator,
    });

    await expect(
      cover.connect(otherUser).buyCover(
        {
          coverId: expectedCoverId,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount: increasedAmount,
          period: BigNumber.from(0),
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
    ).to.be.revertedWithCustomError(cover, 'OnlyOwnerOrApproved');
  });

  it('reverts if invalid coverId', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, targetPriceRatio, priceDenominator, coverAsset, period, amount } = coverBuyFixture;
    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const passedPeriod = BigNumber.from(10);
    const { start: startTimestamp } = await cover.coverSegmentWithRemainingAmount(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const increasedAmount = amount.mul(2);

    const remainingPeriod = calculateRemainingPeriod({ period, passedPeriod });

    const expectedPremium = calculateMockEditPremium({
      existingAmount: amount,
      increasedAmount,
      targetPriceRatio,
      period: remainingPeriod,
      priceDenominator,
    });

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
          maxPremiumInAsset: expectedPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount }],
        { value: expectedPremium },
      ),
    ).to.be.revertedWith('NOT_MINTED');
  });

  it('reverts if period is too short', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, amount, priceDenominator, targetPriceRatio, period } = coverBuyFixture;

    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const passedPeriod = daysToSeconds(15);
    const { start: startTimestamp } = await cover.coverSegmentWithRemainingAmount(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const remainingPeriod = calculateRemainingPeriod({ period, passedPeriod });

    const increasedAmount = amount.mul(2);
    const extraPeriodTooShort = daysToSeconds(5);

    const expectedPremium = calculateMockEditPremium({
      existingAmount: amount,
      increasedAmount,
      targetPriceRatio,
      period: remainingPeriod.add(extraPeriodTooShort),
      extraPeriod: BigNumber.from('0'),
      priceDenominator,
    });

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: expectedCoverId,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount: increasedAmount,
          period: extraPeriodTooShort,
          maxPremiumInAsset: expectedPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount.toString() }],
        {
          value: expectedPremium,
        },
      ),
    ).to.be.revertedWithCustomError(cover, 'CoverPeriodTooShort');
  });

  it('reverts if calculated premium is bigger than maxPremiumInAsset', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, amount, period, priceDenominator, targetPriceRatio } = coverBuyFixture;

    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const passedPeriod = BigNumber.from(10);
    const { start: startTimestamp } = await cover.coverSegmentWithRemainingAmount(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const increasedAmount = amount.mul(2);

    const remainingPeriod = calculateRemainingPeriod({ period, passedPeriod });

    const expectedPremium = calculateMockEditPremium({
      existingAmount: amount,
      increasedAmount,
      targetPriceRatio,
      period: remainingPeriod,
      priceDenominator,
    });

    const smallExpectedEditPremium = expectedPremium.div(10);

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: expectedCoverId,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount: increasedAmount,
          period: BigNumber.from(0),
          maxPremiumInAsset: smallExpectedEditPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount.toString() }],
        {
          value: expectedPremium,
        },
      ),
    ).to.be.revertedWithCustomError(cover, 'PriceExceedsMaxPremiumInAsset');
  });

  it('works if caller is the owner of the NFT', async function () {
    const fixture = await loadFixture(setup);
    const { cover, coverNFT } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, targetPriceRatio, priceDenominator, coverAsset, period, amount } = coverBuyFixture;
    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const passedPeriod = BigNumber.from(10);
    const { start: startTimestamp } = await cover.coverSegmentWithRemainingAmount(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const increasedAmount = amount.mul(2);

    const expectedPremium = calculateMockEditPremium({
      existingAmount: amount,
      increasedAmount,
      targetPriceRatio,
      period,
      extraPeriod: BigNumber.from('0'),
      priceDenominator,
    });

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
          period: BigNumber.from('0'),
          maxPremiumInAsset: expectedPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount }],
        { value: expectedPremium },
      ),
    ).to.not.be.reverted;
  });

  it('works if caller approved by the owner of the NFT', async function () {
    const fixture = await loadFixture(setup);
    const { cover, coverNFT } = fixture;

    const [coverBuyer, otherUser] = fixture.accounts.members;

    const { productId, targetPriceRatio, priceDenominator, coverAsset, period, amount } = coverBuyFixture;
    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const passedPeriod = BigNumber.from(10);
    const { start: startTimestamp } = await cover.coverSegmentWithRemainingAmount(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const increasedAmount = amount.mul(2);

    const expectedPremium = calculateMockEditPremium({
      existingAmount: amount,
      increasedAmount,
      targetPriceRatio,
      period,
      extraPeriod: BigNumber.from('0'),
      priceDenominator,
    });

    await coverNFT.connect(coverBuyer).approve(otherUser.address, expectedCoverId);

    await expect(
      cover.connect(otherUser).buyCover(
        {
          coverId: expectedCoverId,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount: increasedAmount,
          period: BigNumber.from(0),
          maxPremiumInAsset: expectedPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount }],
        { value: expectedPremium },
      ),
    ).to.not.be.reverted;
  });

  it('reverts if incorrect cover asset', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;
    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const passedPeriod = BigNumber.from(10);
    const { start: startTimestamp } = await cover.coverSegmentWithRemainingAmount(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const increasedAmount = amount.mul(2);

    const remainingPeriod = calculateRemainingPeriod({ period, passedPeriod });

    const expectedPremium = calculateMockEditPremium({
      existingAmount: amount,
      increasedAmount,
      targetPriceRatio,
      period: remainingPeriod,
      priceDenominator,
    });

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
          maxPremiumInAsset: expectedPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount }],
        { value: expectedPremium },
      ),
    ).to.be.revertedWithCustomError(cover, 'UnexpectedCoverAsset');
  });

  it('reverts if incorrect productId', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;
    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const passedPeriod = BigNumber.from(10);
    const { start: startTimestamp } = await cover.coverSegmentWithRemainingAmount(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const increasedAmount = amount.mul(2);

    const remainingPeriod = calculateRemainingPeriod({ period, passedPeriod });

    const expectedPremium = calculateMockEditPremium({
      existingAmount: amount,
      increasedAmount,
      targetPriceRatio,
      period: remainingPeriod,
      priceDenominator,
    });

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
          maxPremiumInAsset: expectedPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount }],
        { value: expectedPremium },
      ),
    ).to.be.revertedWithCustomError(cover, 'UnexpectedProductId');
  });

  it('reverts if empty array of allocationRequests', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;
    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const passedPeriod = BigNumber.from(10);
    const { start: startTimestamp } = await cover.coverSegmentWithRemainingAmount(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const increasedAmount = amount.mul(2);

    const remainingPeriod = calculateRemainingPeriod({ period, passedPeriod });

    const expectedPremium = calculateMockEditPremium({
      existingAmount: amount,
      increasedAmount,
      targetPriceRatio,
      period: remainingPeriod,
      priceDenominator,
    });

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: expectedCoverId,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount: increasedAmount,
          period,
          maxPremiumInAsset: expectedPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [],
        { value: expectedPremium },
      ),
    ).to.be.revertedWithCustomError(cover, 'InsufficientCoverAmountAllocated');
  });

  it('emits CoverEdited event', async function () {
    const fixture = await loadFixture(setup);
    const { cover, coverNFT } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;
    const { coverId: expectedCoverId, segmentId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const passedPeriod = BigNumber.from(10);
    const { start: startTimestamp } = await cover.coverSegmentWithRemainingAmount(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const increasedAmount = amount.mul(2);
    const expectedPremium = calculateMockEditPremium({
      existingAmount: amount,
      increasedAmount,
      targetPriceRatio,
      period,
      extraPeriod: BigNumber.from('0'),
      priceDenominator,
    });

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
          period: BigNumber.from('0'),
          maxPremiumInAsset: expectedPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData,
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount }],
        { value: expectedPremium },
      ),
    )
      .to.emit(cover, 'CoverEdited')
      .withArgs(expectedCoverId, productId, newSegmentId, coverBuyer.address, ipfsData);
  });

  it('retrieves the premium difference from the user in ETH', async function () {
    const fixture = await loadFixture(setup);
    const { cover, pool } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, priceDenominator, targetPriceRatio } = coverBuyFixture;

    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const passedPeriod = BigNumber.from(10);
    const { start: startTimestamp } = await cover.coverSegmentWithRemainingAmount(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const remainingPeriod = calculateRemainingPeriod({ period, passedPeriod });

    const increasedAmount = amount.mul(2);
    const expectedPremium = calculateMockEditPremium({
      existingAmount: amount,
      increasedAmount,
      targetPriceRatio,
      period: remainingPeriod,
      extraPeriod: BigNumber.from('0'),
      priceDenominator,
    });

    const poolEthBalanceBefore = await ethers.provider.getBalance(pool.address);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: increasedAmount,
        period: BigNumber.from('0'),
        maxPremiumInAsset: expectedPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: increasedAmount.toString() }],
      {
        value: expectedPremium,
      },
    );

    const poolEthBalanceAfter = await ethers.provider.getBalance(pool.address);
    expect(poolEthBalanceAfter).to.equal(poolEthBalanceBefore.add(expectedPremium));

    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period: remainingPeriod,
      amount: increasedAmount,
      gracePeriod,
      segmentId: 1,
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

    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const passedPeriod = BigNumber.from(10);
    const { start: startTimestamp } = await cover.coverSegmentWithRemainingAmount(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const remainingPeriod = calculateRemainingPeriod({ period, passedPeriod });

    const increasedAmount = amount.mul(2);
    const expectedPremium = calculateMockEditPremium({
      existingAmount: amount,
      increasedAmount,
      targetPriceRatio,
      period: remainingPeriod,
      extraPeriod: BigNumber.from('0'),
      priceDenominator,
    });

    const userBalanceBefore = await nxm.balanceOf(coverBuyer.address);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: increasedAmount,
        period: BigNumber.from(0),
        maxPremiumInAsset: expectedPremium,
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

    expect(userBalanceAfter).to.equal(userBalanceBefore.sub(expectedPremium));

    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period: remainingPeriod,
      amount: increasedAmount,
      gracePeriod,
      segmentId: 1,
    });
  });

  it('allows editing the cover multiple times against multiple staking pools', async function () {
    const fixture = await loadFixture(setup);
    const { cover, stakingProducts } = fixture;

    const [coverBuyer, manager] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;

    await createStakingPool(
      stakingProducts,
      productId,
      parseEther('10000'), // capacity
      coverBuyFixture.targetPriceRatio, // targetPrice
      0, // activeCover
      manager, // manager
      coverBuyFixture.targetPriceRatio, // currentPrice
    );

    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);
    {
      const passedPeriod = BigNumber.from(10);
      const { start: startTimestamp } = await cover.coverSegmentWithRemainingAmount(expectedCoverId, 0);
      const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
      await setNextBlockTime(editTimestamp.toNumber());

      const remainingPeriod = calculateRemainingPeriod({ period, passedPeriod });

      const buyerBalanceBefore = await ethers.provider.getBalance(coverBuyer.address);
      const increasedAmount = amount.mul(2);

      const expectedPremium = calculateMockEditPremium({
        existingAmount: amount,
        increasedAmount,
        targetPriceRatio,
        period: remainingPeriod,
        extraPeriod: BigNumber.from('0'),
        priceDenominator,
      });

      await cover.connect(coverBuyer).buyCover(
        {
          coverId: expectedCoverId,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount: increasedAmount,
          period: BigNumber.from(0),
          maxPremiumInAsset: expectedPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [
          { poolId: 1, coverAmountInAsset: amount },
          { poolId: 2, coverAmountInAsset: amount },
        ],
        {
          value: expectedPremium.add(1),
        },
      );

      const buyerBalanceAfter = await ethers.provider.getBalance(coverBuyer.address);
      expect(buyerBalanceAfter).to.be.lt(buyerBalanceBefore.sub(expectedPremium));

      const firstEditSegment = 1;

      const pool1Allocation = await cover.coverSegmentAllocations(expectedCoverId, firstEditSegment, 0);
      expect(pool1Allocation.poolId).to.be.equal(1);
      expect(pool1Allocation.coverAmountInNXM).to.be.equal(amount);

      const pool2Allocation = await cover.coverSegmentAllocations(expectedCoverId, firstEditSegment, 1);
      expect(pool2Allocation.poolId).to.be.equal(2);
      expect(pool2Allocation.coverAmountInNXM).to.be.equal(amount);

      await assertCoverFields(cover, expectedCoverId, {
        productId,
        coverAsset,
        period: remainingPeriod,
        amount: increasedAmount,
        gracePeriod,
        segmentId: firstEditSegment,
      });
    }

    {
      const passedPeriod = BigNumber.from(10);
      const { start: startTimestamp, period: secondSegmentPeriod } = await cover.coverSegmentWithRemainingAmount(
        expectedCoverId,
        1,
      );
      const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
      await setNextBlockTime(editTimestamp.toNumber());

      const remainingPeriod = calculateRemainingPeriod({ period: secondSegmentPeriod, passedPeriod });

      const increasedAmount = amount.mul(2);

      const expectedPremium = calculateMockEditPremium({
        existingAmount: amount,
        increasedAmount,
        targetPriceRatio,
        period: remainingPeriod,
        extraPeriod: BigNumber.from('0'),
        priceDenominator,
      });

      const totalAmount = increasedAmount.mul(2);
      const totalExpectedPremium = expectedPremium.mul(2);

      await cover.connect(coverBuyer).buyCover(
        {
          coverId: expectedCoverId,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount: totalAmount,
          period: BigNumber.from(0),
          maxPremiumInAsset: totalExpectedPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [
          { poolId: 1, coverAmountInAsset: increasedAmount },
          { poolId: 2, coverAmountInAsset: increasedAmount },
        ],
        {
          value: totalExpectedPremium,
        },
      );

      const secondEditSegment = 2;

      const pool1Allocation = await cover.coverSegmentAllocations(expectedCoverId, secondEditSegment, 0);
      expect(pool1Allocation.poolId).to.be.equal(1);
      expect(pool1Allocation.coverAmountInNXM).to.be.equal(increasedAmount);

      const pool2Allocation = await cover.coverSegmentAllocations(expectedCoverId, secondEditSegment, 1);
      expect(pool2Allocation.poolId).to.be.equal(2);
      expect(pool2Allocation.coverAmountInNXM).to.be.equal(increasedAmount);

      await assertCoverFields(cover, expectedCoverId, {
        productId,
        coverAsset,
        period: remainingPeriod,
        amount: increasedAmount.mul(2),
        gracePeriod,
        segmentId: secondEditSegment,
      });
    }
  });

  it('reverts if incorrect pool id in request array', async function () {
    const fixture = await loadFixture(setup);
    const { cover, stakingProducts } = fixture;

    const [coverBuyer, manager] = fixture.accounts.members;

    const { productId, coverAsset, period, amount } = coverBuyFixture;

    const { expectedPremium, coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    await createStakingPool(
      stakingProducts,
      productId,
      parseEther('10000'), // capacity
      coverBuyFixture.targetPriceRatio, // targetPrice
      0, // activeCover
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
        [{ poolId: 2, coverAmountInAsset: amount }],
        {
          value: expectedPremium,
        },
      ),
    ).to.be.revertedWithCustomError(cover, 'UnexpectedPoolId');
  });

  // TODO: update test after totalActiveCoverInAsset is implemented in buckets
  it.skip('correctly updates totalActiveCoverInAsset', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, priceDenominator, targetPriceRatio } = coverBuyFixture;

    {
      const totalActiveCoverInAsset = await cover.totalActiveCoverInAsset(coverAsset);
      expect(totalActiveCoverInAsset).to.equal(0);
    }

    const {
      expectedPremium,
      segment,
      coverId: expectedCoverId,
    } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

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

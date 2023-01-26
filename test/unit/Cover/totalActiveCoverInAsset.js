const { ethers } = require('hardhat');
const { buyCoverOnOnePool } = require('./helpers');
const { expect } = require('chai');
const { DAI_ASSET_ID } = require('../../integration/utils/cover');
const { BigNumber } = ethers;
const { parseEther } = ethers.utils;
const { AddressZero, MaxUint256 } = ethers.constants;
const { setNextBlockTime, mineNextBlock } = require('../../utils').evm;
const { daysToSeconds } = require('../../../lib/').helpers;

const ETH_COVER_ID = 0b0;
const DAI_COVER_ID = 0b1;
const USDC_COVER_ID = 0b10;

const ethCoverBuyFixture = {
  productId: 0,
  coverAsset: ETH_COVER_ID, // ETH
  period: daysToSeconds(30), // 30 days

  amount: parseEther('1000'),

  targetPriceRatio: '260',
  priceDenominator: '10000',
  activeCover: parseEther('8000'),
  capacity: parseEther('10000'),
  capacityFactor: '10000',
};

const daiCoverBuyFixture = {
  ...ethCoverBuyFixture,
  coverAsset: DAI_COVER_ID,
  paymentAsset: DAI_COVER_ID,
};

describe('totalActiveCoverInAsset', function () {
  before(async function () {
    const { dai, cover } = this;
    const { members } = this.accounts;

    for (const member of members) {
      await dai.mint(member.address, parseEther('100000'));
      await dai.connect(member).approve(cover.address, parseEther('100000'));
    }
  });

  it('should compute active cover amount for ETH correctly after cover purchase', async function () {
    const { cover } = this;
    const { BUCKET_SIZE } = this.config;

    const { coverAsset, amount } = ethCoverBuyFixture;

    await buyCoverOnOnePool.call(this, ethCoverBuyFixture);

    const { timestamp } = await ethers.provider.getBlock('latest');
    const currentBucketId = Math.floor(timestamp / BUCKET_SIZE);
    const { lastBucketUpdateId, totalActiveCoverInAsset } = await cover.activeCover(coverAsset);
    expect(lastBucketUpdateId).to.equal(currentBucketId);
    expect(totalActiveCoverInAsset).to.equal(amount);
  });

  it('should compute active cover amount for DAI correctly after cover purchase', async function () {
    const { cover } = this;
    const { BUCKET_SIZE } = this.config;

    const { coverAsset, amount } = daiCoverBuyFixture;

    await buyCoverOnOnePool.call(this, daiCoverBuyFixture);

    const { timestamp } = await ethers.provider.getBlock('latest');
    const currentBucketId = Math.floor(timestamp / BUCKET_SIZE);
    const { lastBucketUpdateId, totalActiveCoverInAsset } = await cover.activeCover(coverAsset);
    expect(lastBucketUpdateId).to.equal(currentBucketId);
    expect(totalActiveCoverInAsset).to.equal(amount);
  });

  it('should initialize all active cover tracking variables', async function () {
    const { cover } = this;
    const { BUCKET_SIZE } = this.config;
    const { timestamp: initialTimestamp } = await ethers.provider.getBlock('latest');
    const initialBucketId = Math.floor(initialTimestamp / BUCKET_SIZE);
    // ETH
    {
      const { lastBucketUpdateId, totalActiveCoverInAsset } = await cover.activeCover(ETH_COVER_ID);
      expect(lastBucketUpdateId).to.be.equal(initialBucketId);
      expect(totalActiveCoverInAsset).to.be.equal(0);
    }
    // DAI
    {
      const { lastBucketUpdateId, totalActiveCoverInAsset } = await cover.activeCover(DAI_ASSET_ID);
      expect(lastBucketUpdateId).to.be.equal(initialBucketId);
      expect(totalActiveCoverInAsset).to.be.equal(0);
    }
    // USDC
    {
      const { lastBucketUpdateId, totalActiveCoverInAsset } = await cover.activeCover(USDC_COVER_ID);
      expect(lastBucketUpdateId).to.be.equal(0);
      expect(totalActiveCoverInAsset).to.be.equal(0);
    }
  });

  it('should decrease active cover amount when cover expires', async function () {
    const { cover } = this;
    const { BUCKET_SIZE } = this.config;

    const { coverAsset, amount } = daiCoverBuyFixture;

    await buyCoverOnOnePool.call(this, daiCoverBuyFixture);
    {
      // Move forward cover.period + 1 bucket to expire cover
      const { timestamp } = await ethers.provider.getBlock('latest');
      await setNextBlockTime(BUCKET_SIZE.add(timestamp).add(daiCoverBuyFixture.period).toNumber());
    }

    await buyCoverOnOnePool.call(this, daiCoverBuyFixture);

    const { timestamp } = await ethers.provider.getBlock('latest');
    const currentBucketId = Math.floor(timestamp / BUCKET_SIZE);
    const { lastBucketUpdateId, totalActiveCoverInAsset } = await cover.activeCover(coverAsset);
    expect(await lastBucketUpdateId).to.be.equal(currentBucketId);
    expect(totalActiveCoverInAsset).to.be.equal(amount);
  });

  it('should decrease active cover when an edited cover expires', async function () {
    const { cover } = this;
    const { BUCKET_SIZE } = this.config;
    const {
      members: [member1],
    } = this.accounts;

    const { amount, period, coverAsset, productId } = daiCoverBuyFixture;

    await buyCoverOnOnePool.call(this, daiCoverBuyFixture);

    {
      // Move forward 1 bucket
      const { timestamp } = await ethers.provider.getBlock('latest');
      await setNextBlockTime(BUCKET_SIZE.add(timestamp).toNumber());
    }

    // Edit cover
    await cover.connect(member1).buyCover(
      {
        owner: member1.address,
        coverId: 0,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: amount,
        paymentAsset: coverAsset,
        commissionRatio: 0,
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: 0, coverAmountInAsset: amount }],
    );

    const { timestamp } = await ethers.provider.getBlock('latest');
    const currentBucketId = Math.floor(timestamp / BUCKET_SIZE);

    const { lastBucketUpdateId, totalActiveCoverInAsset } = await cover.activeCover(coverAsset);
    expect(lastBucketUpdateId).to.be.equal(currentBucketId);
    expect(totalActiveCoverInAsset).to.be.equal(amount);

    {
      // Move many blocks until next cover is expired
      const { timestamp } = await ethers.provider.getBlock('latest');
      await setNextBlockTime(BigNumber.from(timestamp).add(daysToSeconds(500)).toNumber());
      await mineNextBlock();
      const amount = parseEther('50');
      await cover.connect(member1).buyCover(
        {
          owner: member1.address,
          coverId: MaxUint256,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: amount,
          paymentAsset: coverAsset,
          commissionRatio: 0,
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: 0, coverAmountInAsset: amount }],
      );
    }

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      const currentBucketId = Math.floor(timestamp / BUCKET_SIZE);

      const { lastBucketUpdateId, totalActiveCoverInAsset } = await cover.activeCover(coverAsset);
      expect(lastBucketUpdateId).to.be.equal(currentBucketId);
      expect(totalActiveCoverInAsset).to.be.equal(parseEther('50'));
    }
  });

  it('should be able to burn all active cover', async function () {
    const { cover } = this;
    const [internalContract] = this.accounts.internalContracts;

    const { coverAsset, amount } = daiCoverBuyFixture;

    await buyCoverOnOnePool.call(this, daiCoverBuyFixture);
    await cover.connect(internalContract).burnStake(0, 0, amount);
    expect(await cover.totalActiveCoverInAsset(coverAsset)).to.be.equal(0);
  });

  it('should decrease active cover by 1 WEI, and not cause rounding issues', async function () {
    const { cover } = this;
    const [internalContract] = this.accounts.internalContracts;

    const { coverAsset, amount } = daiCoverBuyFixture;

    await buyCoverOnOnePool.call(this, daiCoverBuyFixture);
    await cover.connect(internalContract).burnStake(0, 0, 1);
    expect(await cover.totalActiveCoverInAsset(coverAsset)).to.be.equal(amount.sub(1));
  });

  it('should calculate active cover correctly after multiple purchases and burns', async function () {
    const { cover } = this;
    const {
      internalContracts: [internalContract],
      members,
    } = this.accounts;
    const { BUCKET_SIZE } = this.config;

    const { coverAsset, amount, productId, period } = daiCoverBuyFixture;

    // cover 0
    await buyCoverOnOnePool.call(this, daiCoverBuyFixture);
    await cover.connect(internalContract).burnStake(0, 0, amount);

    const timeBetweenPurchases = daysToSeconds(2);
    expect(members.length * timeBetweenPurchases < daiCoverBuyFixture.period);

    // purchase cover, then burn half of  the cover and move forward 2 days each iteration
    for (let i = 1; i < members.length; i++) {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await setNextBlockTime(BigNumber.from(timestamp).add(daysToSeconds(2)).toNumber());

      const expectedActiveCover = amount.mul(i).div(2);

      const member = members[i];
      await cover.connect(member).buyCover(
        {
          owner: member.address,
          coverId: MaxUint256,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: amount,
          paymentAsset: coverAsset,
          commissionRatio: 0,
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: 0, coverAmountInAsset: amount }],
      );
      // Burn first segment of coverId == i
      await cover.connect(internalContract).burnStake(i, 0, amount.div(2));
      expect(await cover.totalActiveCoverInAsset(coverAsset)).to.be.equal(expectedActiveCover);
    }

    // Move forward cover period + 1 bucket to expire all covers
    const { timestamp } = await ethers.provider.getBlock('latest');
    await setNextBlockTime(BigNumber.from(timestamp).add(daiCoverBuyFixture.period).add(BUCKET_SIZE).toNumber());

    // New  purchase should be the only active cover
    await buyCoverOnOnePool.call(this, daiCoverBuyFixture);
    expect(await cover.totalActiveCoverInAsset(coverAsset)).to.be.equal(amount);
  });
});

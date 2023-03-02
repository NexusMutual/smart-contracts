const { ethers } = require('hardhat');
const { expect } = require('chai');

const { increaseTime } = require('../utils').evm;
const { daysToSeconds } = require('../utils').helpers;
const { buyCoverOnOnePool } = require('./helpers');

const { BigNumber } = ethers;
const { parseEther } = ethers.utils;
const { AddressZero } = ethers.constants;

const ETH_ASSET_ID = 0b00;
const DAI_ASSET_ID = 0b01;

const ethCoverBuyFixture = {
  productId: 0,
  coverAsset: ETH_ASSET_ID,
  paymentAsset: ETH_ASSET_ID,
  period: daysToSeconds(30),
  amount: parseEther('1000'),
  targetPriceRatio: '260',
  priceDenominator: '10000',
  activeCover: parseEther('8000'),
  capacity: parseEther('10000'),
  capacityFactor: '10000',
};

const daiCoverBuyFixture = {
  ...ethCoverBuyFixture,
  coverAsset: DAI_ASSET_ID,
  paymentAsset: DAI_ASSET_ID,
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

  it('should decrease active cover amount when cover expires', async function () {
    const { cover } = this;
    const { BUCKET_SIZE } = this.config;
    const { coverAsset, amount } = daiCoverBuyFixture;

    await buyCoverOnOnePool.call(this, daiCoverBuyFixture);

    await increaseTime(BUCKET_SIZE.add(daiCoverBuyFixture.period).toNumber());
    await buyCoverOnOnePool.call(this, daiCoverBuyFixture);

    const { timestamp } = await ethers.provider.getBlock('latest');
    const currentBucketId = Math.floor(timestamp / BUCKET_SIZE);
    const { lastBucketUpdateId, totalActiveCoverInAsset } = await cover.activeCover(coverAsset);
    expect(await lastBucketUpdateId).to.be.equal(currentBucketId);
    expect(totalActiveCoverInAsset).to.be.equal(amount);
  });

  it.skip('should decrease active cover when an edited cover expires', async function () {
    const { cover } = this;
    const { BUCKET_SIZE } = this.config;
    const [member] = this.accounts.members;

    const { amount, period, coverAsset, productId } = daiCoverBuyFixture;

    await buyCoverOnOnePool.call(this, daiCoverBuyFixture);

    // Move forward 1 bucket
    await increaseTime(BUCKET_SIZE.toNumber());

    // Edit cover
    const coverId = await cover.coverDataCount();
    await cover.connect(member).buyCover(
      {
        owner: member.address,
        coverId,
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
      [{ poolId: 1, coverAmountInAsset: amount }],
    );

    const { timestamp } = await ethers.provider.getBlock('latest');
    const currentBucketId = Math.floor(timestamp / BUCKET_SIZE);

    const { lastBucketUpdateId, totalActiveCoverInAsset } = await cover.activeCover(coverAsset);
    expect(lastBucketUpdateId).to.be.equal(currentBucketId);
    expect(totalActiveCoverInAsset).to.be.equal(amount);

    {
      // Move many blocks until next cover is expired
      await increaseTime(daysToSeconds(500));

      const amount = parseEther('50');
      await cover.connect(member).buyCover(
        {
          owner: member.address,
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
        [{ poolId: 1, coverAmountInAsset: amount }],
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
    const coverId = await cover.coverDataCount();
    await cover.connect(internalContract).burnStake(coverId, 0, amount);
    expect(await cover.totalActiveCoverInAsset(coverAsset)).to.be.equal(0);
  });

  it('should decrease active cover by 1 WEI, and not cause rounding issues', async function () {
    const { cover } = this;
    const [internalContract] = this.accounts.internalContracts;

    const { coverAsset, amount } = daiCoverBuyFixture;

    await buyCoverOnOnePool.call(this, daiCoverBuyFixture);
    const coverId = await cover.coverDataCount();
    await cover.connect(internalContract).burnStake(coverId, 0, 1);
    expect(await cover.totalActiveCoverInAsset(coverAsset)).to.be.equal(amount.sub(1));
  });

  it('should calculate active cover correctly after multiple purchases and burns', async function () {
    const { cover } = this;
    const { BUCKET_SIZE } = this.config;

    const [internalContract] = this.accounts.internalContracts;
    const members = this.accounts.members;

    const { coverAsset, amount, productId, period } = daiCoverBuyFixture;

    // cover 0
    await buyCoverOnOnePool.call(this, daiCoverBuyFixture);
    const coverId = await cover.coverDataCount();
    await cover.connect(internalContract).burnStake(coverId, 0, amount);

    const timeBetweenPurchases = daysToSeconds(2);
    expect(members.length * timeBetweenPurchases < daiCoverBuyFixture.period);

    // purchase cover, then burn half of  the cover and move forward 2 days each iteration
    for (let i = 1; i < members.length; i++) {
      await increaseTime(daysToSeconds(2));
      const expectedActiveCover = amount.mul(i).div(2);

      const member = members[i];
      await cover.connect(member).buyCover(
        {
          owner: member.address,
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
        [{ poolId: 1, coverAmountInAsset: amount }],
      );
      // Burn first segment of coverId == i
      await cover.connect(internalContract).burnStake(i + 1, 0, amount.div(2));
      expect(await cover.totalActiveCoverInAsset(coverAsset)).to.be.equal(expectedActiveCover);
    }

    // Move forward cover period + 1 bucket to expire all covers
    await increaseTime(BigNumber.from(daiCoverBuyFixture.period).add(BUCKET_SIZE).toNumber());

    // New  purchase should be the only active cover
    await buyCoverOnOnePool.call(this, daiCoverBuyFixture);
    expect(await cover.totalActiveCoverInAsset(coverAsset)).to.be.equal(amount);
  });
});

const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { increaseTime, setNextBlockTime } = require('../utils').evm;
const { daysToSeconds } = require('../utils').helpers;
const { buyCoverOnOnePool } = require('./helpers');
const setup = require('./setup');

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
  let fixture;

  beforeEach(async function () {
    fixture = await loadFixture(setup);
  });

  it('should compute active cover amount for ETH correctly after cover purchase', async function () {
    const { cover } = fixture;
    const { BUCKET_SIZE } = fixture.config;

    const { coverAsset, amount } = ethCoverBuyFixture;

    await buyCoverOnOnePool.call(fixture, ethCoverBuyFixture);

    const { timestamp } = await ethers.provider.getBlock('latest');
    const currentBucketId = Math.floor(timestamp / BUCKET_SIZE);
    const { lastBucketUpdateId, totalActiveCoverInAsset } = await cover.activeCover(coverAsset);
    expect(lastBucketUpdateId).to.equal(currentBucketId);
    expect(totalActiveCoverInAsset).to.equal(amount);
  });

  it('should compute active cover amount for DAI correctly after cover purchase', async function () {
    const { cover } = fixture;
    const { BUCKET_SIZE } = fixture.config;

    const { coverAsset, amount } = daiCoverBuyFixture;

    await buyCoverOnOnePool.call(fixture, daiCoverBuyFixture);

    const { timestamp } = await ethers.provider.getBlock('latest');
    const currentBucketId = Math.floor(timestamp / BUCKET_SIZE);
    const { lastBucketUpdateId, totalActiveCoverInAsset } = await cover.activeCover(coverAsset);
    expect(lastBucketUpdateId).to.equal(currentBucketId);
    expect(totalActiveCoverInAsset).to.equal(amount);
  });

  it('should decrease active cover amount when cover expires', async function () {
    const { cover } = fixture;
    const { BUCKET_SIZE } = fixture.config;
    const { coverAsset, amount } = daiCoverBuyFixture;

    await buyCoverOnOnePool.call(fixture, daiCoverBuyFixture);

    await increaseTime(BUCKET_SIZE.add(daiCoverBuyFixture.period).toNumber());
    await buyCoverOnOnePool.call(fixture, daiCoverBuyFixture);

    const { timestamp } = await ethers.provider.getBlock('latest');
    const currentBucketId = Math.floor(timestamp / BUCKET_SIZE);
    const { lastBucketUpdateId, totalActiveCoverInAsset } = await cover.activeCover(coverAsset);
    expect(await lastBucketUpdateId).to.be.equal(currentBucketId);
    expect(totalActiveCoverInAsset).to.be.equal(amount);
  });

  it('should increase/decrease active cover amount when a legacy cover is migrated/expired', async function () {
    const { cover } = fixture;
    const { BUCKET_SIZE } = fixture.config;
    const [internalContract] = fixture.accounts.internalContracts;
    const member = fixture.accounts.defaultSender;

    const { timestamp } = await ethers.provider.getBlock('latest');

    const coverAsset = 0; // ETH
    const amount = parseEther('1000');
    const start = timestamp - 10;
    const period = 90 * 24 * 3600;

    const activeCoverInitial = await cover.activeCover(coverAsset);

    await cover
      .connect(internalContract)
      .addLegacyCover(/* productId: */ 0, coverAsset, amount, start, period, member.address);

    {
      const activeCover = await cover.activeCover(coverAsset);

      // last bucket update id does not change because we do not expire anything
      expect(activeCover.lastBucketUpdateId).to.equal(activeCoverInitial.lastBucketUpdateId);

      const expectedTotalActiveCoverInAsset = activeCoverInitial.totalActiveCoverInAsset.add(amount);
      expect(activeCover.totalActiveCoverInAsset).to.equal(expectedTotalActiveCoverInAsset);
    }

    // advance time post bucket expiration
    const bucketAtExpiry = Math.ceil((start + period) / BUCKET_SIZE.toNumber());
    const bucketStartTime = bucketAtExpiry * BUCKET_SIZE.toNumber();
    await setNextBlockTime(bucketStartTime + 10);

    // buy a different cover to trigger the expiration
    const { amount: secondCoverAmount } = ethCoverBuyFixture;
    await buyCoverOnOnePool.call(fixture, ethCoverBuyFixture);

    {
      const activeCover = await cover.activeCover(coverAsset);
      expect(activeCover.lastBucketUpdateId).to.equal(bucketAtExpiry);

      // adding only second cover amount, the migrated one should have expired
      const expectedTotalActiveCoverInAsset = activeCoverInitial.totalActiveCoverInAsset.add(secondCoverAmount);
      expect(activeCover.totalActiveCoverInAsset).to.equal(expectedTotalActiveCoverInAsset);
    }
  });

  it('should decrease active cover amount on legacy cover burned', async function () {
    const { cover } = fixture;
    const { BUCKET_SIZE } = fixture.config;
    const [internalContract] = fixture.accounts.internalContracts;
    const member = fixture.accounts.defaultSender;

    const { timestamp } = await ethers.provider.getBlock('latest');

    const coverAsset = 0; // ETH
    const amount = parseEther('1000');
    const start = timestamp - 10;
    const period = 90 * 24 * 3600;

    const activeCoverInitial = await cover.activeCover(coverAsset);

    await cover
      .connect(internalContract)
      .addLegacyCover(/* productId: */ 0, coverAsset, amount, start, period, member.address);

    const coverId = await cover.coverDataCount();
    await cover.connect(internalContract).burnStake(coverId, 0, amount);

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      const currentBucketId = Math.floor(timestamp / BUCKET_SIZE.toNumber());

      const activeCover = await cover.activeCover(coverAsset);
      expect(activeCover.lastBucketUpdateId).to.equal(currentBucketId);

      // should have decreased back to initial amount
      expect(activeCover.totalActiveCoverInAsset).to.equal(activeCoverInitial.totalActiveCoverInAsset);
    }

    // advance time post bucket expiration to make sure expiration doesn't underflow
    const bucketAtExpiry = Math.ceil((start + period) / BUCKET_SIZE.toNumber());
    const bucketStartTime = bucketAtExpiry * BUCKET_SIZE.toNumber();
    await setNextBlockTime(bucketStartTime + 10);

    // buy a different cover to trigger the expiration
    const { amount: secondCoverAmount } = ethCoverBuyFixture;
    await buyCoverOnOnePool.call(fixture, ethCoverBuyFixture);

    {
      const activeCover = await cover.activeCover(coverAsset);
      expect(activeCover.lastBucketUpdateId).to.equal(bucketAtExpiry);

      // adding only second cover amount
      const expectedTotalActiveCoverInAsset = activeCoverInitial.totalActiveCoverInAsset.add(secondCoverAmount);
      expect(activeCover.totalActiveCoverInAsset).to.equal(expectedTotalActiveCoverInAsset);
    }
  });

  it.skip('should decrease active cover when an edited cover expires', async function () {
    const { cover } = fixture;
    const { BUCKET_SIZE } = fixture.config;
    const [member] = fixture.accounts.members;

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
    const { cover } = fixture;
    const [internalContract] = fixture.accounts.internalContracts;

    const { coverAsset, amount } = daiCoverBuyFixture;

    await buyCoverOnOnePool.call(fixture, daiCoverBuyFixture);
    const coverId = await cover.coverDataCount();
    await cover.connect(internalContract).burnStake(coverId, 0, amount);
    expect(await cover.totalActiveCoverInAsset(coverAsset)).to.be.equal(0);
  });

  it('should decrease active cover by 1 WEI, and not cause rounding issues', async function () {
    const { cover } = fixture;
    const [internalContract] = fixture.accounts.internalContracts;

    const { coverAsset, amount } = daiCoverBuyFixture;

    await buyCoverOnOnePool.call(fixture, daiCoverBuyFixture);
    const coverId = await cover.coverDataCount();
    await cover.connect(internalContract).burnStake(coverId, 0, 1);
    expect(await cover.totalActiveCoverInAsset(coverAsset)).to.be.equal(amount.sub(1));
  });

  it('should calculate active cover correctly after multiple purchases and burns', async function () {
    const { cover } = fixture;
    const { BUCKET_SIZE } = fixture.config;

    const [internalContract] = fixture.accounts.internalContracts;
    const members = fixture.accounts.members;

    const { coverAsset, amount, productId, period } = daiCoverBuyFixture;

    // cover 0
    await buyCoverOnOnePool.call(fixture, daiCoverBuyFixture);
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
    await buyCoverOnOnePool.call(fixture, daiCoverBuyFixture);
    expect(await cover.totalActiveCoverInAsset(coverAsset)).to.be.equal(amount);
  });
});

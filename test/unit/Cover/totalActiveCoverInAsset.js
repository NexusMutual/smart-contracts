const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

const { parseEther, ZeroAddress } = ethers;
const { ContractIndexes } = nexus.constants;

async function setupTotalActiveCoverInAsset() {
  const fixture = await loadFixture(setup);
  const { accounts, cover, registry } = fixture;

  const { COVER_BUY_FIXTURE } = fixture.constants;
  const [coverBuyer] = accounts.members;
  const [claims] = accounts.internalContracts;

  await registry.addContract(ContractIndexes.C_CLAIMS, claims, true);

  const { amount, targetPriceRatio, period, priceDenominator, productId, coverAsset } = COVER_BUY_FIXTURE;

  const expectedPremium = (amount * targetPriceRatio * period) / (priceDenominator * 3600n * 24n * 365n);
  // buyCover on 1 pool
  const poolAllocationRequest = [{ poolId: 1, coverAmountInAsset: amount }];
  await cover.connect(coverBuyer).buyCover(
    {
      owner: coverBuyer.address,
      coverId: 0,
      productId,
      coverAsset,
      amount,
      period,
      maxPremiumInAsset: expectedPremium,
      paymentAsset: coverAsset,
      commissionRatio: parseEther('0'),
      commissionDestination: '0x0000000000000000000000000000000000000000',
      ipfsData: '',
    },
    poolAllocationRequest,
    { value: coverAsset === 0n ? expectedPremium : 0n },
  );
  const coverId = await cover.getCoverDataCount();
  const coverData = await cover.getCoverData(coverId);

  return {
    ...fixture,
    coverId,
    coverData,
    expectedPremium,
    poolAllocationRequest,
  };
}

describe('totalActiveCoverInAsset', function () {
  it('should compute active cover amount for ETH correctly after cover purchase', async function () {
    const fixture = await loadFixture(setupTotalActiveCoverInAsset);
    const { cover } = fixture;
    const { BUCKET_SIZE } = fixture.config;
    const { COVER_BUY_FIXTURE } = fixture.constants;

    const { coverAsset, amount } = COVER_BUY_FIXTURE;

    const { timestamp } = await ethers.provider.getBlock('latest');
    const currentBucketId = BigInt(timestamp) / BUCKET_SIZE;
    const { lastBucketUpdateId, totalActiveCoverInAsset } = await cover.activeCover(coverAsset);
    expect(lastBucketUpdateId).to.equal(currentBucketId);
    expect(totalActiveCoverInAsset).to.equal(amount);
  });

  it('should compute active cover amount for ETH correctly after cover purchase', async function () {
    const fixture = await loadFixture(setupTotalActiveCoverInAsset);
    const { cover, poolAllocationRequest, expectedPremium } = fixture;
    const { BUCKET_SIZE } = fixture.config;
    const { COVER_BUY_FIXTURE } = fixture.constants;
    const [coverBuyer] = fixture.accounts.members;

    const { coverAsset, amount, productId, period } = COVER_BUY_FIXTURE;

    await cover.connect(coverBuyer).buyCover(
      {
        owner: coverBuyer.address,
        coverId: 0,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: coverAsset,
        commissionRatio: parseEther('0'),
        commissionDestination: '0x0000000000000000000000000000000000000000',
        ipfsData: '',
      },
      poolAllocationRequest,
      { value: expectedPremium },
    );

    const { timestamp } = await ethers.provider.getBlock('latest');
    const currentBucketId = BigInt(timestamp) / BUCKET_SIZE;
    const { lastBucketUpdateId, totalActiveCoverInAsset } = await cover.activeCover(coverAsset);
    expect(lastBucketUpdateId).to.equal(currentBucketId);
    expect(totalActiveCoverInAsset).to.equal(amount * 2n);
  });

  it('should decrease active cover amount when cover expires', async function () {
    const fixture = await loadFixture(setupTotalActiveCoverInAsset);
    const { cover, coverId } = fixture;
    const { BUCKET_SIZE } = fixture.config;
    const { COVER_BUY_FIXTURE } = fixture.constants;
    const { coverAsset, amount } = COVER_BUY_FIXTURE;

    const { totalActiveCoverInAsset: totalActiveCoverInAssetBefore } = await cover.activeCover(coverAsset);
    await time.increase(Number(BUCKET_SIZE + COVER_BUY_FIXTURE.period));
    await cover.expireCover(coverId);

    const { timestamp } = await ethers.provider.getBlock('latest');
    const currentBucketId = BigInt(timestamp) / BUCKET_SIZE;
    const { lastBucketUpdateId, totalActiveCoverInAsset } = await cover.activeCover(coverAsset);
    expect(await lastBucketUpdateId).to.be.equal(currentBucketId);
    expect(totalActiveCoverInAsset).to.be.equal(totalActiveCoverInAssetBefore - amount);
  });

  it('should decrease active cover when an edited cover expires', async function () {
    const fixture = await loadFixture(setupTotalActiveCoverInAsset);
    const { cover, coverId, expectedPremium } = fixture;
    const { BUCKET_SIZE } = fixture.config;
    const [member] = fixture.accounts.members;
    const { COVER_BUY_FIXTURE } = fixture.constants;

    const { amount, period, coverAsset, productId } = COVER_BUY_FIXTURE;

    // Move forward 1 bucket
    await time.increase(Number(BUCKET_SIZE));

    // Edit cover
    await cover.connect(member).buyCover(
      {
        owner: member.address,
        coverId,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: coverAsset,
        commissionRatio: 0,
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      { value: expectedPremium },
    );

    const { timestamp } = await ethers.provider.getBlock('latest');
    const currentBucketId = BigInt(timestamp) / BUCKET_SIZE;

    const { lastBucketUpdateId, totalActiveCoverInAsset } = await cover.activeCover(coverAsset);
    expect(lastBucketUpdateId).to.be.equal(currentBucketId);
    expect(totalActiveCoverInAsset).to.be.equal(amount);

    {
      // Move many blocks until next cover is expired
      await time.increase(500 * 24 * 60 * 60);

      const amount = parseEther('5');
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
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: amount }],
        { value: amount },
      );
    }

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      const currentBucketId = BigInt(timestamp) / BUCKET_SIZE;

      const { lastBucketUpdateId, totalActiveCoverInAsset } = await cover.activeCover(coverAsset);
      expect(lastBucketUpdateId).to.be.equal(currentBucketId);
      expect(totalActiveCoverInAsset).to.be.equal(parseEther('5'));
    }
  });

  it('should be able to burn all active cover', async function () {
    const fixture = await loadFixture(setupTotalActiveCoverInAsset);
    const { cover, coverId } = fixture;
    const [claims] = fixture.accounts.internalContracts;
    const { COVER_BUY_FIXTURE } = fixture.constants;

    const { coverAsset, amount } = COVER_BUY_FIXTURE;

    await cover.connect(claims).burnStake(coverId, amount);
    expect(await cover.totalActiveCoverInAsset(coverAsset)).to.be.equal(0);
  });

  it('should decrease active cover by 1 WEI, and not cause rounding issues', async function () {
    const fixture = await loadFixture(setupTotalActiveCoverInAsset);
    const { cover, coverId } = fixture;
    const [claims] = fixture.accounts.internalContracts;
    const { COVER_BUY_FIXTURE } = fixture.constants;

    const { coverAsset, amount } = COVER_BUY_FIXTURE;

    await cover.connect(claims).burnStake(coverId, 1);
    expect(await cover.totalActiveCoverInAsset(coverAsset)).to.be.equal(amount - 1n);
  });

  it('should calculate active cover correctly after multiple purchases and burns', async function () {
    const fixture = await loadFixture(setupTotalActiveCoverInAsset);
    const { cover, coverId, expectedPremium, poolAllocationRequest } = fixture;
    const { BUCKET_SIZE } = fixture.config;
    const { COVER_BUY_FIXTURE } = fixture.constants;

    const [claims] = fixture.accounts.internalContracts;
    const members = fixture.accounts.members;
    const coverBuyer = members[0];

    const { coverAsset, amount, productId, period } = COVER_BUY_FIXTURE;

    await cover.connect(claims).burnStake(coverId, amount);

    const timeBetweenPurchases = 2 * 24 * 60 * 60;
    expect(members.length * timeBetweenPurchases < COVER_BUY_FIXTURE.period);

    // purchase cover, then burn half of  the cover and move forward 2 days each iteration
    for (let i = 1; i < members.length; i++) {
      await time.increase(2 * 24 * 60 * 60);
      const expectedActiveCover = (amount * BigInt(i)) / 2n;

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
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: amount }],
        { value: expectedPremium },
      );
      // Burn first segment of coverId == i
      await cover.connect(claims).burnStake(i + 1, amount / 2n);
      expect(await cover.totalActiveCoverInAsset(coverAsset)).to.be.equal(expectedActiveCover);
    }

    // Move forward cover period + 1 bucket to expire all covers
    await time.increase(Number(COVER_BUY_FIXTURE.period + BUCKET_SIZE));

    // New  purchase should be the only active cover
    await cover.connect(coverBuyer).buyCover(
      {
        owner: coverBuyer.address,
        coverId: 0,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: coverAsset,
        commissionRatio: parseEther('0'),
        commissionDestination: '0x0000000000000000000000000000000000000000',
        ipfsData: '',
      },
      poolAllocationRequest,
      { value: expectedPremium },
    );
    expect(await cover.totalActiveCoverInAsset(coverAsset)).to.be.equal(amount);
  });
});

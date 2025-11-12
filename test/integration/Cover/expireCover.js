const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

const { daysToSeconds } = require('../utils');
const setup = require('../setup');

const { BigIntMath } = nexus.helpers;

const buyCoverFixture = {
  coverId: 0,
  owner: ethers.ZeroAddress,
  productId: 0,
  coverAsset: 0,
  amount: ethers.parseEther('1'),
  period: daysToSeconds(28),
  maxPremiumInAsset: ethers.MaxUint256,
  paymentAsset: 0,
  commissionRatio: 0,
  commissionDestination: ethers.ZeroAddress,
  ipfsData: 'ipfs data',
};

describe('expireCover', function () {
  it('should revert when cover is not expired', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;
    const { amount } = buyCoverFixture;
    const coverBuyerAddress = await coverBuyer.getAddress();

    await cover
      .connect(coverBuyer)
      .buyCover(
        { ...buyCoverFixture, owner: coverBuyerAddress },
        [{ poolId: 1, coverAmountInAsset: buyCoverFixture.amount }],
        { value: amount },
      );

    const coverId = await cover.getCoverDataCount();

    const expireCover = cover.connect(coverBuyer).expireCover(coverId);
    await expect(expireCover).to.be.revertedWithCustomError(cover, 'CoverNotYetExpired');
  });

  it('should expire a cover', async function () {
    const fixture = await loadFixture(setup);
    const { cover, stakingPool1 } = fixture.contracts;
    const { BUCKET_DURATION } = fixture.config;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, period, productId } = buyCoverFixture;
    const coverBuyerAddress = await coverBuyer.getAddress();

    // skip time so we would have less ratchet impact on internal price
    await time.increase(period);
    const initialAllocations = await stakingPool1.getActiveAllocations(productId);

    await cover
      .connect(coverBuyer)
      .buyCover(
        { ...buyCoverFixture, owner: coverBuyerAddress },
        [{ poolId: 1, coverAmountInAsset: buyCoverFixture.amount }],
        { value: amount },
      );

    const coverId = await cover.getCoverDataCount();

    await time.increase(period + 1);
    const allocationsWithCover = await stakingPool1.getActiveAllocations(productId);

    await cover.connect(coverBuyer).expireCover(coverId);
    const allocationsAfter = await stakingPool1.getActiveAllocations(productId);

    await time.increase(BUCKET_DURATION); // go to next bucket

    const totalCoverAmountAfter = await cover.totalActiveCoverInAsset(0);
    const allocationsAfterBucketExpiration = await stakingPool1.getActiveAllocations(productId);

    expect(BigIntMath.sum(allocationsWithCover)).not.to.be.equal(BigIntMath.sum(allocationsAfter));
    expect(BigIntMath.sum(initialAllocations)).to.be.equal(BigIntMath.sum(allocationsAfter));
    expect(BigIntMath.sum(allocationsAfter)).to.be.equal(0n);
    expect(BigIntMath.sum(allocationsAfterBucketExpiration)).to.be.equal(0n);
    expect(totalCoverAmountAfter).to.be.equal(0n);
  });

  it('should emit an event on expire a cover', async function () {
    const fixture = await loadFixture(setup);
    const { cover, stakingPool1 } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, period } = buyCoverFixture;
    const coverBuyerAddress = await coverBuyer.getAddress();

    await cover
      .connect(coverBuyer)
      .buyCover(
        { ...buyCoverFixture, owner: coverBuyerAddress },
        [{ poolId: 1, coverAmountInAsset: buyCoverFixture.amount }],
        { value: amount },
      );

    const coverId = await cover.getCoverDataCount();

    const poolAllocations = await cover.getPoolAllocations(coverId);
    const pool1Allocation = poolAllocations.find(alloc => alloc.poolId === 1n);
    const expectedAllocationId = pool1Allocation.allocationId;

    await time.increase(period + 1);

    const expireCover = cover.connect(coverBuyer).expireCover(coverId);
    await expect(expireCover).to.emit(stakingPool1, 'Deallocated').withArgs(expectedAllocationId);
  });

  it('should expire a cover from multiple pools', async function () {
    const fixture = await loadFixture(setup);
    const { cover, stakingPool1, stakingPool2 } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, period, productId } = buyCoverFixture;
    const coverBuyerAddress = await coverBuyer.getAddress();

    const allocationsPool1Before = await stakingPool1.getActiveAllocations(productId);
    const allocationsPool2Before = await stakingPool2.getActiveAllocations(productId);

    await cover.connect(coverBuyer).buyCover(
      { ...buyCoverFixture, owner: coverBuyerAddress },
      [
        { poolId: 1, coverAmountInAsset: buyCoverFixture.amount / 2n },
        { poolId: 2, coverAmountInAsset: buyCoverFixture.amount / 2n },
      ],
      { value: amount },
    );

    const coverId = await cover.getCoverDataCount();

    const allocationsPool1During = await stakingPool1.getActiveAllocations(productId);
    const allocationsPool2During = await stakingPool2.getActiveAllocations(productId);

    await time.increase(period + 1);
    await cover.connect(coverBuyer).expireCover(coverId);

    const allocationsPool1After = await stakingPool1.getActiveAllocations(productId);
    const allocationsPool2After = await stakingPool2.getActiveAllocations(productId);

    expect(BigIntMath.sum(allocationsPool1Before)).to.be.equal(0n);
    expect(BigIntMath.sum(allocationsPool2Before)).to.be.equal(0n);

    expect(BigIntMath.sum(allocationsPool1During)).to.be.gt(BigIntMath.sum(allocationsPool1Before));
    expect(BigIntMath.sum(allocationsPool2During)).to.be.gt(BigIntMath.sum(allocationsPool2Before));

    expect(BigIntMath.sum(allocationsPool1After)).to.be.equal(0n);
    expect(BigIntMath.sum(allocationsPool2After)).to.be.equal(0n);
  });

  it('should revert when trying to expire already expired cover', async function () {
    const fixture = await loadFixture(setup);
    const { cover, stakingPool1 } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, period } = buyCoverFixture;
    const coverBuyerAddress = await coverBuyer.getAddress();

    await cover
      .connect(coverBuyer)
      .buyCover(
        { ...buyCoverFixture, owner: coverBuyerAddress },
        [{ poolId: 1, coverAmountInAsset: buyCoverFixture.amount }],
        { value: amount },
      );

    const coverId = await cover.getCoverDataCount();

    // successful expire
    await time.increase(period + 1);
    await cover.connect(coverBuyer).expireCover(coverId);

    // expire again
    const expireCover = cover.connect(coverBuyer).expireCover(coverId);
    await expect(expireCover).to.be.revertedWithCustomError(stakingPool1, 'AlreadyDeallocated');
  });

  it('should revert when cover already expired with the bucket', async function () {
    const fixture = await loadFixture(setup);
    const { cover, stakingPool1 } = fixture.contracts;
    const { BUCKET_DURATION } = fixture.config;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, period } = buyCoverFixture;
    const coverBuyerAddress = await coverBuyer.getAddress();

    const currentTimestamp = await time.latest();
    const coverBucket = (BigInt(currentTimestamp) + BigInt(period)) / BUCKET_DURATION;
    const coverBucketExpirationPeriod = (coverBucket + 1n) * BUCKET_DURATION - BigInt(currentTimestamp);

    await cover
      .connect(coverBuyer)
      .buyCover(
        { ...buyCoverFixture, owner: coverBuyerAddress },
        [{ poolId: 1, coverAmountInAsset: buyCoverFixture.amount }],
        { value: amount },
      );

    await time.increase(coverBucketExpirationPeriod); // go to next bucket

    const coverId = await cover.getCoverDataCount();
    const expireCover = cover.connect(coverBuyer).expireCover(coverId);
    await expect(expireCover).to.be.revertedWithCustomError(stakingPool1, 'AlreadyDeallocated');
  });
});

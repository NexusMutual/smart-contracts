const { expect } = require('chai');
const { ethers } = require('hardhat');

const { AddressZero, MaxUint256 } = ethers.constants;
const { increaseTime } = require('../utils').evm;
const { daysToSeconds } = require('../utils').helpers;
const { calculateFirstTrancheId } = require('../utils/staking');
const { BigNumber } = require('ethers');

const { parseEther } = ethers.utils;

const allocationAmount = BigNumber.from(472);

const stakedProductParamTemplate = {
  productId: 1,
  recalculateEffectiveWeight: true,
  setTargetWeight: true,
  targetWeight: 100,
  setTargetPrice: true,
  targetPrice: 100,
};

function sum(arr) {
  return arr.reduce((x, y) => x.add(y), BigNumber.from(0));
}

describe('expireCover', function () {
  const buyCoverFixture = {
    coverId: 0,
    owner: AddressZero,
    productId: 1,
    coverAsset: 0,
    amount: parseEther('1'),
    period: daysToSeconds((Date.now() / 1000 / 60 / 60 / 24) % 28 ? 28 : 29),
    maxPremiumInAsset: MaxUint256,
    paymentAsset: 0,
    commissionRatio: 0,
    commissionDestination: AddressZero,
    ipfsData: 'ipfs data',
  };

  beforeEach(async function () {
    const { tk: nxm, stakingProducts, stakingPool1, stakingPool2, stakingPool3, tc: tokenController } = this.contracts;
    const staker = this.accounts.defaultSender;
    const [manager1, manager2, manager3] = this.accounts.stakingPoolManagers;
    const stakeAmount = parseEther('9000000');

    await stakingProducts.connect(manager1).setProducts(1, [stakedProductParamTemplate]);
    await stakingProducts.connect(manager2).setProducts(2, [stakedProductParamTemplate]);
    await stakingProducts.connect(manager3).setProducts(3, [stakedProductParamTemplate]);

    // stake
    const firstActiveTrancheId = await calculateFirstTrancheId(
      await ethers.provider.getBlock('latest'),
      buyCoverFixture.period,
      0,
    );

    await nxm.approve(tokenController.address, MaxUint256);
    await stakingPool1.connect(staker).depositTo(stakeAmount, firstActiveTrancheId + 5, 0, staker.address);
    await stakingPool2.connect(staker).depositTo(stakeAmount, firstActiveTrancheId + 5, 0, staker.address);
    await stakingPool3.connect(staker).depositTo(stakeAmount, firstActiveTrancheId + 5, 0, staker.address);
  });

  it('should revert when cover is not expired', async function () {
    const { cover } = this.contracts;
    const [coverBuyer] = this.accounts.members;
    const { amount } = buyCoverFixture;
    const coverBuyerAddress = await coverBuyer.getAddress();

    await cover
      .connect(coverBuyer)
      .buyCover(
        { ...buyCoverFixture, owner: coverBuyerAddress },
        [{ poolId: 1, coverAmountInAsset: buyCoverFixture.amount }],
        { value: amount },
      );

    const coverId = await cover.coverDataCount();

    await expect(cover.connect(coverBuyer).expireCover(coverId)).to.be.revertedWithCustomError(
      cover,
      `CoverNotYetExpired`,
    );
  });

  it('should expire a cover', async function () {
    const { cover, stakingPool1 } = this.contracts;
    const [coverBuyer] = this.accounts.members;
    const { amount, period, productId } = buyCoverFixture;
    const coverBuyerAddress = await coverBuyer.getAddress();

    await cover
      .connect(coverBuyer)
      .buyCover(
        { ...buyCoverFixture, owner: coverBuyerAddress },
        [{ poolId: 1, coverAmountInAsset: buyCoverFixture.amount }],
        { value: amount },
      );

    const coverId = await cover.coverDataCount();

    await increaseTime(period + 1);

    const allocationsBefore = await stakingPool1.getActiveAllocations(productId);

    await cover.connect(coverBuyer).expireCover(coverId);
    const allocationsAfter = await stakingPool1.getActiveAllocations(productId);

    expect(sum(allocationsBefore)).to.be.equal(sum(allocationsAfter).add(allocationAmount));
  });

  it('should emit an event on expire a cover', async function () {
    const { cover, stakingPool1 } = this.contracts;
    const [coverBuyer] = this.accounts.members;
    const { amount, period, productId } = buyCoverFixture;
    const coverBuyerAddress = await coverBuyer.getAddress();

    await cover
      .connect(coverBuyer)
      .buyCover(
        { ...buyCoverFixture, owner: coverBuyerAddress },
        [{ poolId: 1, coverAmountInAsset: buyCoverFixture.amount }],
        { value: amount },
      );

    const coverId = await cover.coverDataCount();

    await increaseTime(period + 1);

    await expect(cover.connect(coverBuyer).expireCover(coverId))
      .to.emit(stakingPool1, 'Deallocate')
      .withArgs(productId);
  });

  it('should expire a cover from multiple pools', async function () {
    const { cover, stakingPool1, stakingPool2 } = this.contracts;
    const [coverBuyer] = this.accounts.members;
    const { amount, period, productId } = buyCoverFixture;
    const coverBuyerAddress = await coverBuyer.getAddress();

    await cover.connect(coverBuyer).buyCover(
      { ...buyCoverFixture, owner: coverBuyerAddress },
      [
        { poolId: 1, coverAmountInAsset: buyCoverFixture.amount.div(2) },
        { poolId: 2, coverAmountInAsset: buyCoverFixture.amount.div(2) },
      ],
      { value: amount },
    );

    const coverId = await cover.coverDataCount();

    await increaseTime(period + 1);

    const allocationsPool1Before = await stakingPool1.getActiveAllocations(productId);
    const allocationsPool2Before = await stakingPool2.getActiveAllocations(productId);

    await cover.connect(coverBuyer).expireCover(coverId);

    const allocationsPool1After = await stakingPool1.getActiveAllocations(productId);
    const allocationsPool2After = await stakingPool2.getActiveAllocations(productId);

    expect(sum(allocationsPool1After)).to.be.equal(0);
    expect(sum(allocationsPool2After)).to.be.equal(0);
    expect(sum(allocationsPool1Before)).to.be.equal(sum(allocationsPool1After).add(allocationAmount.div(2)));
    expect(sum(allocationsPool2Before)).to.be.equal(sum(allocationsPool2After).add(allocationAmount.div(2)));
  });

  it('should revert when trying to expire already expired cover', async function () {
    const { cover, stakingPool1 } = this.contracts;
    const [coverBuyer] = this.accounts.members;
    const { amount, period } = buyCoverFixture;
    const coverBuyerAddress = await coverBuyer.getAddress();

    await cover
      .connect(coverBuyer)
      .buyCover(
        { ...buyCoverFixture, owner: coverBuyerAddress },
        [{ poolId: 1, coverAmountInAsset: buyCoverFixture.amount }],
        { value: amount },
      );

    const coverId = await cover.coverDataCount();

    await increaseTime(period + 1);

    await cover.connect(coverBuyer).expireCover(coverId);
    await expect(cover.connect(coverBuyer).expireCover(coverId)).to.be.revertedWithCustomError(
      stakingPool1,
      'AlreadyDeallocated',
    );
  });

  it('should revert when cover already expired with the bucket', async function () {
    const { cover, stakingPool1 } = this.contracts;
    const { BUCKET_DURATION } = this.config;
    const [coverBuyer] = this.accounts.members;
    const { amount, period, coverAsset, productId } = buyCoverFixture;
    const coverBuyerAddress = await coverBuyer.getAddress();

    const currentTime = BigNumber.from(Date.now()).div(1000);
    const coverBucket = currentTime.add(period).div(BUCKET_DURATION);
    const coverBucketExpirationPeriod = coverBucket.add(1).mul(BUCKET_DURATION).sub(currentTime);

    await cover
      .connect(coverBuyer)
      .buyCover(
        { ...buyCoverFixture, owner: coverBuyerAddress },
        [{ poolId: 1, coverAmountInAsset: buyCoverFixture.amount }],
        { value: amount },
      );

    const coverId = await cover.coverDataCount();

    await increaseTime(coverBucketExpirationPeriod.toNumber());
    const allocationsBefore = await stakingPool1.getActiveAllocations(productId);
    const { totalActiveCoverInAsset: activeCoverBefore } = await cover.activeCover(coverAsset);

    await cover
      .connect(coverBuyer)
      .buyCover(
        { ...buyCoverFixture, owner: coverBuyerAddress },
        [{ poolId: 1, coverAmountInAsset: buyCoverFixture.amount }],
        { value: amount },
      );

    const allocationsAfter = await stakingPool1.getActiveAllocations(productId);
    const { totalActiveCoverInAsset: activeCoverAfter } = await cover.activeCover(coverAsset);

    // stays the same because same amount expired and was allocated
    expect(sum(allocationsBefore)).to.be.equal(sum(allocationsAfter));
    expect(activeCoverBefore).to.be.equal(activeCoverAfter);
    await expect(cover.connect(coverBuyer).expireCover(coverId)).to.be.revertedWithCustomError(
      stakingPool1,
      'AlreadyDeallocated',
    );
  });
});

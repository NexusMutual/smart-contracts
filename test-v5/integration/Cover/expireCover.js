const { expect } = require('chai');
const { ethers } = require('hardhat');

const { AddressZero, MaxUint256 } = ethers.constants;
const { increaseTime } = require('../utils').evm;
const { daysToSeconds } = require('../utils').helpers;
const { calculateFirstTrancheId } = require('../utils/staking');
const { BigNumber } = require('ethers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('../setup');

const { parseEther } = ethers.utils;

const stakedProductParamTemplate = {
  productId: 1,
  recalculateEffectiveWeight: true,
  setTargetWeight: true,
  targetWeight: 100,
  setTargetPrice: true,
  targetPrice: 100,
};

const buyCoverFixture = {
  coverId: 0,
  owner: AddressZero,
  productId: 1,
  coverAsset: 0,
  amount: parseEther('1'),
  period: daysToSeconds(28),
  maxPremiumInAsset: MaxUint256,
  paymentAsset: 0,
  commissionRatio: 0,
  commissionDestination: AddressZero,
  ipfsData: 'ipfs data',
};

function sum(arr) {
  return arr.reduce((x, y) => x.add(y), BigNumber.from(0));
}

async function expireCoverSetup() {
  const fixture = await loadFixture(setup);
  const { tk: nxm, stakingProducts, stakingPool1, stakingPool2, stakingPool3, tc: tokenController } = fixture.contracts;
  const staker = fixture.accounts.defaultSender;
  const [manager1, manager2, manager3] = fixture.accounts.stakingPoolManagers;
  const stakeAmount = parseEther('900000');

  await stakingProducts.connect(manager1).setProducts(1, [stakedProductParamTemplate]);
  await stakingProducts.connect(manager2).setProducts(2, [stakedProductParamTemplate]);
  await stakingProducts.connect(manager3).setProducts(3, [stakedProductParamTemplate]);

  // stake
  const firstActiveTrancheId = calculateFirstTrancheId(
    await ethers.provider.getBlock('latest'),
    buyCoverFixture.period,
    0,
  );

  await nxm.approve(tokenController.address, MaxUint256);
  await stakingPool1.connect(staker).depositTo(stakeAmount, firstActiveTrancheId + 5, 0, staker.address);
  await stakingPool2.connect(staker).depositTo(stakeAmount, firstActiveTrancheId + 5, 0, staker.address);
  await stakingPool3.connect(staker).depositTo(stakeAmount, firstActiveTrancheId + 5, 0, staker.address);

  return fixture;
}

describe('expireCover', function () {
  it('should revert when cover is not expired', async function () {
    const fixture = await loadFixture(expireCoverSetup);
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

    await expect(cover.connect(coverBuyer).expireCover(coverId)).to.be.revertedWithCustomError(
      cover,
      `CoverNotYetExpired`,
    );
  });

  it('should expire a cover', async function () {
    const fixture = await loadFixture(expireCoverSetup);
    const { cover, stakingPool1 } = fixture.contracts;
    const { BUCKET_DURATION } = fixture.config;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, period, productId } = buyCoverFixture;
    const coverBuyerAddress = await coverBuyer.getAddress();

    // skip time so we would have less ratchet impact on internal price
    await increaseTime(period);
    const initialAllocations = await stakingPool1.getActiveAllocations(productId);

    await cover
      .connect(coverBuyer)
      .buyCover(
        { ...buyCoverFixture, owner: coverBuyerAddress },
        [{ poolId: 1, coverAmountInAsset: buyCoverFixture.amount }],
        { value: amount },
      );

    const coverId = await cover.getCoverDataCount();

    await increaseTime(period + 1);
    const allocationsWithCover = await stakingPool1.getActiveAllocations(productId);

    await cover.connect(coverBuyer).expireCover(coverId);
    const allocationsAfter = await stakingPool1.getActiveAllocations(productId);

    await increaseTime(BUCKET_DURATION.toNumber()); // go to next bucket

    const totalCoverAmountAfter = await cover.totalActiveCoverInAsset(0);
    const allocationsAfterBucketExpiration = await stakingPool1.getActiveAllocations(productId);

    expect(sum(allocationsWithCover)).not.to.be.equal(sum(allocationsAfter));
    expect(sum(initialAllocations)).to.be.equal(sum(allocationsAfter));
    expect(sum(allocationsAfter)).to.be.equal(0);
    expect(sum(allocationsAfterBucketExpiration)).to.be.equal(0);
    expect(totalCoverAmountAfter).to.be.equal(0);
  });

  it('should emit an event on expire a cover', async function () {
    const fixture = await loadFixture(expireCoverSetup);
    const { cover, stakingPool1 } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, period, productId } = buyCoverFixture;
    const coverBuyerAddress = await coverBuyer.getAddress();

    await cover
      .connect(coverBuyer)
      .buyCover(
        { ...buyCoverFixture, owner: coverBuyerAddress },
        [{ poolId: 1, coverAmountInAsset: buyCoverFixture.amount }],
        { value: amount },
      );

    const coverId = await cover.getCoverDataCount();

    await increaseTime(period + 1);

    await expect(cover.connect(coverBuyer).expireCover(coverId))
      .to.emit(stakingPool1, 'Deallocated')
      .withArgs(productId);
  });

  it('should expire a cover from multiple pools', async function () {
    const fixture = await loadFixture(expireCoverSetup);
    const { cover, stakingPool1, stakingPool2 } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, period, productId } = buyCoverFixture;
    const coverBuyerAddress = await coverBuyer.getAddress();

    const allocationsPool1Before = await stakingPool1.getActiveAllocations(productId);
    const allocationsPool2Before = await stakingPool2.getActiveAllocations(productId);

    await cover.connect(coverBuyer).buyCover(
      { ...buyCoverFixture, owner: coverBuyerAddress },
      [
        { poolId: 1, coverAmountInAsset: buyCoverFixture.amount.div(2) },
        { poolId: 2, coverAmountInAsset: buyCoverFixture.amount.div(2) },
      ],
      { value: amount },
    );

    const coverId = await cover.getCoverDataCount();

    const allocationsPool1During = await stakingPool1.getActiveAllocations(productId);
    const allocationsPool2During = await stakingPool2.getActiveAllocations(productId);

    await increaseTime(period + 1);
    await cover.connect(coverBuyer).expireCover(coverId);

    const allocationsPool1After = await stakingPool1.getActiveAllocations(productId);
    const allocationsPool2After = await stakingPool2.getActiveAllocations(productId);

    expect(sum(allocationsPool1Before)).to.be.equal(0);
    expect(sum(allocationsPool2Before)).to.be.equal(0);

    expect(sum(allocationsPool1During)).to.be.gt(sum(allocationsPool1Before));
    expect(sum(allocationsPool2During)).to.be.gt(sum(allocationsPool2Before));

    expect(sum(allocationsPool1After)).to.be.equal(0);
    expect(sum(allocationsPool2After)).to.be.equal(0);
  });

  it('should revert when trying to expire already expired cover', async function () {
    const fixture = await loadFixture(expireCoverSetup);
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

    await increaseTime(period + 1);

    await cover.connect(coverBuyer).expireCover(coverId);
    await expect(cover.connect(coverBuyer).expireCover(coverId)).to.be.revertedWithCustomError(
      stakingPool1,
      'AlreadyDeallocated',
    );
  });

  it('should revert when cover already expired with the bucket', async function () {
    const fixture = await loadFixture(expireCoverSetup);
    const { cover, stakingPool1 } = fixture.contracts;
    const { BUCKET_DURATION } = fixture.config;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, period } = buyCoverFixture;
    const coverBuyerAddress = await coverBuyer.getAddress();

    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
    const coverBucket = BigNumber.from(currentTime).add(period).div(BUCKET_DURATION);
    const coverBucketExpirationPeriod = coverBucket.add(1).mul(BUCKET_DURATION).sub(currentTime);

    await cover
      .connect(coverBuyer)
      .buyCover(
        { ...buyCoverFixture, owner: coverBuyerAddress },
        [{ poolId: 1, coverAmountInAsset: buyCoverFixture.amount }],
        { value: amount },
      );

    const coverId = await cover.getCoverDataCount();

    await increaseTime(coverBucketExpirationPeriod.toNumber());
    await cover
      .connect(coverBuyer)
      .buyCover(
        { ...buyCoverFixture, owner: coverBuyerAddress },
        [{ poolId: 1, coverAmountInAsset: buyCoverFixture.amount }],
        { value: amount },
      );

    await expect(cover.connect(coverBuyer).expireCover(coverId)).to.be.revertedWithCustomError(
      stakingPool1,
      'AlreadyDeallocated',
    );
  });
});

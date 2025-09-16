const { ethers } = require('hardhat');
const { expect } = require('chai');

const { increaseTime, setNextBlockTime, mineNextBlock } = require('../utils').evm;
const { daysToSeconds } = require('../utils').helpers;
const {
  getTranches,
  TRANCHE_DURATION,
  getCurrentBucket,
  BUCKET_DURATION,
  generateRewards,
  setTime,
  MAX_ACTIVE_TRANCHES,
} = require('./helpers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

const { AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;
const { BigNumber } = ethers;

const depositToFixture = {
  amount: parseEther('100'),
  trancheId: 0,
  tokenId: 0,
  destination: AddressZero,
};

const productParams = {
  productId: 0,
  weight: 100,
  initialPrice: 500,
  targetPrice: 500,
};

const poolInitParams = {
  poolId: 1,
  initialPoolFee: 5, // 5%
  maxPoolFee: 5, // 5%
  products: [productParams],
};

async function proccessExpirationSetup() {
  const fixture = await loadFixture(setup);
  const { stakingPool, stakingProducts } = fixture;
  const { poolId, initialPoolFee, maxPoolFee, products } = poolInitParams;

  await stakingPool.connect(fixture.stakingProductsSigner).initialize(false, initialPoolFee, maxPoolFee, poolId);

  await stakingProducts.connect(fixture.stakingProductsSigner).setInitialProducts(poolId, products);

  // Move to the beginning of the next tranche
  const { firstActiveTrancheId: trancheId } = await getTranches();
  await setTime((trancheId + 1) * TRANCHE_DURATION);

  return fixture;
}

describe('processExpirations', function () {
  it('expires tranche with no previous updates', async function () {
    const fixture = await loadFixture(proccessExpirationSetup);
    const { stakingPool } = fixture;
    const {
      members: [user],
    } = fixture.accounts;

    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    // Deposit. In this internal call to processExpirations _rewardsSharesSupply is 0
    // so it only updates lastAccNxmUpdate and return
    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);

    // increase time to expire the first active tranche
    await increaseTime(TRANCHE_DURATION);

    await expect(stakingPool.processExpirations(true));

    const expiredTranche = await stakingPool.getExpiredTranche(firstActiveTrancheId);
    expect(expiredTranche.accNxmPerRewardShareAtExpiry).to.equal(0);
    expect(expiredTranche.stakeAmountAtExpiry).to.equal(amount);
    expect(expiredTranche.stakeSharesSupplyAtExpiry).to.equal(Math.sqrt(amount));
  });

  it('does not revert when expires multiple tranches', async function () {
    const fixture = await loadFixture(proccessExpirationSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;
    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    // deposit
    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);

    // increase time to expire a couple of tranches
    await increaseTime(TRANCHE_DURATION * 2);

    await expect(stakingPool.processExpirations(true)).to.not.reverted;
  });

  it('anyone can call this method', async function () {
    const fixture = await loadFixture(proccessExpirationSetup);
    const { stakingPool } = fixture;
    const {
      nonMembers: [anyone],
    } = fixture.accounts;

    await expect(stakingPool.connect(anyone).processExpirations(true)).to.not.be.reverted;
  });

  it('expires tranches updating active stake, stake shares and rewards shares supply', async function () {
    const fixture = await loadFixture(proccessExpirationSetup);
    const { stakingPool } = fixture;
    const { POOL_FEE_DENOMINATOR } = fixture.config;
    const [user] = fixture.accounts.members;

    const { amount, tokenId, destination } = depositToFixture;
    const { initialPoolFee } = poolInitParams;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    const tranches = Array(MAX_ACTIVE_TRANCHES)
      .fill(0)
      .map((e, i) => firstActiveTrancheId + i);

    let rewardsSharesTotalSupply = parseEther('0');
    for (let i = 0; i < tranches.length; i++) {
      const tranche = tranches[i];
      await stakingPool.connect(user).depositTo(amount, tranche, tokenId, destination);
      const nftId = i + 1;
      const deposit = await stakingPool.deposits(nftId, tranche);

      const feesRewardShares = deposit.rewardsShares.mul(initialPoolFee).div(POOL_FEE_DENOMINATOR.sub(initialPoolFee));

      // double check
      const feesRewardSharesPercentage = feesRewardShares.mul(POOL_FEE_DENOMINATOR).div(deposit.rewardsShares);
      expect(feesRewardSharesPercentage).to.equal(initialPoolFee);

      rewardsSharesTotalSupply = rewardsSharesTotalSupply.add(deposit.rewardsShares.add(feesRewardShares));

      const trancheData = await stakingPool.getTranche(tranche);
      expect(trancheData.stakeShares).to.equal(deposit.stakeShares);
      expect(trancheData.rewardsShares).to.equal(deposit.rewardsShares.add(feesRewardShares));
    }

    const baseStakeShares = BigNumber.from(Math.sqrt(amount));
    const depositsCount = 8;

    {
      const activeStake = await stakingPool.getActiveStake();
      const stakeSharesSupply = await stakingPool.getStakeSharesSupply();
      const rewardsSharesSupply = await stakingPool.getRewardsSharesSupply();

      expect(activeStake).to.equal(amount.mul(depositsCount));
      expect(stakeSharesSupply).to.equal(baseStakeShares.mul(depositsCount));
      expect(rewardsSharesSupply).to.equal(rewardsSharesTotalSupply);
    }

    await generateRewards(stakingPool, fixture.coverSigner, TRANCHE_DURATION * 7, 0);

    await stakingPool.processExpirations(true);

    await increaseTime(TRANCHE_DURATION * 8);

    // expire all tranches
    await stakingPool.processExpirations(true);

    // Validate tranches are expired
    for (let i = 0; i < tranches.length; i++) {
      const tranche = tranches[i];
      const expiredTranche = await stakingPool.getExpiredTranche(tranche);

      const activeDepositsAtTranche = maxTranche - tranche + 1;

      expect(expiredTranche.accNxmPerRewardShareAtExpiry).to.gt(0);
      expect(expiredTranche.stakeAmountAtExpiry).to.equal(amount.mul(activeDepositsAtTranche));
      expect(expiredTranche.stakeSharesSupplyAtExpiry).to.equal(baseStakeShares.mul(activeDepositsAtTranche));

      const trancheData = await stakingPool.getTranche(tranche);
      expect(trancheData.stakeShares).to.equal(0);
      expect(trancheData.rewardsShares).to.equal(0);
    }

    // Validate globals active stake, stake share supply and rewards shares supply
    {
      const activeStake = await stakingPool.getActiveStake();
      const stakeSharesSupply = await stakingPool.getStakeSharesSupply();
      const rewardsSharesSupply = await stakingPool.getRewardsSharesSupply();

      expect(activeStake).to.equal(0);
      expect(stakeSharesSupply).to.equal(0);
      expect(rewardsSharesSupply).to.equal(0);
    }
  });

  it('expires tranches correctly storing expiredTranches struct', async function () {
    const fixture = await loadFixture(proccessExpirationSetup);
    const { stakingPool } = fixture;
    const {
      members: [user],
    } = fixture.accounts;

    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    const tranches = Array(MAX_ACTIVE_TRANCHES)
      .fill(0)
      .map((e, i) => firstActiveTrancheId + i);

    for (let i = 0; i < tranches.length; i++) {
      await stakingPool.connect(user).depositTo(amount, tranches[i], tokenId, destination);
    }

    const baseStakeShares = BigNumber.from(Math.sqrt(amount));

    await generateRewards(stakingPool, fixture.coverSigner, TRANCHE_DURATION * 7, 0);

    await stakingPool.processExpirations(true);

    const accNxmPerRewardShareAtExpiry = Array(MAX_ACTIVE_TRANCHES).fill(0);

    for (let i = 0; i < tranches.length; i++) {
      await increaseTime(TRANCHE_DURATION);

      // expire one tranche
      await stakingPool.processExpirations(false);

      const accNxmPerRewardsShare = await stakingPool.getAccNxmPerRewardsShare();
      accNxmPerRewardShareAtExpiry[i] = accNxmPerRewardsShare;
    }

    // Validate tranches are expired
    for (let i = 0; i < tranches.length; i++) {
      const tranche = tranches[i];
      const expiredTranche = await stakingPool.getExpiredTranche(tranche);

      const activeDepositsAtTranche = maxTranche - tranche + 1;

      expect(expiredTranche.accNxmPerRewardShareAtExpiry).to.equal(accNxmPerRewardShareAtExpiry[i]);
      expect(expiredTranche.stakeAmountAtExpiry).to.equal(amount.mul(activeDepositsAtTranche));
      expect(expiredTranche.stakeSharesSupplyAtExpiry).to.equal(baseStakeShares.mul(activeDepositsAtTranche));
    }
  });

  it('correctly calculates accNxmPerRewardShare', async function () {
    const fixture = await loadFixture(proccessExpirationSetup);
    const { stakingPool } = fixture;
    const {
      members: [user],
    } = fixture.accounts;

    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    const tranches = Array(MAX_ACTIVE_TRANCHES)
      .fill(0)
      .map((e, i) => firstActiveTrancheId + i);

    for (let i = 0; i < tranches.length; i++) {
      const tranche = tranches[i];
      await stakingPool.connect(user).depositTo(amount, tranche, tokenId, destination);
    }

    await generateRewards(stakingPool, fixture.coverSigner, TRANCHE_DURATION * 3, 0);

    await increaseTime(TRANCHE_DURATION - BUCKET_DURATION);

    await stakingPool.processExpirations(true);

    const accNxmPerRewardsShareBefore = await stakingPool.getAccNxmPerRewardsShare();
    const lastAccNxmUpdateBefore = await stakingPool.getLastAccNxmUpdate();
    const rewardPerSecondBefore = await stakingPool.getRewardPerSecond();
    const rewardsSharesSupply = await stakingPool.getRewardsSharesSupply();

    await increaseTime(BUCKET_DURATION * 2);

    const bucketId = BigNumber.from(await stakingPool.getFirstActiveBucketId());
    const trancheId = BigNumber.from(await stakingPool.getFirstActiveTrancheId());
    const tranche = await stakingPool.getTranche(trancheId);

    // expire 1 bucket + 1 tranche + 1 bucket
    await stakingPool.processExpirations(true);

    const expiredTranche = await stakingPool.getExpiredTranche(trancheId);

    const nextBucketId = bucketId.add(1);
    const nextBucketStartTime = nextBucketId.mul(BUCKET_DURATION);
    const nextBucketRewardPerSecondCut = await stakingPool.rewardPerSecondCut(nextBucketId);
    const trancheEndTime = trancheId.add(1).mul(TRANCHE_DURATION);

    const accFromBeforeToBucketExpiration = nextBucketStartTime
      .sub(lastAccNxmUpdateBefore)
      .mul(rewardPerSecondBefore)
      .mul(parseEther('1'))
      .div(rewardsSharesSupply);

    const accFromBucketExpirationToTrancheExpiration = trancheEndTime
      .sub(nextBucketStartTime)
      .mul(rewardPerSecondBefore.sub(nextBucketRewardPerSecondCut))
      .mul(parseEther('1'))
      .div(rewardsSharesSupply);

    expect(expiredTranche.accNxmPerRewardShareAtExpiry).to.equal(
      accNxmPerRewardsShareBefore.add(accFromBeforeToBucketExpiration).add(accFromBucketExpirationToTrancheExpiration),
    );

    const accNxmPerRewardsShareAfter = await stakingPool.getAccNxmPerRewardsShare();
    const { timestamp } = await ethers.provider.getBlock('latest');

    const secondNextBucketId = nextBucketId.add(1);
    const secondNextBucketStartTime = secondNextBucketId.mul(BUCKET_DURATION);
    const secondBucketRewardPerSecondCut = await stakingPool.rewardPerSecondCut(secondNextBucketId);

    const accFromTrancheExpirationToSecondBucketExpiration = secondNextBucketStartTime
      .sub(trancheEndTime)
      .mul(rewardPerSecondBefore.sub(nextBucketRewardPerSecondCut))
      .mul(parseEther('1'))
      .div(rewardsSharesSupply.sub(tranche.rewardsShares));

    const accFromSecondBucketExpirationToCurrentTime = BigNumber.from(timestamp)
      .sub(secondNextBucketStartTime)
      .mul(rewardPerSecondBefore.sub(nextBucketRewardPerSecondCut).sub(secondBucketRewardPerSecondCut))
      .mul(parseEther('1'))
      .div(rewardsSharesSupply.sub(tranche.rewardsShares));

    expect(accNxmPerRewardsShareAfter).to.equal(
      accNxmPerRewardsShareBefore
        .add(accFromBeforeToBucketExpiration)
        .add(accFromBucketExpirationToTrancheExpiration)
        .add(accFromTrancheExpirationToSecondBucketExpiration)
        .add(accFromSecondBucketExpirationToCurrentTime),
    );
  });

  it('expires buckets updating rewards per second and lastAccNxmUpdate', async function () {
    const fixture = await loadFixture(proccessExpirationSetup);
    const { stakingPool } = fixture;
    const {
      members: [user],
    } = fixture.accounts;

    const { amount, tokenId, destination } = depositToFixture;

    // advance to the start of the next bucket
    const currentBucketId = BigNumber.from(await getCurrentBucket());
    await setNextBlockTime(currentBucketId.add(1).mul(BUCKET_DURATION).toNumber());
    await mineNextBlock();

    const { firstActiveTrancheId } = await getTranches();

    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId + 1, tokenId, destination);

    await generateRewards(stakingPool, fixture.coverSigner, daysToSeconds(10), 0);

    const accNxmPerRewardsShareBefore = await stakingPool.getAccNxmPerRewardsShare();
    const rewardPerSecondBefore = await stakingPool.getRewardPerSecond();
    const lastAccNxmUpdateBefore = await stakingPool.getLastAccNxmUpdate();

    await increaseTime(BUCKET_DURATION);

    await stakingPool.processExpirations(false);

    const firstActiveBucketId = BigNumber.from(await stakingPool.getFirstActiveBucketId());
    const accNxmPerRewardsShareAfter = await stakingPool.getAccNxmPerRewardsShare();
    const rewardPerSecondAfter = await stakingPool.getRewardPerSecond();
    const lastAccNxmUpdateAfter = await stakingPool.getLastAccNxmUpdate();
    const expiredBucketRewards = await stakingPool.rewardPerSecondCut(firstActiveBucketId);
    const rewardsSharesSupply = await stakingPool.getRewardsSharesSupply();

    const bucketStartTime = firstActiveBucketId.mul(BUCKET_DURATION);
    const elapsed = bucketStartTime.sub(lastAccNxmUpdateBefore);

    expect(expiredBucketRewards).to.equal(rewardPerSecondBefore);
    expect(rewardPerSecondAfter).to.equal(rewardPerSecondBefore.sub(expiredBucketRewards));
    expect(accNxmPerRewardsShareAfter).to.equal(
      accNxmPerRewardsShareBefore.add(elapsed.mul(rewardPerSecondBefore).mul(parseEther('1')).div(rewardsSharesSupply)),
    );
    expect(lastAccNxmUpdateAfter).to.equal(bucketStartTime);
  });

  it('updates first active tranche id', async function () {
    const fixture = await loadFixture(proccessExpirationSetup);
    const { stakingPool } = fixture;
    const {
      members: [user],
    } = fixture.accounts;

    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId: initialFirstActiveTrancheId } = await getTranches();

    // deposit to initialize first active tranche id
    await stakingPool.connect(user).depositTo(amount, initialFirstActiveTrancheId, tokenId, destination);

    const firstActiveTrancheIdBefore = await stakingPool.getFirstActiveTrancheId();
    expect(firstActiveTrancheIdBefore).to.equal(initialFirstActiveTrancheId);

    const increasedTranches = 7;
    await increaseTime(TRANCHE_DURATION * increasedTranches);

    await expect(stakingPool.processExpirations(true))
      .to.emit(stakingPool, 'TrancheExpired')
      .withArgs(firstActiveTrancheIdBefore);

    const { firstActiveTrancheId: newFirstActiveTrancheId } = await getTranches();
    const firstActiveTrancheIdAfter = await stakingPool.getFirstActiveTrancheId();

    expect(firstActiveTrancheIdAfter).to.equal(initialFirstActiveTrancheId + increasedTranches);
    expect(firstActiveTrancheIdAfter).to.equal(newFirstActiveTrancheId);
  });

  it('updates first active bucket id', async function () {
    const fixture = await loadFixture(proccessExpirationSetup);
    const { stakingPool } = fixture;
    const {
      members: [user],
    } = fixture.accounts;

    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    // deposit to initialize first active bucket id
    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);

    const initialCurrentBucket = await getCurrentBucket();
    const firstActiveBucketIdBefore = await stakingPool.getFirstActiveBucketId();

    expect(firstActiveBucketIdBefore).to.equal(initialCurrentBucket);

    const increasedBuckets = 7;
    await increaseTime(BUCKET_DURATION * increasedBuckets);

    await expect(stakingPool.processExpirations(true))
      .to.emit(stakingPool, 'BucketExpired')
      .withArgs(firstActiveBucketIdBefore);

    const newCurrentBucket = await getCurrentBucket();
    const firstActiveBucketIdAfter = await stakingPool.getFirstActiveBucketId();

    expect(firstActiveBucketIdAfter).to.equal(initialCurrentBucket + increasedBuckets);
    expect(firstActiveBucketIdAfter).to.equal(newCurrentBucket);
  });

  it('updates accNxmPerRewardsShare and lastAccNxmUpdate up to date when forced by param', async function () {
    const fixture = await loadFixture(proccessExpirationSetup);
    const { stakingPool } = fixture;
    const {
      members: [user],
    } = fixture.accounts;

    const { amount, tokenId, destination } = depositToFixture;

    // advance to the start of the next bucket
    const currentBucketId = BigNumber.from(await getCurrentBucket());
    await setNextBlockTime(currentBucketId.add(1).mul(BUCKET_DURATION).toNumber());
    await mineNextBlock();

    const { firstActiveTrancheId } = await getTranches();

    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId + 1, tokenId, destination);

    await generateRewards(stakingPool, fixture.coverSigner, daysToSeconds(10), 0);

    const accNxmPerRewardsShareBefore = await stakingPool.getAccNxmPerRewardsShare();
    const rewardPerSecondBefore = await stakingPool.getRewardPerSecond();
    const lastAccNxmUpdateBefore = await stakingPool.getLastAccNxmUpdate();

    await increaseTime(BUCKET_DURATION);

    // pass true to force update to current timestamp
    await stakingPool.processExpirations(true);

    const firstActiveBucketId = BigNumber.from(await stakingPool.getFirstActiveBucketId());
    const accNxmPerRewardsShareAfter = await stakingPool.getAccNxmPerRewardsShare();
    const rewardPerSecondAfter = await stakingPool.getRewardPerSecond();
    const lastAccNxmUpdateAfter = await stakingPool.getLastAccNxmUpdate();
    const rewardsSharesSupply = await stakingPool.getRewardsSharesSupply();
    const lastBlock = await ethers.provider.getBlock('latest');

    const bucketStartTime = firstActiveBucketId.mul(BUCKET_DURATION);
    const elapsedInBucket = bucketStartTime.sub(lastAccNxmUpdateBefore);
    const elapsedAfterBucket = BigNumber.from(lastBlock.timestamp).sub(lastAccNxmUpdateBefore);

    const accNxmPerRewardsAtBucketEnd = accNxmPerRewardsShareBefore.add(
      elapsedInBucket.mul(rewardPerSecondBefore).mul(parseEther('1')).div(rewardsSharesSupply),
    );
    expect(accNxmPerRewardsShareAfter).to.equal(
      accNxmPerRewardsAtBucketEnd.add(
        elapsedAfterBucket.mul(rewardPerSecondAfter).mul(parseEther('1')).div(rewardsSharesSupply),
      ),
    );
    expect(lastAccNxmUpdateAfter).to.equal(lastBlock.timestamp);
  });

  it('emits ActiveStakeUpdated event when a tranche is expired', async function () {
    const fixture = await loadFixture(proccessExpirationSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;

    const { amount, tokenId, destination } = depositToFixture;
    const { firstActiveTrancheId } = await getTranches();

    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);
    const activeStakeAfter = await stakingPool.getActiveStake();
    const stakeSharesSupplyAfter = await stakingPool.getStakeSharesSupply();

    const expectedActiveStakeAfter = amount;
    const expectedStakeSharesSupplyAfter = Math.sqrt(amount);

    expect(activeStakeAfter).to.equal(expectedActiveStakeAfter);
    expect(stakeSharesSupplyAfter).to.equal(expectedStakeSharesSupplyAfter);

    await increaseTime(TRANCHE_DURATION * 2);
    await expect(stakingPool.processExpirations(true)).to.emit(stakingPool, 'ActiveStakeUpdated').withArgs(0, 0);
  });
});

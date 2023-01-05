const { ethers } = require('hardhat');
const { expect } = require('chai');

const { setEtherBalance, increaseTime } = require('../utils').evm;
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

const { AddressZero, MaxUint256 } = ethers.constants;
const { parseEther } = ethers.utils;
const { BigNumber } = ethers;

const depositToFixture = {
  amount: parseEther('100'),
  trancheId: 0,
  tokenId: MaxUint256,
  destination: AddressZero,
};

const productParams = {
  productId: 0,
  weight: 100,
  initialPrice: 500,
  targetPrice: 500,
};

const poolInitParams = {
  poolId: 0,
  initialPoolFee: 5, // 5%
  maxPoolFee: 5, // 5%
  products: [productParams],
  ipfsDescriptionHash: 'Description Hash',
};

describe('processExpirations', function () {
  beforeEach(async function () {
    const { stakingPool, cover } = this;
    const { defaultSender: manager } = this.accounts;
    const { poolId, initialPoolFee, maxPoolFee, products, ipfsDescriptionHash } = poolInitParams;

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));
    this.coverSigner = coverSigner;

    await stakingPool
      .connect(coverSigner)
      .initialize(manager.address, false, initialPoolFee, maxPoolFee, products, poolId, ipfsDescriptionHash);

    // Move to the beginning of the next tranche
    const { firstActiveTrancheId: trancheId } = await getTranches();
    await setTime((trancheId + 1) * TRANCHE_DURATION);
  });

  it('expires tranche with no previous updates', async function () {
    const { stakingPool } = this;
    const {
      members: [user],
    } = this.accounts;

    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    // Deposit. In this internal call to processExpirations _rewardsSharesSupply is 0
    // so it only updates lastAccNxmUpdate and return
    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);

    // increase time to expire the first active tranche
    await increaseTime(TRANCHE_DURATION);

    await expect(stakingPool.processExpirations(true));

    const expiredTranche = await stakingPool.expiredTranches(firstActiveTrancheId);
    expect(expiredTranche.accNxmPerRewardShareAtExpiry).to.equal(0);
    expect(expiredTranche.stakeAmountAtExpiry).to.equal(amount);
    expect(expiredTranche.stakeShareSupplyAtExpiry).to.equal(Math.sqrt(amount));
  });

  it('does not revert when expires multiple tranches', async function () {
    const { stakingPool } = this;
    const [user] = this.accounts.members;
    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    // deposit
    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);

    // increase time to expire a couple of tranches
    await increaseTime(TRANCHE_DURATION * 2);

    await expect(stakingPool.processExpirations(true)).to.not.reverted;
  });

  it('anyone can call this method', async function () {
    const { stakingPool } = this;
    const {
      nonMembers: [anyone],
    } = this.accounts;

    await expect(stakingPool.connect(anyone).processExpirations(true)).to.not.be.reverted;
  });

  it('expires tranches updating active stake, stake shares and rewards shares supply', async function () {
    const { stakingPool } = this;
    const { POOL_FEE_DENOMINATOR } = this.config;
    const [user] = this.accounts.members;

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
      const nftId = i;
      const deposit = await stakingPool.deposits(nftId, tranche);

      const feesRewardShares = deposit.rewardsShares.mul(initialPoolFee).div(POOL_FEE_DENOMINATOR.sub(initialPoolFee));

      // double check
      const feesRewardSharesPercentage = feesRewardShares.mul(POOL_FEE_DENOMINATOR).div(deposit.rewardsShares);
      expect(feesRewardSharesPercentage).to.equal(initialPoolFee);

      rewardsSharesTotalSupply = rewardsSharesTotalSupply.add(deposit.rewardsShares.add(feesRewardShares));

      const trancheData = await stakingPool.tranches(tranche);
      expect(trancheData.stakeShares).to.equal(deposit.stakeShares);
      expect(trancheData.rewardsShares).to.equal(deposit.rewardsShares.add(feesRewardShares));
    }

    const baseStakeShares = BigNumber.from(Math.sqrt(amount));
    const depositsCount = 8;

    {
      const activeStake = await stakingPool.activeStake();
      const stakeSharesSupply = await stakingPool.stakeSharesSupply();
      const rewardsSharesSupply = await stakingPool.rewardsSharesSupply();

      expect(activeStake).to.equal(amount.mul(depositsCount));
      expect(stakeSharesSupply).to.equal(baseStakeShares.mul(depositsCount));
      expect(rewardsSharesSupply).to.equal(rewardsSharesTotalSupply);
    }

    await generateRewards(stakingPool, this.coverSigner, TRANCHE_DURATION * 7, 0);

    await stakingPool.processExpirations(true);

    await increaseTime(TRANCHE_DURATION * 8);

    // expire all tranches
    await stakingPool.processExpirations(true);

    // Validate tranches are expired
    for (let i = 0; i < tranches.length; i++) {
      const tranche = tranches[i];
      const expiredTranche = await stakingPool.expiredTranches(tranche);

      const activeDepositsAtTranche = maxTranche - tranche + 1;

      expect(expiredTranche.accNxmPerRewardShareAtExpiry).to.gt(0);
      expect(expiredTranche.stakeAmountAtExpiry).to.equal(amount.mul(activeDepositsAtTranche));
      expect(expiredTranche.stakeShareSupplyAtExpiry).to.equal(baseStakeShares.mul(activeDepositsAtTranche));

      const trancheData = await stakingPool.tranches(tranche);
      expect(trancheData.stakeShares).to.equal(0);
      expect(trancheData.rewardsShares).to.equal(0);
    }

    // Validate globals active stake, stake share supply and rewards shares supply
    {
      const activeStake = await stakingPool.activeStake();
      const stakeSharesSupply = await stakingPool.stakeSharesSupply();
      const rewardsSharesSupply = await stakingPool.rewardsSharesSupply();

      expect(activeStake).to.equal(0);
      expect(stakeSharesSupply).to.equal(0);
      expect(rewardsSharesSupply).to.equal(0);
    }
  });

  it('expires tranches correctly storing expiredTranches struct', async function () {
    const { stakingPool } = this;
    const {
      members: [user],
    } = this.accounts;

    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId, maxTranche } = await getTranches();

    const tranches = Array(MAX_ACTIVE_TRANCHES)
      .fill(0)
      .map((e, i) => firstActiveTrancheId + i);

    for (let i = 0; i < tranches.length; i++) {
      await stakingPool.connect(user).depositTo(amount, tranches[i], tokenId, destination);
    }

    const baseStakeShares = BigNumber.from(Math.sqrt(amount));

    await generateRewards(stakingPool, this.coverSigner, TRANCHE_DURATION * 7, 0);

    await stakingPool.processExpirations(true);

    const accNxmPerRewardShareAtExpiry = Array(MAX_ACTIVE_TRANCHES).fill(0);

    for (let i = 0; i < tranches.length; i++) {
      await increaseTime(TRANCHE_DURATION);

      // expire one tranche
      await stakingPool.processExpirations(false);

      const accNxmPerRewardsShare = await stakingPool.accNxmPerRewardsShare();
      accNxmPerRewardShareAtExpiry[i] = accNxmPerRewardsShare;
    }

    // Validate tranches are expired
    for (let i = 0; i < tranches.length; i++) {
      const tranche = tranches[i];
      const expiredTranche = await stakingPool.expiredTranches(tranche);

      const activeDepositsAtTranche = maxTranche - tranche + 1;

      expect(expiredTranche.accNxmPerRewardShareAtExpiry).to.equal(accNxmPerRewardShareAtExpiry[i]);
      expect(expiredTranche.stakeAmountAtExpiry).to.equal(amount.mul(activeDepositsAtTranche));
      expect(expiredTranche.stakeShareSupplyAtExpiry).to.equal(baseStakeShares.mul(activeDepositsAtTranche));
    }
  });

  it('correctly calculates accNxmPerRewardShare', async function () {
    const { stakingPool } = this;
    const {
      members: [user],
    } = this.accounts;

    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    const tranches = Array(MAX_ACTIVE_TRANCHES)
      .fill(0)
      .map((e, i) => firstActiveTrancheId + i);

    for (let i = 0; i < tranches.length; i++) {
      const tranche = tranches[i];
      await stakingPool.connect(user).depositTo(amount, tranche, tokenId, destination);
    }

    await generateRewards(stakingPool, this.coverSigner, TRANCHE_DURATION * 3, 0);

    await increaseTime(TRANCHE_DURATION - BUCKET_DURATION);

    await stakingPool.processExpirations(true);

    const accNxmPerRewardsShareBefore = await stakingPool.accNxmPerRewardsShare();
    const lastAccNxmUpdateBefore = await stakingPool.lastAccNxmUpdate();
    const rewardPerSecondBefore = await stakingPool.rewardPerSecond();
    const rewardsSharesSupply = await stakingPool.rewardsSharesSupply();

    await increaseTime(BUCKET_DURATION * 2);

    const bucketId = await stakingPool.firstActiveBucketId();
    const trancheId = await stakingPool.firstActiveTrancheId();
    const tranche = await stakingPool.tranches(trancheId);

    // expire 1 bucket + 1 tranche + 1 bucket
    await stakingPool.processExpirations(true);

    const expiredTranche = await stakingPool.expiredTranches(trancheId);

    const nextBucketId = bucketId.add(1);
    const nextBucketStartTime = nextBucketId.mul(BUCKET_DURATION);
    const nextBucketRewardPerSecondCut = await stakingPool.rewardBuckets(nextBucketId);
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

    const accNxmPerRewardsShareAfter = await stakingPool.accNxmPerRewardsShare();
    const { timestamp } = await ethers.provider.getBlock('latest');

    const secondNextBucketId = nextBucketId.add(1);
    const secondNextBucketStartTime = secondNextBucketId.mul(BUCKET_DURATION);
    const secondBucketRewardPerSecondCut = await stakingPool.rewardBuckets(secondNextBucketId);

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
    const { stakingPool } = this;
    const {
      members: [user],
    } = this.accounts;

    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);

    await generateRewards(stakingPool, this.coverSigner, daysToSeconds(10), 0);

    const accNxmPerRewardsShareBefore = await stakingPool.accNxmPerRewardsShare();
    const rewardPerSecondBefore = await stakingPool.rewardPerSecond();
    const lastAccNxmUpdateBefore = await stakingPool.lastAccNxmUpdate();

    await increaseTime(BUCKET_DURATION);

    await stakingPool.processExpirations(false);

    const firstActiveBucketId = await stakingPool.firstActiveBucketId();
    const accNxmPerRewardsShareAfter = await stakingPool.accNxmPerRewardsShare();
    const rewardPerSecondAfter = await stakingPool.rewardPerSecond();
    const lastAccNxmUpdateAfter = await stakingPool.lastAccNxmUpdate();
    const expiredBucketRewards = await stakingPool.rewardBuckets(firstActiveBucketId);
    const rewardsSharesSupply = await stakingPool.rewardsSharesSupply();

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
    const { stakingPool } = this;
    const {
      members: [user],
    } = this.accounts;

    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId: initialFirstActiveTrancheId } = await getTranches();

    // deposit to initialize first active tranche id
    await stakingPool.connect(user).depositTo(amount, initialFirstActiveTrancheId, tokenId, destination);

    const firstActiveTrancheIdBefore = await stakingPool.firstActiveTrancheId();
    expect(firstActiveTrancheIdBefore).to.equal(initialFirstActiveTrancheId);

    const increasedTranches = 7;
    await increaseTime(TRANCHE_DURATION * increasedTranches);

    await stakingPool.processExpirations(true);

    const { firstActiveTrancheId: newFirstActiveTrancheId } = await getTranches();
    const firstActiveTrancheIdAfter = await stakingPool.firstActiveTrancheId();

    expect(firstActiveTrancheIdAfter).to.equal(initialFirstActiveTrancheId + increasedTranches);
    expect(firstActiveTrancheIdAfter).to.equal(newFirstActiveTrancheId);
  });

  it('updates first active bucket id', async function () {
    const { stakingPool } = this;
    const {
      members: [user],
    } = this.accounts;

    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    // deposit to initialize first active bucket id
    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);

    const initialCurrentBucket = await getCurrentBucket();
    const firstActiveBucketIdBefore = await stakingPool.firstActiveBucketId();

    expect(firstActiveBucketIdBefore).to.equal(initialCurrentBucket);

    const increasedBuckets = 7;
    await increaseTime(BUCKET_DURATION * increasedBuckets);

    await stakingPool.processExpirations(true);

    const newCurrentBucket = await getCurrentBucket();
    const firstActiveBucketIdAfter = await stakingPool.firstActiveBucketId();

    expect(firstActiveBucketIdAfter).to.equal(initialCurrentBucket + increasedBuckets);
    expect(firstActiveBucketIdAfter).to.equal(newCurrentBucket);
  });

  it('updates accNxmPerRewardsShare and lastAccNxmUpdate up to date when forced by param', async function () {
    const { stakingPool } = this;
    const {
      members: [user],
    } = this.accounts;

    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);

    await generateRewards(stakingPool, this.coverSigner, daysToSeconds(10), 0);

    const accNxmPerRewardsShareBefore = await stakingPool.accNxmPerRewardsShare();
    const rewardPerSecondBefore = await stakingPool.rewardPerSecond();
    const lastAccNxmUpdateBefore = await stakingPool.lastAccNxmUpdate();

    await increaseTime(BUCKET_DURATION);

    // pass true to force update to current timestamp
    await stakingPool.processExpirations(true);

    const firstActiveBucketId = await stakingPool.firstActiveBucketId();
    const accNxmPerRewardsShareAfter = await stakingPool.accNxmPerRewardsShare();
    const rewardPerSecondAfter = await stakingPool.rewardPerSecond();
    const lastAccNxmUpdateAfter = await stakingPool.lastAccNxmUpdate();
    const rewardsSharesSupply = await stakingPool.rewardsSharesSupply();
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
});

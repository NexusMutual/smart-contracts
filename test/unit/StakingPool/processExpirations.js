const { ethers } = require('hardhat');
const { expect } = require('chai');
const { time, mine } = require('@nomicfoundation/hardhat-network-helpers');
const {
  getTranches,
  TRANCHE_DURATION,
  getCurrentBucket,
  BUCKET_DURATION,
  generateRewards,
  setTime,
  MAX_ACTIVE_TRANCHES,
  daysToSeconds,
} = require('./helpers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

const { ZeroAddress } = ethers;
const { parseEther } = ethers;

const depositToFixture = {
  amount: parseEther('100'),
  trancheId: 0,
  tokenId: 0,
  destination: ZeroAddress,
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

function sqrt(value) {
  if (value < 2n) {
    return value;
  }
  let z = value;
  let x = value / 2n + 1n;
  while (x < z) {
    z = x;
    x = (value / x + x) / 2n;
  }
  return z;
}

async function processExpirationSetup() {
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
    const fixture = await loadFixture(processExpirationSetup);
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
    await time.increase(TRANCHE_DURATION + 1);

    await stakingPool.processExpirations(true);

    let expiredTranche = await stakingPool.getExpiredTranche(firstActiveTrancheId);
    if (expiredTranche.stakeAmountAtExpiry === 0n) {
      await time.increase(1);
      await stakingPool.processExpirations(true);
      expiredTranche = await stakingPool.getExpiredTranche(firstActiveTrancheId);
    }
    expect(expiredTranche.accNxmPerRewardShareAtExpiry).to.equal(0);
    expect(expiredTranche.stakeAmountAtExpiry).to.equal(amount);
    expect(expiredTranche.stakeSharesSupplyAtExpiry).to.equal(sqrt(amount));
  });

  it('does not revert when expires multiple tranches', async function () {
    const fixture = await loadFixture(processExpirationSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;
    const { amount, tokenId, destination } = depositToFixture;

    const { firstActiveTrancheId } = await getTranches();

    // deposit
    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);

    // increase time to expire a couple of tranches
    await time.increase(TRANCHE_DURATION * 2);

    await expect(stakingPool.processExpirations(true)).to.not.reverted;
  });

  it('anyone can call this method', async function () {
    const fixture = await loadFixture(processExpirationSetup);
    const { stakingPool } = fixture;
    const {
      nonMembers: [anyone],
    } = fixture.accounts;

    await expect(stakingPool.connect(anyone).processExpirations(true)).to.not.be.reverted;
  });

  it('expires tranches updating active stake, stake shares and rewards shares supply', async function () {
    const fixture = await loadFixture(processExpirationSetup);
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

      const feesRewardShares =
        (deposit.rewardsShares * BigInt(initialPoolFee)) / BigInt(POOL_FEE_DENOMINATOR - BigInt(initialPoolFee));

      // double check
      const feesRewardSharesPercentage =
        (feesRewardShares * BigInt(POOL_FEE_DENOMINATOR)) / BigInt(deposit.rewardsShares);
      expect(feesRewardSharesPercentage).to.equal(initialPoolFee);

      rewardsSharesTotalSupply = rewardsSharesTotalSupply + BigInt(deposit.rewardsShares + BigInt(feesRewardShares));

      const trancheData = await stakingPool.getTranche(tranche);
      expect(trancheData.stakeShares).to.equal(deposit.stakeShares);
      expect(trancheData.rewardsShares).to.equal(deposit.rewardsShares + BigInt(feesRewardShares));
    }

    const baseStakeShares = sqrt(amount);
    const depositsCount = 8;

    {
      const activeStake = await stakingPool.getActiveStake();
      const stakeSharesSupply = await stakingPool.getStakeSharesSupply();
      const rewardsSharesSupply = await stakingPool.getRewardsSharesSupply();

      expect(activeStake).to.equal(amount * BigInt(depositsCount));
      expect(stakeSharesSupply).to.equal(baseStakeShares * BigInt(depositsCount));
      expect(rewardsSharesSupply).to.equal(rewardsSharesTotalSupply);
    }

    await generateRewards(stakingPool, fixture.coverSigner, TRANCHE_DURATION * 7, 0);

    await stakingPool.processExpirations(true);

    await time.increase(TRANCHE_DURATION * 8);

    // expire all tranches
    await stakingPool.processExpirations(true);

    // Validate tranches are expired
    for (let i = 0; i < tranches.length; i++) {
      const tranche = tranches[i];
      const expiredTranche = await stakingPool.getExpiredTranche(tranche);

      const activeDepositsAtTranche = maxTranche - tranche + 1;

      expect(expiredTranche.accNxmPerRewardShareAtExpiry).to.gt(0);
      expect(expiredTranche.stakeAmountAtExpiry).to.equal(amount * BigInt(activeDepositsAtTranche));
      expect(expiredTranche.stakeSharesSupplyAtExpiry).to.equal(baseStakeShares * BigInt(activeDepositsAtTranche));

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
    const fixture = await loadFixture(processExpirationSetup);
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

    const baseStakeShares = sqrt(amount);

    await generateRewards(stakingPool, fixture.coverSigner, TRANCHE_DURATION * 7, 0);

    await stakingPool.processExpirations(true);

    const accNxmPerRewardShareAtExpiry = Array(MAX_ACTIVE_TRANCHES).fill(0);

    for (let i = 0; i < tranches.length; i++) {
      await time.increase(TRANCHE_DURATION);

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
      expect(expiredTranche.stakeAmountAtExpiry).to.equal(amount * BigInt(activeDepositsAtTranche));
      expect(expiredTranche.stakeSharesSupplyAtExpiry).to.equal(baseStakeShares * BigInt(activeDepositsAtTranche));
    }
  });

  it('correctly calculates accNxmPerRewardShare', async function () {
    const fixture = await loadFixture(processExpirationSetup);
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

    await time.increase(TRANCHE_DURATION - BUCKET_DURATION);

    await stakingPool.processExpirations(true);

    const accNxmPerRewardsShareBefore = await stakingPool.getAccNxmPerRewardsShare();
    const lastAccNxmUpdateBefore = await stakingPool.getLastAccNxmUpdate();
    const rewardPerSecondBefore = await stakingPool.getRewardPerSecond();
    const rewardsSharesSupply = await stakingPool.getRewardsSharesSupply();

    await time.increase(BUCKET_DURATION * 2);

    const bucketId = await stakingPool.getFirstActiveBucketId();
    const trancheId = await stakingPool.getFirstActiveTrancheId();
    const tranche = await stakingPool.getTranche(trancheId);

    // expire 1 bucket + 1 tranche + 1 bucket
    await stakingPool.processExpirations(true);

    const expiredTranche = await stakingPool.getExpiredTranche(trancheId);

    const nextBucketId = bucketId + BigInt(1);
    const nextBucketStartTime = nextBucketId * BigInt(BUCKET_DURATION);
    const nextBucketRewardPerSecondCut = await stakingPool.rewardPerSecondCut(nextBucketId);
    const trancheEndTime = (trancheId + 1n) * BigInt(TRANCHE_DURATION);

    const accFromBeforeToBucketExpiration =
      ((nextBucketStartTime - BigInt(lastAccNxmUpdateBefore)) * BigInt(rewardPerSecondBefore) * parseEther('1')) /
      BigInt(rewardsSharesSupply);

    const accFromBucketExpirationToTrancheExpiration =
      ((trancheEndTime - nextBucketStartTime) *
        (BigInt(rewardPerSecondBefore) - BigInt(nextBucketRewardPerSecondCut)) *
        parseEther('1')) /
      BigInt(rewardsSharesSupply);

    expect(expiredTranche.accNxmPerRewardShareAtExpiry).to.equal(
      accNxmPerRewardsShareBefore +
        BigInt(accFromBeforeToBucketExpiration) +
        BigInt(accFromBucketExpirationToTrancheExpiration),
    );

    const accNxmPerRewardsShareAfter = await stakingPool.getAccNxmPerRewardsShare();
    const { timestamp } = await ethers.provider.getBlock('latest');

    const secondNextBucketId = nextBucketId + BigInt(1);
    const secondNextBucketStartTime = secondNextBucketId * BigInt(BUCKET_DURATION);
    const secondBucketRewardPerSecondCut = await stakingPool.rewardPerSecondCut(secondNextBucketId);

    const accFromTrancheExpirationToSecondBucketExpiration =
      ((secondNextBucketStartTime - trancheEndTime) *
        (BigInt(rewardPerSecondBefore) - BigInt(nextBucketRewardPerSecondCut)) *
        parseEther('1')) /
      (BigInt(rewardsSharesSupply) - BigInt(tranche.rewardsShares));

    const accFromSecondBucketExpirationToCurrentTime =
      ((BigInt(timestamp) - secondNextBucketStartTime) *
        (BigInt(rewardPerSecondBefore) -
          BigInt(nextBucketRewardPerSecondCut) -
          BigInt(secondBucketRewardPerSecondCut)) *
        parseEther('1')) /
      (BigInt(rewardsSharesSupply) - BigInt(tranche.rewardsShares));

    expect(accNxmPerRewardsShareAfter).to.equal(
      accNxmPerRewardsShareBefore +
        BigInt(accFromBeforeToBucketExpiration) +
        BigInt(accFromBucketExpirationToTrancheExpiration) +
        BigInt(accFromTrancheExpirationToSecondBucketExpiration) +
        BigInt(accFromSecondBucketExpirationToCurrentTime),
    );
  });

  it('expires buckets updating rewards per second and lastAccNxmUpdate', async function () {
    const fixture = await loadFixture(processExpirationSetup);
    const { stakingPool } = fixture;
    const {
      members: [user],
    } = fixture.accounts;

    const { amount, tokenId, destination } = depositToFixture;

    // advance to the start of the next bucket
    const currentBucketId = BigInt(await getCurrentBucket());
    await time.setNextBlockTimestamp(Number((currentBucketId + 1n) * BigInt(BUCKET_DURATION)));
    await mine();

    const { firstActiveTrancheId } = await getTranches();

    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId + 1, tokenId, destination);

    await generateRewards(stakingPool, fixture.coverSigner, daysToSeconds(10), 0);

    const accNxmPerRewardsShareBefore = await stakingPool.getAccNxmPerRewardsShare();
    const rewardPerSecondBefore = await stakingPool.getRewardPerSecond();
    const lastAccNxmUpdateBefore = await stakingPool.getLastAccNxmUpdate();

    await time.increase(BUCKET_DURATION);

    await stakingPool.processExpirations(false);

    const firstActiveBucketId = await stakingPool.getFirstActiveBucketId();
    const accNxmPerRewardsShareAfter = await stakingPool.getAccNxmPerRewardsShare();
    const rewardPerSecondAfter = await stakingPool.getRewardPerSecond();
    const lastAccNxmUpdateAfter = await stakingPool.getLastAccNxmUpdate();
    const expiredBucketRewards = await stakingPool.rewardPerSecondCut(firstActiveBucketId);
    const rewardsSharesSupply = await stakingPool.getRewardsSharesSupply();

    const bucketStartTime = firstActiveBucketId * BigInt(BUCKET_DURATION);
    const elapsed = bucketStartTime - BigInt(lastAccNxmUpdateBefore);

    expect(expiredBucketRewards).to.equal(rewardPerSecondBefore);
    expect(rewardPerSecondAfter).to.equal(rewardPerSecondBefore - BigInt(expiredBucketRewards));
    expect(accNxmPerRewardsShareAfter).to.equal(
      accNxmPerRewardsShareBefore +
        BigInt((elapsed * BigInt(rewardPerSecondBefore) * BigInt(parseEther('1'))) / BigInt(rewardsSharesSupply)),
    );
    expect(lastAccNxmUpdateAfter).to.equal(bucketStartTime);
  });

  it('updates first active tranche id', async function () {
    const fixture = await loadFixture(processExpirationSetup);
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
    await time.increase(TRANCHE_DURATION * increasedTranches);

    await expect(stakingPool.processExpirations(true))
      .to.emit(stakingPool, 'TrancheExpired')
      .withArgs(firstActiveTrancheIdBefore);

    const { firstActiveTrancheId: newFirstActiveTrancheId } = await getTranches();
    const firstActiveTrancheIdAfter = await stakingPool.getFirstActiveTrancheId();

    expect(firstActiveTrancheIdAfter).to.equal(initialFirstActiveTrancheId + increasedTranches);
    expect(firstActiveTrancheIdAfter).to.equal(newFirstActiveTrancheId);
  });

  it('updates first active bucket id', async function () {
    const fixture = await loadFixture(processExpirationSetup);
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
    await time.increase(BUCKET_DURATION * increasedBuckets);

    await expect(stakingPool.processExpirations(true))
      .to.emit(stakingPool, 'BucketExpired')
      .withArgs(firstActiveBucketIdBefore);

    const newCurrentBucket = await getCurrentBucket();
    const firstActiveBucketIdAfter = await stakingPool.getFirstActiveBucketId();

    expect(firstActiveBucketIdAfter).to.equal(initialCurrentBucket + increasedBuckets);
    expect(firstActiveBucketIdAfter).to.equal(newCurrentBucket);
  });

  it('updates accNxmPerRewardsShare and lastAccNxmUpdate up to date when forced by param', async function () {
    const fixture = await loadFixture(processExpirationSetup);
    const { stakingPool } = fixture;
    const {
      members: [user],
    } = fixture.accounts;

    const { amount, tokenId, destination } = depositToFixture;

    // advance to the start of the next bucket
    const currentBucketId = BigInt(await getCurrentBucket());
    await time.setNextBlockTimestamp(Number((currentBucketId + 1n) * BigInt(BUCKET_DURATION)));
    await mine();

    const { firstActiveTrancheId } = await getTranches();

    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId + 1, tokenId, destination);

    await generateRewards(stakingPool, fixture.coverSigner, daysToSeconds(10), 0);

    const accNxmPerRewardsShareBefore = await stakingPool.getAccNxmPerRewardsShare();
    const rewardPerSecondBefore = await stakingPool.getRewardPerSecond();
    const lastAccNxmUpdateBefore = await stakingPool.getLastAccNxmUpdate();

    await time.increase(BUCKET_DURATION);

    // pass true to force update to current timestamp
    await stakingPool.processExpirations(true);

    const firstActiveBucketId = await stakingPool.getFirstActiveBucketId();
    const accNxmPerRewardsShareAfter = await stakingPool.getAccNxmPerRewardsShare();
    const rewardPerSecondAfter = await stakingPool.getRewardPerSecond();
    const lastAccNxmUpdateAfter = await stakingPool.getLastAccNxmUpdate();
    const rewardsSharesSupply = await stakingPool.getRewardsSharesSupply();
    const lastBlock = await ethers.provider.getBlock('latest');

    const bucketStartTime = firstActiveBucketId * BigInt(BUCKET_DURATION);
    const elapsedInBucket = bucketStartTime - BigInt(lastAccNxmUpdateBefore);
    const elapsedAfterBucket = BigInt(lastBlock.timestamp) - lastAccNxmUpdateBefore;

    const accNxmPerRewardsAtBucketEnd =
      accNxmPerRewardsShareBefore +
      BigInt((elapsedInBucket * BigInt(rewardPerSecondBefore) * BigInt(parseEther('1'))) / BigInt(rewardsSharesSupply));
    expect(accNxmPerRewardsShareAfter).to.equal(
      accNxmPerRewardsAtBucketEnd +
        BigInt(
          (elapsedAfterBucket * BigInt(rewardPerSecondAfter) * BigInt(parseEther('1'))) / BigInt(rewardsSharesSupply),
        ),
    );
    expect(lastAccNxmUpdateAfter).to.equal(lastBlock.timestamp);
  });

  it('emits ActiveStakeUpdated event when a tranche is expired', async function () {
    const fixture = await loadFixture(processExpirationSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;

    const { amount, tokenId, destination } = depositToFixture;
    const { firstActiveTrancheId } = await getTranches();

    await stakingPool.connect(user).depositTo(amount, firstActiveTrancheId, tokenId, destination);
    const activeStakeAfter = await stakingPool.getActiveStake();
    const stakeSharesSupplyAfter = await stakingPool.getStakeSharesSupply();

    const expectedActiveStakeAfter = amount;
    const expectedStakeSharesSupplyAfter = sqrt(amount);

    expect(activeStakeAfter).to.equal(expectedActiveStakeAfter);
    expect(stakeSharesSupplyAfter).to.equal(expectedStakeSharesSupplyAfter);

    await time.increase(TRANCHE_DURATION * 2);
    await expect(stakingPool.processExpirations(true)).to.emit(stakingPool, 'ActiveStakeUpdated').withArgs(0, 0);
  });
});

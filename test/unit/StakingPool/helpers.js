const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { time, mine } = require('@nomicfoundation/hardhat-network-helpers');
const { BigIntMath } = nexus.helpers;
const { divCeil } = BigIntMath;

const { parseEther } = ethers;

const daysToSeconds = days => days * 24 * 60 * 60;

const TRANCHE_DURATION = daysToSeconds(91);
const BUCKET_DURATION = daysToSeconds(28);
const ONE_YEAR = daysToSeconds(365);
const MAX_ACTIVE_TRANCHES = 8;

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

const setTime = async timestamp => {
  await time.setNextBlockTimestamp(timestamp);
  await mine();
};

function calculateBasePrice(timestamp, product, priceChangePerDay) {
  const timeSinceLastUpdate = BigInt(timestamp) - product.bumpedPriceUpdateTime;
  const priceDrop = (timeSinceLastUpdate * BigInt(priceChangePerDay)) / BigInt(daysToSeconds(1));
  const basePrice = product.bumpedPrice - priceDrop;
  return basePrice > product.targetPrice ? basePrice : product.targetPrice;
}

function calculateBasePremiumPerYear(coverAmount, basePrice, config) {
  expect(typeof coverAmount).to.be.equal('bigint');
  expect(typeof basePrice).to.be.equal('bigint');
  const allocationAmount = divCeil(coverAmount, config.NXM_PER_ALLOCATION_UNIT);
  return (basePrice * allocationAmount * config.NXM_PER_ALLOCATION_UNIT) / config.INITIAL_PRICE_DENOMINATOR;
}

function calculateBasePremium(coverAmount, basePrice, period, config) {
  // validate inputs
  expect(typeof coverAmount).to.be.equal('bigint');
  expect(typeof basePrice).to.be.equal('bigint');

  const allocationAmount = divCeil(coverAmount, config.NXM_PER_ALLOCATION_UNIT);
  const basePremiumPerYear =
    (basePrice * allocationAmount * config.NXM_PER_ALLOCATION_UNIT) / config.INITIAL_PRICE_DENOMINATOR;

  return (basePremiumPerYear * BigInt(period)) / BigInt(ONE_YEAR);
}

function calculatePriceBump(coverAmount, priceBumpRatio, totalCapacity, NXM_PER_ALLOCATION_UNIT) {
  const allocationAmount = divCeil(coverAmount, NXM_PER_ALLOCATION_UNIT);
  return (BigInt(priceBumpRatio) * allocationAmount) / BigInt(totalCapacity);
}

// Rounds an integer up to the nearest multiple of NXM_PER_ALLOCATION_UNIT
function roundUpToNearestAllocationUnit(amount, nxmPerAllocationUnit) {
  return divCeil(amount, nxmPerAllocationUnit) * BigInt(nxmPerAllocationUnit);
}

function calculateFirstTrancheId(timestamp, period, gracePeriod) {
  return Math.floor((timestamp + period + gracePeriod) / TRANCHE_DURATION);
}

async function getCurrentTrancheId() {
  const { timestamp } = await ethers.provider.getBlock('latest');
  return Math.floor(timestamp / TRANCHE_DURATION);
}

async function getTranches(period = 0, gracePeriod = 0) {
  const lastBlock = await ethers.provider.getBlock('latest');
  const firstActiveTrancheId = calculateFirstTrancheId(lastBlock.timestamp, period, gracePeriod);
  const maxTranche = firstActiveTrancheId + MAX_ACTIVE_TRANCHES - 1;
  return { firstActiveTrancheId, maxTranche };
}

async function getCurrentBucket() {
  const lastBlock = await ethers.provider.getBlock('latest');
  return Math.floor(lastBlock.timestamp / BUCKET_DURATION);
}

async function calculateStakeShares(stakingPool, depositAmount) {
  const stakeShareSupply = await stakingPool.getStakeSharesSupply();

  if (stakeShareSupply === 0n) {
    return sqrt(depositAmount);
  }

  const activeStake = await stakingPool.getActiveStake();
  return (depositAmount * stakeShareSupply) / activeStake;
}

async function generateRewards(
  stakingPool,
  signer,
  period = daysToSeconds(10),
  gracePeriod = daysToSeconds(10),
  amount = parseEther('1'),
) {
  const allocationRequest = {
    productId: 0,
    coverId: 0,
    period,
    gracePeriod,
    useFixedPrice: false,
    capacityRatio: 20000,
    capacityReductionRatio: 0,
    rewardRatio: 5000,
    productMinPrice: 10000,
  };
  await stakingPool.connect(signer).requestAllocation(amount, allocationRequest);
}

async function calculateStakeAndRewardsWithdrawAmounts(stakingPool, deposit, trancheId) {
  const { accNxmPerRewardShareAtExpiry, stakeAmountAtExpiry, stakeSharesSupplyAtExpiry } =
    await stakingPool.getExpiredTranche(trancheId);

  return {
    rewards:
      (deposit.rewardsShares * (accNxmPerRewardShareAtExpiry - deposit.lastAccNxmPerRewardShare)) / parseEther('1') +
      deposit.pendingRewards,
    stake: (stakeAmountAtExpiry * deposit.stakeShares) / stakeSharesSupplyAtExpiry,
  };
}

async function moveTimeToNextTranche(trancheCount) {
  const nextTrancheId = (await getCurrentTrancheId()) + trancheCount;
  await setTime(nextTrancheId * TRANCHE_DURATION);
  return nextTrancheId;
}

async function moveTimeToNextBucket(bucketCount) {
  const nextBucketId = (await getCurrentBucket()) + bucketCount;
  await setTime(nextBucketId * BUCKET_DURATION);
  return nextBucketId;
}

module.exports = {
  setTime,
  calculateBasePrice,
  calculateBasePremium,
  calculateBasePremiumPerYear,
  calculatePriceBump,
  divCeil,
  roundUpToNearestAllocationUnit,
  getTranches,
  getCurrentTrancheId,
  getCurrentBucket,
  calculateStakeShares,
  generateRewards,
  calculateStakeAndRewardsWithdrawAmounts,
  moveTimeToNextBucket,
  moveTimeToNextTranche,
  daysToSeconds,
  TRANCHE_DURATION,
  BUCKET_DURATION,
  MAX_ACTIVE_TRANCHES,
};

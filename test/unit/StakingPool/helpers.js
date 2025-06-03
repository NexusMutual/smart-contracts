const { ethers } = require('hardhat');
const { expect } = require('chai');

const { setNextBlockTime, mineNextBlock } = require('../utils').evm;
const { daysToSeconds } = require('../utils').helpers;
const { divCeil } = require('../utils').bnMath;

const { parseEther } = ethers;

const TRANCHE_DURATION = daysToSeconds(91);
const BUCKET_DURATION = daysToSeconds(28);
const ONE_YEAR = daysToSeconds(365);
const MAX_ACTIVE_TRANCHES = 8;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

function calculateBasePrice(timestamp, product, priceChangePerDay) {
  const timeSinceLastUpdate = BigInt(timestamp) - BigInt(product.bumpedPriceUpdateTime);
  const priceDrop = (timeSinceLastUpdate * BigInt(priceChangePerDay)) / BigInt(daysToSeconds(1));
  const basePrice = BigInt(product.bumpedPrice) - priceDrop;
  return BigInt(Math.max(Number(basePrice), Number(product.targetPrice)));
}

function calculateBasePremiumPerYear(coverAmount, basePrice, config) {
  expect(typeof coverAmount === 'bigint' || typeof coverAmount.toBigInt === 'function').to.be.equal(true);
  expect(typeof basePrice === 'bigint' || typeof basePrice.toBigInt === 'function').to.be.equal(true);
  const allocationAmount = divCeil(coverAmount, config.NXM_PER_ALLOCATION_UNIT);
  const numerator = basePrice * allocationAmount * config.NXM_PER_ALLOCATION_UNIT;
  return numerator / config.INITIAL_PRICE_DENOMINATOR;
}

function calculateBasePremium(coverAmount, basePrice, period, config) {
  // validate inputs
  expect(typeof coverAmount === 'bigint' || typeof coverAmount.toBigInt === 'function').to.be.equal(true);
  expect(typeof basePrice === 'bigint' || typeof basePrice.toBigInt === 'function').to.be.equal(true);

  const allocationAmount = divCeil(coverAmount, config.NXM_PER_ALLOCATION_UNIT);
  const numerator = basePrice * allocationAmount * config.NXM_PER_ALLOCATION_UNIT;
  const basePremiumPerYear = numerator / config.INITIAL_PRICE_DENOMINATOR;

  return (basePremiumPerYear * BigInt(period)) / BigInt(ONE_YEAR);
}

function calculatePriceBump(coverAmount, priceBumpRatio, totalCapacity, NXM_PER_ALLOCATION_UNIT) {
  const allocationAmount = divCeil(coverAmount, NXM_PER_ALLOCATION_UNIT);
  return (BigInt(priceBumpRatio) * allocationAmount) / totalCapacity;
}

// Rounds an integer up to the nearest multiple of NXM_PER_ALLOCATION_UNIT
function roundUpToNearestAllocationUnit(amount, nxmPerAllocationUnit) {
  amount = BigInt(amount);
  return divCeil(amount, nxmPerAllocationUnit) * nxmPerAllocationUnit;
}

function calculateFirstTrancheId(timestamp, period, gracePeriod) {
  return Math.floor((timestamp + period + gracePeriod) / (91 * 24 * 3600));
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
    return BigInt(Math.floor(Math.sqrt(Number(depositAmount))));
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

  const numerator = deposit.rewardsShares * (accNxmPerRewardShareAtExpiry - deposit.lastAccNxmPerRewardShare);
  const rewardsCalc = numerator / parseEther('1');
  return {
    rewards: rewardsCalc + deposit.pendingRewards,
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
  TRANCHE_DURATION,
  BUCKET_DURATION,
  MAX_ACTIVE_TRANCHES,
};

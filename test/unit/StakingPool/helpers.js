const { ethers } = require('hardhat');
const { expect } = require('chai');

const { setNextBlockTime, mineNextBlock } = require('../utils').evm;
const { daysToSeconds } = require('../utils').helpers;

const { parseEther } = ethers.utils;
const { BigNumber } = ethers;
const { MaxUint256 } = ethers.constants;

const TRANCHE_DURATION = daysToSeconds(91);
const BUCKET_DURATION = daysToSeconds(28);
const ONE_YEAR = daysToSeconds(365);
const MAX_ACTIVE_TRANCHES = 8;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

function calculateBasePrice(timestamp, product, priceChangePerDay) {
  const timeSinceLastUpdate = BigNumber.from(timestamp).sub(product.bumpedPriceUpdateTime);
  const priceDrop = timeSinceLastUpdate.mul(priceChangePerDay).div(daysToSeconds(1));
  const basePrice = product.bumpedPrice.sub(priceDrop);
  return BigNumber.from(Math.max(basePrice, product.targetPrice));
}

function calculateBasePremiumPerYear(coverAmount, basePrice, config) {
  expect(BigNumber.isBigNumber(coverAmount)).to.be.equal(true);
  expect(BigNumber.isBigNumber(basePrice)).to.be.equal(true);
  const allocationAmount = divCeil(coverAmount, config.NXM_PER_ALLOCATION_UNIT);
  return basePrice.mul(allocationAmount).mul(config.NXM_PER_ALLOCATION_UNIT).div(config.INITIAL_PRICE_DENOMINATOR);
}

function calculateBasePremium(coverAmount, basePrice, period, config) {
  // validate inputs
  expect(BigNumber.isBigNumber(coverAmount)).to.be.equal(true);
  expect(BigNumber.isBigNumber(basePrice)).to.be.equal(true);

  const allocationAmount = divCeil(coverAmount, config.NXM_PER_ALLOCATION_UNIT);
  const basePremiumPerYear = basePrice
    .mul(allocationAmount)
    .mul(config.NXM_PER_ALLOCATION_UNIT)
    .div(config.INITIAL_PRICE_DENOMINATOR);

  return basePremiumPerYear.mul(period).div(ONE_YEAR);
}

// config is from StakingPool/unit/setup.js
function calculateSurgePremiumPerYear(coverAmount, initialCapacity, totalCapacity, config) {
  // validate inputs
  expect(BigNumber.isBigNumber(coverAmount)).to.be.equal(true);
  expect(BigNumber.isBigNumber(initialCapacity)).to.be.equal(true);
  expect(BigNumber.isBigNumber(totalCapacity)).to.be.equal(true);

  const surgeStartPoint = totalCapacity.mul(config.SURGE_THRESHOLD_RATIO).div(config.SURGE_THRESHOLD_DENOMINATOR);
  const allocationAmount = divCeil(coverAmount, config.NXM_PER_ALLOCATION_UNIT);
  const finalCapacity = initialCapacity.add(allocationAmount);
  expect(finalCapacity).to.be.lte(totalCapacity, 'Allocation exceeds available capacity');

  if (finalCapacity.lte(surgeStartPoint)) {
    return {
      surgePremiumSkipped: BigNumber.from(0),
      surgePremium: BigNumber.from(0),
      amountOnSurge: BigNumber.from(0),
    };
  }

  // total amount on surge sold for this product
  const totalAmountOnSurge = finalCapacity.sub(surgeStartPoint);

  // amount on surge sold before this cover
  const amountOnSurgeSkipped = initialCapacity.gt(surgeStartPoint)
    ? initialCapacity.sub(surgeStartPoint) // when initialCapacity is above surgeStartPoint
    : BigNumber.from(0);

  const surgePremiumTotal = totalAmountOnSurge
    .mul(totalAmountOnSurge)
    .mul(config.SURGE_PRICE_RATIO)
    .div(totalCapacity)
    .div(2);

  const surgePremiumSkipped = amountOnSurgeSkipped
    .mul(amountOnSurgeSkipped)
    .mul(config.SURGE_PRICE_RATIO)
    .div(totalCapacity)
    .div(2);

  const surgePremium = surgePremiumTotal.sub(surgePremiumSkipped);
  const amountOnSurge = totalAmountOnSurge.sub(amountOnSurgeSkipped);

  return {
    surgePremiumSkipped: surgePremiumSkipped.div(config.ALLOCATION_UNITS_PER_NXM),
    surgePremium: surgePremium.div(config.ALLOCATION_UNITS_PER_NXM),
    amountOnSurge,
  };
}

// config is from StakingPool/unit/setup.js
function calculateSurgePremium(coverAmount, initialCapacity, totalCapacity, period, config) {
  const surgePremiumPerYear = calculateSurgePremiumPerYear(coverAmount, initialCapacity, totalCapacity, config);
  return {
    surgePremiumSkipped: surgePremiumPerYear.surgePremiumSkipped.mul(period).div(ONE_YEAR),
    surgePremium: surgePremiumPerYear.surgePremium.mul(period).div(ONE_YEAR),
    amountOnSurge: surgePremiumPerYear.amountOnSurge,
  };
}

function calculatePriceBump(coverAmount, priceBumpRatio, totalCapacity, NXM_PER_ALLOCATION_UNIT) {
  const allocationAmount = divCeil(coverAmount, NXM_PER_ALLOCATION_UNIT);
  return BigNumber.from(priceBumpRatio).mul(allocationAmount).div(totalCapacity);
}

// Rounds an integer up to the nearest multiple of NXM_PER_ALLOCATION_UNIT
function roundUpToNearestAllocationUnit(amount, nxmPerAllocationUnit) {
  amount = BigNumber.from(amount);
  return divCeil(amount, nxmPerAllocationUnit).mul(nxmPerAllocationUnit);
}

function divCeil(a, b) {
  a = BigNumber.from(a);
  let result = a.div(b);
  if (!a.mod(b).isZero()) {
    result = result.add(1);
  }
  return result;
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

async function estimateStakeShares({ amount, stakingPool }) {
  const stakeShareSupply = await stakingPool.stakeSharesSupply();

  if (stakeShareSupply.isZero()) {
    return Math.sqrt(amount);
  }

  const activeStake = await stakingPool.activeStake();
  return amount.mul(stakeShareSupply).div(activeStake);
}

async function getNewRewardShares(params) {
  const { stakingPool, initialStakeShares, stakeSharesIncrease, initialTrancheId, newTrancheId } = params;
  const { timestamp: currentTime } = await ethers.provider.getBlock('latest');

  return stakingPool.calculateNewRewardShares(
    initialStakeShares,
    stakeSharesIncrease,
    initialTrancheId,
    newTrancheId,
    currentTime,
  );
}

async function generateRewards(
  stakingPool,
  signer,
  period = daysToSeconds(10),
  gracePeriod = daysToSeconds(10),
  amount = parseEther('1'),
) {
  const previousPremium = 0;
  const allocationRequest = {
    productId: 0,
    coverId: 0,
    allocationId: MaxUint256,
    period,
    gracePeriod,
    previousStart: 0,
    previousExpiration: 0,
    previousRewardsRatio: 5000,
    useFixedPrice: false,
    globalCapacityRatio: 20000,
    capacityReductionRatio: 0,
    rewardRatio: 5000,
    globalMinPrice: 10000,
  };
  await stakingPool.connect(signer).requestAllocation(amount, previousPremium, allocationRequest);
}

async function calculateStakeAndRewardsWithdrawAmounts(stakingPool, deposit, trancheId) {
  const { accNxmPerRewardShareAtExpiry, stakeAmountAtExpiry, stakeShareSupplyAtExpiry } =
    await stakingPool.expiredTranches(trancheId);

  return {
    rewards: deposit.rewardsShares
      .mul(accNxmPerRewardShareAtExpiry.sub(deposit.lastAccNxmPerRewardShare))
      .div(parseEther('1'))
      .add(deposit.pendingRewards),
    stake: stakeAmountAtExpiry.mul(deposit.stakeShares).div(stakeShareSupplyAtExpiry),
  };
}

module.exports = {
  setTime,
  calculateBasePrice,
  calculateBasePremium,
  calculateBasePremiumPerYear,
  calculatePriceBump,
  calculateSurgePremium,
  calculateSurgePremiumPerYear,
  divCeil,
  roundUpToNearestAllocationUnit,
  getTranches,
  getCurrentTrancheId,
  getCurrentBucket,
  getNewRewardShares,
  estimateStakeShares,
  generateRewards,
  calculateStakeAndRewardsWithdrawAmounts,
  TRANCHE_DURATION,
  BUCKET_DURATION,
  MAX_ACTIVE_TRANCHES,
};

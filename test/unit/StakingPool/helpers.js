const { ethers } = require('hardhat');
const { setNextBlockTime, mineNextBlock } = require('../../utils/evm');
const { parseEther } = require('ethers/lib/utils');
const { daysToSeconds } = require('../../../lib/helpers');

const { parseUnits } = ethers.utils;
const { BigNumber } = ethers;

const TRANCHE_DURATION =
  91 * // days
  24 * // hourss
  60 * // minutes
  60; // seconds
const MAX_ACTIVE_TRANCHES = 8;
const SURGE_THRESHOLD = parseUnits('0.8');
const BASE_SURGE_LOADING = parseUnits('0.1'); // 10%
const BASE_SURGE_CAPACITY_USED = parseUnits('0.01'); // 1%

const PRICE_RATIO_CHANGE_PER_DAY = parseUnits('0.005'); // 0.5%
const BASE_PRICE_BUMP_RATIO = 200; // 2%
const BASE_PRICE_BUMP_INTERVAL = 1000; // 10%
const BASE_PRICE_BUMP_DENOMINATOR = 10000;
const POOL_FEE_DENOMINATOR = 100;

const PRICE_DENOMINATOR = parseUnits('1');

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

function calculateBasePrice(timestamp, product, priceChangePerDay) {
  const timeSinceLastUpdate = BigNumber.from(timestamp).sub(product.nextPriceUpdateTime);
  const priceDrop = timeSinceLastUpdate.mul(priceChangePerDay).div(daysToSeconds('1'));
  const basePrice = product.nextPrice.lt(product.targetPrice.add(priceDrop))
    ? product.targetPrice
    : product.nextPrice.sub(priceDrop);
  return basePrice;
}

function calculateSurgePremium(amountOnSurge, totalCapacity, surgePriceRatio, allocationUnitsPerNxm) {
  amountOnSurge = BigNumber.from(amountOnSurge);
  const surgePremium = amountOnSurge.mul(surgePriceRatio.mul(amountOnSurge)).div(totalCapacity).div(2);
  return surgePremium.div(allocationUnitsPerNxm);
}

function calculateSurgePremiums(coverAmount, initialCapacityUsed, totalCapacity, config) {
  const amountOnSurge = calculateAmountOnSurge(coverAmount, initialCapacityUsed, totalCapacity, config);
  const surgePremium = calculateSurgePremium(
    amountOnSurge,
    totalCapacity,
    config.SURGE_PRICE_RATIO,
    config.ALLOCATION_UNITS_PER_NXM,
  );
  const amountOnSurgeSkipped = calculateAmountOnSurgeSkipped(coverAmount, initialCapacityUsed, totalCapacity, config);
  const surgePremiumSkipped = calculateSurgePremium(
    amountOnSurgeSkipped,
    totalCapacity,
    config.SURGE_PRICE_RATIO,
    config.ALLOCATION_UNITS_PER_NXM,
  );
  return { surgePremium, surgePremiumSkipped };
}

// config is from StakingPool/unit/setup.js
function calculateAmountOnSurge(coverAmount, initialCapacityUsed, totalCapacity, config) {
  coverAmount = divCeil(coverAmount, config.NXM_PER_ALLOCATION_UNIT);
  initialCapacityUsed = BigNumber.from(initialCapacityUsed);
  totalCapacity = BigNumber.from(totalCapacity);
  const finalCapacityUsed = initialCapacityUsed.add(coverAmount);
  const surgeStartPoint = totalCapacity.mul(config.SURGE_THRESHOLD_RATIO) / config.SURGE_THRESHOLD_DENOMINATOR;
  const amountOnSurge = finalCapacityUsed.sub(surgeStartPoint);
  return amountOnSurge;
}

// This function should calculate the amount on surge skipped
function calculateAmountOnSurgeSkipped(coverAmount, initialCapacityUsed, totalCapacity, config) {
  coverAmount = divCeil(coverAmount, config.NXM_PER_ALLOCATION_UNIT);
  initialCapacityUsed = BigNumber.from(initialCapacityUsed);
  totalCapacity = BigNumber.from(totalCapacity);
  const surgeStartPoint = totalCapacity.mul(config.SURGE_THRESHOLD_RATIO).div(config.SURGE_THRESHOLD_DENOMINATOR);

  const finalCapacityUsed = initialCapacityUsed.add(coverAmount);

  if (finalCapacityUsed.lte(surgeStartPoint)) {
    return BigNumber.from(0);
  }

  if (initialCapacityUsed.lte(surgeStartPoint)) {
    return BigNumber.from(0);
  }

  return initialCapacityUsed.sub(surgeStartPoint);
}

// Note fn expects coverAmount is rounded up to the nearest NXM_PER_ALLOCATION_UNIT
function calculatePriceBump(coverAmount, priceBumpRatio, totalCapacity) {
  const priceBump = BigNumber.from(priceBumpRatio).mul(coverAmount).div(totalCapacity);
  return priceBump;
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

function interpolatePrice(lastPriceRatio, targetPriceRatio, lastPriceUpdate, currentTimestamp) {
  const priceChange = BigNumber.from(currentTimestamp - lastPriceUpdate)
    .div(24 * 3600)
    .mul(PRICE_RATIO_CHANGE_PER_DAY);

  if (targetPriceRatio.gt(lastPriceRatio)) {
    return targetPriceRatio;
  }

  const bumpedPrice = lastPriceRatio.sub(priceChange);

  if (bumpedPrice.lt(targetPriceRatio)) {
    return targetPriceRatio;
  }

  return bumpedPrice;
}

function calculatePrice(amount, basePriceRatio, activeCover, capacity) {
  amount = BigNumber.from(amount);
  basePriceRatio = BigNumber.from(basePriceRatio);
  activeCover = BigNumber.from(activeCover);
  capacity = BigNumber.from(capacity);

  const newActiveCoverAmount = amount.add(activeCover);
  const activeCoverRatio = activeCover.mul((1e18).toString()).div(capacity);
  const newActiveCoverRatio = newActiveCoverAmount.mul((1e18).toString()).div(capacity);

  if (newActiveCoverRatio.lt(SURGE_THRESHOLD)) {
    return basePriceRatio;
  }

  const capacityUsedSteepRatio = activeCoverRatio.gte(SURGE_THRESHOLD)
    ? newActiveCoverRatio.sub(activeCoverRatio)
    : newActiveCoverRatio.sub(SURGE_THRESHOLD);
  const capacityUsedRatio = newActiveCoverRatio.sub(activeCoverRatio);

  const startSurgeLoadingRatio = activeCoverRatio.lt(SURGE_THRESHOLD)
    ? BigNumber.from(0)
    : activeCoverRatio.sub(SURGE_THRESHOLD).mul(BASE_SURGE_LOADING).div(BASE_SURGE_CAPACITY_USED);
  const endSurgeLoadingRatio = newActiveCoverRatio
    .sub(SURGE_THRESHOLD)
    .mul(BASE_SURGE_LOADING)
    .div(BASE_SURGE_CAPACITY_USED);

  const surgeLoadingRatio = capacityUsedSteepRatio
    .mul(endSurgeLoadingRatio.add(startSurgeLoadingRatio).div(2))
    .div(capacityUsedRatio);

  const actualPriceRatio = basePriceRatio.mul(surgeLoadingRatio.add(PRICE_DENOMINATOR)).div(PRICE_DENOMINATOR);
  return actualPriceRatio;
}

function getPrices(amount, activeCover, capacity, initialPrice, lastBasePrice, targetPrice, blockTimestamp) {
  amount = BigNumber.from(amount);
  activeCover = BigNumber.from(activeCover);
  capacity = BigNumber.from(capacity);
  initialPrice = BigNumber.from(initialPrice);
  targetPrice = BigNumber.from(targetPrice);
  const lastBasePriceValue = BigNumber.from(lastBasePrice.value);
  const lastUpdateTime = BigNumber.from(lastBasePrice.lastUpdateTime);

  const basePrice = interpolatePrice(
    lastBasePriceValue.gt(0) ? lastBasePriceValue : initialPrice,
    targetPrice,
    lastUpdateTime,
    blockTimestamp,
  );

  // calculate actualPrice using the current basePrice
  const actualPrice = calculatePrice(amount, basePrice, activeCover, capacity);

  // Bump base price by 2% (200 basis points) per 10% (1000 basis points) of capacity used
  const priceBump = amount
    .mul(BASE_PRICE_BUMP_DENOMINATOR)
    .div(capacity)
    .div(BASE_PRICE_BUMP_INTERVAL)
    .mul(BASE_PRICE_BUMP_RATIO);

  const bumpedBasePrice = basePrice.add(priceBump);

  return { basePrice: bumpedBasePrice, actualPrice };
}

function calculateFirstTrancheId(timestamp, period, gracePeriod) {
  return Math.floor((timestamp + period + gracePeriod) / (91 * 24 * 3600));
}

async function getCurrentTrancheId() {
  const { timestamp } = await ethers.provider.getBlock('latest');
  return Math.floor(timestamp / daysToSeconds(91));
}

async function getTranches(period = 0, gracePeriod = 0) {
  const lastBlock = await ethers.provider.getBlock('latest');
  const firstActiveTrancheId = calculateFirstTrancheId(lastBlock.timestamp, period, gracePeriod);
  const maxTranche = firstActiveTrancheId + MAX_ACTIVE_TRANCHES - 1;

  return {
    firstActiveTrancheId,
    maxTranche,
  };
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

async function generateRewards(stakingPool, signer) {
  const amount = parseEther('1');
  const previousPremium = 0;
  const allocationRequest = {
    productId: 0,
    coverId: 0,
    period: daysToSeconds(10),
    gracePeriod: daysToSeconds(10),
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

module.exports = {
  setTime,
  getPrices,
  calculatePrice,
  calculateBasePrice,
  calculateSurgePremiums,
  calculatePriceBump,
  calculateAmountOnSurge,
  calculateAmountOnSurgeSkipped,
  divCeil,
  roundUpToNearestAllocationUnit,
  getTranches,
  getCurrentTrancheId,
  getNewRewardShares,
  estimateStakeShares,
  generateRewards,
  PRICE_RATIO_CHANGE_PER_DAY,
  TRANCHE_DURATION,
  MAX_ACTIVE_TRANCHES,
  POOL_FEE_DENOMINATOR,
};

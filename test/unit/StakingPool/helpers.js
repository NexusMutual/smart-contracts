const { ethers } = require('hardhat');
const Decimal = require('decimal.js');
const { setNextBlockTime, mineNextBlock } = require('../../utils/evm');

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

function interpolatePrice(lastPriceRatio, targetPriceRatio, lastPriceUpdate, currentTimestamp) {
  const priceChange = BigNumber.from(currentTimestamp - lastPriceUpdate)
    .div(24 * 3600)
    .mul(PRICE_RATIO_CHANGE_PER_DAY);

  if (targetPriceRatio.gt(lastPriceRatio)) {
    return targetPriceRatio;
  }

  const nextPrice = lastPriceRatio.sub(priceChange);

  if (nextPrice.lt(targetPriceRatio)) {
    return targetPriceRatio;
  }

  return nextPrice;
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

function toDecimal(x) {
  return new Decimal(x.toString());
}

async function getTranches() {
  const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
  const firstActiveTrancheId = Math.floor(currentTime / TRANCHE_DURATION);
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

async function getNewRewardShares({
  stakingPool,
  initialStakeShares,
  stakeSharesIncrease,
  initialTrancheId,
  newTrancheId,
}) {
  const { timestamp: currentTime } = await ethers.provider.getBlock('latest');

  return stakingPool.calculateNewRewardShares(
    initialStakeShares,
    stakeSharesIncrease,
    initialTrancheId,
    newTrancheId,
    currentTime,
  );
}

module.exports = {
  setTime,
  getPrices,
  calculatePrice,
  toDecimal,
  getTranches,
  getNewRewardShares,
  estimateStakeShares,
  PRICE_RATIO_CHANGE_PER_DAY,
  TRANCHE_DURATION,
  MAX_ACTIVE_TRANCHES,
  POOL_FEE_DENOMINATOR,
};

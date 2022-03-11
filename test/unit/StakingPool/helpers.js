const { ethers: { BigNumber } } = require('hardhat');
const Decimal = require('decimal.js');

const SURGE_THRESHOLD = BigNumber.from(8e17.toString());
const BASE_SURGE_LOADING = BigNumber.from(1e17.toString()); // 10%
const BASE_SURGE_CAPACITY_USED = BigNumber.from(1e16.toString()); // 1%

const PRICE_RATIO_CHANGE_PER_DAY = BigNumber.from(5e15.toString()); // 0.5%
const BASE_PRICE_BUMP_RATIO = 200; // 2%
const BASE_PRICE_BUMP_INTERVAL = 1000; // 10%
const BASE_PRICE_BUMP_DENOMINATOR = 10000;

function interpolatePrice (
  lastPrice,
  targetPrice,
  lastPriceUpdate,
  currentTimestamp,
) {

  const priceChange = BigNumber.from(currentTimestamp - lastPriceUpdate).div(24 * 3600).mul(PRICE_RATIO_CHANGE_PER_DAY);

  if (targetPrice.gt(lastPrice)) {
    return targetPrice;
  }

  const nextPrice = lastPrice.sub(priceChange);

  if (nextPrice.lt(targetPrice)) {
    return targetPrice;
  }

  return nextPrice;
}

function calculatePrice (
  amount,
  basePrice,
  activeCover,
  capacity) {

  amount = BigNumber.from(amount);
  basePrice = BigNumber.from(basePrice);
  activeCover = BigNumber.from(activeCover);
  capacity = BigNumber.from(capacity);

  const newActiveCoverAmount = amount.add(activeCover);
  const activeCoverRatio = activeCover.mul(1e18.toString()).div(capacity);
  const newActiveCoverRatio = newActiveCoverAmount.mul(1e18.toString()).div(capacity);

  if (newActiveCoverRatio.lt(SURGE_THRESHOLD)) {
    return basePrice;
  }

  const capacityUsedFlat = activeCoverRatio.gte(SURGE_THRESHOLD) ? BigNumber.from(0) : SURGE_THRESHOLD.sub(activeCoverRatio);
  const capacityUsedSteep = activeCoverRatio.gte(SURGE_THRESHOLD) ? newActiveCoverRatio.sub(activeCoverRatio) : newActiveCoverRatio.sub(SURGE_THRESHOLD);
  const capacityUsed = newActiveCoverRatio.sub(activeCoverRatio);

  const startSurgeLoading =
    activeCoverRatio.lt(SURGE_THRESHOLD) ? BigNumber.from(0)
    : activeCoverRatio.sub(SURGE_THRESHOLD).mul(BASE_SURGE_LOADING).div(BASE_SURGE_CAPACITY_USED);
  const endSurgeLoading = newActiveCoverRatio.sub(SURGE_THRESHOLD).mul(BASE_SURGE_LOADING).div(BASE_SURGE_CAPACITY_USED);

  const surgeLoadingRatio = capacityUsedSteep.mul(endSurgeLoading.add(startSurgeLoading).div(2)).div(capacityUsed);

  const actualPrice = basePrice.mul(surgeLoadingRatio.add(1e18.toString()));
  return actualPrice;
}

function getPrices (
  amount,
  activeCover,
  capacity,
  initialPrice,
  lastBasePrice,
  targetPrice,
  blockTimestamp,
) {

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
  const priceBump = amount.mul(BASE_PRICE_BUMP_DENOMINATOR).div(capacity).div(BASE_PRICE_BUMP_INTERVAL).mul(BASE_PRICE_BUMP_RATIO);

  const bumpedBasePrice = basePrice.add(priceBump);

  return { basePrice: bumpedBasePrice, actualPrice };
}

function toDecimal (x) {
  return new Decimal(x.toString());
}

function assertRoughlyEqual (a, b) {
  assert(a.eq(b), `${a.toString()} != ${b.toString()}`);
}

module.exports = {
  getPrices,
  calculatePrice,
  toDecimal,
  PRICE_RATIO_CHANGE_PER_DAY
};

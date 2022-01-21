const { artifacts, web3 } = require('hardhat');
const { toBN, BN } = web3.utils;
const Decimal = require('decimal.js');

const SURGE_THRESHOLD = new Decimal(8e17);
const BASE_SURGE_LOADING = 1e17;

const PRICE_RATIO_CHANGE_PER_DAY = 100;
const PRICE_DENOMINATOR = 10000;
const BASE_PRICE_BUMP_RATIO = 200; // 2%
const BASE_PRICE_BUMP_INTERVAL = 1000; // 10%
const BASE_PRICE_BUMP_DENOMINATOR = 10000;

function interpolatePrice (
  lastPrice,
  targetPrice,
  lastPriceUpdate,
  currentTimestamp,
) {

  const priceChange = (currentTimestamp - lastPriceUpdate) / (24 * 3600) * PRICE_RATIO_CHANGE_PER_DAY;

  if (targetPrice > lastPrice) {
    return targetPrice;
  }

  return lastPrice.sub(lastPrice.sub(targetPrice)).mul(priceChange).div(PRICE_DENOMINATOR);
}

function calculatePrice (
  amount,
  basePrice,
  activeCover,
  capacity) {

  amount = toDecimal(amount);
  basePrice = toDecimal(basePrice);
  activeCover = toDecimal(activeCover);
  capacity = toDecimal(capacity);

  const newActiveCoverAmount = amount.add(activeCover);
  const activeCoverRatio = activeCover.mul(1e18).div(capacity);
  const newActiveCoverRatio = newActiveCoverAmount.mul(1e18).div(capacity);

  if (newActiveCoverRatio.lt(SURGE_THRESHOLD)) {
    return basePrice;
  }

  const surgeLoadingRatio = newActiveCoverRatio.sub(SURGE_THRESHOLD);
  const surgeFraction =
    activeCoverRatio.gte(SURGE_THRESHOLD) ? toDecimal(1e18) : surgeLoadingRatio.mul(capacity).div(amount);
  const surgeLoading = surgeLoadingRatio.mul(BASE_SURGE_LOADING).div(1e16).div(2).mul(surgeFraction).div(1e18);

  return basePrice.mul(surgeLoading.add(1e18)).div(1e18).floor();
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

  amount = toDecimal(amount);
  activeCover = toDecimal(activeCover);
  capacity = toDecimal(capacity);
  initialPrice = toDecimal(initialPrice);
  targetPrice = toDecimal(targetPrice);
  const lastBasePriceValue = toDecimal(lastBasePrice.value);
  const lastUpdateTime = toDecimal(lastBasePrice.lastUpdateTime);

  let basePrice = interpolatePrice(
    lastBasePriceValue.gt(0) ? lastBasePriceValue : initialPrice,
    targetPrice,
    lastUpdateTime,
    blockTimestamp,
  );

  console.log({
    lastBasePriceValue: lastBasePriceValue.toString(),
    basePrice: basePrice.toString(),
  });

  // calculate actualPrice using the current basePrice
  const actualPrice = calculatePrice(amount, basePrice, activeCover, capacity);

  // Bump base price by 2% (200 basis points) per 10% (1000 basis points) of capacity used
  const priceBump = amount.mul(BASE_PRICE_BUMP_DENOMINATOR).div(capacity).div(BASE_PRICE_BUMP_INTERVAL).mul(BASE_PRICE_BUMP_RATIO);

  console.log({
    capacity: capacity.toFixed(),
    amount: amount.toFixed(),
    priceBump: priceBump.toFixed(),
  });
  basePrice = basePrice + priceBump;

  return { basePrice, actualPrice };
}

function toDecimal (x) {
  return new Decimal(x.toString());
}

module.exports = {
  getPrices,
  calculatePrice,
  toDecimal,
};

const { artifacts, web3 } = require('hardhat');
const { toBN, BN } = web3.utils;
const Decimal = require('decimal.js');

function calculatePriceIntegral (
  basePrice,
  activeCover,
  capacity,
) {
  const price = basePrice.mul(activeCover.pow(toDecimal(8)).div(toDecimal(8).mul(capacity.pow(toDecimal(7)))).add(activeCover));
  return price;
}

const SURGE_THRESHOLD = new Decimal(8e17);
const BASE_SURGE_LOADING = 1e17;

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

function toDecimal (x) {
  return new Decimal(x.toString());
}

module.exports = {
  calculatePrice,
};

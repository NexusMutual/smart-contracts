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
const BASE_SURGE_LOADING = 1e16;

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
  const newActiveCoverRatio = newActiveCoverAmount.mul(1e18).div(capacity);

  if (newActiveCoverRatio.gt(SURGE_THRESHOLD)) {
    return basePrice;
  }

  const surgeLoadingRatio = newActiveCoverRatio.sub(SURGE_THRESHOLD);
  const surgeFraction = surgeLoadingRatio.mul(capacity).div(newActiveCoverAmount);
  const surgeLoading = BASE_SURGE_LOADING.mul(surgeLoadingRatio).div(1e18).div(2).mul(surgeFraction).div(1e18);

  return basePrice.mul(surgeLoading.add(1e18)).div(1e18);
}

function toDecimal (x) {
  return new Decimal(x.toString());
}

module.exports = {
  calculatePrice,
};

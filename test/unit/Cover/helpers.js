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

function calculatePrice (
  amount,
  basePrice,
  activeCover,
  capacity) {

  amount = toDecimal(amount);
  basePrice = toDecimal(basePrice);
  activeCover = toDecimal(activeCover);
  capacity = toDecimal(capacity);
  return (calculatePriceIntegral(
    basePrice,
    activeCover.add(amount),
    capacity,
  ).sub(calculatePriceIntegral(
    basePrice,
    activeCover,
    capacity,
  ))).div(amount);
}

function toDecimal (x) {
  return new Decimal(x.toString());
}

module.exports = {
  calculatePrice,
};

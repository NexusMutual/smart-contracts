const { ethers } = require('hardhat');

const APY = ethers.BigNumber.from(50); // 5000% APY
const YIELD_SCALING_FACTOR = ethers.BigNumber.from('1000000');
const ONE = ethers.BigNumber.from('1000000'); // Same scale as YIELD_SCALING_FACTOR

const DAILY_PERCENTAGE_YIELD = APY.mul(YIELD_SCALING_FACTOR).div(365).add(ONE);

/**
 * Increases the price feed rate by day based on 5000% APY
 */
const increasePriceFeedRate = async (chainLinkPriceFeed, days = 1) => {
  const priceRate = await chainLinkPriceFeed.latestAnswer();
  const compoundedDailyYield = DAILY_PERCENTAGE_YIELD.pow(days).div(YIELD_SCALING_FACTOR.pow(days - 1));
  const newPriceRate = priceRate.mul(compoundedDailyYield).div(YIELD_SCALING_FACTOR);
  await chainLinkPriceFeed.setLatestAnswer(newPriceRate);
};

module.exports = { increasePriceFeedRate };

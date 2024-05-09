const { ethers } = require('hardhat');

const APY = ethers.BigNumber.from(50); // 5000% APY
const YIELD_SCALING_FACTOR = ethers.BigNumber.from('1000000');
const DAILY_PERCENTAGE_YIELD = APY.mul(YIELD_SCALING_FACTOR)
  .div(365)
  .add(1 * YIELD_SCALING_FACTOR);

const increasePriceFeedRate = async (chainLinkPriceFeed, days = 1) => {
  const priceRate = await chainLinkPriceFeed.latestAnswer();
  const newPriceRate = priceRate.mul(DAILY_PERCENTAGE_YIELD).div(YIELD_SCALING_FACTOR).pow(days);
  await chainLinkPriceFeed.setLatestAnswer(newPriceRate);
};

module.exports = { increasePriceFeedRate };

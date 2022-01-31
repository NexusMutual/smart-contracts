const { artifacts } = require('hardhat');
const Decimal = require('decimal.js');
const CoverMockStakingPool = artifacts.require('CoverMockStakingPool');

async function createStakingPool (
  cover, productId, capacity, targetPrice, activeCover, stakingPoolCreator, stakingPoolManager, currentPrice,
) {

  const tx = await cover.connect(stakingPoolCreator).createStakingPool(stakingPoolManager.address);

  const receipt = await tx.wait();

  const { stakingPoolAddress } = receipt.events[0].args;

  const stakingPool = await CoverMockStakingPool.at(stakingPoolAddress);

  await stakingPool.setStake(productId, capacity);
  await stakingPool.setTargetPrice(productId, targetPrice);
  await stakingPool.setUsedCapacity(productId, activeCover);

  await stakingPool.setPrice(productId, currentPrice); // 2.6%

  return stakingPool;
}

function toDecimal (x) {
  return new Decimal(x.toString());
}

module.exports = {
  createStakingPool,
};

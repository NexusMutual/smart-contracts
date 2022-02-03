const { artifacts } = require('hardhat');
const Decimal = require('decimal.js');
const { assert } = require('chai');
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

async function assertCoverFields (cover, coverId, { productId, payoutAsset, period, amount, targetPriceRatio }) {
  const storedCoverData = await cover.coverData(coverId);

  const segment = await cover.coverSegments(coverId, '0');

  await assert.equal(storedCoverData.productId, productId);
  await assert.equal(storedCoverData.payoutAsset, payoutAsset);
  await assert.equal(storedCoverData.amountPaidOut, '0');
  await assert.equal(segment.period, period);
  await assert.equal(segment.amount.toString(), amount.toString());
  await assert.equal(segment.priceRatio.toString(), targetPriceRatio.toString());
}

function toDecimal (x) {
  return new Decimal(x.toString());
}

module.exports = {
  createStakingPool,
  assertCoverFields,
};

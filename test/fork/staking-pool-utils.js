// Check that effective weights are calculated correctly
const { ethers } = require('hardhat');
const { V2Addresses } = require('./utils');
const { expect } = require('chai');
const { BigNumber } = ethers;

async function verifyPoolWeights(stakingProducts, poolId, config) {
  const cover = await ethers.getContractAt('Cover', V2Addresses.Cover);
  const numProducts = await cover.productsCount();
  const stakedProducts = [];

  // get products from staking pool and discard if not initialized
  for (let i = 0; i < numProducts; i++) {
    const { lastEffectiveWeight, targetWeight, bumpedPrice, bumpedPriceUpdateTime } = await stakingProducts.getProduct(
      poolId,
      i,
    );

    // bumpedPrice and bumpedPriceUpdateTime should be greater than 0 if initialized
    if (BigNumber.from(bumpedPrice).isZero()) {
      expect(bumpedPriceUpdateTime).to.equal(0);
      continue;
    }

    stakedProducts.push({ targetWeight, lastEffectiveWeight, productId: i, bumpedPrice });
  }

  let expectedTotalEffectiveWeight = BigNumber.from(0);
  for (let i = 0; i < stakedProducts.length; i++) {
    const product = stakedProducts[i];
    expectedTotalEffectiveWeight = expectedTotalEffectiveWeight.add(product.targetWeight);
  }

  for (let i = 0; i < stakedProducts.length; i++) {
    const product = stakedProducts[i];
    // TODO: actually calculate effective weight in case of burns
    const expectedEffectiveWeight = product.targetWeight;
    const { lastEffectiveWeight } = await stakingProducts.getProduct(poolId, product.productId);
    const { capacityReductionRatio } = await cover.products(product.productId);
    const effectiveWeightCalculated = await stakingProducts.getEffectiveWeight(
      poolId,
      product.productId,
      product.targetWeight,
      config.GLOBAL_CAPACITY_RATIO /* globalCapacityRatio */,
      capacityReductionRatio,
    );
    expect(lastEffectiveWeight).to.equal(effectiveWeightCalculated);
    expect(lastEffectiveWeight).to.equal(expectedEffectiveWeight);
  }

  const totalEffectiveWeight = await stakingProducts.getTotalEffectiveWeight(poolId);
  expect(totalEffectiveWeight).to.equal(expectedTotalEffectiveWeight);
}

module.exports = {
  verifyPoolWeights,
};

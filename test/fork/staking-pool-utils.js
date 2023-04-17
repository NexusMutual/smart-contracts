// Check that effective weights are calculated correctly
const { ethers } = require('hardhat');
const { V2Addresses } = require('./utils');
const { expect } = require('chai');
const { BigNumber } = ethers;

async function getMaxTotalCapacity(stakingPool, capacityReductionRatio, config) {
  const {
    GLOBAL_CAPACITY_RATIO,
    CAPACITY_REDUCTION_DENOMINATOR,
    NXM_PER_ALLOCATION_UNIT,
    GLOBAL_CAPACITY_DENOMINATOR,
  } = config;

  const activeStake = await stakingPool.getActiveStake();
  const multiplier = BigNumber.from(GLOBAL_CAPACITY_RATIO).mul(
    CAPACITY_REDUCTION_DENOMINATOR.sub(capacityReductionRatio),
  );
  const denominator = BigNumber.from(GLOBAL_CAPACITY_DENOMINATOR).mul(CAPACITY_REDUCTION_DENOMINATOR);
  const maxTotalCapacity = activeStake.mul(multiplier).div(denominator).div(NXM_PER_ALLOCATION_UNIT);
  return maxTotalCapacity;
}
async function calculateActualWeight(stakingPool, targetWeight, productId, config) {
  const MAX_UINT16 = BigNumber.from(2).pow(16).sub(1);

  const cover = await ethers.getContractAt('Cover', V2Addresses.Cover);
  const product = await cover.products(productId);
  const capacityReductionRatio = product.capacityReductionRatio;

  const totalCapacity = await getMaxTotalCapacity(stakingPool, capacityReductionRatio, config);

  const allocations = await stakingPool.getActiveAllocations(productId);
  const totalAllocation = allocations.reduce((a, b) => a.add(b), BigNumber.from(0));

  if (!BigNumber.isBigNumber(targetWeight)) {
    throw new Error('Invalid input: totalCapacity, targetWeight, and totalAllocation must be BigNumber objects');
  }

  if (totalCapacity.eq(0)) {
    if (totalAllocation.gt(0)) {
      throw Error('TODO: handle case where totalCapacity is 0 but totalAllocation is not');
      // return MAX_UINT16;
    }
    return BigNumber.from(targetWeight);
  }

  let actualWeight = BigNumber.from(totalAllocation).mul(config.WEIGHT_DENOMINATOR).div(totalCapacity);

  if (actualWeight.gt(MAX_UINT16)) {
    actualWeight = MAX_UINT16;
  }

  if (targetWeight.gt(actualWeight)) {
    return targetWeight;
  } else {
    return actualWeight;
  }
}

async function verifyPoolWeights(stakingProducts, poolId, config) {
  const cover = await ethers.getContractAt('Cover', V2Addresses.Cover);
  const numProducts = await cover.productsCount();
  const stakedProducts = [];
  const stakingPoolAddress = await cover.stakingPool(poolId);
  const stakingPool = await ethers.getContractAt('StakingPool', stakingPoolAddress);

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
    const expectedEffectiveWeight = await calculateActualWeight(
      stakingPool,
      product.targetWeight,
      product.productId,
      config,
    );
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

const { ethers } = require('hardhat');
const { expect } = require('chai');

const { parseEther } = ethers.utils;

const { allocateCapacity, depositTo, burnStake, setStakedProducts } = require('./helpers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

const poolId = 1;
const productId = 0;

async function getEffectiveWeightSetup() {
  const fixture = await loadFixture(setup);
  const { cover, coverProducts } = fixture;
  const capacityRatio = await cover.GLOBAL_CAPACITY_RATIO();
  const product = await coverProducts.getProduct(productId);

  fixture.globalCapacityRatio = capacityRatio;
  fixture.capacityReductionRatio = product.capacityReductionRatio;

  return {
    ...fixture,
    capacityReductionRatio: product.capacityReductionRatio,
    globalCapacityRatio: capacityRatio,
  };
}

describe('getEffectiveWeight', function () {
  it('should return target weight when there is no active stake or allocations', async function () {
    const fixture = await loadFixture(getEffectiveWeightSetup);
    const { stakingProducts } = fixture;

    {
      const effectiveWeight = await stakingProducts.getEffectiveWeight(
        poolId,
        productId,
        0,
        fixture.globalCapacityRatio,
        fixture.capacityReductionRatio,
      );
      expect(effectiveWeight).to.equal(0);
    }

    {
      const effectiveWeight = await stakingProducts.getEffectiveWeight(
        poolId,
        productId,
        100,
        fixture.globalCapacityRatio,
        fixture.capacityReductionRatio,
      );
      expect(effectiveWeight).to.equal(100);
    }
    {
      const effectiveWeight = await stakingProducts.getEffectiveWeight(
        poolId,
        productId,
        10000,
        fixture.globalCapacityRatio,
        fixture.capacityReductionRatio,
      );
      expect(effectiveWeight).to.equal(10000);
    }
  });

  it('should return effective weight when there is active stake but no active allocation', async function () {
    const fixture = await loadFixture(getEffectiveWeightSetup);
    const { stakingProducts } = fixture;
    const [staker] = fixture.accounts.members;

    await setStakedProducts.call(fixture, { productIds: [productId] });
    await depositTo.call(fixture, { staker, amount: parseEther('100') });

    const effectiveWeight = await stakingProducts.getEffectiveWeight(
      poolId,
      productId,
      100,
      fixture.globalCapacityRatio,
      fixture.capacityReductionRatio,
    );
    expect(effectiveWeight).to.equal(100);
  });

  it('effective weight should be 100 when capacity == allocations', async function () {
    const fixture = await loadFixture(getEffectiveWeightSetup);
    const { stakingProducts } = fixture;
    const [staker] = fixture.accounts.members;

    await setStakedProducts.call(fixture, { productIds: [productId] });
    await depositTo.call(fixture, { staker, amount: parseEther('100') });
    // 2x capacity ratio
    await allocateCapacity.call(fixture, { amount: parseEther('200'), productId });

    {
      const effectiveWeight = await stakingProducts.getEffectiveWeight(
        poolId,
        productId,
        1,
        fixture.globalCapacityRatio,
        fixture.capacityReductionRatio,
      );
      expect(effectiveWeight).to.equal(100);
    }

    {
      const effectiveWeight = await stakingProducts.getEffectiveWeight(
        poolId,
        productId,
        100,
        fixture.globalCapacityRatio,
        fixture.capacityReductionRatio,
      );
      expect(effectiveWeight).to.equal(100);
    }
  });

  it('should return effective weight, when actual weight is greater than the target weight', async function () {
    const fixture = await loadFixture(getEffectiveWeightSetup);
    const { stakingProducts } = fixture;
    const [staker] = fixture.accounts.members;

    const { timestamp: start } = await ethers.provider.getBlock('latest');
    await setStakedProducts.call(fixture, { productIds: [productId] });
    await depositTo.call(fixture, { staker, amount: parseEther('100') });
    // 50% allocation
    await allocateCapacity.call(fixture, { amount: parseEther('100'), productId });
    // burn 50%
    await burnStake.call(fixture, { start, amount: parseEther('50') });

    const effectiveWeight = await stakingProducts.getEffectiveWeight(
      poolId,
      productId,
      30,
      fixture.globalCapacityRatio,
      fixture.capacityReductionRatio,
    );
    expect(effectiveWeight).to.equal(100);
  });

  it('should return targetWeight if capacity ratio is 0', async function () {
    const fixture = await loadFixture(getEffectiveWeightSetup);
    // capacity will be 0 when capacity ratio is 0
    const { stakingProducts } = fixture;
    const [staker] = fixture.accounts.members;

    await setStakedProducts.call(fixture, { productIds: [productId] });
    await depositTo.call(fixture, { staker, amount: parseEther('100') });
    await allocateCapacity.call(fixture, { amount: parseEther('100'), productId });

    const effectiveWeight = await stakingProducts.getEffectiveWeight(
      poolId,
      productId,
      30,
      0,
      fixture.capacityReductionRatio,
    );
    expect(effectiveWeight).to.equal(30);

    {
      const effectiveWeight = await stakingProducts.getEffectiveWeight(
        poolId,
        productId,
        1,
        0,
        fixture.capacityReductionRatio,
      );
      expect(effectiveWeight).to.equal(1);
    }
  });

  it('should return target weight if capacity reduction ratio is 10000', async function () {
    const fixture = await loadFixture(getEffectiveWeightSetup);
    // capacity will be 0
    const { stakingProducts } = fixture;
    const [staker] = fixture.accounts.members;

    await setStakedProducts.call(fixture, { productIds: [productId] });
    await depositTo.call(fixture, { staker, amount: parseEther('100') });
    await allocateCapacity.call(fixture, { amount: parseEther('100'), productId });

    const effectiveWeight = await stakingProducts.getEffectiveWeight(
      poolId,
      productId,
      1,
      fixture.globalCapacityRatio,
      10000,
    );
    expect(effectiveWeight).to.equal(1);
  });

  it('increasing capacity reduction ratio should increase effective weight', async function () {
    const fixture = await loadFixture(getEffectiveWeightSetup);
    const { stakingProducts } = fixture;
    const [staker] = fixture.accounts.members;

    await setStakedProducts.call(fixture, { productIds: [productId] });
    await depositTo.call(fixture, { staker, amount: parseEther('100') });
    // 1% of capacity
    await allocateCapacity.call(fixture, { amount: parseEther('2'), productId });

    {
      const effectiveWeight = await stakingProducts.getEffectiveWeight(
        poolId,
        productId,
        1,
        fixture.globalCapacityRatio,
        0,
      );
      expect(effectiveWeight).to.equal(1);
    }

    const effectiveWeight = await stakingProducts.getEffectiveWeight(
      poolId,
      productId,
      1,
      fixture.globalCapacityRatio,
      5000,
    );
    expect(effectiveWeight).to.equal(2);
  });

  it('increasing capacity ratio should decrease effective weight', async function () {
    const fixture = await loadFixture(getEffectiveWeightSetup);
    const { stakingProducts } = fixture;
    const [staker] = fixture.accounts.members;

    await setStakedProducts.call(fixture, { productIds: [productId] });
    await depositTo.call(fixture, { staker, amount: parseEther('100') });
    // 10% of capacity
    await allocateCapacity.call(fixture, { amount: parseEther('20'), productId });

    {
      const effectiveWeight = await stakingProducts.getEffectiveWeight(
        poolId,
        productId,
        0,
        fixture.globalCapacityRatio,
        fixture.capacityReductionRatio,
      );
      expect(effectiveWeight).to.equal(10);
    }

    const effectiveWeight = await stakingProducts.getEffectiveWeight(
      poolId,
      productId,
      0,
      40000,
      fixture.capacityReductionRatio,
    );
    expect(effectiveWeight).to.equal(5);
  });
});

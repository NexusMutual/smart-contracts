const { ethers } = require('hardhat');
const { expect } = require('chai');

const { parseEther } = ethers.utils;

const { allocateCapacity, depositTo, burnStake, setStakedProducts } = require('./helpers');

const poolId = 1;
const productId = 0;
describe('getEffectiveWeight', function () {
  before(async function () {
    const { coverProducts, cover } = this;

    const capacityRatio = await cover.GLOBAL_CAPACITY_RATIO();
    const product = await coverProducts.products(productId);

    this.globalCapacityRatio = capacityRatio;
    this.capacityReductionRatio = product.capacityReductionRatio;
  });

  it('should return target weight when there is no active stake or allocations', async function () {
    const { stakingProducts } = this;

    {
      const effectiveWeight = await stakingProducts.getEffectiveWeight(
        poolId,
        productId,
        0,
        this.globalCapacityRatio,
        this.capacityReductionRatio,
      );
      expect(effectiveWeight).to.equal(0);
    }

    {
      const effectiveWeight = await stakingProducts.getEffectiveWeight(
        poolId,
        productId,
        100,
        this.globalCapacityRatio,
        this.capacityReductionRatio,
      );
      expect(effectiveWeight).to.equal(100);
    }
    {
      const effectiveWeight = await stakingProducts.getEffectiveWeight(
        poolId,
        productId,
        10000,
        this.globalCapacityRatio,
        this.capacityReductionRatio,
      );
      expect(effectiveWeight).to.equal(10000);
    }
  });

  it('should return effective weight when there is active stake but no active allocation', async function () {
    const { stakingProducts } = this;
    const [staker] = this.accounts.members;

    await setStakedProducts.call(this, { productIds: [productId] });
    await depositTo.call(this, { staker, amount: parseEther('100') });

    const effectiveWeight = await stakingProducts.getEffectiveWeight(
      poolId,
      productId,
      100,
      this.globalCapacityRatio,
      this.capacityReductionRatio,
    );
    expect(effectiveWeight).to.equal(100);
  });

  it('effective weight should be 100 when capacity == allocations', async function () {
    const { stakingProducts } = this;
    const [staker, coverBuyer] = this.accounts.members;

    await setStakedProducts.call(this, { productIds: [productId] });
    await depositTo.call(this, { staker, amount: parseEther('100') });
    // 2x capacity ratio
    await allocateCapacity.call(this, { coverBuyer, amount: parseEther('200'), productId });

    {
      const effectiveWeight = await stakingProducts.getEffectiveWeight(
        poolId,
        productId,
        1,
        this.globalCapacityRatio,
        this.capacityReductionRatio,
      );
      expect(effectiveWeight).to.equal(100);
    }

    {
      const effectiveWeight = await stakingProducts.getEffectiveWeight(
        poolId,
        productId,
        100,
        this.globalCapacityRatio,
        this.capacityReductionRatio,
      );
      expect(effectiveWeight).to.equal(100);
    }
  });

  it('should return effective weight, when actual weight is greater than the target weight', async function () {
    const { stakingProducts } = this;
    const [staker, coverBuyer] = this.accounts.members;

    const { timestamp: start } = await ethers.provider.getBlock('latest');
    await setStakedProducts.call(this, { productIds: [productId] });
    await depositTo.call(this, { staker, amount: parseEther('100') });
    // 50% allocation
    await allocateCapacity.call(this, { coverBuyer, amount: parseEther('100'), productId });
    // burn 50%
    await burnStake.call(this, { start, amount: parseEther('50') });

    const effectiveWeight = await stakingProducts.getEffectiveWeight(
      poolId,
      productId,
      30,
      this.globalCapacityRatio,
      this.capacityReductionRatio,
    );
    expect(effectiveWeight).to.equal(100);
  });

  it('should return targetWeight if capacity ratio is 0', async function () {
    // capacity will be 0 when capacity ratio is 0
    const { stakingProducts } = this;
    const [staker, coverBuyer] = this.accounts.members;

    await setStakedProducts.call(this, { productIds: [productId] });
    await depositTo.call(this, { staker, amount: parseEther('100') });
    await allocateCapacity.call(this, { coverBuyer, amount: parseEther('100'), productId });

    const effectiveWeight = await stakingProducts.getEffectiveWeight(
      poolId,
      productId,
      30,
      0,
      this.capacityReductionRatio,
    );
    expect(effectiveWeight).to.equal(30);

    {
      const effectiveWeight = await stakingProducts.getEffectiveWeight(
        poolId,
        productId,
        1,
        0,
        this.capacityReductionRatio,
      );
      expect(effectiveWeight).to.equal(1);
    }
  });

  it('should return target weight if capacity reduction ratio is 10000', async function () {
    // capacity will be 0
    const { stakingProducts } = this;
    const [staker, coverBuyer] = this.accounts.members;

    await setStakedProducts.call(this, { productIds: [productId] });
    await depositTo.call(this, { staker, amount: parseEther('100') });
    await allocateCapacity.call(this, { coverBuyer, amount: parseEther('100'), productId });

    const effectiveWeight = await stakingProducts.getEffectiveWeight(
      poolId,
      productId,
      1,
      this.globalCapacityRatio,
      10000,
    );
    expect(effectiveWeight).to.equal(1);
  });

  it('increasing capacity reduction ratio should increase effective weight', async function () {
    const { stakingProducts } = this;
    const [staker, coverBuyer] = this.accounts.members;

    await setStakedProducts.call(this, { productIds: [productId] });
    await depositTo.call(this, { staker, amount: parseEther('100') });
    // 1% of capacity
    await allocateCapacity.call(this, { coverBuyer, amount: parseEther('2'), productId });

    {
      const effectiveWeight = await stakingProducts.getEffectiveWeight(
        poolId,
        productId,
        1,
        this.globalCapacityRatio,
        0,
      );
      expect(effectiveWeight).to.equal(1);
    }

    const effectiveWeight = await stakingProducts.getEffectiveWeight(
      poolId,
      productId,
      1,
      this.globalCapacityRatio,
      5000,
    );
    expect(effectiveWeight).to.equal(2);
  });

  it('increasing capacity ratio should decrease effective weight', async function () {
    const { stakingProducts } = this;
    const [staker, coverBuyer] = this.accounts.members;

    await setStakedProducts.call(this, { productIds: [productId] });
    await depositTo.call(this, { staker, amount: parseEther('100') });
    // 10% of capacity
    await allocateCapacity.call(this, { coverBuyer, amount: parseEther('20'), productId });

    {
      const effectiveWeight = await stakingProducts.getEffectiveWeight(
        poolId,
        productId,
        0,
        this.globalCapacityRatio,
        this.capacityReductionRatio,
      );
      expect(effectiveWeight).to.equal(10);
    }

    const effectiveWeight = await stakingProducts.getEffectiveWeight(
      poolId,
      productId,
      0,
      40000,
      this.capacityReductionRatio,
    );
    expect(effectiveWeight).to.equal(5);
  });
});

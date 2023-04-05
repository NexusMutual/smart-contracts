const { ethers } = require('hardhat');
const { expect } = require('chai');

const { parseEther } = ethers.utils;
const { Zero } = ethers.constants;

const { allocateCapacity, depositTo, burnStake, setStakedProducts } = require('./helpers');

const DEFAULT_PRODUCTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
describe('recalculateEffectiveWeight', function () {
  it('should return 0 for products not found in stakingPool', async function () {
    const { stakingProducts } = this;
    const productIdToAdd = Zero;

    await setStakedProducts.call(this, { productIds: [productIdToAdd] });

    const stakedProduct = await stakingProducts.getProduct(this.poolId, productIdToAdd);
    expect(stakedProduct.lastEffectiveWeight).to.be.equal(100);
    expect(stakedProduct.targetWeight).to.be.equal(100);

    const unknownProduct = await stakingProducts.getProduct(this.poolId, productIdToAdd.add(1));
    expect(unknownProduct.lastEffectiveWeight).to.be.equal(0);

    expect(await stakingProducts.getTotalTargetWeight(this.poolId)).to.be.equal(100);
    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.equal(100);

    // recalculating should do nothing
    await stakingProducts.recalculateEffectiveWeights(this.poolId, [productIdToAdd, productIdToAdd.add(1)]);

    expect(await stakingProducts.getTotalTargetWeight(this.poolId)).to.be.equal(100);
    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.equal(100);

    {
      const unknownProduct = await stakingProducts.getProduct(this.poolId, productIdToAdd.add(1));
      expect(unknownProduct.lastEffectiveWeight).to.be.equal(0);
      expect(unknownProduct.targetWeight).to.be.equal(0);
    }
  });

  it('should be equal to the target weight if there are no burns', async function () {
    const { stakingProducts, stakingPool } = this;
    const [staker, coverBuyer] = this.accounts.members;
    const amount = parseEther('1');
    const coverBuyAmount = parseEther('1');

    // set target weight to 50% for all products
    await setStakedProducts.call(this, { productIds: DEFAULT_PRODUCTS, targetWeight: 50 });

    // deposit stake
    const { timestamp: start } = await ethers.provider.getBlock('latest');
    await depositTo.call(this, { staker, amount });

    // buy all cover on all products at 50% target weight
    const allocationPromises = [];
    for (const productId of DEFAULT_PRODUCTS) {
      allocationPromises.push(allocateCapacity.call(this, { coverBuyer, amount: coverBuyAmount, productId }));
    }
    await Promise.all(allocationPromises);
    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.equal(
      await stakingProducts.getTotalTargetWeight(this.poolId),
    );
    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.equal(1000);

    // burn half of active stake: leaving 1/2 of the capacity, so effective weight should now be maxed out
    const activeStake = await stakingPool.getActiveStake();
    await burnStake.call(this, { amount: activeStake.div(2), start });

    // recalculate effective weight
    await stakingProducts.recalculateEffectiveWeights(this.poolId, DEFAULT_PRODUCTS);
    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.equal(2000);
    expect(await stakingProducts.getTotalTargetWeight(this.poolId)).to.be.equal(1000);

    // lowering target weight shouldn't change effective weight
    await setStakedProducts.call(this, { productIds: DEFAULT_PRODUCTS, targetWeight: 1 });
    await stakingProducts.recalculateEffectiveWeights(this.poolId, DEFAULT_PRODUCTS);
    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.equal(2000);
    expect(await stakingProducts.getTotalTargetWeight(this.poolId)).to.be.equal(20);

    // raising target weight also shouldn't change effective weight
    await setStakedProducts.call(this, { productIds: DEFAULT_PRODUCTS, targetWeight: 100 });
    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.equal(
      await stakingProducts.getTotalTargetWeight(this.poolId),
    );
    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.equal(2000);

    // burn half the remaining stake
    {
      // allocation will be at 200% of max allowable capacity, so effective weight should now be 200%
      const activeStake = await stakingPool.getActiveStake();
      await burnStake.call(this, { amount: activeStake.div(2), start });
    }

    // recalculate effective weight
    await stakingProducts.recalculateEffectiveWeights(this.poolId, DEFAULT_PRODUCTS);
    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.gt(
      await stakingProducts.getTotalTargetWeight(this.poolId),
    );
    // 2000 * 2.00 = 4000
    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.equal(4000);
  });

  it('should fail to recalculate effective weight for product not in system', async function () {
    const { stakingProducts, cover } = this;

    await setStakedProducts.call(this, { productIds: [1, 2, 3] });
    await expect(stakingProducts.recalculateEffectiveWeights(this.poolId, [9999999])).to.be.revertedWithCustomError(
      cover,
      'ProductDeprecatedOrNotInitialized',
    );
  });
});

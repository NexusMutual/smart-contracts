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

  // TODO: add max products and buy all coverage
  it.skip('should be equal to the target weight if there are no burns', async function () {
    const { stakingProducts } = this;
    const [staker, coverBuyer] = this.accounts.members;
    const amount = parseEther('1');
    const coverBuyAmount = parseEther('.5');

    await setStakedProducts.call(this, { productIds: DEFAULT_PRODUCTS, targetWeight: 50 });

    const { timestamp: start } = await ethers.provider.getBlock('latest');
    await depositTo.call(this, { staker, amount });

    // buy cover product 1
    await allocateCapacity.call(this, { coverBuyer, amount: coverBuyAmount, productId: 1 });
    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.equal(
      await stakingProducts.getTotalTargetWeight(this.poolId),
    );

    // burn
    await burnStake.call(this, { amount: coverBuyAmount, start });

    // buy cover product 2 doesnt increase effective weight
    await allocateCapacity.call(this, { coverBuyer, amount: coverBuyAmount, productId: 2 });
    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.equal(
      await stakingProducts.getTotalTargetWeight(this.poolId),
    );

    // recalculate effective weight
    await stakingProducts.recalculateEffectiveWeights(this.poolId, DEFAULT_PRODUCTS);

    // Now effective weight should be above target weight
    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.gt(
      await stakingProducts.getTotalTargetWeight(this.poolId),
    );

    // raising target weight to 100 should make total effective weight equal to total target weight
    await setStakedProducts.call(this, { productIds: DEFAULT_PRODUCTS, targetWeight: 100 });
    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.equal(
      await stakingProducts.getTotalTargetWeight(this.poolId),
    );

    await burnStake.call(this, { amount: coverBuyAmount, start });

    // recalculate effective weight
    await stakingProducts.recalculateEffectiveWeights(this.poolId, DEFAULT_PRODUCTS);
    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.gt(
      await stakingProducts.getTotalTargetWeight(this.poolId),
    );
  });

  it('should fail to recalculate effective weight for product not in system', async function () {
    const { stakingProducts, cover } = this;

    await setStakedProducts.call(this, { productIds: [1, 2, 3] });
    await expect(stakingProducts.recalculateEffectiveWeights(this.poolId, [99])).to.be.revertedWithCustomError(
      cover,
      'ProductDeprecatedOrNotInitialized',
    );
  });
});

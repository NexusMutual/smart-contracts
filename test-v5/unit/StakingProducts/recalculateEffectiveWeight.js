const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const {
  allocateCapacity,
  depositTo,
  burnStake,
  setStakedProducts,
  daysToSeconds,
  burnStakeParams,
  newProductTemplate,
} = require('./helpers');
const setup = require('./setup');
const { increaseTime, setEtherBalance } = require('../utils').evm;

const { parseEther } = ethers.utils;
const { Zero, One } = ethers.constants;

const DEFAULT_PRODUCTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const MAX_TARGET_WEIGHT = 100;
const MAX_TOTAL_EFFECTIVE_WEIGHT = 2000;
const UINT16_MAX = 65535;

describe('recalculateEffectiveWeight', function () {
  it('recalculating effective weight should have no effect for products not found in stakingPool', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts } = fixture;
    const productIdToAdd = Zero;
    const unknownProductId = productIdToAdd.add(1);

    await setStakedProducts.call(fixture, { productIds: [productIdToAdd] });

    const stakedProduct = await stakingProducts.getProduct(fixture.poolId, productIdToAdd);
    expect(stakedProduct.lastEffectiveWeight).to.be.equal(MAX_TARGET_WEIGHT);
    expect(stakedProduct.targetWeight).to.be.equal(MAX_TARGET_WEIGHT);

    const unknownProduct = await stakingProducts.getProduct(fixture.poolId, unknownProductId);
    expect(unknownProduct.lastEffectiveWeight).to.be.equal(0);

    expect(await stakingProducts.getTotalTargetWeight(fixture.poolId)).to.be.equal(MAX_TARGET_WEIGHT);
    expect(await stakingProducts.getTotalEffectiveWeight(fixture.poolId)).to.be.equal(MAX_TARGET_WEIGHT);

    // recalculating should do nothing
    await stakingProducts.recalculateEffectiveWeights(fixture.poolId, [productIdToAdd, unknownProductId]);

    expect(await stakingProducts.getTotalTargetWeight(fixture.poolId)).to.be.equal(MAX_TARGET_WEIGHT);
    expect(await stakingProducts.getTotalEffectiveWeight(fixture.poolId)).to.be.equal(MAX_TARGET_WEIGHT);

    {
      const unknownProduct = await stakingProducts.getProduct(fixture.poolId, unknownProductId);
      expect(unknownProduct.lastEffectiveWeight).to.be.equal(0);
      expect(unknownProduct.targetWeight).to.be.equal(0);
    }
  });

  // TODO: implement once https://github.com/NexusMutual/smart-contracts/issues/842 is sorted out
  it.skip('effective weight should be > target when allocations are greater than capacity', async function () {});

  it('should calculate effective weight properly when decreasing target weight', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts } = fixture;
    const [staker] = fixture.accounts.members;

    const amount = parseEther('12345');
    const coverBuyAmount = amount.mul(8).div(100).mul(2); // 8% of capacity with 2x capacity multiplier

    const productIdToAdd = Zero;
    const initialTargetWeight = 10;
    await setStakedProducts.call(fixture, { productIds: [productIdToAdd], targetWeight: initialTargetWeight });

    // deposit stake
    await depositTo.call(fixture, { staker, amount });

    // buy cover
    const expectedEffectiveWeight = 8;
    await allocateCapacity.call(fixture, { amount: coverBuyAmount, productId: productIdToAdd });

    // recalculate effective weight
    await stakingProducts.recalculateEffectiveWeights(fixture.poolId, [productIdToAdd]);

    expect(await stakingProducts.getTotalTargetWeight(fixture.poolId)).to.be.equal(initialTargetWeight);
    expect(await stakingProducts.getTotalEffectiveWeight(fixture.poolId)).to.be.equal(initialTargetWeight);
    {
      const stakedProduct = await stakingProducts.getProduct(fixture.poolId, productIdToAdd);
      expect(stakedProduct.lastEffectiveWeight).to.be.equal(initialTargetWeight);
      expect(stakedProduct.targetWeight).to.be.equal(initialTargetWeight);
    }

    // decrease target weight
    const reducedTargetWeight = 5;
    await setStakedProducts.call(fixture, { productIds: [productIdToAdd], targetWeight: reducedTargetWeight });

    // recalculate effective weight
    await stakingProducts.recalculateEffectiveWeights(fixture.poolId, [productIdToAdd]);

    expect(await stakingProducts.getTotalTargetWeight(fixture.poolId)).to.be.equal(reducedTargetWeight);
    expect(await stakingProducts.getTotalEffectiveWeight(fixture.poolId)).to.be.equal(expectedEffectiveWeight);
    {
      const stakedProduct = await stakingProducts.getProduct(fixture.poolId, productIdToAdd);
      expect(stakedProduct.lastEffectiveWeight).to.be.equal(expectedEffectiveWeight);
      expect(stakedProduct.targetWeight).to.be.equal(reducedTargetWeight);
    }

    // lower target weight to 0
    const zeroTargetWeight = 0;
    await setStakedProducts.call(fixture, { productIds: [productIdToAdd], targetWeight: zeroTargetWeight });

    // recalculate effective weight
    await stakingProducts.recalculateEffectiveWeights(fixture.poolId, [productIdToAdd]);

    expect(await stakingProducts.getTotalTargetWeight(fixture.poolId)).to.be.equal(zeroTargetWeight);
    expect(await stakingProducts.getTotalEffectiveWeight(fixture.poolId)).to.be.equal(expectedEffectiveWeight);
    {
      const stakedProduct = await stakingProducts.getProduct(fixture.poolId, productIdToAdd);
      expect(stakedProduct.lastEffectiveWeight).to.be.equal(expectedEffectiveWeight);
      expect(stakedProduct.targetWeight).to.be.equal(zeroTargetWeight);
    }
  });

  it('should reduce effective weight when allocations expire', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts } = fixture;
    const [staker] = fixture.accounts.members;

    const stakeAmount = parseEther('12345');
    const coverBuyAmount = stakeAmount.mul(8).div(100).mul(2); // 8% of capacity with 2x capacity multiplier
    const productId = Zero;
    const expectedEffectiveWeight = 8;
    const initialTargetWeight = 10;

    await setStakedProducts.call(fixture, { productIds: [productId], targetWeight: initialTargetWeight });

    // deposit stake
    await depositTo.call(fixture, { staker, amount: stakeAmount });

    // buy cover
    await allocateCapacity.call(fixture, { amount: coverBuyAmount, productId });

    // recalculate effective weight
    await stakingProducts.recalculateEffectiveWeights(fixture.poolId, [productId]);

    expect(await stakingProducts.getTotalTargetWeight(fixture.poolId)).to.be.equal(initialTargetWeight);
    expect(await stakingProducts.getTotalEffectiveWeight(fixture.poolId)).to.be.equal(initialTargetWeight);

    // lower target weight to 1
    const loweredTargetWeight = 1;
    await setStakedProducts.call(fixture, {
      productIds: [productId],
      targetWeight: 1,
    });

    expect(await stakingProducts.getTotalTargetWeight(fixture.poolId)).to.be.equal(loweredTargetWeight);
    expect(await stakingProducts.getTotalEffectiveWeight(fixture.poolId)).to.be.equal(expectedEffectiveWeight);

    // expire cover. effective weight should be reduced to target weight
    await increaseTime(daysToSeconds(365));

    // recalculate effective weight
    await stakingProducts.recalculateEffectiveWeights(fixture.poolId, [productId]);

    expect(await stakingProducts.getTotalTargetWeight(fixture.poolId)).to.be.equal(loweredTargetWeight);
    expect(await stakingProducts.getTotalEffectiveWeight(fixture.poolId)).to.be.equal(loweredTargetWeight);
    {
      const stakedProduct = await stakingProducts.getProduct(fixture.poolId, productId);
      expect(stakedProduct.lastEffectiveWeight).to.be.equal(loweredTargetWeight);
      expect(stakedProduct.targetWeight).to.be.equal(loweredTargetWeight);
    }
  });

  it('effective weight should be lowered from extra deposits', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts } = fixture;
    const [staker] = fixture.accounts.members;

    const amount = parseEther('10000');
    // buy a quarter of the capacity
    const expectedEffectiveWeight = One.mul(25);
    // 8% of capacity with 2x capacity multiplier
    const coverBuyAmount = amount.mul(expectedEffectiveWeight).div(100).mul(2);

    const productIdToAdd = Zero;
    await setStakedProducts.call(fixture, { productIds: [productIdToAdd], targetWeight: expectedEffectiveWeight });

    // deposit stake
    await depositTo.call(fixture, { staker, amount });

    // buy cover
    await allocateCapacity.call(fixture, { amount: coverBuyAmount, productId: productIdToAdd });

    // lower target weight to 0
    await setStakedProducts.call(fixture, { productIds: [productIdToAdd], targetWeight: 0 });

    expect(await stakingProducts.getTotalTargetWeight(fixture.poolId)).to.be.equal(0);
    expect(await stakingProducts.getTotalEffectiveWeight(fixture.poolId)).to.be.equal(expectedEffectiveWeight);

    // double stake
    await depositTo.call(fixture, { staker, amount });

    expect(await stakingProducts.getTotalEffectiveWeight(fixture.poolId)).to.be.equal(expectedEffectiveWeight);

    // recalculate effective weight
    await stakingProducts.recalculateEffectiveWeights(fixture.poolId, [productIdToAdd]);

    // effective weight should be reduced by 50%
    expect(await stakingProducts.getTotalEffectiveWeight(fixture.poolId)).to.be.equal(expectedEffectiveWeight.div(2));
    {
      const stakedProduct = await stakingProducts.getProduct(fixture.poolId, productIdToAdd);
      expect(stakedProduct.lastEffectiveWeight).to.be.equal(expectedEffectiveWeight.div(2));
      expect(stakedProduct.targetWeight).to.be.equal(0);
    }
  });

  it('it should return uint16.max when allocation is much larger than capacity', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts } = fixture;
    const [staker] = fixture.accounts.members;
    const amount = parseEther('12345');
    const coverBuyAmount = parseEther('12345');

    // set single product
    const productIdToAdd = Zero;
    await setStakedProducts.call(fixture, { productIds: [productIdToAdd] });

    // deposit stake
    const { timestamp: start } = await ethers.provider.getBlock('latest');
    await depositTo.call(fixture, { staker, amount });

    // buy all cover
    await allocateCapacity.call(fixture, { amount: coverBuyAmount, productId: productIdToAdd });

    // burn stake
    await burnStake.call(fixture, { start, amount: amount.sub(fixture.config.NXM_PER_ALLOCATION_UNIT) });

    // check effective weight
    const stakedProduct = await stakingProducts.getProduct(fixture.poolId, productIdToAdd);
    expect(stakedProduct.lastEffectiveWeight).to.be.equal(MAX_TARGET_WEIGHT);
    expect(stakedProduct.targetWeight).to.be.equal(MAX_TARGET_WEIGHT);

    expect(await stakingProducts.getTotalTargetWeight(fixture.poolId)).to.be.equal(MAX_TARGET_WEIGHT);
    expect(await stakingProducts.getTotalEffectiveWeight(fixture.poolId)).to.be.equal(MAX_TARGET_WEIGHT);

    // recalculating should increase total effective weight
    await stakingProducts.recalculateEffectiveWeights(fixture.poolId, [productIdToAdd]);

    expect(await stakingProducts.getTotalTargetWeight(fixture.poolId)).to.be.equal(MAX_TARGET_WEIGHT);
    expect(await stakingProducts.getTotalEffectiveWeight(fixture.poolId)).to.be.equal(UINT16_MAX);

    {
      const stakedProduct = await stakingProducts.getProduct(fixture.poolId, productIdToAdd);
      expect(stakedProduct.lastEffectiveWeight).to.be.equal(UINT16_MAX);
      expect(stakedProduct.targetWeight).to.be.equal(MAX_TARGET_WEIGHT);
    }
  });

  it('effective weight should be equal to target weight if capacity and allocations are 0', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts } = fixture;
    const productIdToAdd = Zero;

    await setStakedProducts.call(fixture, { productIds: [productIdToAdd] });

    const stakedProduct = await stakingProducts.getProduct(fixture.poolId, productIdToAdd);
    expect(stakedProduct.lastEffectiveWeight).to.be.equal(MAX_TARGET_WEIGHT);
    expect(stakedProduct.targetWeight).to.be.equal(MAX_TARGET_WEIGHT);

    expect(await stakingProducts.getTotalTargetWeight(fixture.poolId)).to.be.equal(MAX_TARGET_WEIGHT);
    expect(await stakingProducts.getTotalEffectiveWeight(fixture.poolId)).to.be.equal(MAX_TARGET_WEIGHT);

    // recalculating should do nothing
    await stakingProducts.recalculateEffectiveWeights(fixture.poolId, [productIdToAdd]);

    expect(await stakingProducts.getTotalTargetWeight(fixture.poolId)).to.be.equal(MAX_TARGET_WEIGHT);
    expect(await stakingProducts.getTotalEffectiveWeight(fixture.poolId)).to.be.equal(MAX_TARGET_WEIGHT);

    // edit to 0
    const targetWeight = 0;
    await setStakedProducts.call(fixture, { productIds: [productIdToAdd], targetWeight });

    expect(await stakingProducts.getTotalTargetWeight(fixture.poolId)).to.be.equal(targetWeight);
    expect(await stakingProducts.getTotalEffectiveWeight(fixture.poolId)).to.be.equal(targetWeight);

    {
      const stakedProduct = await stakingProducts.getProduct(fixture.poolId, productIdToAdd);
      expect(stakedProduct.lastEffectiveWeight).to.be.equal(targetWeight);
      expect(stakedProduct.targetWeight).to.be.equal(targetWeight);
    }
  });

  it('should correctly calculate effective weight after several burns', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts, stakingPool } = fixture;
    const [staker] = fixture.accounts.members;
    const amount = parseEther('1');
    const coverBuyAmount = parseEther('1');
    const initialTargetWeight = 50;
    const expectedTotalTargetWeight = DEFAULT_PRODUCTS.length * initialTargetWeight;

    // set target weight to 50% for all products
    await setStakedProducts.call(fixture, { productIds: DEFAULT_PRODUCTS, targetWeight: initialTargetWeight });

    // deposit stake
    const { timestamp: start } = await ethers.provider.getBlock('latest');
    await depositTo.call(fixture, { staker, amount });

    // buy all cover on all products at 50% target weight (1/2 max)
    const allocationPromises = [];
    for (const productId of DEFAULT_PRODUCTS) {
      allocationPromises.push(allocateCapacity.call(fixture, { amount: coverBuyAmount, productId }));
    }
    await Promise.all(allocationPromises);
    expect(await stakingProducts.getTotalEffectiveWeight(fixture.poolId)).to.be.equal(
      await stakingProducts.getTotalTargetWeight(fixture.poolId),
    );
    expect(await stakingProducts.getTotalEffectiveWeight(fixture.poolId)).to.be.equal(expectedTotalTargetWeight);

    // burn half of active stake: leaving 1/2 of the capacity, so effective weight should now be maxed out
    const activeStake = await stakingPool.getActiveStake();
    await burnStake.call(fixture, { amount: activeStake.div(2), start });

    // recalculate effective weight
    await stakingProducts.recalculateEffectiveWeights(fixture.poolId, DEFAULT_PRODUCTS);
    expect(await stakingProducts.getTotalEffectiveWeight(fixture.poolId)).to.be.equal(MAX_TOTAL_EFFECTIVE_WEIGHT);
    expect(await stakingProducts.getTotalTargetWeight(fixture.poolId)).to.be.equal(expectedTotalTargetWeight);

    // lowering target weight shouldn't change effective weight
    await setStakedProducts.call(fixture, { productIds: DEFAULT_PRODUCTS, targetWeight: 1 });
    await stakingProducts.recalculateEffectiveWeights(fixture.poolId, DEFAULT_PRODUCTS);
    expect(await stakingProducts.getTotalEffectiveWeight(fixture.poolId)).to.be.equal(MAX_TOTAL_EFFECTIVE_WEIGHT);
    expect(await stakingProducts.getTotalTargetWeight(fixture.poolId)).to.be.equal(DEFAULT_PRODUCTS.length);

    // raising target weight also shouldn't change effective weight
    await setStakedProducts.call(fixture, { productIds: DEFAULT_PRODUCTS, targetWeight: MAX_TARGET_WEIGHT });
    expect(await stakingProducts.getTotalEffectiveWeight(fixture.poolId)).to.be.equal(
      await stakingProducts.getTotalTargetWeight(fixture.poolId),
    );
    expect(await stakingProducts.getTotalEffectiveWeight(fixture.poolId)).to.be.equal(MAX_TOTAL_EFFECTIVE_WEIGHT);

    // burn half the remaining stake
    {
      // allocation will be at 200% of max allowable capacity, so effective weight should now be 200%
      const activeStake = await stakingPool.getActiveStake();
      await burnStake.call(fixture, { amount: activeStake.div(2), start });
    }

    // recalculate effective weight
    await stakingProducts.recalculateEffectiveWeights(fixture.poolId, DEFAULT_PRODUCTS);
    expect(await stakingProducts.getTotalEffectiveWeight(fixture.poolId)).to.be.gt(
      await stakingProducts.getTotalTargetWeight(fixture.poolId),
    );
    // 2000 * 2.00 = 4000
    expect(await stakingProducts.getTotalEffectiveWeight(fixture.poolId)).to.be.equal(4000);
  });

  it('should fail to increase target weight when effective weight is at the limit', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts, stakingPool, cover } = fixture;
    const [manager, staker] = fixture.accounts.members;

    // Impersonate cover contract
    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(cover.address, parseEther('100000'));

    const numProducts = 200;
    const amount = parseEther('10000');
    const initialTargetWeight = 5;
    const totalExpectedTargetWeight = numProducts * initialTargetWeight;

    // Get capacity in staking pool
    await depositTo.call(fixture, { staker, amount });

    // 200 products with 5 weight = 50% of max weight (200 * 5 = 1000 / 2000)
    const products = Array(numProducts)
      .fill('')
      .map((value, index) => {
        return {
          productId: index,
          recalculateEffectiveWeight: true,
          setTargetWeight: true,
          targetWeight: initialTargetWeight,
          setTargetPrice: true,
          targetPrice: 200,
        };
      });

    // Add products
    await stakingProducts.connect(manager).setProducts(fixture.poolId, products);

    // Buy all available cover for every product
    const allocationPromises = [];
    for (let i = 0; i < products.length; i++) {
      allocationPromises.push(allocateCapacity.call(fixture, { productId: i, amount: amount.div(10) }));
    }
    await Promise.all(allocationPromises);

    // total target and total effective weight should be at the max
    expect(await stakingProducts.getTotalTargetWeight(fixture.poolId)).to.be.equal(totalExpectedTargetWeight);
    expect(await stakingProducts.getTotalEffectiveWeight(fixture.poolId)).to.be.equal(totalExpectedTargetWeight);

    // Burn 75% of the current stake
    // Effective weight was at 50%, so with 3/4 of capacity reduced, allocations are twice as much as capacity
    // ie. 50/100 = 1000 effective weight, burn 75% of stake -> 50/25 = 4000 effective weight
    const activeStake = await stakingPool.getActiveStake();
    const burnAmount = activeStake.sub(activeStake.div(4));
    await stakingPool.connect(coverSigner).burnStake(burnAmount, burnStakeParams);

    // recalculate effective weight
    await stakingProducts.recalculateEffectiveWeights(
      fixture.poolId,
      products.map(product => product.productId),
    );
    expect(await stakingProducts.getTotalTargetWeight(fixture.poolId)).to.be.equal(totalExpectedTargetWeight);
    expect(await stakingProducts.getTotalEffectiveWeight(fixture.poolId)).to.be.equal(4000);

    // Increasing weight on any product will cause it to recalculate effective weight
    const increaseProductWeightParams = products.map(product => {
      return {
        ...newProductTemplate,
        productId: product.productId,
        targetWeight: 10,
        recalculateEffectiveWeight: true,
        setPrice: false,
      };
    });
    await expect(
      stakingProducts.connect(manager).setProducts(fixture.poolId, increaseProductWeightParams),
    ).to.be.revertedWithCustomError(stakingProducts, 'TotalEffectiveWeightExceeded');
  });
});

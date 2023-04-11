const { ethers } = require('hardhat');
const { expect } = require('chai');

const { parseEther } = ethers.utils;
const { Zero, One } = ethers.constants;

const {
  allocateCapacity,
  depositTo,
  burnStake,
  setStakedProducts,
  daysToSeconds,
  burnStakeParams,
  buyCoverParamsTemplate,
  newProductTemplate,
} = require('./helpers');
const { setEtherBalance } = require('../../utils/evm');
const { increaseTime } = require('../../utils').evm;

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

  // TODO: implement once https://github.com/NexusMutual/smart-contracts/issues/842 is sorted out
  it.skip('effective weight should be > target when allocations are greater than capacity', async function () {});

  it('should calculate effective weight properly when decreasing target weight', async function () {
    const { stakingProducts } = this;
    const [staker, coverBuyer] = this.accounts.members;

    const amount = parseEther('12345');
    const coverBuyAmount = amount.mul(8).div(100).mul(2); // 8% of capacity with 2x capacity multiplier

    const productIdToAdd = Zero;
    await setStakedProducts.call(this, { productIds: [productIdToAdd], targetWeight: 10 });

    // deposit stake
    await depositTo.call(this, { staker, amount });

    // buy cover
    await allocateCapacity.call(this, { coverBuyer, amount: coverBuyAmount, productId: productIdToAdd });

    // recalculate effective weight
    await stakingProducts.recalculateEffectiveWeights(this.poolId, [productIdToAdd]);

    expect(await stakingProducts.getTotalTargetWeight(this.poolId)).to.be.equal(10);
    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.equal(10);
    {
      const stakedProduct = await stakingProducts.getProduct(this.poolId, productIdToAdd);
      expect(stakedProduct.lastEffectiveWeight).to.be.equal(10);
      expect(stakedProduct.targetWeight).to.be.equal(10);
    }

    // decrease target weight
    await setStakedProducts.call(this, { productIds: [productIdToAdd], targetWeight: 5 });

    // recalculate effective weight
    await stakingProducts.recalculateEffectiveWeights(this.poolId, [productIdToAdd]);

    expect(await stakingProducts.getTotalTargetWeight(this.poolId)).to.be.equal(5);
    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.equal(8);
    {
      const stakedProduct = await stakingProducts.getProduct(this.poolId, productIdToAdd);
      expect(stakedProduct.lastEffectiveWeight).to.be.equal(8);
      expect(stakedProduct.targetWeight).to.be.equal(5);
    }

    // lower target weight to 0
    await setStakedProducts.call(this, { productIds: [productIdToAdd], targetWeight: 0 });

    // recalculate effective weight
    await stakingProducts.recalculateEffectiveWeights(this.poolId, [productIdToAdd]);

    expect(await stakingProducts.getTotalTargetWeight(this.poolId)).to.be.equal(0);
    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.equal(8);
    {
      const stakedProduct = await stakingProducts.getProduct(this.poolId, productIdToAdd);
      expect(stakedProduct.lastEffectiveWeight).to.be.equal(8);
      expect(stakedProduct.targetWeight).to.be.equal(0);
    }
  });

  it('should reduce effective weight when allocations expire', async function () {
    const { stakingProducts } = this;
    const [staker, coverBuyer] = this.accounts.members;

    const stakeAmount = parseEther('12345');
    const coverBuyAmount = stakeAmount.mul(8).div(100).mul(2); // 8% of capacity with 2x capacity multiplier
    const productId = Zero;

    await setStakedProducts.call(this, { productIds: [productId], targetWeight: 10 });

    // deposit stake
    await depositTo.call(this, { staker, amount: stakeAmount });

    // buy cover
    await allocateCapacity.call(this, { coverBuyer, amount: coverBuyAmount, productId });

    // recalculate effective weight
    await stakingProducts.recalculateEffectiveWeights(this.poolId, [productId]);

    expect(await stakingProducts.getTotalTargetWeight(this.poolId)).to.be.equal(10);
    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.equal(10);

    // lower target weight to 1
    await setStakedProducts.call(this, {
      productIds: [productId],
      targetWeight: 1,
    });

    expect(await stakingProducts.getTotalTargetWeight(this.poolId)).to.be.equal(1);
    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.equal(8);

    // expire cover. effective weight should be reduced to target weight
    await increaseTime(daysToSeconds(365));

    // recalculate effective weight
    await stakingProducts.recalculateEffectiveWeights(this.poolId, [productId]);

    expect(await stakingProducts.getTotalTargetWeight(this.poolId)).to.be.equal(1);
    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.equal(1);
    {
      const stakedProduct = await stakingProducts.getProduct(this.poolId, productId);
      expect(stakedProduct.lastEffectiveWeight).to.be.equal(1);
      expect(stakedProduct.targetWeight).to.be.equal(1);
    }
  });

  it('effective weight should be lowered from extra deposits', async function () {
    const { stakingProducts } = this;
    const [staker, coverBuyer] = this.accounts.members;

    const amount = parseEther('10000');
    // buy a quarter of the capacity
    const coverBuyAmount = amount.mul(25).div(100).mul(2); // 8% of capacity with 2x capacity multiplier

    const productIdToAdd = Zero;
    await setStakedProducts.call(this, { productIds: [productIdToAdd], targetWeight: 25 });

    // deposit stake
    await depositTo.call(this, { staker, amount });

    // buy cover
    await allocateCapacity.call(this, { coverBuyer, amount: coverBuyAmount, productId: productIdToAdd });

    // lower target weight to 0
    await setStakedProducts.call(this, { productIds: [productIdToAdd], targetWeight: 0 });

    expect(await stakingProducts.getTotalTargetWeight(this.poolId)).to.be.equal(0);
    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.equal(25);

    // double stake
    await depositTo.call(this, { staker, amount });

    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.equal(25);

    // recalculate effective weight
    await stakingProducts.recalculateEffectiveWeights(this.poolId, [productIdToAdd]);

    const expectedEffectiveWeight = One.mul(25).div(2);
    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.equal(expectedEffectiveWeight);
    {
      const stakedProduct = await stakingProducts.getProduct(this.poolId, productIdToAdd);
      expect(stakedProduct.lastEffectiveWeight).to.be.equal(12);
      expect(stakedProduct.targetWeight).to.be.equal(0);
    }
  });

  it('should fail to allocate any capacity when capacityReductionRatio is 1', async function () {
    const { stakingPool, cover } = this;
    const [staker, coverBuyer] = this.accounts.members;

    const amount = parseEther('12345');
    const coverBuyAmount = parseEther('.02');

    const coverProductTemplate = {
      productType: 1,
      yieldTokenAddress: ethers.constants.AddressZero,
      coverAssets: 1111,
      initialPriceRatio: 500,
      capacityReductionRatio: 10000,
      useFixedPrice: false,
    };

    // add product to cover contract
    const count = await cover.productsCount();
    await cover.setProducts([coverProductTemplate], [count]);
    await cover.setPoolAllowed(count, this.poolId, true);

    // set single product
    const productIdToAdd = count;
    await setStakedProducts.call(this, { productIds: [productIdToAdd] });

    // deposit stake
    await depositTo.call(this, { staker, amount });

    // fail to buy any coverage
    await expect(
      allocateCapacity.call(this, { coverBuyer, amount: coverBuyAmount, productId: productIdToAdd }),
    ).to.be.revertedWithCustomError(stakingPool, 'InsufficientCapacity');
  });

  it('it should return uint16.max when allocation is much larger than capacity', async function () {
    const { stakingProducts } = this;
    const [staker, coverBuyer] = this.accounts.members;
    const amount = parseEther('12345');
    const coverBuyAmount = parseEther('12345');

    // set single product
    const productIdToAdd = Zero;
    await setStakedProducts.call(this, { productIds: [productIdToAdd] });

    // deposit stake
    const { timestamp: start } = await ethers.provider.getBlock('latest');
    await depositTo.call(this, { staker, amount });

    // buy all cover
    await allocateCapacity.call(this, { coverBuyer, amount: coverBuyAmount, productId: productIdToAdd });

    // burn stake
    await burnStake.call(this, { start, amount: amount.sub(this.config.NXM_PER_ALLOCATION_UNIT) });

    // check effective weight
    const stakedProduct = await stakingProducts.getProduct(this.poolId, productIdToAdd);
    expect(stakedProduct.lastEffectiveWeight).to.be.equal(100);
    expect(stakedProduct.targetWeight).to.be.equal(100);

    expect(await stakingProducts.getTotalTargetWeight(this.poolId)).to.be.equal(100);
    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.equal(100);

    // recalculating should increase total effective weight
    await stakingProducts.recalculateEffectiveWeights(this.poolId, [productIdToAdd]);

    expect(await stakingProducts.getTotalTargetWeight(this.poolId)).to.be.equal(100);
    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.equal(65535);

    {
      const stakedProduct = await stakingProducts.getProduct(this.poolId, productIdToAdd);
      expect(stakedProduct.lastEffectiveWeight).to.be.equal(65535);
      expect(stakedProduct.targetWeight).to.be.equal(100);
    }
  });

  it('effective weight should be equal to target weight if capacity and allocations are 0', async function () {
    const { stakingProducts } = this;
    const productIdToAdd = Zero;

    await setStakedProducts.call(this, { productIds: [productIdToAdd] });

    const stakedProduct = await stakingProducts.getProduct(this.poolId, productIdToAdd);
    expect(stakedProduct.lastEffectiveWeight).to.be.equal(100);
    expect(stakedProduct.targetWeight).to.be.equal(100);

    expect(await stakingProducts.getTotalTargetWeight(this.poolId)).to.be.equal(100);
    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.equal(100);

    // recalculating should do nothing
    await stakingProducts.recalculateEffectiveWeights(this.poolId, [productIdToAdd]);

    expect(await stakingProducts.getTotalTargetWeight(this.poolId)).to.be.equal(100);
    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.equal(100);

    // edit to 0
    await setStakedProducts.call(this, { productIds: [productIdToAdd], targetWeight: 0 });

    expect(await stakingProducts.getTotalTargetWeight(this.poolId)).to.be.equal(0);
    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.equal(0);

    {
      const stakedProduct = await stakingProducts.getProduct(this.poolId, productIdToAdd);
      expect(stakedProduct.lastEffectiveWeight).to.be.equal(0);
      expect(stakedProduct.targetWeight).to.be.equal(0);
    }
  });

  it('should correctly calculate effective weight after several burns', async function () {
    const { stakingProducts, stakingPool } = this;
    const [staker, coverBuyer] = this.accounts.members;
    const amount = parseEther('1');
    const coverBuyAmount = parseEther('1');

    // set target weight to 50% for all products
    await setStakedProducts.call(this, { productIds: DEFAULT_PRODUCTS, targetWeight: 50 });

    // deposit stake
    const { timestamp: start } = await ethers.provider.getBlock('latest');
    await depositTo.call(this, { staker, amount });

    // buy all cover on all products at 50% target weight (1/2 max)
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

  it('should fail to increase target weight when effective weight is at the limit', async function () {
    const { stakingProducts, stakingPool, cover } = this;
    const [manager, staker, coverBuyer] = this.accounts.members;
    const [internalContract] = this.accounts.internalContracts;

    // Impersonate cover contract
    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(cover.address, parseEther('100000'));

    const coverId = 1;
    const amount = parseEther('10000');

    // Get capacity in staking pool
    await depositTo.call(this, { staker, amount });

    // 200 products with 5 weight = 50% of max weight (200 * 5 = 1000 / 2000)
    const products = Array(200)
      .fill('')
      .map((value, index) => {
        return { initialPrice: 500, targetPrice: 200, productId: index, weight: 5 };
      });

    // Add products
    await stakingProducts.connect(internalContract).setInitialProducts(this.poolId, products);

    // Buy all available cover for every product
    const allocationPromises = [];
    for (let i = 0; i < products.length; i++) {
      allocationPromises.push(
        cover.allocateCapacity(
          { ...buyCoverParamsTemplate, productId: i, owner: coverBuyer.address, amount: amount.div(10) },
          coverId,
          0,
          stakingPool.address,
        ),
      );
    }
    await Promise.all(allocationPromises);

    // total target and total effective weight should be at the max
    expect(await stakingProducts.getTotalTargetWeight(this.poolId)).to.be.equal(1000);
    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.equal(1000);

    // Burn 75% of the current stake
    // Effective weight was at 50%, so with 3/4 of capacity reduced, allocations are twice as much as capacity
    // ie. 50/100 = 1000 effective weight, burn 75% of stake -> 50/25 = 4000 effective weight
    const activeStake = await stakingPool.getActiveStake();
    const burnAmount = activeStake.sub(activeStake.div(4));
    await stakingPool.connect(coverSigner).burnStake(burnAmount, burnStakeParams);

    // recalculate effective weight
    await stakingProducts.recalculateEffectiveWeights(
      this.poolId,
      products.map(product => product.productId),
    );
    expect(await stakingProducts.getTotalTargetWeight(this.poolId)).to.be.equal(1000);
    expect(await stakingProducts.getTotalEffectiveWeight(this.poolId)).to.be.equal(4000);

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
      stakingProducts.connect(manager).setProducts(this.poolId, increaseProductWeightParams),
    ).to.be.revertedWithCustomError(stakingProducts, 'TotalEffectiveWeightExceeded');
  });
});

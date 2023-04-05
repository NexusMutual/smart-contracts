const { expect } = require('chai');
const { ethers } = require('hardhat');
const { setEtherBalance } = require('../../utils/').evm;
const { burnStakeParams, verifyInitialProduct, depositTo, daysToSeconds } = require('./helpers');
const { parseEther } = ethers.utils;
const { AddressZero } = ethers.constants;

const poolId = 1;

const product0 = {
  productId: 0,
  weight: 100,
  initialPrice: '500',
  targetPrice: '500',
};

const initializeParams = {
  poolId: 1,
  isPrivatePool: false,
  initialPoolFee: 5, // 5%
  maxPoolFee: 5, // 5%
  products: [product0],
  ipfsDescriptionHash: 'Description Hash',
};

const newProductTemplate = {
  productId: 0,
  recalculateEffectiveWeight: true,
  setTargetWeight: true,
  targetWeight: 100,
  setTargetPrice: true,
  targetPrice: 500,
};

const buyCoverParamsTemplate = {
  owner: AddressZero,
  coverId: 0,
  productId: 0,
  coverAsset: 0, // ETH
  amount: parseEther('100'),
  period: daysToSeconds('30'),
  maxPremiumInAsset: parseEther('100'),
  paymentAsset: 0,
  payWithNXM: false,
  commissionRatio: 1,
  commissionDestination: AddressZero,
  ipfsData: 'ipfs data',
};

describe('initializeProducts', function () {
  it('reverts if product target price is too high', async function () {
    const { stakingProducts } = this;

    const { poolId, products } = initializeParams;

    const TARGET_PRICE_DENOMINATOR = (await stakingProducts.TARGET_PRICE_DENOMINATOR()).toNumber();

    await expect(
      stakingProducts.setInitialProducts(poolId, [{ ...products[0], targetPrice: TARGET_PRICE_DENOMINATOR + 1 }]),
    ).to.be.revertedWithCustomError(stakingProducts, 'TargetPriceTooHigh');

    await expect(
      stakingProducts.setInitialProducts(poolId, [
        { ...products[0], targetPrice: TARGET_PRICE_DENOMINATOR.toString() },
      ]),
    ).to.not.be.reverted;
  });

  it('reverts if product weight bigger than 1', async function () {
    const { stakingProducts } = this;

    const { poolId, products } = initializeParams;

    const WEIGHT_DENOMINATOR = (await stakingProducts.WEIGHT_DENOMINATOR()).toNumber();

    await expect(
      stakingProducts.setInitialProducts(poolId, [{ ...products[0], weight: WEIGHT_DENOMINATOR + 1 }]),
    ).to.be.revertedWithCustomError(stakingProducts, 'TargetWeightTooHigh');

    await expect(stakingProducts.setInitialProducts(poolId, [{ ...products[0], weight: WEIGHT_DENOMINATOR }])).to.not.be
      .reverted;
  });

  it('reverts if products total target exceeds max total weight', async function () {
    const { stakingProducts } = this;

    const { poolId } = initializeParams;

    const MAX_TOTAL_WEIGHT = await stakingProducts.MAX_TOTAL_WEIGHT();
    const arrayLength = MAX_TOTAL_WEIGHT.div(product0.weight).toNumber();

    const validProducts = Array(arrayLength)
      .fill(product0)
      .map((value, index) => {
        return { ...value, productId: index };
      });

    await expect(
      stakingProducts.setInitialProducts(poolId, [...validProducts, { ...product0, productId: validProducts.length }]),
    ).to.be.revertedWithCustomError(stakingProducts, 'TotalTargetWeightExceeded');

    await expect(stakingProducts.setInitialProducts(poolId, [...validProducts])).to.not.be.reverted;
  });

  it('should initialize 1000 products with 2 weight', async function () {
    const { stakingProducts, stakingPool, cover } = this;
    const {
      internalContracts: [internalContract],
      members: [staker, coverBuyer],
    } = this.accounts;

    const { poolId } = initializeParams;

    const initialProduct = { ...product0, productId: 0, weight: 2, targetPrice: 0 };
    const numProducts = 1000;

    const validProducts = Array(numProducts)
      .fill(initialProduct)
      .map((value, index) => {
        return { ...value, productId: index };
      });

    await stakingProducts.connect(internalContract).setInitialProducts(poolId, validProducts);

    await verifyInitialProduct.call(this, {
      product: await stakingProducts.getProduct(poolId, 0),
      initialProduct: validProducts[0],
    });
    await verifyInitialProduct.call(this, {
      product: await stakingProducts.getProduct(poolId, numProducts - 1),
      initialProduct: validProducts[numProducts - 1],
    });

    const weights = await stakingProducts.weights(poolId);
    expect(weights.totalTargetWeight).to.be.equal(2000);
    expect(weights.totalEffectiveWeight).to.be.equal(2000);
    expect(await stakingProducts.getTotalTargetWeight(poolId)).to.be.equal(2000);
    expect(await stakingProducts.getTotalEffectiveWeight(poolId)).to.be.equal(2000);

    await depositTo.call(this, { staker, amount: parseEther('1000') });

    // Buy cover
    await cover.allocateCapacity(
      { ...buyCoverParamsTemplate, owner: coverBuyer.address, amount: parseEther('10') },
      0,
      800,
      stakingPool.address,
    );
  });

  it('should initialize products successfully', async function () {
    const { stakingProducts } = this;
    const [internalContract] = this.accounts.internalContracts;

    const { poolId } = initializeParams;

    const MAX_TOTAL_WEIGHT = await stakingProducts.MAX_TOTAL_WEIGHT();
    const arrayLength = MAX_TOTAL_WEIGHT.div(product0.weight).toNumber();
    const validProducts = Array(arrayLength)
      .fill(product0)
      .map((value, index) => {
        return { ...value, productId: index };
      });

    {
      const weights = await stakingProducts.weights(poolId);
      expect(weights.totalTargetWeight).to.be.equal(0);
      expect(weights.totalEffectiveWeight).to.be.equal(0);
    }

    await stakingProducts.connect(internalContract).setInitialProducts(poolId, validProducts);

    await verifyInitialProduct.call(this, {
      product: await stakingProducts.getProduct(poolId, 0),
      initialProduct: validProducts[0],
    });
    await verifyInitialProduct.call(this, {
      product: await stakingProducts.getProduct(poolId, arrayLength - 1),
      initialProduct: validProducts[arrayLength - 1],
    });

    const weights = await stakingProducts.weights(poolId);
    expect(weights.totalTargetWeight).to.be.equal(2000);
    expect(weights.totalEffectiveWeight).to.be.equal(2000);
    expect(await stakingProducts.getTotalTargetWeight(poolId)).to.be.equal(2000);
    expect(await stakingProducts.getTotalEffectiveWeight(poolId)).to.be.equal(2000);
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
        return { ...product0, productId: index, weight: 5 };
      });

    // Add products
    await stakingProducts.connect(internalContract).setInitialProducts(poolId, products);

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
    expect(await stakingProducts.getTotalTargetWeight(poolId)).to.be.equal(1000);
    expect(await stakingProducts.getTotalEffectiveWeight(poolId)).to.be.equal(1000);

    // Burn 75% of the current stake
    // Effective weight was at 50%, so with 3/4 of capacity reduced, allocations are twice as much as capacity
    // ie. 50/100 = 1000 effective weight, burn 75% of stake -> 50/25 = 4000 effective weight
    const activeStake = await stakingPool.getActiveStake();
    const burnAmount = activeStake.sub(activeStake.div(4));
    await stakingPool.connect(coverSigner).burnStake(burnAmount, burnStakeParams);

    // recalculate effective weight
    await stakingProducts.recalculateEffectiveWeights(
      poolId,
      products.map(product => product.productId),
    );
    expect(await stakingProducts.getTotalTargetWeight(poolId)).to.be.equal(1000);
    expect(await stakingProducts.getTotalEffectiveWeight(poolId)).to.be.equal(4000);

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
      stakingProducts.connect(manager).setProducts(poolId, increaseProductWeightParams),
    ).to.be.revertedWithCustomError(stakingProducts, 'TotalEffectiveWeightExceeded');
  });
});

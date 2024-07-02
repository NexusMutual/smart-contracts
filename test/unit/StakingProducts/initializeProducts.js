const { expect } = require('chai');
const { verifyInitialProduct } = require('./helpers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

const MAX_TOTAL_WEIGHT = 2000;

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

describe('initializeProducts', function () {
  it('reverts if product target price is too high', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts } = fixture;

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
    const fixture = await loadFixture(setup);
    const { stakingProducts } = fixture;

    const { poolId, products } = initializeParams;

    const WEIGHT_DENOMINATOR = (await stakingProducts.WEIGHT_DENOMINATOR()).toNumber();

    await expect(
      stakingProducts.setInitialProducts(poolId, [{ ...products[0], weight: WEIGHT_DENOMINATOR + 1 }]),
    ).to.be.revertedWithCustomError(stakingProducts, 'TargetWeightTooHigh');

    await expect(stakingProducts.setInitialProducts(poolId, [{ ...products[0], weight: WEIGHT_DENOMINATOR }])).to.not.be
      .reverted;
  });

  it('reverts if products total target exceeds max total weight', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts } = fixture;

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

  it('should initialize 1000 products with target weight set to 2', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts } = fixture;
    const [internalContract] = fixture.accounts.internalContracts;

    const { poolId } = initializeParams;

    const initialProduct = { ...product0, productId: 0, weight: 2, targetPrice: 100 };
    const numProducts = 1000;

    const validProducts = Array(numProducts)
      .fill(initialProduct)
      .map((value, index) => {
        return { ...value, productId: index };
      });

    await stakingProducts.connect(internalContract).setInitialProducts(poolId, validProducts);

    await verifyInitialProduct.call(fixture, {
      product: await stakingProducts.getProduct(poolId, 0),
      initialProduct: validProducts[0],
    });
    await verifyInitialProduct.call(fixture, {
      product: await stakingProducts.getProduct(poolId, numProducts - 1),
      initialProduct: validProducts[numProducts - 1],
    });

    const weights = await stakingProducts.weights(poolId);
    expect(weights.totalTargetWeight).to.be.equal(MAX_TOTAL_WEIGHT);
    expect(weights.totalEffectiveWeight).to.be.equal(MAX_TOTAL_WEIGHT);
    expect(await stakingProducts.getTotalTargetWeight(poolId)).to.be.equal(MAX_TOTAL_WEIGHT);
    expect(await stakingProducts.getTotalEffectiveWeight(poolId)).to.be.equal(MAX_TOTAL_WEIGHT);
  });

  it('should initialize products successfully', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts } = fixture;
    const [internalContract] = fixture.accounts.internalContracts;

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

    await verifyInitialProduct.call(fixture, {
      product: await stakingProducts.getProduct(poolId, 0),
      initialProduct: validProducts[0],
    });
    await verifyInitialProduct.call(fixture, {
      product: await stakingProducts.getProduct(poolId, arrayLength - 1),
      initialProduct: validProducts[arrayLength - 1],
    });

    const weights = await stakingProducts.weights(poolId);
    expect(weights.totalTargetWeight).to.be.equal(MAX_TOTAL_WEIGHT);
    expect(weights.totalEffectiveWeight).to.be.equal(MAX_TOTAL_WEIGHT);
    expect(await stakingProducts.getTotalTargetWeight(poolId)).to.be.equal(MAX_TOTAL_WEIGHT);
    expect(await stakingProducts.getTotalEffectiveWeight(poolId)).to.be.equal(MAX_TOTAL_WEIGHT);
  });
});

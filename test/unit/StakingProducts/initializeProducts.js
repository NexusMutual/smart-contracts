const { expect } = require('chai');
const { verifyInitialProduct } = require('./helpers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

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

    const TARGET_PRICE_DENOMINATOR = await stakingProducts.TARGET_PRICE_DENOMINATOR();

    await expect(
      stakingProducts.setInitialProducts(poolId, [{ ...products[0], targetPrice: TARGET_PRICE_DENOMINATOR + 1n }]),
    ).to.be.revertedWithCustomError(stakingProducts, 'TargetPriceTooHigh');

    await expect(
      stakingProducts.setInitialProducts(poolId, [{ ...products[0], targetPrice: TARGET_PRICE_DENOMINATOR }]),
    ).to.not.be.reverted;
  });

  it('reverts if product weight bigger than 1', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts } = fixture;

    const { poolId, products } = initializeParams;

    const WEIGHT_DENOMINATOR = await stakingProducts.WEIGHT_DENOMINATOR();

    await expect(
      stakingProducts.setInitialProducts(poolId, [{ ...products[0], weight: WEIGHT_DENOMINATOR + 1n }]),
    ).to.be.revertedWithCustomError(stakingProducts, 'TargetWeightTooHigh');

    await expect(stakingProducts.setInitialProducts(poolId, [{ ...products[0], weight: WEIGHT_DENOMINATOR }])).to.not.be
      .reverted;
  });

  it('reverts if products total target exceeds max total weight', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts } = fixture;

    const { poolId } = initializeParams;

    const maxTotalWeight = await stakingProducts.MAX_TOTAL_WEIGHT();
    const arrayLength = Number(maxTotalWeight / BigInt(product0.weight));

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

  it('should initialize many products with target weight set to 2', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts } = fixture;
    const [internalContract] = fixture.accounts.internalContracts;

    const { poolId } = initializeParams;

    const initialProduct = { ...product0, productId: 0, weight: 2, targetPrice: 100 };
    const numProducts = 700;
    const expectedTotalWeight = BigInt(numProducts * 2);

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
    expect(weights.totalTargetWeight).to.be.equal(expectedTotalWeight);
    expect(weights.totalEffectiveWeight).to.be.equal(expectedTotalWeight);
    expect(await stakingProducts.getTotalTargetWeight(poolId)).to.be.equal(expectedTotalWeight);
    expect(await stakingProducts.getTotalEffectiveWeight(poolId)).to.be.equal(expectedTotalWeight);
  });

  it('should initialize products successfully', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts } = fixture;
    const [internalContract] = fixture.accounts.internalContracts;

    const { poolId } = initializeParams;

    const maxTotalWeight = await stakingProducts.MAX_TOTAL_WEIGHT();
    const arrayLength = Number(maxTotalWeight / BigInt(product0.weight));
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
    expect(weights.totalTargetWeight).to.be.equal(maxTotalWeight);
    expect(weights.totalEffectiveWeight).to.be.equal(maxTotalWeight);
    expect(await stakingProducts.getTotalTargetWeight(poolId)).to.be.equal(maxTotalWeight);
    expect(await stakingProducts.getTotalEffectiveWeight(poolId)).to.be.equal(maxTotalWeight);
  });
});

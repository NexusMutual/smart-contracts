const { expect } = require('chai');
const { ethers } = require('hardhat');

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

  it('should initialize products successfully', async function () {
    const { stakingProducts, cover } = this;
    const [internalContract] = this.accounts.internalContracts;

    const { poolId } = initializeParams;

    const MAX_TOTAL_WEIGHT = await stakingProducts.MAX_TOTAL_WEIGHT();
    const arrayLength = MAX_TOTAL_WEIGHT.div(product0.weight).toNumber();
    const validProducts = Array(arrayLength)
      .fill(product0)
      .map((value, index) => {
        return { ...value, productId: index };
      });

    await stakingProducts.connect(internalContract).setInitialProducts(poolId, validProducts);

    for (let i = 0; i < validProducts.length; i++) {
      const product = await stakingProducts.getProduct(poolId, i);
      expect(product.lastEffectiveWeight).to.be.equal(product.targetWeight);
    }

    const block = await ethers.provider.getBlock('latest');

    const product = await stakingProducts.getProduct(poolId, 0);
    expect(product.targetWeight).to.be.equal(validProducts[0].weight);
    expect(product.targetPrice).to.be.equal(validProducts[0].targetPrice);
    expect(product.bumpedPriceUpdateTime).to.be.equal(block.timestamp);
    expect(product.bumpedPrice).to.be.equal(validProducts[0].initialPrice);

    const weights = await stakingProducts.weights(poolId);
    expect(weights.totalTargetWeight).to.be.equal(2000);
    expect(weights.totalEffectiveWeight).to.be.equal(2000);
    expect(await stakingProducts.getTotalTargetWeight(poolId)).to.be.equal(2000);
    expect(await stakingProducts.getTotalEffectiveWeight(poolId)).to.be.equal(2000);

    await stakingProducts.recalculateEffectiveWeightsForAllProducts(poolId);
    const totalProducts = await cover.productsCount();
    expect(totalProducts).to.be.gt(validProducts.length);
    for (let i = 0; i < totalProducts; i++) {
      const product = await stakingProducts.getProduct(poolId, i);
      if (i < validProducts.length) {
        expect(product.lastEffectiveWeight).to.be.equal(validProducts[i].weight);
      } else {
        expect(product.lastEffectiveWeight).to.be.equal(0);
      }
    }
    {
      const weights = await stakingProducts.weights(poolId);
      expect(weights.totalTargetWeight).to.be.equal(2000);
      expect(weights.totalEffectiveWeight).to.be.equal(2000);
      expect(await stakingProducts.getTotalTargetWeight(poolId)).to.be.equal(2000);
      expect(await stakingProducts.getTotalEffectiveWeight(poolId)).to.be.equal(2000);
    }
  });
});

const { expect } = require('chai');
const { ethers } = require('hardhat');
const { AddressZero } = ethers.constants;

describe('setProducts unit tests', function () {
  const initializePool = async function (cover, stakingPool, manager, poolId, productInitParams) {
    // Set products in mock cover contract
    await Promise.all(
      productInitParams.map(p => {
        return cover.setProduct(getCoverProduct(p.initialPrice), p.productId);
      }),
    );
    await cover.initializeStaking(stakingPool.address, manager, false, 5, 5, productInitParams, poolId);
  };

  const getInitialProduct = (weight, targetPrice, initialPrice, id) => {
    return {
      productId: id,
      weight,
      initialPrice,
      targetPrice,
    };
  };
  // Staking.ProductParam
  const getNewProduct = (weight, price, id) => {
    return {
      productId: id,
      setWeight: true,
      targetWeight: weight,
      setPrice: true,
      targetPrice: price,
    };
  };
  // Cover.Product
  const getCoverProduct = initialPriceRatio => {
    return {
      productType: 1,
      productAddress: AddressZero,
      coverAssets: 1111,
      initialPriceRatio,
      capacityReductionRatio: 111,
    };
  };

  // Get product and set in cover contract
  const initProduct = async (cover, initialPriceRatio, weight, price, id) => {
    const coverProduct = getCoverProduct(initialPriceRatio);
    await cover.setProduct(coverProduct, id);
    return getNewProduct(weight, price, id);
  };

  const verifyProduct = (product, weight, price, initialPrice) => {
    expect(product.targetWeight).to.be.equal(weight);
    expect(product.targetPrice).to.be.equal(price);
    // TODO: verify exact nextPriceUpdateTime
    expect(product.nextPriceUpdateTime).to.be.greaterThan(0);
    expect(product.nextPrice).to.be.equal(initialPrice);
  };

  it('should fail to be called by non manager', async function () {
    const { stakingPool, cover } = this;
    const { defaultSender, members } = this.accounts;
    await initializePool(cover, stakingPool, defaultSender.address, 0, []);
    const product = await initProduct(cover, 100, 100, 0, 0);
    await expect(stakingPool.connect(members[3]).setProducts([product])).to.be.revertedWith(
      'StakingPool: Only pool manager can call this function',
    );
  });

  it('should initialize products successfully', async function () {
    const { stakingPool, cover } = this;
    const { defaultSender } = this.accounts;
    let i = 0;
    const initialProducts = Array.from({ length: 20 }, () => getInitialProduct(100, 100, 500, i++));
    await initializePool(cover, stakingPool, defaultSender.address, 0, initialProducts);
    const product = await stakingPool.products(0);
    verifyProduct(product, 100, 100, 500);
  });

  it('should fail to initialize too many products with full weight', async function () {
    const { stakingPool, cover } = this;
    const { defaultSender } = this.accounts;
    let i = 0;
    const initialProducts = Array.from({ length: 21 }, () => getInitialProduct(100, 100, 500, i++));
    await expect(initializePool(cover, stakingPool, defaultSender.address, 0, initialProducts)).to.be.revertedWith(
      'StakingPool: Target weight above 20',
    );
  });

  it('should set products and store values correctly', async function () {
    const { stakingPool, cover } = this;
    const { defaultSender } = this.accounts;
    await initializePool(cover, stakingPool, defaultSender.address, 0, []);
    const product = await initProduct(cover, 50, 100, 100, 0);
    await stakingPool.setProducts([product]);
    const product0 = await stakingPool.products(0);
    verifyProduct(product0, 100, 100, 50);
  });

  it('should add and remove products in same tx', async function () {
    const { stakingPool, cover } = this;
    const { defaultSender } = this.accounts;
    const initialPriceRatio = 1000;
    await initializePool(cover, stakingPool, defaultSender.address, 0, []);
    const products = [
      await initProduct(cover, initialPriceRatio, 50, 50, 0),
      await initProduct(cover, initialPriceRatio, 50, 50, 1),
    ];
    await stakingPool.setProducts(products);

    products[0].targetWeight = 0;
    products[1] = await initProduct(cover, initialPriceRatio, 50, 50, 2);
    // remove product0, add product2
    await stakingPool.setProducts(products);

    const product0 = await stakingPool.products(0);
    const product1 = await stakingPool.products(1);
    const product2 = await stakingPool.products(2);
    verifyProduct(product1, 50, 50, initialPriceRatio);
    verifyProduct(product0, 0, 50, initialPriceRatio);
    verifyProduct(product2, 50, 50, initialPriceRatio);
  });

  it('should add maximum products with full weight (20)', async function () {
    const { stakingPool, cover } = this;
    const { defaultSender } = this.accounts;
    await initializePool(cover, stakingPool, defaultSender.address, 0, []);
    let i = 0;
    const products = await Promise.all(Array.from({ length: 20 }, () => initProduct(cover, 999, 100, 100, i++)));
    await stakingPool.setProducts(products);
    expect(await stakingPool.targetWeight()).to.be.equal(2000);
    const product19 = await stakingPool.products(19);
    verifyProduct(product19, 100, 100, 999);
  });

  it('should fail to add weights beyond 20x', async function () {
    const { stakingPool, cover } = this;
    const { defaultSender } = this.accounts;
    await initializePool(cover, stakingPool, defaultSender.address, 0, []);
    let i = 0;
    const products = await Promise.all(Array.from({ length: 20 }, () => initProduct(cover, 1, 100, 100, i++)));
    await stakingPool.setProducts(products);
    const newProduct = [await initProduct(cover, 1, 1, 1, 50)];
    await expect(stakingPool.setProducts(newProduct)).to.be.revertedWith('StakingPool: Target weight above 20');
    expect(await stakingPool.targetWeight()).to.be.equal(2000);
    const product0 = await stakingPool.products(0);
    verifyProduct(product0, 100, 100, 1);
    expect(product0.nextPrice).to.be.equal(1);
  });

  it('should fail to make product weight higher than 1', async function () {
    const { stakingPool, cover } = this;
    const { defaultSender } = this.accounts;
    await initializePool(cover, stakingPool, defaultSender.address, 0, []);
    await expect(stakingPool.setProducts([await initProduct(cover, 1, 101, 101, 0)])).to.be.revertedWith(
      'StakingPool: Cannot set weight beyond 1',
    );
  });

  it('should edit weights, and skip price', async function () {
    const { stakingPool, cover } = this;
    const { defaultSender } = this.accounts;
    await initializePool(cover, stakingPool, defaultSender.address, 0, []);
    const product = await initProduct(cover, 1, 0, 20, 0);
    product.setPrice = false;
    expect(product.targetPrice).to.be.equal(20);
    await stakingPool.setProducts([product]);
    verifyProduct(await stakingPool.products(0), 0, 0, 1);
    product.targetWeight = 100;
    await stakingPool.setProducts([product]);
    verifyProduct(await stakingPool.products(0), 100, 0, 1);
  });

  it('should edit prices and skip weights', async function () {
    const { stakingPool, cover } = this;
    const { defaultSender } = this.accounts;
    await initializePool(cover, stakingPool, defaultSender.address, 0, []);
    const product = await initProduct(cover, 1, 80, 50, 0);
    product.setWeight = false;
    await stakingPool.setProducts([product]);
    verifyProduct(await stakingPool.products(0), 0, 50, 1);
    product.targetPrice = 100;
    await stakingPool.setProducts([product]);
    verifyProduct(await stakingPool.products(0), 0, 100, 1);
  });

  it('should fail with targetPrice too high', async function () {
    const { stakingPool, cover } = this;
    const { defaultSender } = this.accounts;
    await initializePool(cover, stakingPool, defaultSender.address, 0, []);
    const product = await initProduct(cover, 1, 80, 10001, 0);
    await expect(stakingPool.setProducts([product])).to.be.revertedWith('StakingPool: Target price too high');
  });

  it('should fail to add non-existing product', async function () {
    const { stakingPool, cover } = this;
    const { defaultSender } = this.accounts;
    await initializePool(cover, stakingPool, defaultSender.address, 0, []);
    const product = getNewProduct(100, 100, 0);
    await expect(stakingPool.setProducts([product])).to.be.revertedWith(
      'StakingPool: Failed to get initial price for product',
    );
  });
});

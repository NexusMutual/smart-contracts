const { expect } = require('chai');

describe('setProducts unit tests', function () {
  const initializePool = async function (stakingPool, manager, poolId, productInitParams) {
    await stakingPool.initialize(manager, false, 5, 5, productInitParams, poolId);
  };

  const getInitialProduct = (weight, targetPrice, initialPrice, id) => {
    return {
      productId: id,
      weight,
      initialPrice,
      targetPrice,
    };
  };
  // ProductParams
  const getNewProduct = (weight, price, id) => {
    return {
      productId: id,
      setWeight: true,
      targetWeight: weight,
      setPrice: true,
      targetPrice: price,
    };
  };

  const verifyProduct = (product, weight, price) => {
    expect(product.targetWeight).to.be.equal(weight);
    expect(product.targetPrice).to.be.equal(price);
  };

  it('should fail to be called by non manager', async function () {
    const { stakingPool } = this;
    const { defaultSender, members } = this.accounts;
    await initializePool(stakingPool, defaultSender.address, 0, []);
    const product = getNewProduct(100, 100, 0);
    await expect(stakingPool.connect(members[3]).setProducts([product])).to.be.revertedWith(
      'StakingPool: Only pool manager can call this function',
    );
  });

  it('should initialize products successfully', async function () {
    const { stakingPool } = this;
    const { defaultSender } = this.accounts;
    let i = 0;
    const initialProducts = Array.from({ length: 20 }, () => getInitialProduct(100, 100, 500, i++));
    await initializePool(stakingPool, defaultSender.address, 0, initialProducts);
    const product = await stakingPool.products(0);
    verifyProduct(product, 100, 100);
    expect(product.nextPrice).to.be.equal(500);
  });

  it('should fail to initialize too many products with full weight', async function () {
    const { stakingPool } = this;
    const { defaultSender } = this.accounts;
    let i = 0;
    const initialProducts = Array.from({ length: 21 }, () => getInitialProduct(100, 100, 500, i++));
    await expect(initializePool(stakingPool, defaultSender.address, 0, initialProducts)).to.be.revertedWith(
      'Target weight above 20',
    );
  });

  it('should set products and store values correctly', async function () {
    const { stakingPool } = this;
    const { defaultSender } = this.accounts;
    await initializePool(stakingPool, defaultSender.address, 0, []);
    const product = getNewProduct(100, 100, 0);
    await stakingPool.setProducts([product]);
    const products = await stakingPool.products(0);
    verifyProduct(product, 100, 100);
    // TODO: set initial price
    expect(products.nextPrice).to.be.equal(0);
    expect(products.nextPriceUpdateTime).to.be.equal(0);
  });

  it('should add and remove products in same tx', async function () {
    const { stakingPool } = this;
    const { defaultSender } = this.accounts;
    await initializePool(stakingPool, defaultSender.address, 0, []);
    const products = [getNewProduct(50, 50, 0), getNewProduct(50, 50, 1)];
    await stakingPool.setProducts(products);
    // remove product0, add product2
    products[0].targetWeight = 0;
    products[1] = getNewProduct(50, 50, 2);
    await stakingPool.setProducts(products);
    const product0 = await stakingPool.products(0);
    const product1 = await stakingPool.products(1);
    const product2 = await stakingPool.products(2);
    // expect(product1).to.be.equal(await stakingPool.products(1));
    verifyProduct(product1, 50, 50);
    verifyProduct(product0, 0, 50);
    verifyProduct(product2, 50, 50);
  });

  it('should add maximum products with full weight (20)', async function () {
    const { stakingPool } = this;
    const { defaultSender } = this.accounts;
    await initializePool(stakingPool, defaultSender.address, 0, []);
    let i = 0;
    const products = Array.from({ length: 20 }, () => getNewProduct(100, 100, i++));
    await stakingPool.setProducts(products);
    expect(await stakingPool.targetWeight()).to.be.equal(2000);
    verifyProduct(await stakingPool.products(19), 100, 100, 19);
  });

  it('should fail to add weights beyond 20x', async function () {
    const { stakingPool } = this;
    const { defaultSender } = this.accounts;
    await initializePool(stakingPool, defaultSender.address, 0, []);
    let i = 0;
    const products = Array.from({ length: 20 }, () => getNewProduct(100, 100, i++));
    await stakingPool.setProducts(products);
    const newProduct = [getNewProduct(1, 1, 50)];
    await expect(stakingPool.setProducts(newProduct)).to.be.revertedWith('Target weight above 20');
    expect(await stakingPool.targetWeight()).to.be.equal(2000);
    verifyProduct(await stakingPool.products(19), 100, 100, 19);
  });

  it('should fail to make product weight higher than 1', async function () {
    const { stakingPool } = this;
    const { defaultSender } = this.accounts;
    await initializePool(stakingPool, defaultSender.address, 0, []);
    await expect(stakingPool.setProducts([getNewProduct(101, 101, 0)])).to.be.revertedWith(
      'Cannot set weight beyond 1',
    );
  });

  it('should edit weights, and skip price', async function () {
    const { stakingPool } = this;
    const { defaultSender } = this.accounts;
    await initializePool(stakingPool, defaultSender.address, 0, []);
    const product = getNewProduct(0, 20, 0);
    product.setPrice = false;
    expect(product.targetPrice).to.be.equal(20);
    await stakingPool.setProducts([product]);
    verifyProduct(await stakingPool.products(0), 0, 0);
    product.targetWeight = 100;
    await stakingPool.setProducts([product]);
    verifyProduct(await stakingPool.products(0), 100, 0);
  });

  it('should edit prices and skip weights', async function () {
    const { stakingPool } = this;
    const { defaultSender } = this.accounts;
    await initializePool(stakingPool, defaultSender.address, 0, []);
    const product = getNewProduct(80, 50, 0);
    product.setWeight = false;
    await stakingPool.setProducts([product]);
    verifyProduct(await stakingPool.products(0), 0, 50);
    product.targetPrice = 100;
    await stakingPool.setProducts([product]);
    verifyProduct(await stakingPool.products(0), 0, 100);
  });

  it('should fail with targetPrice too high', async function () {
    const { stakingPool } = this;
    const { defaultSender } = this.accounts;
    await initializePool(stakingPool, defaultSender.address, 0, []);
    const product = getNewProduct(80, 10001, 0);
    await expect(stakingPool.setProducts([product])).to.be.revertedWith('Target price too high');
  });
});

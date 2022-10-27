const { expect } = require('chai');
const { ethers } = require('hardhat');
const { AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;
const daysToSeconds = days => days * 24 * 60 * 60;

const ProductTypeFixture = {
  claimMethod: 1,
  gracePeriodInDays: 7,
};

describe('setProducts unit tests', function () {
  const initializePool = async function (cover, stakingPool, manager, poolId, productInitParams) {
    // Set products in mock cover contract
    await Promise.all(
      productInitParams.map(p => [
        cover.setProduct(getCoverProduct(p.initialPrice), p.productId),
        cover.setProductType(ProductTypeFixture, p.productId),
      ]),
    );
    await cover.initializeStaking(stakingPool.address, manager, false, 5, 5, productInitParams, poolId);
  };

  const depositRequest = async (stakingPool, amount, tokenId, destination) => {
    const block = await ethers.provider.getBlock('latest');
    const currentTrancheId = Math.floor(block.timestamp / daysToSeconds(91));
    return {
      amount,
      trancheId: currentTrancheId + 2,
      tokenId,
      destination,
    };
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
      setTargetWeight: true,
      recalculateEffectiveWeight: true,
      targetWeight: weight,
      setTargetPrice: true,
      targetPrice: price,
    };
  };
  // Cover.Product
  const getCoverProduct = initialPriceRatio => {
    return {
      productType: 1,
      yieldTokenAddress: AddressZero,
      coverAssets: 1111,
      initialPriceRatio,
      capacityReductionRatio: 0,
    };
  };
  const buyCoverParams = (owner, productId, period, amount) => {
    return {
      owner,
      productId,
      coverAsset: 0, // ETH
      amount,
      period,
      maxPremiumInAsset: parseEther('100'),
      paymentAsset: 0,
      payWithNXM: false,
      commissionRatio: 1,
      commissionDestination: owner,
      ipfsData: 'ipfs data',
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
    const [manager, nonManager] = this.accounts.members;

    await initializePool(cover, stakingPool, manager.address, 0, []);
    const product = await initProduct(cover, 100, 100, 100, 0);
    await expect(stakingPool.connect(nonManager).setProducts([product])).to.be.revertedWith(
      'StakingPool: Only pool manager can call this function',
    );
  });

  it('should initialize products successfully', async function () {
    const { stakingPool, cover } = this;
    const [manager] = this.accounts.members;

    let i = 0;
    const initialProducts = Array.from({ length: 20 }, () => getInitialProduct(100, 100, 500, i++));
    await initializePool(cover, stakingPool, manager.address, 0, initialProducts);
    const product = await stakingPool.products(0);
    verifyProduct(product, 100, 100, 500);
    expect(await stakingPool.totalTargetWeight()).to.be.equal(2000);
  });

  it('should fail to initialize too many products with full weight', async function () {
    const { stakingPool, cover } = this;
    const [manager] = this.accounts.members;

    let i = 0;
    const initialProducts = Array.from({ length: 21 }, () => getInitialProduct(100, 100, 500, i++));
    await expect(initializePool(cover, stakingPool, manager.address, 0, initialProducts)).to.be.revertedWith(
      'StakingPool: Total max target weight exceeded',
    );
  });

  it('should set products and store values correctly', async function () {
    const { stakingPool, cover } = this;
    const [manager] = this.accounts.members;

    await initializePool(cover, stakingPool, manager.address, 0, []);
    const product = await initProduct(cover, 50, 100, 100, 0);
    await stakingPool.connect(manager).setProducts([product]);
    const product0 = await stakingPool.products(0);
    verifyProduct(product0, 100, 100, 50);
  });

  it('should revert if user tries to set targetWeight without recalculating effectiveWeight', async function () {
    const { stakingPool, cover } = this;
    const {
      members: [manager],
    } = this.accounts;
    await initializePool(cover, stakingPool, manager.address, 0, []);
    const product = await initProduct(cover, 50, 100, 100, 0);
    product.recalculateEffectiveWeight = false;
    await expect(stakingPool.connect(manager).setProducts([product])).to.be.revertedWith(
      'StakingPool: Must recalculate effectiveWeight to edit targetWeight',
    );
  });

  it('should revert if adding a product without setting the targetPrice', async function () {
    const { stakingPool, cover } = this;
    const [manager] = this.accounts.members;

    await initializePool(cover, stakingPool, manager.address, 0, []);
    const product = await initProduct(cover, 50, 100, 100, 0);
    product.setTargetPrice = false;
    await expect(stakingPool.connect(manager).setProducts([product])).to.be.revertedWith(
      'StakingPool: Must set price for new products',
    );
  });

  it('should add and remove products in same tx', async function () {
    const { stakingPool, cover } = this;
    const [manager] = this.accounts.members;

    const initialPriceRatio = 1000;
    await initializePool(cover, stakingPool, manager.address, 0, []);
    const products = [
      await initProduct(cover, initialPriceRatio, 50, 500, 0),
      await initProduct(cover, initialPriceRatio, 50, 500, 1),
    ];
    await stakingPool.connect(manager).setProducts(products);

    products[0].targetWeight = 0;
    products[1] = await initProduct(cover, initialPriceRatio, 50, 500, 2);
    // remove product0, add product2
    await stakingPool.connect(manager).setProducts(products);

    const product0 = await stakingPool.products(0);
    const product1 = await stakingPool.products(1);
    const product2 = await stakingPool.products(2);
    verifyProduct(product1, 50, 500, initialPriceRatio);
    verifyProduct(product0, 0, 500, initialPriceRatio);
    verifyProduct(product2, 50, 500, initialPriceRatio);
  });

  it('should add maximum products with full weight (20)', async function () {
    const { stakingPool, cover } = this;
    const [manager] = this.accounts.members;

    await initializePool(cover, stakingPool, manager.address, 0, []);
    let i = 0;
    const products = await Promise.all(Array.from({ length: 20 }, () => initProduct(cover, 999, 100, 100, i++)));
    await stakingPool.connect(manager).setProducts(products);
    expect(await stakingPool.totalTargetWeight()).to.be.equal(2000);
    const product19 = await stakingPool.products(19);
    verifyProduct(product19, 100, 100, 999);
  });

  it('should fail to add weights beyond 20x', async function () {
    const { stakingPool, cover } = this;
    const [manager] = this.accounts.members;

    await initializePool(cover, stakingPool, manager.address, 0, []);
    let i = 0;
    const products = await Promise.all(Array.from({ length: 20 }, () => initProduct(cover, 1, 100, 100, i++)));
    await stakingPool.connect(manager).setProducts(products);
    const newProduct = [await initProduct(cover, 1, 1, 100, 50)];

    await expect(stakingPool.connect(manager).setProducts(newProduct)).to.be.revertedWith(
      'StakingPool: Total max effective weight exceeded',
    );
    expect(await stakingPool.totalTargetWeight()).to.be.equal(2000);
    const product0 = await stakingPool.products(0);
    verifyProduct(product0, 100, 100, 1);
    expect(product0.nextPrice).to.be.equal(1);
  });

  it('should fail to initialize product with targetWeight greater that 1', async function () {
    const { stakingPool, cover } = this;
    const { GLOBAL_MIN_PRICE_RATIO } = this.config;
    const [manager] = this.accounts.members;

    const initialProduct = getInitialProduct(101, GLOBAL_MIN_PRICE_RATIO, 1, 1);
    await expect(initializePool(cover, stakingPool, manager.address, 0, [initialProduct])).to.be.revertedWith(
      'StakingPool: Cannot set weight beyond 1',
    );
  });

  it('should fail to make product weight higher than 1', async function () {
    const { stakingPool, cover } = this;
    const [manager] = this.accounts.members;

    await initializePool(cover, stakingPool, manager.address, 0, []);
    await expect(
      stakingPool.connect(manager).setProducts([await initProduct(cover, 1, 101, 500, 0)]),
    ).to.be.revertedWith('StakingPool: Cannot set weight beyond 1');
  });

  it('should edit weights, and skip price', async function () {
    const { stakingPool, cover } = this;
    const [manager] = this.accounts.members;

    await initializePool(cover, stakingPool, manager.address, 0, []);
    const product = await initProduct(cover, 1, 100, 500, 0);
    await stakingPool.connect(manager).setProducts([product]);
    verifyProduct(await stakingPool.products(0), 100, 500, 1);
    product.setTargetPrice = false;
    product.targetPrice = 0;
    product.targetWeight = 50;
    await stakingPool.connect(manager).setProducts([product]);
    verifyProduct(await stakingPool.products(0), 50, 500, 1);
  });

  it('should not be able to change targetWeight without recalculating effectiveWeight ', async function () {
    const { stakingPool, cover } = this;
    const [manager] = this.accounts.members;

    await initializePool(cover, stakingPool, manager.address, 0, []);
    const product = await initProduct(cover, 1, 0, 500, 0);
    await stakingPool.connect(manager).setProducts([product]);
    product.recalculateEffectiveWeight = false;
    product.targetWeight = 100;
    stakingPool.connect(manager).setProducts([product]);
    const productAfter = await stakingPool.products(0);
    expect(productAfter.targetWeight).to.be.equal(0);
    expect(productAfter.lastEffectiveWeight).to.be.equal(0);
  });

  it('should not use param.targetWeight if not explicityly setting targetWeight', async function () {
    const { stakingPool, cover } = this;
    const [manager] = this.accounts.members;

    await initializePool(cover, stakingPool, manager.address, 0, []);
    const products = [await initProduct(cover, 1, 0, 200, 0), await initProduct(cover, 1, 100, 200, 1)];
    await stakingPool.connect(manager).setProducts(products);
    products[0].targetWeight = 100;
    // Product 1 targetWeight shouldn't change, but effectiveWeight recalculated
    products[1].targetWeight = 0;
    products[1].setTargetWeight = false;
    await stakingPool.connect(manager).setProducts(products);
    const product0 = await stakingPool.products(0);
    const product1 = await stakingPool.products(1);
    verifyProduct(product0, 100, 200, 1);
    verifyProduct(product1, 100, 200, 1);
    expect(product0.lastEffectiveWeight).to.be.equal(100);
    expect(product1.lastEffectiveWeight).to.be.equal(100);
  });

  it('should edit prices and skip weights', async function () {
    const { stakingPool, cover } = this;
    const { GLOBAL_MIN_PRICE_RATIO } = this.config;
    const [manager] = this.accounts.members;

    await initializePool(cover, stakingPool, manager.address, 0, []);
    const product = await initProduct(cover, 1, 80, 500, 0);
    product.setTargetWeight = false;
    await stakingPool.connect(manager).setProducts([product]);
    verifyProduct(await stakingPool.products(0), 0, 500, 1);
    product.targetPrice = GLOBAL_MIN_PRICE_RATIO;
    await stakingPool.connect(manager).setProducts([product]);
    verifyProduct(await stakingPool.products(0), 0, GLOBAL_MIN_PRICE_RATIO, 1);
  });

  it('should fail with targetPrice too high', async function () {
    const { stakingPool, cover } = this;
    const [manager] = this.accounts.members;

    await initializePool(cover, stakingPool, manager.address, 0, []);
    const product = await initProduct(cover, 1, 80, 10001, 0);
    await expect(stakingPool.connect(manager).setProducts([product])).to.be.revertedWith(
      'StakingPool: Target price too high',
    );
  });

  it('should fail to initialize products with targetPrice below global minimum', async function () {
    const { stakingPool, cover } = this;
    const [manager] = this.accounts.members;

    const product = getInitialProduct(100, 1, 10, 0);
    await expect(initializePool(cover, stakingPool, manager.address, 0, [product])).to.be.revertedWith(
      'CoverUtilsLib: Target price below GLOBAL_MIN_PRICE_RATIO',
    );
  });

  it('should fail with targetPrice below global min price ratio', async function () {
    const { stakingPool, cover } = this;
    const { GLOBAL_MIN_PRICE_RATIO } = this.config;
    const [manager] = this.accounts.members;

    await initializePool(cover, stakingPool, manager.address, 0, []);
    const product = await initProduct(cover, 1, 80, GLOBAL_MIN_PRICE_RATIO - 1, 0);
    await expect(stakingPool.connect(manager).setProducts([product])).to.be.revertedWith(
      'StakingPool: Target price below GLOBAL_MIN_PRICE_RATIO',
    );
  });

  it('should fail to add non-existing product', async function () {
    const { stakingPool, cover } = this;
    const [manager] = this.accounts.members;

    await initializePool(cover, stakingPool, manager.address, 0, []);
    const product = getNewProduct(100, 100, 10);
    await expect(stakingPool.connect(manager).setProducts([product])).to.be.revertedWith(
      'Cover: Product deprecated or not initialized',
    );
  });

  it('should fail to change product weights when fully allocated', async function () {
    const { stakingPool, cover, nxm, tokenController } = this;
    const [manager, staker, coverBuyer] = this.accounts.members;

    const amount = parseEther('1');
    await initializePool(cover, stakingPool, manager.address, 0, []);

    // Get capacity in staking pool
    await nxm.connect(staker).approve(tokenController.address, amount);
    const request = await depositRequest(stakingPool, amount, 0, staker.address);
    await stakingPool.connect(staker).depositTo([request]);

    let i = 0;
    const coverId = 1;

    // Initialize Products
    const products = await Promise.all(Array.from({ length: 20 }, () => initProduct(cover, 1, 100, 100, i++)));
    await stakingPool.connect(manager).setProducts(products);

    // CoverBuy
    const coverBuy = Array.from({ length: 20 }, () => {
      return buyCoverParams(coverBuyer.address, --i, daysToSeconds('98'), parseEther('2'));
    });
    await Promise.all(
      coverBuy.map(cb => {
        return cover.allocateCapacity(cb, coverId, stakingPool.address);
      }),
    );

    products[10].targetWeight = 50;
    const newProducts = [products[10], await initProduct(cover, 1, 50, 500, 50)];
    await expect(stakingPool.connect(manager).setProducts(newProducts)).to.be.revertedWith(
      'StakingPool: Total max effective weight exceeded',
    );
  });

  it('should fail to change products when fully allocated after initializing', async function () {
    const { stakingPool, cover, nxm, tokenController } = this;
    const [manager, staker, coverBuyer] = this.accounts.members;
    const amount = parseEther('1');

    let i = 0;
    const initialProducts = Array.from({ length: 20 }, () => getInitialProduct(100, 100, 500, i++));
    await initializePool(cover, stakingPool, manager.address, 0, initialProducts);

    // Get capacity in staking pool
    await nxm.connect(staker).approve(tokenController.address, amount);
    const request = await depositRequest(stakingPool, amount, 0, manager.address);
    await stakingPool.connect(staker).depositTo([request]);

    const ratio = await cover.getPriceAndCapacityRatios([0]);
    const { totalCapacity } = await stakingPool.getTotalCapacitiesForActiveTranches(
      0,
      ratio._globalCapacityRatio,
      ratio._capacityReductionRatios[0],
    );
    expect(totalCapacity).to.be.equal(200);

    // Initialize Products and CoverBuy requests
    const coverId = 1;
    const coverBuy = Array.from({ length: 20 }, () => {
      return buyCoverParams(coverBuyer.address, --i, daysToSeconds('150'), parseEther('2'));
    });
    await Promise.all(
      coverBuy.map(cb => {
        return cover.connect(coverBuyer).allocateCapacity(cb, coverId, stakingPool.address);
      }),
    );

    const product10 = getNewProduct(50, 100, 10);
    const newProducts = [product10, await initProduct(cover, 1, 50, 500, 50)];
    await expect(stakingPool.connect(manager).setProducts(newProducts)).to.be.revertedWith(
      'StakingPool: Total max effective weight exceeded',
    );
  });
});

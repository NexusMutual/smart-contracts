const { expect } = require('chai');
const { ethers } = require('hardhat');
const { AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;
const daysToSeconds = days => days * 24 * 60 * 60;

const ProductTypeFixture = {
  claimMethod: 1,
  gracePeriodInDays: 7,
};

const coverProductTemplate = {
  productType: 1,
  yieldTokenAddress: AddressZero,
  coverAssets: 1111,
  initialPriceRatio: 500,
  capacityReductionRatio: 0,
};

const initialProductTemplate = {
  productId: 0,
  weight: 100, // 1.00
  initialPrice: 500, // 5%
  targetPrice: 100, // 1%
};

const newProductTemplate = {
  productId: 0,
  setTargetWeight: true,
  recalculateEffectiveWeight: true,
  targetWeight: 100,
  setTargetPrice: true,
  targetPrice: 500,
};

const buyCoverParamsTemplate = {
  owner: AddressZero,
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

describe('setProducts unit tests', function () {
  // Create a default deposit request to the staking pool
  const depositRequest = async (stakingPool, amount, destination) => {
    const tokenId = 0;
    const block = await ethers.provider.getBlock('latest');
    const currentTrancheId = Math.floor(block.timestamp / daysToSeconds(91));
    return {
      amount,
      trancheId: currentTrancheId + 2,
      tokenId,
      destination,
    };
  };

  const verifyProduct = (product, productParam) => {
    expect(product.targetWeight).to.be.equal(productParam.targetWeight);
    expect(product.targetPrice).to.be.equal(productParam.targetPrice);
    expect(product.nextPriceUpdateTime).to.be.equal(productParam.nextPriceUpdateTime);
  };

  it('should fail to be called by non manager', async function () {
    const { stakingPool, cover } = this;
    const [manager, nonManager] = this.accounts.members;

    await cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, [], 0);
    const product = { ...newProductTemplate };
    await cover.setProduct({ ...coverProductTemplate }, product.productId);
    await expect(stakingPool.connect(nonManager).setProducts([product])).to.be.revertedWith(
      'StakingPool: Only pool manager can call this function',
    );
  });

  it('should initialize products successfully', async function () {
    const { stakingPool, cover } = this;
    const [manager] = this.accounts.members;

    // initial products
    let i = 0;
    const initialProducts = Array(20)
      .fill('')
      .map(() => {
        return { ...initialProductTemplate, productId: i++ };
      });
    // Add products to cover contract
    await Promise.all(
      initialProducts.map(({ productId, initialPrice: initialPriceRatio }) => [
        cover.setProduct({ ...coverProductTemplate, initialPriceRatio }, productId),
        cover.setProductType(ProductTypeFixture, productId),
      ]),
    );
    await cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, initialProducts, 0);
    const block = await ethers.provider.getBlock('latest');

    const product = await stakingPool.products(0);
    expect(product.targetWeight).to.be.equal(initialProducts[0].weight);
    expect(product.targetPrice).to.be.equal(initialProducts[0].targetPrice);
    expect(product.nextPriceUpdateTime).to.be.equal(block.timestamp);
    expect(product.nextPrice).to.be.equal(initialProducts[0].initialPrice);
    expect(await stakingPool.totalTargetWeight()).to.be.equal(2000);
    expect(await stakingPool.totalEffectiveWeight()).to.be.equal(2000);
  });

  it('should fail to initialize too many products with full weight', async function () {
    const { stakingPool, cover } = this;
    const [manager] = this.accounts.members;

    let i = 0;
    const initialProducts = Array(21)
      .fill('')
      .map(() => ({ ...initialProductTemplate, productId: i++ }));
    // Add products to cover contract
    await Promise.all(
      initialProducts.map(({ productId, initialPrice: initialPriceRatio }) => [
        cover.setProduct({ ...coverProductTemplate, initialPriceRatio }, productId),
        cover.setProductType(ProductTypeFixture, productId),
      ]),
    );
    // 21 products at full weight will set exceed max target weight
    await expect(
      cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, initialProducts, 0),
    ).to.be.revertedWith('StakingPool: Total max target weight exceeded');
  });

  it('should set products and store values correctly', async function () {
    const { stakingPool, cover } = this;
    const [manager] = this.accounts.members;

    await cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, [], 0);
    const product = { ...newProductTemplate };
    await cover.setProduct({ ...coverProductTemplate }, product.productId);

    await stakingPool.connect(manager).setProducts([product]);
    const { timestamp: nextPriceUpdateTime } = await ethers.provider.getBlock('latest');

    const product0 = await stakingPool.products(0);
    verifyProduct(product0, { ...product, nextPriceUpdateTime });
  });

  it('should revert if user tries to set targetWeight without recalculating effectiveWeight', async function () {
    const { stakingPool, cover } = this;
    const [manager] = this.accounts.members;

    await cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, [], 0);
    const product = { ...newProductTemplate };
    await cover.setProduct({ ...coverProductTemplate }, product.productId);

    product.recalculateEffectiveWeight = false;
    await expect(stakingPool.connect(manager).setProducts([product])).to.be.revertedWith(
      'StakingPool: Must recalculate effectiveWeight to edit targetWeight',
    );
  });

  it('should revert if adding a product without setting the targetPrice', async function () {
    const { stakingPool, cover } = this;
    const [manager] = this.accounts.members;

    await cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, [], 0);
    const product = { ...newProductTemplate, setTargetPrice: false };
    await cover.setProduct({ ...coverProductTemplate }, product.productId);

    await expect(stakingPool.connect(manager).setProducts([product])).to.be.revertedWith(
      'StakingPool: Must set price for new products',
    );
  });

  it('should add and remove products in same tx', async function () {
    const { stakingPool, cover } = this;
    const [manager] = this.accounts.members;

    await cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, [], 0);
    const products = [{ ...newProductTemplate }, { ...newProductTemplate, productId: 1 }];
    await Promise.all([
      cover.setProduct({ ...coverProductTemplate }, products[0].productId),
      cover.setProduct({ ...coverProductTemplate }, products[1].productId),
    ]);

    await stakingPool.connect(manager).setProducts(products);
    const { timestamp: initialTimestamp } = await ethers.provider.getBlock('latest');

    const newProduct = { ...newProductTemplate, productId: 2 };
    await cover.setProduct({ ...coverProductTemplate }, newProduct.productId);

    // remove product0, skip product1, add product2
    const productEditParams = [{ ...products[0], targetWeight: 0 }, newProduct];
    await stakingPool.connect(manager).setProducts(productEditParams);
    const { timestamp: latestTimestamp } = await ethers.provider.getBlock('latest');

    const product0 = await stakingPool.products(0);
    const product1 = await stakingPool.products(1);
    const product2 = await stakingPool.products(2);

    // product 0 should now have targetWegiht == 0
    verifyProduct(product0, { ...productEditParams[0], nextPriceUpdateTime: initialTimestamp });
    // product 1 stays the same
    verifyProduct(product1, { ...products[1], nextPriceUpdateTime: initialTimestamp });
    // product 2 should be added as a supported product
    verifyProduct(product2, { ...productEditParams[1], nextPriceUpdateTime: latestTimestamp });
  });

  it('should add maximum products with full weight (20)', async function () {
    const { stakingPool, cover } = this;
    const [manager] = this.accounts.members;
    // initialize with 0 products
    await cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, [], 0);

    let i = 0;
    const products = await Promise.all(
      Array(20)
        .fill('')
        .map(() => {
          const product = { ...newProductTemplate, productId: i++ };
          cover.setProduct({ ...coverProductTemplate }, product.productId);
          return product;
        }),
    );
    await stakingPool.connect(manager).setProducts(products);
    const { timestamp: nextPriceUpdateTime } = await ethers.provider.getBlock('latest');

    expect(await stakingPool.totalTargetWeight()).to.be.equal(2000);
    const product19 = await stakingPool.products(19);
    verifyProduct(product19, { ...products[19], nextPriceUpdateTime });
  });

  it('should fail to add weights beyond 20x', async function () {
    const { stakingPool, cover } = this;
    const [manager] = this.accounts.members;

    await cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, [], 0);
    let i = 0;
    const products = await Promise.all(
      Array.from({ length: 20 }, () => {
        const product = { ...newProductTemplate, productId: i++ };
        cover.setProduct({ ...coverProductTemplate }, product.productId);
        return product;
      }),
    );
    await stakingPool.connect(manager).setProducts(products);
    const { timestamp: nextPriceUpdateTime } = await ethers.provider.getBlock('latest');

    expect(await stakingPool.totalTargetWeight()).to.be.equal(2000);
    const product0 = await stakingPool.products(0);
    verifyProduct(product0, { ...products[0], nextPriceUpdateTime });

    const newProduct = { ...newProductTemplate, productId: 50 };
    await cover.setProduct({ ...coverProductTemplate }, newProduct.productId);
    await expect(stakingPool.connect(manager).setProducts([newProduct])).to.be.revertedWith(
      'StakingPool: Total max effective weight exceeded',
    );
  });

  it('should fail to initialize product with targetWeight greater that 1', async function () {
    const { stakingPool, cover } = this;
    const [manager] = this.accounts.members;

    const initialProduct = { ...initialProductTemplate, weight: 101 };

    await expect(
      cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, [initialProduct], 0),
    ).to.be.revertedWith('StakingPool: Cannot set weight beyond 1');
  });

  it('should fail to make product weight higher than 1', async function () {
    const { stakingPool, cover } = this;
    const [manager] = this.accounts.members;

    await cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, [], 0);
    const product = { ...newProductTemplate, targetWeight: 101 };
    await cover.setProduct({ ...coverProductTemplate }, product.productId);
    await expect(stakingPool.connect(manager).setProducts([product])).to.be.revertedWith(
      'StakingPool: Cannot set weight beyond 1',
    );
  });

  it('should edit weights, and skip price', async function () {
    const { stakingPool, cover } = this;
    const [manager] = this.accounts.members;

    await cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, [], 0);
    const product = { ...newProductTemplate };
    await cover.setProduct({ ...coverProductTemplate }, product.productId);
    await stakingPool.connect(manager).setProducts([product]);
    const { timestamp: nextPriceUpdateTime } = await ethers.provider.getBlock('latest');

    verifyProduct(await stakingPool.products(0), { ...product, nextPriceUpdateTime });
    product.setTargetPrice = false;
    product.targetPrice = 0;
    product.targetWeight = 50;
    {
      const { timestamp: nextPriceUpdateTime } = await ethers.provider.getBlock('latest');
      await stakingPool.connect(manager).setProducts([product]);
      verifyProduct(await stakingPool.products(0), {
        ...newProductTemplate,
        targetWeight: 50,
        nextPriceUpdateTime,
      });
    }
  });

  it('should not be able to change targetWeight without recalculating effectiveWeight ', async function () {
    const { stakingPool, cover } = this;
    const [manager] = this.accounts.members;

    await cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, [], 0);
    const product = { ...newProductTemplate, targetWeight: 0 };
    await cover.setProduct({ ...coverProductTemplate }, product.productId);
    await stakingPool.connect(manager).setProducts([product]);
    product.recalculateEffectiveWeight = false;
    product.targetWeight = 100;
    await expect(stakingPool.connect(manager).setProducts([product])).to.be.revertedWith(
      'StakingPool: Must recalculate effectiveWeight to edit targetWeight',
    );
  });

  it('effective weight should lower if targetWeight is reduced and there are no allocations', async function () {
    const { stakingPool, cover } = this;
    const [manager] = this.accounts.members;

    await cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, [], 0);
    const products = [{ ...newProductTemplate }, { ...newProductTemplate, productId: 1 }];
    await Promise.all([
      cover.setProduct({ ...coverProductTemplate }, products[0].productId),
      cover.setProduct({ ...coverProductTemplate }, products[1].productId),
    ]);
    await stakingPool.connect(manager).setProducts(products);
    const { timestamp: nextPriceUpdateTime } = await ethers.provider.getBlock('latest');
    // lowering targetWeight should reduce effective weight
    products[0].targetWeight = 0;
    // product1 target and effective weight  should remain at 100
    products[1].targetWeight = 0;
    products[1].setTargetWeight = false;
    await stakingPool.connect(manager).setProducts(products);
    const product0 = await stakingPool.products(0);
    const product1 = await stakingPool.products(1);
    verifyProduct(product0, { ...products[0], nextPriceUpdateTime });
    verifyProduct(product1, { ...newProductTemplate, productId: 1, nextPriceUpdateTime });
    expect(product0.lastEffectiveWeight).to.be.equal(0);
    expect(product1.lastEffectiveWeight).to.be.equal(100);
  });

  it('should edit prices and skip weights', async function () {
    const { stakingPool, cover } = this;
    const { GLOBAL_MIN_PRICE_RATIO } = this.config;
    const [manager] = this.accounts.members;

    await cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, [], 0);
    const product = { ...newProductTemplate };
    await cover.setProduct({ ...coverProductTemplate }, product.productId);
    await stakingPool.connect(manager).setProducts([product]);
    const { timestamp: nextPriceUpdateTime } = await ethers.provider.getBlock('latest');
    verifyProduct(await stakingPool.products(0), { ...product, nextPriceUpdateTime });
    // Weight calculation should be skipped
    await stakingPool
      .connect(manager)
      .setProducts([{ ...product, targetWeight: 1, setTargetWeight: false, targetPrice: GLOBAL_MIN_PRICE_RATIO }]);
    verifyProduct(await stakingPool.products(0), {
      ...newProductTemplate,
      targetPrice: GLOBAL_MIN_PRICE_RATIO,
      nextPriceUpdateTime,
    });
  });

  it('should fail with targetPrice too high', async function () {
    const { stakingPool, cover } = this;
    const [manager] = this.accounts.members;

    await cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, [], 0);
    const product = { ...newProductTemplate, targetPrice: 10001 };
    await cover.setProduct({ ...coverProductTemplate }, product.productId);
    await expect(stakingPool.connect(manager).setProducts([product])).to.be.revertedWith(
      'StakingPool: Target price too high',
    );
  });

  it('should fail to initialize products with targetPrice below global minimum', async function () {
    const { stakingPool, cover } = this;
    const { GLOBAL_MIN_PRICE_RATIO } = this.config;
    const [manager] = this.accounts.members;

    const product = { ...initialProductTemplate, targetPrice: GLOBAL_MIN_PRICE_RATIO - 1 };
    await expect(
      cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, [product], 0),
    ).to.be.revertedWith('CoverUtilsLib: Target price below GLOBAL_MIN_PRICE_RATIO');
  });

  it('should fail with targetPrice below global min price ratio', async function () {
    const { stakingPool, cover } = this;
    const { GLOBAL_MIN_PRICE_RATIO } = this.config;
    const [manager] = this.accounts.members;

    await cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, [], 0);
    const product = { ...newProductTemplate, targetPrice: GLOBAL_MIN_PRICE_RATIO - 1 };
    await cover.setProduct({ ...coverProductTemplate }, product.productId);
    await expect(stakingPool.connect(manager).setProducts([product])).to.be.revertedWith(
      'StakingPool: Target price below GLOBAL_MIN_PRICE_RATIO',
    );
  });

  it('should fail to add non-existing product', async function () {
    const { stakingPool, cover } = this;
    const [manager] = this.accounts.members;

    await cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, [], 0);
    const product = { ...newProductTemplate, productId: 1000 };
    await expect(stakingPool.connect(manager).setProducts([product])).to.be.revertedWith(
      'Cover: Product deprecated or not initialized',
    );
  });

  it('should fail to change product weights when fully allocated', async function () {
    const { stakingPool, cover, nxm, tokenController } = this;
    const [manager, staker, coverBuyer] = this.accounts.members;

    const amount = parseEther('1');
    await cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, [], 0);

    // Get capacity in staking pool
    await nxm.connect(staker).approve(tokenController.address, amount);
    const request = await depositRequest(stakingPool, amount, staker.address);
    await stakingPool.connect(staker).depositTo([request]);

    let i = 0;
    const coverId = 1;
    // Initialize Products
    const products = await Promise.all(
      Array(20)
        .fill('')
        .map(() => {
          const product = { ...newProductTemplate, productId: i++ };
          cover.setProduct({ ...coverProductTemplate }, product.productId);
          return product;
        }),
    );

    await stakingPool.connect(manager).setProducts(products);

    // CoverBuy
    const coverBuyParams = Array(20)
      .fill('')
      .map(() => ({
        ...buyCoverParamsTemplate,
        owner: coverBuyer.address,
        productId: --i,
        amount: parseEther('2'),
      }));

    await Promise.all(
      coverBuyParams.map(cb => {
        return cover.allocateCapacity(cb, coverId, stakingPool.address);
      }),
    );

    products[10].targetWeight = 50;
    const newProducts = [products[10], { ...newProductTemplate, productId: 50 }];
    await cover.setProduct({ ...coverProductTemplate }, newProducts[1].productId);
    await expect(stakingPool.connect(manager).setProducts(newProducts)).to.be.revertedWith(
      'StakingPool: Total max effective weight exceeded',
    );
  });

  it('should fail to change products when fully allocated after initializing', async function () {
    const { stakingPool, cover, nxm, tokenController } = this;
    const [manager, staker, coverBuyer] = this.accounts.members;
    const amount = parseEther('1');

    let i = 0;
    const initialProducts = Array(20)
      .fill('')
      .map(() => ({ ...initialProductTemplate, productId: i++ }));
    // Add products to cover contract
    await Promise.all(
      initialProducts.map(({ productId, initialPrice: initialPriceRatio }) => [
        cover.setProduct({ ...coverProductTemplate, initialPriceRatio }, productId),
        cover.setProductType(ProductTypeFixture, productId),
      ]),
    );
    await cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, initialProducts, 0);

    // Get capacity in staking pool
    await nxm.connect(staker).approve(tokenController.address, amount);
    const request = await depositRequest(stakingPool, amount, manager.address);
    await stakingPool.connect(staker).depositTo([request]);

    const ratio = await cover.getPriceAndCapacityRatios([0]);
    const { totalCapacity } = await stakingPool.getActiveTrancheCapacities(
      0,
      ratio._globalCapacityRatio,
      ratio._capacityReductionRatios[0],
    );
    expect(totalCapacity).to.be.equal(200);

    // Initialize Products and CoverBuy requests
    const coverId = 1;
    const coverBuyParams = Array(20)
      .fill('')
      .map(() => {
        return { ...buyCoverParamsTemplate, owner: coverBuyer.address, productId: --i, amount: parseEther('2') };
      });
    await Promise.all(
      coverBuyParams.map(cb => {
        return cover.connect(coverBuyer).allocateCapacity(cb, coverId, stakingPool.address);
      }),
    );

    // lower product 10 to half weight to add half weight on another product
    const newProducts = [
      { ...newProductTemplate, targetWeight: 50, productId: 10 },
      { ...newProductTemplate, productId: 50 },
    ];
    await cover.setProduct({ ...coverProductTemplate }, newProducts[1].productId);
    await expect(stakingPool.connect(manager).setProducts(newProducts)).to.be.revertedWith(
      'StakingPool: Total max effective weight exceeded',
    );
  });

  it('any address should be able to recalculate effective weight', async function () {
    const { stakingPool, cover, nxm, tokenController } = this;
    const {
      members: [manager, staker, coverBuyer],
    } = this.accounts;
    const amount = parseEther('1');

    let i = 0;
    const initialProducts = Array.from({ length: 20 }, () => getInitialProduct(50, 100, 500, i++));
    await initializePool(cover, stakingPool, manager.address, 0, initialProducts);

    // Get capacity in staking pool
    await nxm.connect(staker).approve(tokenController.address, amount);
    const request = await depositRequest(stakingPool, amount, 0, manager.address);
    await stakingPool.connect(staker).depositTo([request]);

    // Initialize Products and CoverBuy requests
    const coverId = 1;
    const coverBuy = Array.from({ length: 20 }, () => {
      return buyCoverParams(coverBuyer.address, --i, daysToSeconds('150'), parseEther('1'));
    });
    await Promise.all(
      coverBuy.map(cb => {
        return cover.connect(coverBuyer).allocateCapacity(cb, coverId, stakingPool.address);
      }),
    );
    // TODO: test effective weight after a burn
    await stakingPool.recalculateEffectiveWeights(initialProducts.map(p => p.productId));
  });
});

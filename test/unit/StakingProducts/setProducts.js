const { expect } = require('chai');
const { ethers } = require('hardhat');
const { setEtherBalance } = require('../../utils/evm');
const {
  verifyProduct,
  depositTo,
  daysToSeconds,
  initialProductTemplate,
  newProductTemplate,
  getNewStakedProducts,
  allocateCapacity,
  burnStakeParams,
} = require('./helpers');
const { AddressZero, Zero, One, Two } = ethers.constants;
const { parseEther } = ethers.utils;
const { BigNumber } = ethers;
const { increaseTime } = require('../../utils/evm');

const poolId = 1;
const allProducts = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

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

describe('setProducts unit tests', function () {
  it('should fail to be called by non manager', async function () {
    const { stakingProducts } = this;
    const [nonManager] = this.accounts.nonMembers;

    await expect(
      stakingProducts.connect(nonManager).setProducts(poolId, [{ ...newProductTemplate }]),
    ).to.be.revertedWithCustomError(stakingProducts, 'OnlyManager');
  });

  it('should fail to set products for a non existent staking pool', async function () {
    const { stakingProducts } = this;
    const [manager] = this.accounts.members;

    const product = { ...newProductTemplate };
    await expect(stakingProducts.connect(manager).setProducts(324985304958, [product])).to.be.revertedWithoutReason();
  });

  it('should set products and store values correctly', async function () {
    const { stakingProducts } = this;
    const [manager] = this.accounts.members;

    await stakingProducts.connect(manager).setProducts(poolId, [{ ...newProductTemplate }]);
    const { timestamp: bumpedPriceUpdateTime } = await ethers.provider.getBlock('latest');

    const product0 = await stakingProducts.getProduct(poolId, 0);
    await verifyProduct.call(this, {
      product: product0,
      productParams: { ...newProductTemplate, bumpedPriceUpdateTime },
    });
  });

  it('should revert if user tries to set targetWeight without recalculating effectiveWeight', async function () {
    const { stakingProducts } = this;
    const [manager] = this.accounts.members;

    const product = { ...newProductTemplate, recalculateEffectiveWeight: false };

    await expect(stakingProducts.connect(manager).setProducts(poolId, [product])).to.be.revertedWithCustomError(
      stakingProducts,
      'MustRecalculateEffectiveWeight',
    );
  });

  it('should revert if adding a product without setting the targetPrice', async function () {
    const { stakingProducts } = this;
    const [manager] = this.accounts.members;

    const product = { ...newProductTemplate, setTargetPrice: false };

    await expect(stakingProducts.connect(manager).setProducts(poolId, [product])).to.be.revertedWithCustomError(
      stakingProducts,
      'MustSetPriceForNewProducts',
    );
  });

  it('should emit ProductUpdated event when setting a product ', async function () {
    const { stakingProducts } = this;
    const [manager] = this.accounts.members;

    const products = [{ ...newProductTemplate }];

    await stakingProducts.connect(manager).setProducts(poolId, products);

    await expect(stakingProducts.connect(manager).setProducts(poolId, products))
      .to.emit(stakingProducts, 'ProductUpdated')
      .withArgs(products[0].productId, products[0].targetWeight, products[0].targetPrice);
  });

  it('should add and remove products in same tx', async function () {
    const { stakingProducts } = this;
    const [manager] = this.accounts.members;

    const products = [{ ...newProductTemplate }, { ...newProductTemplate, productId: 1 }];

    await stakingProducts.connect(manager).setProducts(poolId, products);
    const { timestamp: initialTimestamp } = await ethers.provider.getBlock('latest');

    const newProduct = { ...newProductTemplate, productId: 2 };

    // remove product0, skip product1, add product2
    const productEditParams = [{ ...products[0], setTargetPrice: false, targetWeight: 0 }, newProduct];
    await stakingProducts.connect(manager).setProducts(poolId, productEditParams);
    const { timestamp: latestTimestamp } = await ethers.provider.getBlock('latest');

    const product0 = await stakingProducts.getProduct(poolId, 0);
    const product1 = await stakingProducts.getProduct(poolId, 1);
    const product2 = await stakingProducts.getProduct(poolId, 2);

    // product 0 should now have targetWeight == 0
    await verifyProduct.call(this, {
      product: product0,
      productParams: { ...productEditParams[0], bumpedPriceUpdateTime: initialTimestamp },
    });
    // product 1 stays the same
    await verifyProduct.call(this, {
      product: product1,
      productParams: { ...products[1], bumpedPriceUpdateTime: initialTimestamp },
    });
    // product 2 should be added as a supported product
    await verifyProduct.call(this, {
      product: product2,
      productParams: { ...productEditParams[1], bumpedPriceUpdateTime: latestTimestamp },
    });
  });

  it('should edit targetPrice and update bumpedPrice and bumpedPriceUpdateTime', async function () {
    const { stakingProducts, cover } = this;
    const [manager] = this.accounts.members;

    const products = [{ ...newProductTemplate }];

    const { _initialPrices } = await cover.getPriceAndCapacityRatios(products.map(p => p.productId));

    // set products
    await stakingProducts.connect(manager).setProducts(poolId, products);

    const { timestamp: initialTimestamp } = await ethers.provider.getBlock('latest');

    const { bumpedPrice: bumpedPriceBefore, bumpedPriceUpdateTime: bumpedPriceUpdateTimeBefore } =
      await stakingProducts.getProduct(poolId, newProductTemplate.productId);

    expect(bumpedPriceBefore).to.be.equal(_initialPrices[0]);
    expect(bumpedPriceUpdateTimeBefore).to.be.equal(initialTimestamp);

    const productEditParams = [{ ...products[0], targetPrice: 200 }];
    await stakingProducts.connect(manager).setProducts(poolId, productEditParams);

    await increaseTime(daysToSeconds(2)); // 1% drop
    const priceDrop = BigNumber.from(100); // 1%

    // increase targetPrice, but bumpedPrice should decrease towards previous targer
    {
      const productEditParams = [{ ...products[0], targetPrice: 2000 }];
      await stakingProducts.connect(manager).setProducts(poolId, productEditParams);
      const { timestamp: latestTimestamp } = await ethers.provider.getBlock('latest');

      const product0 = await stakingProducts.getProduct(poolId, 0);
      expect(product0.bumpedPrice).to.not.equal(product0.targetPrice);
      expect(product0.bumpedPrice).to.be.equal(BigNumber.from(bumpedPriceBefore).sub(priceDrop));
      expect(product0.bumpedPriceUpdateTime).to.be.equal(latestTimestamp);

      verifyProduct(product0, { ...productEditParams[0], bumpedPriceUpdateTime: latestTimestamp });
    }
  });

  it('should update bumpedPrice correctly when decreasing targetPrice', async function () {
    const { stakingProducts, cover } = this;
    const [manager] = this.accounts.members;

    // target price = 300
    const initialTargetPrice = BigNumber.from(300);
    const products = [{ ...newProductTemplate, targetPrice: initialTargetPrice }];

    // initial price = 500
    const { _initialPrices } = await cover.getPriceAndCapacityRatios(products.map(p => p.productId));

    // set products
    await stakingProducts.connect(manager).setProducts(poolId, products);

    const { timestamp: initialTimestamp } = await ethers.provider.getBlock('latest');
    const { bumpedPrice: bumpedPriceBefore, bumpedPriceUpdateTime: bumpedPriceUpdateTimeBefore } =
      await stakingProducts.getProduct(poolId, newProductTemplate.productId);

    expect(bumpedPriceBefore).to.be.equal(_initialPrices[0]); // 500
    expect(bumpedPriceUpdateTimeBefore).to.be.equal(initialTimestamp);

    await increaseTime(daysToSeconds(8)); // 4% drop

    // decrease target price, but keep it above what the base price would have been if there was no floor
    const newTargetPrice = BigNumber.from(200);

    const productEditParams = { ...products[0], targetPrice: newTargetPrice };
    await stakingProducts.connect(manager).setProducts(poolId, [productEditParams]);
    const { timestamp: latestTimestamp } = await ethers.provider.getBlock('latest');

    const product0 = await stakingProducts.getProduct(poolId, 0);

    // base price would have dropped to 500 - 400 = 100 if there was no targetPrice/floor
    // base price should drop only to the initial target price: max(100, 300) = 300
    expect(product0.bumpedPrice).to.be.equal(initialTargetPrice);
    expect(product0.bumpedPriceUpdateTime).to.be.equal(latestTimestamp);

    expect(product0.targetWeight).to.be.equal(productEditParams.targetWeight);
    expect(product0.targetPrice).to.be.equal(productEditParams.targetPrice);
  });

  it('should add maximum products with full weight (20)', async function () {
    const { stakingProducts } = this;
    const [manager] = this.accounts.members;

    const products = await getNewStakedProducts.call(this, { productIds: allProducts });
    await stakingProducts.connect(manager).setProducts(poolId, products);

    const weights = await stakingProducts.weights(poolId);
    expect(weights.totalTargetWeight).to.be.equal(2000);
    expect(weights.totalEffectiveWeight).to.be.equal(2000);

    const product19 = await stakingProducts.getProduct(poolId, 19);
    const product1 = await stakingProducts.getProduct(poolId, 1);

    await verifyProduct.call(this, { product: product19, productParams: products[19] });
    await verifyProduct.call(this, { product: product1, productParams: products[1] });
  });

  it('should fail to add weights beyond 20x', async function () {
    const { stakingProducts } = this;
    const [manager] = this.accounts.members;

    // define staking products
    const initialStakingProducts = await getNewStakedProducts.call(this, { productIds: allProducts });

    await stakingProducts.connect(manager).setProducts(poolId, initialStakingProducts);
    const weights = await stakingProducts.weights(poolId);
    expect(weights.totalTargetWeight).to.be.equal(2000);

    const stakingProduct = await stakingProducts.getProduct(poolId, 0);
    await verifyProduct.call(this, {
      product: stakingProduct,
      productParams: initialStakingProducts[0],
    });

    const newStakingProduct = { ...newProductTemplate, productId: 20 };
    await expect(
      stakingProducts.connect(manager).setProducts(poolId, [newStakingProduct]),
    ).to.be.revertedWithCustomError(stakingProducts, 'TotalTargetWeightExceeded');
  });

  it('should fail to make product weight higher than 1', async function () {
    const { stakingProducts } = this;
    const [manager] = this.accounts.members;

    const product = { ...newProductTemplate, targetWeight: 101 };
    await expect(stakingProducts.connect(manager).setProducts(poolId, [product])).to.be.revertedWithCustomError(
      stakingProducts,
      'TargetWeightTooHigh',
    );
  });

  it('should edit weights, and skip price', async function () {
    const { stakingProducts } = this;
    const [manager] = this.accounts.members;

    const newProductParams = { ...newProductTemplate };
    await stakingProducts.connect(manager).setProducts(poolId, [newProductParams]);

    await verifyProduct.call(this, {
      product: await stakingProducts.getProduct(poolId, 0),
      productParams: newProductParams,
    });

    newProductParams.setTargetPrice = false;
    newProductParams.targetPrice = 0;
    newProductParams.targetWeight = 50;
    const { timestamp: bumpedPriceUpdateTime } = await ethers.provider.getBlock('latest');
    await stakingProducts.connect(manager).setProducts(poolId, [newProductParams]);
    await verifyProduct.call(this, {
      product: await stakingProducts.getProduct(poolId, 0),
      productParams: {
        ...newProductTemplate,
        targetWeight: 50,
        bumpedPriceUpdateTime,
      },
    });
  });

  it('should not be able to change targetWeight without recalculating effectiveWeight ', async function () {
    const { stakingProducts } = this;
    const [manager] = this.accounts.members;

    const product = { ...newProductTemplate, targetWeight: 0 };
    await stakingProducts.connect(manager).setProducts(poolId, [product]);
    product.recalculateEffectiveWeight = false;
    product.targetWeight = 100;
    await expect(stakingProducts.connect(manager).setProducts(poolId, [product])).to.be.revertedWithCustomError(
      stakingProducts,
      'MustRecalculateEffectiveWeight',
    );
  });

  it('effective weight should lower if targetWeight is reduced and there are no allocations', async function () {
    const { stakingProducts } = this;
    const [manager] = this.accounts.members;

    const products = [{ ...newProductTemplate }, { ...newProductTemplate, productId: 1 }];
    await stakingProducts.connect(manager).setProducts(poolId, products);
    const { timestamp: bumpedPriceUpdateTime } = await ethers.provider.getBlock('latest');
    // lowering targetWeight should reduce effective weight
    products[0].targetWeight = 0;
    products[0].setTargetPrice = false;
    // should skip setting price and weight
    products[1].targetWeight = 0;
    products[1].setTargetWeight = false;
    products[1].setTargetPrice = false;

    await stakingProducts.connect(manager).setProducts(poolId, products);
    const product0 = await stakingProducts.getProduct(poolId, 0);
    const product1 = await stakingProducts.getProduct(poolId, 1);
    await verifyProduct.call(this, { product: product0, productParams: { ...products[0], bumpedPriceUpdateTime } });
    await verifyProduct.call(this, {
      product: product1,
      productParams: { ...newProductTemplate, productId: 1, bumpedPriceUpdateTime },
    });
    expect(product0.lastEffectiveWeight).to.be.equal(0);
    expect(product1.lastEffectiveWeight).to.be.equal(100);
  });

  it('should edit prices and skip weights', async function () {
    const { stakingProducts } = this;
    const { GLOBAL_MIN_PRICE_RATIO } = this.config;
    const [manager] = this.accounts.members;

    const newProductParams = { ...newProductTemplate };
    await stakingProducts.connect(manager).setProducts(poolId, [newProductParams]);

    const { timestamp: bumpedPriceUpdateTime } = await ethers.provider.getBlock('latest');
    await verifyProduct.call(this, {
      product: await stakingProducts.getProduct(poolId, 0),
      productParams: { ...newProductParams, bumpedPriceUpdateTime },
    });

    // Weight calculation should be skipped
    await stakingProducts
      .connect(manager)
      .setProducts(poolId, [
        { ...newProductParams, targetWeight: 1, setTargetWeight: false, targetPrice: GLOBAL_MIN_PRICE_RATIO },
      ]);

    const { timestamp: bumpedPriceUpdateTimeAfter } = await ethers.provider.getBlock('latest');
    await verifyProduct.call(this, {
      product: await stakingProducts.getProduct(poolId, 0),
      productParams: {
        ...newProductTemplate,
        targetPrice: GLOBAL_MIN_PRICE_RATIO,
        bumpedPriceUpdateTimeAfter,
      },
    });
  });

  it('should fail with targetPrice too high', async function () {
    const { stakingProducts } = this;
    const [manager] = this.accounts.members;

    const product = { ...newProductTemplate, targetPrice: 10001 };
    await expect(stakingProducts.connect(manager).setProducts(poolId, [product])).to.be.revertedWithCustomError(
      stakingProducts,
      'TargetPriceTooHigh',
    );
  });

  it('should fail with targetPrice below global min price ratio', async function () {
    const { stakingProducts } = this;
    const { GLOBAL_MIN_PRICE_RATIO } = this.config;
    const [manager] = this.accounts.members;

    const product = { ...newProductTemplate, targetPrice: GLOBAL_MIN_PRICE_RATIO - 1 };
    await expect(stakingProducts.connect(manager).setProducts(poolId, [product])).to.be.revertedWithCustomError(
      stakingProducts,
      'TargetPriceBelowMin',
    );
  });

  it('should fail to add a product and skip setting targetWeight', async function () {
    const { stakingProducts } = this;
    const [manager] = this.accounts.members;

    const product = { ...newProductTemplate, setTargetWeight: false };
    await expect(stakingProducts.connect(manager).setProducts(poolId, [product])).to.be.revertedWithCustomError(
      stakingProducts,
      'MustSetWeightForNewProducts',
    );
  });

  it('should edit a single product', async function () {
    const { stakingProducts } = this;
    const [manager] = this.accounts.members;

    // Add 3 products
    const products = await getNewStakedProducts.call(this, { productIds: [0, 1, 2] });
    await stakingProducts.connect(manager).setProducts(poolId, products);

    const { timestamp: initialTimestamp } = await ethers.provider.getBlock('latest');

    // Product 1: Skip weight adjustments, but set price
    const productToEdit = {
      ...products[1],
      recalculateEffectiveWeight: false,
      setTargetWeight: false,
      setTargetPrice: true,
      targetPrice: One.mul(499),
    };

    // Product [0,2]: Add products as param, but don't adjust anything
    const skipProduct = {
      ...products[0],
      setTargetPrice: false,
      setTargetWeight: false,
      recalculateEffectiveWeight: false,
    };

    // Edit product 1, skip product 0 and 2
    await stakingProducts
      .connect(manager)
      .setProducts(poolId, [productToEdit, { ...skipProduct, productId: 0 }, { ...skipProduct, productId: 2 }]);

    const { timestamp: bumpedPriceUpdateTime } = await ethers.provider.getBlock('latest');

    // product 1 has the lastest timestamp
    await verifyProduct.call(this, {
      product: await stakingProducts.getProduct(poolId, One),
      productParams: { ...productToEdit, bumpedPriceUpdateTime },
    });
    await verifyProduct.call(this, {
      product: await stakingProducts.getProduct(poolId, Zero),
      productParams: { ...skipProduct, productId: 0, bumpedPriceUpdateTime: initialTimestamp },
    });
    await verifyProduct.call(this, {
      product: await stakingProducts.getProduct(poolId, Two),
      productParams: { ...skipProduct, productId: 2, bumpedPriceUpdateTime: initialTimestamp },
    });
  });

  it('should fail to add non-existing product', async function () {
    const { stakingProducts } = this;
    const [manager] = this.accounts.members;

    const product = { ...newProductTemplate, productId: 1000 };
    await expect(stakingProducts.connect(manager).setProducts(poolId, [product])).to.be.revertedWithCustomError(
      stakingProducts,
      'PoolNotAllowedForThisProduct',
    );
  });

  it('should fail to change product weights when fully allocated', async function () {
    const { stakingProducts, stakingPool, cover } = this;
    const [manager, staker, coverBuyer] = this.accounts.members;

    const amount = parseEther('1');

    // Deposit
    await depositTo.call(this, { staker, amount });

    let i = 0;
    const coverId = 1;
    // Initialize Products
    const products = await Promise.all(
      Array(20)
        .fill('')
        .map(() => {
          return { ...newProductTemplate, productId: i++ };
        }),
    );

    await stakingProducts.connect(manager).setProducts(poolId, products);

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
        return cover.allocateCapacity(cb, coverId, 0, stakingPool.address);
      }),
    );

    products[10].targetWeight = 50;
    const newProducts = [products[10], { ...newProductTemplate, productId: 20 }];
    await expect(stakingProducts.connect(manager).setProducts(poolId, newProducts)).to.be.revertedWithCustomError(
      stakingProducts,
      'TotalTargetWeightExceeded',
    );
  });

  it('should fail to change products when fully allocated after initializing', async function () {
    const { stakingProducts, stakingPool, cover } = this;
    const [manager, staker, coverBuyer] = this.accounts.members;
    const amount = parseEther('1');

    let i = 0;
    const initialProducts = Array(20)
      .fill('')
      .map(() => ({ ...initialProductTemplate, productId: i++ }));

    await stakingProducts.setInitialProducts(poolId, initialProducts);

    // Get capacity in staking pool
    await depositTo.call(this, { staker, amount });

    // Initialize Products and CoverBuy requests
    const coverId = 1;
    const coverBuyParams = Array(20)
      .fill('')
      .map(() => {
        return { ...buyCoverParamsTemplate, owner: coverBuyer.address, productId: --i, amount: parseEther('2') };
      });
    await Promise.all(
      coverBuyParams.map(cb => {
        return cover.connect(coverBuyer).allocateCapacity(cb, coverId, 0, stakingPool.address);
      }),
    );

    // lower product 10 to half weight to add half weight on another product
    const newProducts = [
      { ...newProductTemplate, targetWeight: 50, productId: 10 },
      { ...newProductTemplate, productId: 20 },
    ];
    await expect(stakingProducts.connect(manager).setProducts(poolId, newProducts)).to.be.revertedWithCustomError(
      stakingProducts,
      'TotalTargetWeightExceeded',
    );
  });

  it('any address should be able to recalculate effective weight', async function () {
    const { stakingProducts, stakingPool, cover } = this;
    const {
      members: [staker, coverBuyer],
      nonMembers: [anybody],
    } = this.accounts;
    const amount = parseEther('200');

    let i = 0;
    const initialProducts = Array(20)
      .fill('')
      .map(() => ({ ...initialProductTemplate, productId: i++ }));

    await stakingProducts.setInitialProducts(poolId, initialProducts);

    // Get capacity in staking pool
    await depositTo.call(this, { staker, amount });

    // Initialize Products and CoverBuy requests
    const coverBuyParams = Array(20)
      .fill('')
      .map((_, productId) => ({
        ...buyCoverParamsTemplate,
        owner: coverBuyer.address,
        productId,
        period: daysToSeconds('150'),
        amount: parseEther('1'),
      }));

    const coverId = 0;
    await Promise.all(
      coverBuyParams.map(cb => {
        return cover.connect(coverBuyer).allocateCapacity(cb, coverId, 0, stakingPool.address);
      }),
    );

    await stakingProducts.connect(anybody).recalculateEffectiveWeights(
      poolId,
      initialProducts.map(p => p.productId),
    );
  });

  it('should add products with target weight 0 and have no capacity', async function () {
    const { stakingProducts, stakingPool, cover } = this;
    const [manager, staker, coverBuyer] = this.accounts.members;

    const numProducts = 20;
    const coverId = 1;
    const amount = parseEther('.01');

    // Get capacity in staking pool
    await depositTo.call(this, { staker, amount });

    let i = 0;
    const products = await Promise.all(
      Array(numProducts)
        .fill('')
        .map(() => {
          return { ...newProductTemplate, productId: i++, targetWeight: 0 };
        }),
    );

    // Set products
    await stakingProducts.connect(manager).setProducts(poolId, products);

    await expect(
      cover
        .connect(coverBuyer)
        .allocateCapacity({ ...buyCoverParamsTemplate, amount: 1 }, coverId, 0, stakingPool.address),
    ).to.be.revertedWithCustomError(stakingPool, 'InsufficientCapacity');
  });

  it('should add product with target weight 1', async function () {
    const { stakingProducts, stakingPool, cover } = this;
    const [manager, staker, coverBuyer] = this.accounts.members;

    const coverId = 1;
    const amount = parseEther('1');
    const coverBuyAmount = amount.div(100); // weight is 1/100

    // Get capacity in staking pool
    await depositTo.call(this, { staker, amount });

    await stakingProducts.connect(manager).setProducts(poolId, [{ ...newProductTemplate, targetWeight: 1 }]);

    await stakingPool.getActiveStake();

    // Fails if cover amount is too high
    await expect(
      cover
        .connect(coverBuyer)
        .allocateCapacity({ ...buyCoverParamsTemplate, amount: coverBuyAmount + 1 }, coverId, 0, stakingPool.address),
    ).to.be.revertedWithCustomError(stakingPool, 'InsufficientCapacity');

    await cover
      .connect(coverBuyer)
      .allocateCapacity({ ...buyCoverParamsTemplate, amount: coverBuyAmount }, coverId, 0, stakingPool.address);
  });

  it('should fail to increase target weight when effective weight is at the limit', async function () {
    const { stakingProducts, stakingPool, cover } = this;
    const [manager, staker, coverBuyer] = this.accounts.members;

    // Impersonate cover contract
    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(cover.address, parseEther('100000'));

    const coverId = 1;
    const amount = parseEther('10000');

    // Get capacity in staking pool
    await depositTo.call(this, { staker, amount });

    // setup 20 products at 50% weight
    const numProducts = 20;
    const products = Array(numProducts)
      .fill('')
      .map((_, i) => ({ ...newProductTemplate, productId: i, targetWeight: 50 }));

    // Add products
    await stakingProducts.connect(manager).setProducts(poolId, products);

    // Buy max cover on all products
    const allocatePromises = [];
    for (let i = 0; i < numProducts; i++) {
      allocatePromises.push(
        cover.allocateCapacity(
          { ...buyCoverParamsTemplate, productId: i, owner: coverBuyer.address, amount },
          coverId,
          0,
          stakingPool.address,
        ),
      );
    }
    await Promise.all(allocatePromises);

    // Burn stake 99% of stake
    const activeStake = await stakingPool.getActiveStake();
    await stakingPool.connect(coverSigner).burnStake(activeStake.sub(parseEther('.01')), burnStakeParams);

    // Increasing weight on any product will cause it to recalculate effective weight
    const increaseTargetWeightParams = products.map(p => ({ ...p, targetWeight: 51 }));
    await expect(
      stakingProducts.connect(manager).setProducts(poolId, increaseTargetWeightParams),
    ).to.be.revertedWithCustomError(stakingProducts, 'TotalEffectiveWeightExceeded');
  });

  it('should lower target weights when over allocated', async function () {
    const { stakingProducts, stakingPool, cover } = this;
    const [manager, staker, coverBuyer] = this.accounts.members;

    // Impersonate cover contract
    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(cover.address, parseEther('100000'));

    const numProducts = 20;
    const coverId = 1;
    const amount = parseEther('1');
    const { timestamp: start } = await ethers.provider.getBlock('latest');

    // Add capacity
    await depositTo.call(this, { staker, amount });

    // 20 products with 95% weight
    let i = 0;
    const products = await Promise.all(
      Array(numProducts)
        .fill('')
        .map(() => {
          return { ...newProductTemplate, productId: i++, targetWeight: 95 };
        }),
    );

    // Set products
    await stakingProducts.connect(manager).setProducts(poolId, products);

    // Buy all remaining cover (190 capacity per product)
    const coverBuyParams = Array(20)
      .fill('')
      .map(() => ({
        ...buyCoverParamsTemplate,
        owner: coverBuyer.address,
        productId: --i,
        amount: parseEther('1.90'),
      }));
    await Promise.all(
      coverBuyParams.map(cb => {
        return cover.allocateCapacity(cb, coverId, 0, stakingPool.address);
      }),
    );

    {
      let i = 0;
      const products = await Promise.all(
        Array(numProducts)
          .fill('')
          .map(() => {
            return { ...newProductTemplate, productId: i++, targetWeight: 100 };
          }),
      );

      const burnStakeParams = {
        allocationId: 1,
        productId: 1,
        start,
        period: buyCoverParamsTemplate.period,
        deallocationAmount: 0,
      };

      // Effective weight is 1900, so a 5% increase on each product weight should be ok
      await expect(stakingProducts.connect(manager).callStatic.setProducts(poolId, products)).to.not.be.reverted;

      // Burn 6 capacity units to increase effective weight to 102%
      await stakingPool.connect(coverSigner).burnStake(parseEther('.06'), burnStakeParams);

      expect(await stakingProducts.getTotalTargetWeight(poolId)).to.equal(1900);
      expect(await stakingProducts.getTotalEffectiveWeight(poolId)).to.equal(1900);

      // Increasing weight on any product will cause it require effective weight be below limit
      await expect(stakingProducts.connect(manager).setProducts(poolId, products)).to.be.revertedWithCustomError(
        stakingProducts,
        'TotalEffectiveWeightExceeded',
      );

      // should be able to lower product weights however
      const productsReduced = await Promise.all(
        Array(numProducts)
          .fill('')
          .map(() => {
            return { ...newProductTemplate, productId: --i, targetWeight: 1 };
          }),
      );
      await expect(stakingProducts.connect(manager).setProducts(poolId, productsReduced)).to.not.be.reverted;

      expect(await stakingProducts.getTotalTargetWeight(poolId)).to.equal(20);
      expect(await stakingProducts.getTotalEffectiveWeight(poolId)).to.equal(2020);
    }
  });

  it('should calculate effective weight properly', async function () {
    const { stakingProducts } = this;
    const [manager, coverBuyer] = this.accounts.members;

    const products = await getNewStakedProducts.call(this, { productIds: allProducts, targetWeight: 50 });

    // set products at 50% weight
    await stakingProducts.connect(manager).setProducts(poolId, products);

    // check weights
    expect(await stakingProducts.getTotalEffectiveWeight(poolId)).to.equal(1000);
    expect(await stakingProducts.getTotalTargetWeight(poolId)).to.equal(1000);

    // deposit 100 capacity
    await depositTo.call(this, { staker: manager, amount: parseEther('100') });

    // buy 100 capacity for each products (100% of available capacity at 50% weight)
    await Promise.all(
      allProducts.map(productId => allocateCapacity.call(this, { coverBuyer, productId, amount: parseEther('100') })),
    );

    await stakingProducts.connect(manager).recalculateEffectiveWeightsForAllProducts(poolId);

    // check weights
    expect(await stakingProducts.getTotalEffectiveWeight(poolId)).to.equal(1000);
    expect(await stakingProducts.getTotalTargetWeight(poolId)).to.equal(1000);
  });
});

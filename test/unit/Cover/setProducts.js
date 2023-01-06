const { ethers } = require('hardhat');
const { expect } = require('chai');
const { createStakingPool } = require('./helpers');
const { daysToSeconds } = require('../../../lib/helpers');
const { resultAsObject } = require('../../utils/').results;
const { parseEther } = ethers.utils;
const { AddressZero, MaxUint256 } = ethers.constants;

describe('setProducts', function () {
  const amount = parseEther('1000');
  const targetPriceRatio = '260';
  const activeCover = parseEther('8000');
  const capacity = parseEther('10000');
  const priceDenominator = 10000;
  const capacityFactor = 10000;
  const defaultIpfsData = 'QmRmkky7qQBjCAU3gFUqfy3NXD6CPq8YVLPM7GHXBz7b5P';

  // Cover.PoolAllocationRequest
  const poolAllocationRequestTemplate = {
    poolId: '0',
    coverAmountInAsset: amount,
    allocationId: MaxUint256,
  };

  // Cover.BuyCoverParams
  const buyCoverTemplate = {
    owner: AddressZero,
    coverId: MaxUint256,
    productId: 0,
    coverAsset: 0,
    amount,
    period: daysToSeconds(50),
    maxPremiumInAsset: parseEther('100'),
    paymentAsset: 0,
    commissionRatio: parseEther('0'),
    commissionDestination: AddressZero,
    ipfsData: defaultIpfsData,
  };

  // Cover.Product
  const productTemplate = {
    productType: 0,
    yieldTokenAddress: AddressZero,
    coverAssets: parseInt('111', 2), // ETH/DAI/USDC
    initialPriceRatio: 1000, // 10%
    capacityReductionRatio: capacityFactor, // 100%
    isDeprecated: false,
    useFixedPrice: false,
  };

  // Cover.ProductParams
  const productParamsTemplate = {
    productId: MaxUint256,
    ipfsMetadata: defaultIpfsData,
    product: { ...productTemplate },
    allowedPools: [],
  };

  it('should add a single product and emit ProductSet event', async function () {
    const { cover } = this;
    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;
    const productParams = { ...productParamsTemplate };
    const expectedProductId = await cover.productsCount();
    await expect(cover.connect(advisoryBoardMember0).setProducts([productParams]))
      .to.emit(cover, 'ProductSet')
      .withArgs(expectedProductId, defaultIpfsData);
    const product = resultAsObject(await cover.products(expectedProductId));
    const expectedProduct = productParams.product;
    expect(product).to.deep.equal(expectedProduct);
  });

  it('should edit a single product and emit ProductSet event with updated args', async function () {
    const { cover } = this;
    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;
    const productParams = { ...productParamsTemplate };
    // add product
    await cover.connect(advisoryBoardMember0).setProducts([productParams]);
    // edit product
    const capacityReductionRatio = 500;
    const product = { ...productParams.product, capacityReductionRatio };
    const productId = (await cover.productsCount()).sub(1);
    const ipfsMetadata = 'new ipfs hash';
    const editParams = { ...productParams, ipfsMetadata, productId, product };
    await expect(cover.connect(advisoryBoardMember0).setProducts([editParams]))
      .to.emit(cover, 'ProductSet')
      .withArgs(productId, ipfsMetadata);
    const actualProduct = resultAsObject(await cover.products(productId));
    const expectedProduct = editParams.product;
    expect(actualProduct).to.deep.equal(expectedProduct);
  });

  it('should revert if called by address not on advisory board', async function () {
    const { cover } = this;
    const [member] = this.accounts.members;
    const productParams = Array.from({ length: 20 }, () => ({ ...productParamsTemplate }));
    await expect(cover.connect(member).setProducts(productParams)).to.be.revertedWith(
      'Caller is not an advisory board member',
    );
  });

  it('should add many products', async function () {
    const { cover } = this;
    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;

    const previousProductsCount = await cover.productsCount();
    const newProductsCount = 40;
    const productParams = Array.from({ length: newProductsCount }, () => ({ ...productParamsTemplate }));
    await expect(cover.connect(advisoryBoardMember0).setProducts(productParams))
      .to.emit(cover, 'ProductSet')
      .withArgs(40, defaultIpfsData);
    const products = await cover.getProducts();
    expect(products.length).to.be.equal(previousProductsCount.add(newProductsCount).toNumber());
  });

  it('should revert if trying to edit a non-existing product', async function () {
    const { cover } = this;
    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;
    const productId = await cover.productsCount();
    const productParams = { ...productParamsTemplate, productId };
    await expect(cover.connect(advisoryBoardMember0).setProducts([productParams])).to.be.revertedWith(
      'Cover: Product doesnt exist. Set id to uint256.max to add it',
    );
  });

  it('should revert if updated coverAssets are unsupported', async function () {
    const { cover } = this;
    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;
    const coverAssets = parseInt('1111', 2); // ETH DAI, USDC and WBTC supported
    const product = { ...productTemplate, coverAssets };
    const productParams = { ...productParamsTemplate, product };
    await expect(cover.connect(advisoryBoardMember0).setProducts([productParams])).to.be.revertedWith(
      'Cover: Unsupported cover assets',
    );
  });

  it('should revert if updated coverAssets are unsupported when editing a product', async function () {
    const { cover } = this;
    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;
    const productId = await cover.productsCount();
    const productParams = { ...productParamsTemplate };
    await expect(cover.connect(advisoryBoardMember0).setProducts([productParams]))
      .to.emit(cover, 'ProductSet')
      .withArgs(productId, defaultIpfsData);
    {
      const coverAssets = parseInt('1111', 2); // ETH DAI, USDC and WBTC supported
      const product = { ...productTemplate, coverAssets };
      const productParams = { ...productParamsTemplate, product, productId };
      await expect(cover.connect(advisoryBoardMember0).setProducts([productParams])).to.be.revertedWith(
        'Cover: Unsupported cover assets',
      );
    }
  });

  it('should revert if initialPriceRatio > 100', async function () {
    const { cover } = this;
    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;
    const initialPriceRatio = priceDenominator + 1;
    const product = { ...productTemplate, initialPriceRatio };
    const productParams = { ...productParamsTemplate, product };
    await expect(cover.connect(advisoryBoardMember0).setProducts([productParams])).to.be.revertedWith(
      'Cover: initialPriceRatio > 100%',
    );
  });

  it('should revert if initialPriceRatio > 100 when editing a product', async function () {
    const { cover } = this;
    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;
    const productId = await cover.productsCount();
    const productParams = { ...productParamsTemplate };
    await expect(cover.connect(advisoryBoardMember0).setProducts([productParams]))
      .to.emit(cover, 'ProductSet')
      .withArgs(productId, defaultIpfsData);
    {
      const initialPriceRatio = priceDenominator + 1;
      const product = { ...productTemplate, initialPriceRatio };
      const productParams = { ...productParamsTemplate, product, productId };
      await expect(cover.connect(advisoryBoardMember0).setProducts([productParams])).to.be.revertedWith(
        'Cover: initialPriceRatio > 100%',
      );
    }
  });

  it('should revert if initialPriceRatio is below GLOBAL_MIN_PRICE_RATIO', async function () {
    const { cover } = this;
    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;
    const { GLOBAL_MIN_PRICE_RATIO } = this.config;
    const initialPriceRatio = GLOBAL_MIN_PRICE_RATIO - 1;
    const product = { ...productTemplate, initialPriceRatio };
    const productParams = { ...productParamsTemplate, product };
    await expect(cover.connect(advisoryBoardMember0).setProducts([productParams])).to.be.revertedWith(
      'Cover: initialPriceRatio < GLOBAL_MIN_PRICE_RATIO',
    );
  });

  it('should revert if initialPriceRatio is below GLOBAL_MIN_PRICE_RATIO when editing a product', async function () {
    const { cover } = this;
    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;
    const productId = 1;
    const { GLOBAL_MIN_PRICE_RATIO } = this.config;
    const productParams = { ...productParamsTemplate };
    await cover.connect(advisoryBoardMember0).setProducts([productParams]);
    {
      const initialPriceRatio = GLOBAL_MIN_PRICE_RATIO - 1;
      const product = { ...productTemplate, initialPriceRatio };
      const productParams = { ...productParamsTemplate, product, productId };
      await expect(cover.connect(advisoryBoardMember0).setProducts([productParams])).to.be.revertedWith(
        'Cover: initialPriceRatio < GLOBAL_MIN_PRICE_RATIO',
      );
    }
  });

  it('should revert if capacityReductionRatio > 100% when adding a product', async function () {
    const { cover } = this;
    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;
    const capacityReductionRatio = capacityFactor + 1; // 100.01 %
    const product = { ...productTemplate, capacityReductionRatio };
    const productParams = { ...productParamsTemplate, product };
    await expect(cover.connect(advisoryBoardMember0).setProducts([productParams])).to.be.revertedWith(
      'Cover: capacityReductionRatio > 100%',
    );
  });

  it('should revert if capacityReductionRatio > 100% when editing a product', async function () {
    const { cover } = this;
    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;
    const productId = await cover.productsCount();
    const productParams = { ...productParamsTemplate };
    await expect(cover.connect(advisoryBoardMember0).setProducts([productParams]))
      .to.emit(cover, 'ProductSet')
      .withArgs(productId, defaultIpfsData);

    const capacityReductionRatio = capacityFactor + 1; // 100.01 %
    const product = { ...productTemplate, capacityReductionRatio };
    const productParamsOverCapacity = { ...productParamsTemplate, product, productId };
    await expect(
      cover.connect(advisoryBoardMember0).setProducts([productParamsOverCapacity]), // should revert
    ).to.be.revertedWith('Cover: capacityReductionRatio > 100%');
  });

  it('should fail to buy cover for deprecated product', async function () {
    const { cover } = this;
    const {
      governanceContracts: [gv1],
      members: [coverBuyer, stakingPoolManager],
      advisoryBoardMembers: [advisoryBoardMember0],
    } = this.accounts;

    const productId = 1;
    await cover.connect(gv1).updateUintParameters([0], [capacityFactor]);

    // create staking pool
    await createStakingPool(
      cover,
      productId,
      capacity,
      targetPriceRatio,
      activeCover,
      stakingPoolManager,
      stakingPoolManager,
      targetPriceRatio,
    );

    const productParams = {
      ...productParamsTemplate,
    };
    // Add new product
    await cover.connect(advisoryBoardMember0).setProducts([productParams]);

    // deprecate product
    const isDeprecated = true;
    const product = { ...productParams.product, isDeprecated };
    const deprecateProductParams = { ...productParamsTemplate, productId, product };
    await cover.connect(advisoryBoardMember0).setProducts([deprecateProductParams]);

    // buy cover
    const owner = coverBuyer.address;
    const expectedPremium = amount.mul(targetPriceRatio).div(priceDenominator);
    const buyCoverParams = { ...buyCoverTemplate, owner, expectedPremium, productId };
    await expect(
      cover.connect(coverBuyer).buyCover(buyCoverParams, [poolAllocationRequestTemplate], {
        value: expectedPremium,
      }),
    ).to.be.revertedWith('Cover: Product is deprecated');
  });

  it('should fail to edit cover for deprecated product', async function () {
    const { cover } = this;
    const {
      governanceContracts: [gv1],
      members: [coverBuyer, stakingPoolManager],
      advisoryBoardMembers: [advisoryBoardMember0],
    } = this.accounts;

    const productId = 1;
    await cover.connect(gv1).updateUintParameters([0], [capacityFactor]);

    // create staking pool
    await createStakingPool(
      cover,
      productId,
      capacity,
      targetPriceRatio,
      activeCover,
      stakingPoolManager,
      stakingPoolManager,
      targetPriceRatio,
    );

    const productParams = {
      ...productParamsTemplate,
    };
    // Add new product
    await cover.connect(advisoryBoardMember0).setProducts([productParams]);

    // buy cover
    const owner = coverBuyer.address;
    const expectedPremium = amount.mul(targetPriceRatio).div(priceDenominator);
    const buyCoverParams = { ...buyCoverTemplate, owner, expectedPremium, productId };
    await cover
      .connect(coverBuyer)
      .buyCover(buyCoverParams, [poolAllocationRequestTemplate], { value: expectedPremium });

    // deprecate product
    const isDeprecated = true;
    const product = { ...productParams.product, isDeprecated };
    const deprecateProductParams = { ...productParamsTemplate, productId, product };
    await cover.connect(advisoryBoardMember0).setProducts([deprecateProductParams]);

    const coverId = (await cover.coverDataCount()).sub(1);
    const editCoverParams = { ...buyCoverParams, coverId };

    // edit cover
    await expect(
      cover.connect(coverBuyer).buyCover(editCoverParams, [poolAllocationRequestTemplate], { value: expectedPremium }),
    ).to.be.revertedWith('Cover: Product is deprecated');
  });

  it('should be able to buy cover on a previously deprecated product', async function () {
    const { cover } = this;
    const {
      governanceContracts: [gv1],
      members: [coverBuyer, stakingPoolManager],
      advisoryBoardMembers: [advisoryBoardMember0],
    } = this.accounts;

    const productId = 1;
    await cover.connect(gv1).updateUintParameters([0], [capacityFactor]);

    // create staking pool
    await createStakingPool(
      cover,
      productId,
      capacity,
      targetPriceRatio,
      activeCover,
      stakingPoolManager,
      stakingPoolManager,
      targetPriceRatio,
    );

    const productParams = {
      ...productParamsTemplate,
    };
    // Add new product
    await cover.connect(advisoryBoardMember0).setProducts([productParams]);

    // deprecate product
    const isDeprecated = true;
    const product = { ...productParams.product, isDeprecated };
    const deprecateProductParams = { ...productParamsTemplate, productId, product };
    await cover.connect(advisoryBoardMember0).setProducts([deprecateProductParams]);

    {
      // re-enable product
      const isDeprecated = false;
      const product = { ...productParams.product, isDeprecated };
      const restoreProductParams = { ...deprecateProductParams, product };
      await cover.connect(advisoryBoardMember0).setProducts([restoreProductParams]);
    }

    // buy cover
    const owner = coverBuyer.address;
    const expectedPremium = amount.mul(targetPriceRatio).div(priceDenominator);
    const buyCoverParams = { ...buyCoverTemplate, owner, expectedPremium, productId };
    await cover
      .connect(coverBuyer)
      .buyCover(buyCoverParams, [poolAllocationRequestTemplate], { value: expectedPremium });
  });
});

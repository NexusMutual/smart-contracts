const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('../Cover/setup');
const { resultAsObject } = require('../utils').results;
const { AddressZero, MaxUint256 } = ethers.constants;

describe('setProducts', function () {
  const priceDenominator = 10000;
  const capacityFactor = 10000;
  const defaultIpfsData = 'QmRmkky7qQBjCAU3gFUqfy3NXD6CPq8YVLPM7GHXBz7b5P';

  // coverProducts.Product
  const productTemplate = {
    productType: 0,
    yieldTokenAddress: AddressZero,
    coverAssets: parseInt('111', 2), // ETH/DAI/USDC
    initialPriceRatio: 1000, // 10%
    capacityReductionRatio: capacityFactor, // 100%
    isDeprecated: false,
    useFixedPrice: false,
  };

  // coverProducts.ProductParams
  const productParamsTemplate = {
    productName: 'xyz',
    productId: MaxUint256,
    ipfsMetadata: defaultIpfsData,
    product: { ...productTemplate },
    allowedPools: [],
  };

  it('should add a single product and emit ProductSet event', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;
    const productParams = { ...productParamsTemplate };
    const expectedProductId = await coverProducts.getProductCount();
    await expect(coverProducts.connect(advisoryBoardMember0).setProducts([productParams]))
      .to.emit(coverProducts, 'ProductSet')
      .withArgs(expectedProductId, defaultIpfsData);
    const product = resultAsObject(await coverProducts.getProduct(expectedProductId));
    const expectedProduct = productParams.product;
    expect(product).to.deep.equal(expectedProduct);
  });

  it('should edit a single product and emit ProductSet event with updated args', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;
    const productParams = { ...productParamsTemplate };
    // add product
    await coverProducts.connect(advisoryBoardMember0).setProducts([productParams]);
    // edit product
    const capacityReductionRatio = 500;
    const product = { ...productParams.product, capacityReductionRatio };
    const productId = (await coverProducts.getProductCount()).sub(1);
    const ipfsMetadata = 'new ipfs hash';
    const editParams = { ...productParams, ipfsMetadata, productId, product };
    await expect(coverProducts.connect(advisoryBoardMember0).setProducts([editParams]))
      .to.emit(coverProducts, 'ProductSet')
      .withArgs(productId, ipfsMetadata);
    const actualProduct = resultAsObject(await coverProducts.getProduct(productId));
    const expectedProduct = editParams.product;
    expect(actualProduct).to.deep.equal(expectedProduct);
  });

  it('should revert if called by address not on advisory board', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [member] = fixture.accounts.members;
    const productParams = Array.from({ length: 20 }, () => ({ ...productParamsTemplate }));
    await expect(coverProducts.connect(member).setProducts(productParams)).to.be.revertedWith(
      'Caller is not an advisory board member',
    );
  });

  it('should add many products', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;

    const previousProductsCount = await coverProducts.getProductCount();
    const newProductsCount = 40;
    const productParams = Array.from({ length: newProductsCount }, () => ({ ...productParamsTemplate }));
    await expect(coverProducts.connect(advisoryBoardMember0).setProducts(productParams))
      .to.emit(coverProducts, 'ProductSet')
      .withArgs(40, defaultIpfsData);
    const products = await coverProducts.getProducts();
    expect(products.length).to.be.equal(previousProductsCount.add(newProductsCount).toNumber());
  });

  it('should revert if trying to edit a non-existing product', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;
    const productId = await coverProducts.getProductCount();
    const productParams = { ...productParamsTemplate, productId };
    await expect(
      coverProducts.connect(advisoryBoardMember0).setProducts([productParams]),
    ).to.be.revertedWithCustomError(coverProducts, 'ProductDoesntExist');
  });

  it('should revert if updated coverAssets are unsupported', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember] = fixture.accounts.advisoryBoardMembers;

    // ETH = 1, DAI = 2, 3 & 4 don't exist
    const coverAssets = 0b1111;
    const product = { ...productTemplate, coverAssets };
    const productParams = { ...productParamsTemplate, product };

    await expect(coverProducts.connect(advisoryBoardMember).setProducts([productParams])).to.be.revertedWithCustomError(
      coverProducts,
      'UnsupportedCoverAssets',
    );
  });

  it('should revert if updated coverAssets are unsupported when editing a product', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;
    const productId = await coverProducts.getProductCount();
    const productParams = { ...productParamsTemplate };
    await expect(coverProducts.connect(advisoryBoardMember0).setProducts([productParams]))
      .to.emit(coverProducts, 'ProductSet')
      .withArgs(productId, defaultIpfsData);
    {
      const coverAssets = parseInt('1111', 2); // ETH DAI, USDC and WBTC supported
      const product = { ...productTemplate, coverAssets };
      const productParams = { ...productParamsTemplate, product, productId };
      await expect(
        coverProducts.connect(advisoryBoardMember0).setProducts([productParams]),
      ).to.be.revertedWithCustomError(coverProducts, 'UnsupportedCoverAssets');
    }
  });

  it('should revert if initialPriceRatio > 100', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;
    const initialPriceRatio = priceDenominator + 1;
    const product = { ...productTemplate, initialPriceRatio };
    const productParams = { ...productParamsTemplate, product };
    await expect(
      coverProducts.connect(advisoryBoardMember0).setProducts([productParams]),
    ).to.be.revertedWithCustomError(coverProducts, 'InitialPriceRatioAbove100Percent');
  });

  it('should revert if initialPriceRatio > 100 when editing a product', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;
    const productId = await coverProducts.getProductCount();
    const productParams = { ...productParamsTemplate };
    await expect(coverProducts.connect(advisoryBoardMember0).setProducts([productParams]))
      .to.emit(coverProducts, 'ProductSet')
      .withArgs(productId, defaultIpfsData);
    {
      const initialPriceRatio = priceDenominator + 1;
      const product = { ...productTemplate, initialPriceRatio };
      const productParams = { ...productParamsTemplate, product, productId };
      await expect(
        coverProducts.connect(advisoryBoardMember0).setProducts([productParams]),
      ).to.be.revertedWithCustomError(coverProducts, 'InitialPriceRatioAbove100Percent');
    }
  });

  it('should revert if initialPriceRatio is below GLOBAL_MIN_PRICE_RATIO', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;
    const { GLOBAL_MIN_PRICE_RATIO } = fixture.config;
    const initialPriceRatio = GLOBAL_MIN_PRICE_RATIO - 1;
    const product = { ...productTemplate, initialPriceRatio };
    const productParams = { ...productParamsTemplate, product };
    await expect(
      coverProducts.connect(advisoryBoardMember0).setProducts([productParams]),
    ).to.be.revertedWithCustomError(coverProducts, 'InitialPriceRatioBelowGlobalMinPriceRatio');
  });

  it('should revert if initialPriceRatio is below GLOBAL_MIN_PRICE_RATIO when editing a product', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;
    const productId = 1;
    const { GLOBAL_MIN_PRICE_RATIO } = fixture.config;
    const productParams = { ...productParamsTemplate };
    await coverProducts.connect(advisoryBoardMember0).setProducts([productParams]);
    {
      const initialPriceRatio = GLOBAL_MIN_PRICE_RATIO - 1;
      const product = { ...productTemplate, initialPriceRatio };
      const productParams = { ...productParamsTemplate, product, productId };
      await expect(
        coverProducts.connect(advisoryBoardMember0).setProducts([productParams]),
      ).to.be.revertedWithCustomError(coverProducts, 'InitialPriceRatioBelowGlobalMinPriceRatio');
    }
  });

  it('should revert if capacityReductionRatio > 100% when adding a product', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;
    const capacityReductionRatio = capacityFactor + 1; // 100.01 %
    const product = { ...productTemplate, capacityReductionRatio };
    const productParams = { ...productParamsTemplate, product };
    await expect(
      coverProducts.connect(advisoryBoardMember0).setProducts([productParams]),
    ).to.be.revertedWithCustomError(coverProducts, 'CapacityReductionRatioAbove100Percent');
  });

  it('should revert if capacityReductionRatio > 100% when editing a product', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;
    const productId = await coverProducts.getProductCount();
    const productParams = { ...productParamsTemplate };
    await expect(coverProducts.connect(advisoryBoardMember0).setProducts([productParams]))
      .to.emit(coverProducts, 'ProductSet')
      .withArgs(productId, defaultIpfsData);

    const capacityReductionRatio = capacityFactor + 1; // 100.01 %
    const product = { ...productTemplate, capacityReductionRatio };
    const productParamsOverCapacity = { ...productParamsTemplate, product, productId };
    await expect(
      coverProducts.connect(advisoryBoardMember0).setProducts([productParamsOverCapacity]), // should revert
    ).to.be.revertedWithCustomError(coverProducts, 'CapacityReductionRatioAbove100Percent');
  });

  it('should store product name for existing product', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;

    const expectedProductId = 0;
    const expectedProductName = 'Product Test';

    const productParams = {
      ...productParamsTemplate,
      productId: expectedProductId,
      productName: expectedProductName,
    };
    await coverProducts.connect(advisoryBoardMember0).setProducts([productParams]);

    const productName = await coverProducts.productNames(expectedProductId);
    expect(productName).to.be.equal(expectedProductName);
  });

  it('should not change product name for existing product if passed empty string', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;

    const expectedProductId = 0;
    const productNameBefore = await coverProducts.productNames(expectedProductId);

    const productParams = {
      ...productParamsTemplate,
      productId: expectedProductId,
      productName: '',
    };
    await coverProducts.connect(advisoryBoardMember0).setProducts([productParams]);

    const productNameAfter = await coverProducts.productNames(expectedProductId);
    expect(productNameAfter).to.be.equal(productNameBefore);
  });

  it('should store product name for new product', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;

    const expectedProductName = 'Product Test';

    const productParams = {
      ...productParamsTemplate,
      productId: MaxUint256,
      productName: expectedProductName,
    };
    await coverProducts.connect(advisoryBoardMember0).setProducts([productParams]);

    const productsCount = await coverProducts.getProductCount();
    const productName = await coverProducts.productNames(productsCount.sub(1));
    expect(productName).to.be.equal(expectedProductName);
  });
});
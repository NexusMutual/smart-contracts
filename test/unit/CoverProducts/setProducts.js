const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

const { resultAsObject } = require('../utils').results;
const { MaxUint256 } = ethers.constants;

describe('setProducts', function () {
  const priceDenominator = 10000;
  const capacityFactor = 10000;
  const defaultIpfsData = 'QmRmkky7qQBjCAU3gFUqfy3NXD6CPq8YVLPM7GHXBz7b5P';

  // coverProducts.Product
  const productTemplate = {
    productType: 0,
    minPrice: 0,
    __gap: 0,
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

  it('should add a single product', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;
    const productParams = { ...productParamsTemplate };
    const expectedProductId = await coverProducts.getProductCount();
    await coverProducts.connect(advisoryBoardMember0).setProducts([productParams]);
    const product = resultAsObject(await coverProducts.getProduct(expectedProductId));
    const expectedProduct = productParams.product;
    expect(product).to.deep.equal(expectedProduct);
  });

  it('should emit a ProductSet event when adding a product', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;
    const productParams = { ...productParamsTemplate };
    const expectedProductId = await coverProducts.getProductCount();
    await expect(coverProducts.connect(advisoryBoardMember0).setProducts([productParams]))
      .to.emit(coverProducts, 'ProductSet')
      .withArgs(expectedProductId);
  });

  it('should set the metadata of the newly added product', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;
    const productParams = { ...productParamsTemplate };
    const expectedProductId = await coverProducts.getProductCount();

    const tx = await coverProducts.connect(advisoryBoardMember0).setProducts([productParams]);
    const receipt = await tx.wait();
    const { timestamp } = await ethers.provider.getBlock(receipt.blockNumber);

    const actualProductMetadata = await coverProducts.getLatestProductMetadata(expectedProductId);

    expect(actualProductMetadata.timestamp).to.be.equal(timestamp);
    expect(actualProductMetadata.ipfsHash).to.be.equal(productParams.ipfsMetadata);
  });

  it('should leave the metadata of the newly added product empty', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;
    const productParams = { ...productParamsTemplate, ipfsMetadata: '' };
    const expectedProductId = await coverProducts.getProductCount();

    await coverProducts.connect(advisoryBoardMember0).setProducts([productParams]);
    const actualProductMetadata = await coverProducts.getLatestProductMetadata(expectedProductId);

    expect(actualProductMetadata.ipfsHash).to.be.equal('');
    expect(actualProductMetadata.timestamp).to.be.equal(0);
  });

  it('should edit a single product', async function () {
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
    const editParams = { ...productParams, productId, product };
    await coverProducts.connect(advisoryBoardMember0).setProducts([editParams]);
    const actualProduct = resultAsObject(await coverProducts.getProduct(productId));
    const expectedProduct = editParams.product;
    expect(actualProduct).to.deep.equal(expectedProduct);
  });

  it('should emit a ProductSet event when editing a product', async function () {
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
    const editParams = { ...productParams, productId, product };
    await expect(coverProducts.connect(advisoryBoardMember0).setProducts([editParams]))
      .to.emit(coverProducts, 'ProductSet')
      .withArgs(productId);
  });

  it('should not update metadata when editing the product if the new value is empty', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;
    const expectedProductId = await coverProducts.getProductCount();

    // add
    const addProductParams = { ...productParamsTemplate };
    await coverProducts.connect(advisoryBoardMember0).setProducts([addProductParams]);

    // update
    const newMetadata = ''; // empty
    const updateProductParams = {
      ...productParamsTemplate,
      productId: expectedProductId,
      ipfsMetadata: newMetadata,
    };
    await coverProducts.connect(advisoryBoardMember0).setProducts([updateProductParams]);

    const productMetadata = await coverProducts.getProductMetadata(expectedProductId);
    expect(productMetadata.length).to.be.equal(1);
    expect(productMetadata[0].ipfsHash).to.be.equal(addProductParams.ipfsMetadata);

    const latestMetadata = await coverProducts.getLatestProductMetadata(expectedProductId);
    expect(latestMetadata.ipfsHash).to.be.equal(addProductParams.ipfsMetadata);
  });

  it('should update metadata when editing the product if the new value is not empty', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;
    const expectedProductId = await coverProducts.getProductCount();

    // add
    const addProductParams = { ...productParamsTemplate };
    await coverProducts.connect(advisoryBoardMember0).setProducts([addProductParams]);

    // update
    const newMetadata = 'non-empty-ipfs-hash';
    const updateProductParams = {
      ...productParamsTemplate,
      productId: expectedProductId,
      ipfsMetadata: newMetadata,
    };
    await coverProducts.connect(advisoryBoardMember0).setProducts([updateProductParams]);

    const productMetadata = await coverProducts.getProductMetadata(expectedProductId);

    expect(productMetadata.length).to.be.equal(2);
    expect(productMetadata[1].ipfsHash).to.be.equal(newMetadata);
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
    await coverProducts.connect(advisoryBoardMember0).setProducts(productParams);
    const products = await coverProducts.getProducts();
    expect(products.length).to.be.equal(previousProductsCount.add(newProductsCount).toNumber());
  });

  it('should revert if trying to add a product with non existing pool in allowedPools', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;
    const productParams = { ...productParamsTemplate, allowedPools: [99] };
    await expect(coverProducts.connect(advisoryBoardMember0).setProducts([productParams])).to.revertedWithCustomError(
      coverProducts,
      'StakingPoolDoesNotExist',
    );
  });

  it('should revert if trying to edit a non-existing product', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;
    const productId = await coverProducts.getProductCount();
    const productParams = { ...productParamsTemplate, productId };
    await expect(
      coverProducts.connect(advisoryBoardMember0).setProducts([productParams]),
    ).to.be.revertedWithCustomError(coverProducts, 'ProductNotFound');
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
    await coverProducts.connect(advisoryBoardMember0).setProducts([productParams]);

    const coverAssets = parseInt('1111', 2); // ETH DAI, USDC and WBTC supported
    const product = { ...productTemplate, coverAssets };
    const updatedProductParams = { ...productParamsTemplate, product, productId };
    await expect(
      coverProducts.connect(advisoryBoardMember0).setProducts([updatedProductParams]),
    ).to.be.revertedWithCustomError(coverProducts, 'UnsupportedCoverAssets');
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
    await coverProducts.connect(advisoryBoardMember0).setProducts([productParams]);

    const initialPriceRatio = priceDenominator + 1;
    const product = { ...productTemplate, initialPriceRatio };
    const updatedProductParams = { ...productParamsTemplate, product, productId };
    await expect(
      coverProducts.connect(advisoryBoardMember0).setProducts([updatedProductParams]),
    ).to.be.revertedWithCustomError(coverProducts, 'InitialPriceRatioAbove100Percent');
  });

  it('should revert if initialPriceRatio is below DEFAULT_MIN_PRICE_RATIO', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;
    const { DEFAULT_MIN_PRICE_RATIO } = fixture.config;
    const initialPriceRatio = DEFAULT_MIN_PRICE_RATIO - 1;
    const product = { ...productTemplate, initialPriceRatio };
    const productParams = { ...productParamsTemplate, product };
    await expect(
      coverProducts.connect(advisoryBoardMember0).setProducts([productParams]),
    ).to.be.revertedWithCustomError(coverProducts, 'InitialPriceRatioBelowMinPriceRatio');
  });

  it('should revert if initialPriceRatio is below DEFAULT_MIN_PRICE_RATIO when editing a product', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;
    const productId = 1;
    const { DEFAULT_MIN_PRICE_RATIO } = fixture.config;
    const productParams = { ...productParamsTemplate };
    await coverProducts.connect(advisoryBoardMember0).setProducts([productParams]);
    {
      const initialPriceRatio = DEFAULT_MIN_PRICE_RATIO - 1;
      const product = { ...productTemplate, initialPriceRatio };
      const productParams = { ...productParamsTemplate, product, productId };
      await expect(
        coverProducts.connect(advisoryBoardMember0).setProducts([productParams]),
      ).to.be.revertedWithCustomError(coverProducts, 'InitialPriceRatioBelowMinPriceRatio');
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
    await coverProducts.connect(advisoryBoardMember0).setProducts([productParams]);

    const capacityReductionRatio = capacityFactor + 1; // 100.01 %
    const product = { ...productTemplate, capacityReductionRatio };
    const productParamsOverCapacity = { ...productParamsTemplate, product, productId };
    await expect(
      coverProducts.connect(advisoryBoardMember0).setProducts([productParamsOverCapacity]), // should revert
    ).to.be.revertedWithCustomError(coverProducts, 'CapacityReductionRatioAbove100Percent');
  });

  it('should revert if product type does not exist', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;
    const productParams = { ...productParamsTemplate, product: { ...productTemplate, productType: 99 } };
    await expect(
      coverProducts.connect(advisoryBoardMember0).setProducts([productParams]),
    ).to.be.revertedWithCustomError(coverProducts, 'ProductTypeNotFound');
  });

  it('should revert if allowed pools contain pool 0', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;
    const productParams = { ...productParamsTemplate, product: { ...productTemplate }, allowedPools: [0] };
    await expect(
      coverProducts.connect(advisoryBoardMember0).setProducts([productParams]),
    ).to.be.revertedWithCustomError(coverProducts, 'StakingPoolDoesNotExist');
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

    const productName = await coverProducts.getProductName(expectedProductId);
    expect(productName).to.be.equal(expectedProductName);
  });

  it('should not change product name for existing product if passed empty string', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;

    const expectedProductId = 0;
    const productNameBefore = await coverProducts.getProductName(expectedProductId);

    const productParams = {
      ...productParamsTemplate,
      productId: expectedProductId,
      productName: '',
    };
    await coverProducts.connect(advisoryBoardMember0).setProducts([productParams]);

    const productNameAfter = await coverProducts.getProductName(expectedProductId);
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
    const productName = await coverProducts.getProductName(productsCount.sub(1));
    expect(productName).to.be.equal(expectedProductName);
  });

  it('should set a product with minPrice', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;

    const expectedProductMinPrice = 10;

    const productParams = {
      ...productParamsTemplate,
      product: {
        ...productTemplate,
        minPrice: expectedProductMinPrice,
      },
    };

    await coverProducts.connect(advisoryBoardMember0).setProducts([productParams]);

    const productsCount = await coverProducts.getProductCount();
    const product = await coverProducts.getProduct(productsCount.sub(1));

    expect(product.minPrice).to.be.equal(expectedProductMinPrice);
  });

  it('should change minPrice of a product', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;
    const productWithMinPrice = { ...productTemplate, minPrice: 10 };
    const productParams = { ...productParamsTemplate, product: productWithMinPrice };
    // add product with min price
    await coverProducts.connect(advisoryBoardMember0).setProducts([productParams]);
    // edit min price
    const newMinPrice = 20;
    const editProduct = { ...productTemplate, minPrice: newMinPrice };
    const productId = (await coverProducts.getProductCount()).sub(1);
    const editParams = { ...productParams, productId, product: editProduct };
    await coverProducts.connect(advisoryBoardMember0).setProducts([editParams]);
    const product = await coverProducts.getProduct(productId);

    expect(product.minPrice).to.be.equal(newMinPrice);
  });
});

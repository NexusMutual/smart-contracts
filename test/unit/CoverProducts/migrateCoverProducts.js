const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

async function migrateCoverProductsSetup() {
  const fixture = await loadFixture(setup);
  const { cover, stakingPoolFactory, master, products, productTypes } = fixture;
  await stakingPoolFactory.setStakingPoolCount(3);

  const { productsList, productNames, allowedPools } = products.reduce(
    (acc, productData) => {
      acc.productsList.push(productData.product);
      acc.productNames.push(productData.productName);
      acc.allowedPools.push(productData.allowedPools);
      return acc;
    },
    {
      productsList: [],
      productNames: [],
      allowedPools: [],
    },
  );

  const { productTypesList, productTypeNames } = productTypes.reduce(
    (acc, productData) => {
      acc.productTypesList.push(productData.productType);
      acc.productTypeNames.push(productData.productTypeName);
      return acc;
    },
    {
      productTypesList: [],
      productTypeNames: [],
      allowedPools: [],
    },
  );

  await cover.setProductsAndProductTypes(productsList, productTypesList, productNames, productTypeNames, allowedPools);

  // setup new CoverProducts contract
  const coverProducts = await ethers.deployContract('CoverProducts');
  await coverProducts.changeMasterAddress(master.address);
  await coverProducts.changeDependentContractAddress();
  await master.enrollInternal(coverProducts.address);

  return { ...fixture, coverProducts, productTypesList, productTypeNames, productsList, productNames, allowedPools };
}

describe('migrateCoverProducts', function () {
  it('should migrate all the product, productTypes and allowedPools', async function () {
    const fixture = await loadFixture(migrateCoverProductsSetup);

    const { coverProducts, productTypesList, productsList, allowedPools, productNames, productTypeNames } = fixture;

    // migrate data
    await coverProducts.migrateCoverProducts();

    const productTypes = await coverProducts.getProductTypes();
    const products = await coverProducts.getProducts();

    for (const i in products) {
      expect(products[i].productType).to.be.equal(productsList[i].productType);
      expect(products[i].yieldTokenAddress).to.be.equal(productsList[i].yieldTokenAddress);
      expect(products[i].coverAssets).to.be.equal(productsList[i].coverAssets);
      expect(products[i].initialPriceRatio).to.be.equal(productsList[i].initialPriceRatio);
      expect(products[i].capacityReductionRatio).to.be.equal(productsList[i].capacityReductionRatio);
      expect(products[i].isDeprecated).to.be.equal(productsList[i].isDeprecated);
      expect(products[i].useFixedPrice).to.be.equal(productsList[i].useFixedPrice);

      const allowedPoolsAfter = await coverProducts.getAllowedPools(i);
      const productName = await coverProducts.getProductName(i);

      expect(allowedPoolsAfter).to.be.deep.equal(allowedPools[i]);
      expect(productName).to.be.equal(productNames[i]);
    }

    for (const i in productTypes) {
      expect(productTypes[i].claimMethod).to.be.equal(productTypesList[i].claimMethod);
      expect(productTypes[i].gracePeriod).to.be.equal(productTypesList[i].gracePeriod);

      const productTypeName = await coverProducts.getProductTypeName(i);

      expect(productTypeName).to.be.equal(productTypeNames[i]);
    }
  });

  it('should revert if products are already set', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts, productTypes } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;

    await coverProducts.connect(advisoryBoardMember0).setProductTypes(productTypes);

    await expect(coverProducts.migrateCoverProducts()).to.be.revertedWith('CoverProducts: _products already migrated');
  });

  it('should revert if productTypes are already set', async function () {
    const fixture = await loadFixture(migrateCoverProductsSetup);
    const { coverProducts, productTypes } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;

    await coverProducts.connect(advisoryBoardMember0).setProductTypes(productTypes);

    await expect(coverProducts.migrateCoverProducts()).to.be.revertedWith(
      'CoverProducts: _productTypes already migrated',
    );
  });
});

const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');
const { AddressZero } = ethers.constants;

describe('migrateProductsAndProductTypes', function () {
  const capacityFactor = 10000;

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

  it('should migrate products from Cover', async function () {
    const fixture = await loadFixture(setup);
    const { cover, master, dai } = fixture;

    const product1 = { ...productTemplate };
    const product2 = { ...productTemplate, productType: 1, yieldTokenAddress: dai.address };

    const products = [product1, product2];
    const productNames = ['First Product', 'Second Product'];
    const allowedPools = [[0, 1], [1]];

    const productTypes = [
      {
        claimMethod: 0,
        gracePeriod: 3600 * 24 * 30,
      },
      {
        claimMethod: 1,
        gracePeriod: 3600 * 24 * 40,
      },
    ];

    const productTypeNames = ['First Product Type', 'Second Product Type'];

    await cover.setProductsAndProductTypes(products, productTypes, productNames, productTypeNames, allowedPools);

    const newCoverProducts = await ethers.deployContract('DisposableCoverProducts');

    await newCoverProducts.changeMasterAddress(master.address);
    await newCoverProducts.changeDependentContractAddress();

    await newCoverProducts.migrateProductsAndProductTypes();

    const migratedProducts = await newCoverProducts.getProducts();
    const migratedProductTypes = await newCoverProducts.getProductTypes();

    let i = 0;
    for (const product of migratedProducts) {
      expect(product.productType).to.be.equal(products[i].productType);
      expect(product.yieldTokenAddress).to.be.equal(products[i].yieldTokenAddress);
      expect(product.initialPriceRatio).to.be.equal(products[i].initialPriceRatio);
      expect(product.capacityReductionRatio).to.be.equal(products[i].capacityReductionRatio);
      expect(product.isDeprecated).to.be.equal(products[i].isDeprecated);
      expect(product.useFixedPrice).to.be.equal(products[i].useFixedPrice);

      const productName = await newCoverProducts.productNames(i);
      expect(productName).to.be.equal(productNames[i]);

      i++;
    }

    let j = 0;
    for (const productType of migratedProductTypes) {
      expect(productType.claimMethod).to.be.equal(productTypes[j].claimMethod);
      expect(productType.gracePeriod).to.be.equal(productTypes[j].gracePeriod);

      const productTypeName = await newCoverProducts.productTypeNames(j);
      expect(productTypeName).to.be.equal(productTypeNames[j]);
      j++;
    }

    let productId = 0;
    for (const allowedPoolsForProduct of allowedPools) {
      for (const poolId of allowedPoolsForProduct) {
        const isPoolAllowed = await newCoverProducts.isPoolAllowed(productId, poolId);
        expect(isPoolAllowed).to.be.equal(true);

        productId++;
      }
    }
  });
});

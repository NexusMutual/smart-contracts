const { assert } = require('chai');
const { ethers } = require('hardhat');

describe('editProducts', function () {
  it('should edit existing product', async function () {
    const { cover } = this;

    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;

    const newProductValues = {
      productType: '0',
      productAddress: '0x0000000000000000000000000000000000000032',
      coverAssets: parseInt('111', 2), // ETH DAI and USDC supported
      initialPriceRatio: '1000', // 10%
      capacityReductionRatio: '500',
    };

    await cover.connect(advisoryBoardMember0).editProducts([0], [newProductValues]);

    const storedProduct = await cover.products(0);

    assert.equal(newProductValues.productType, storedProduct.productType);
    assert.equal(newProductValues.productAddress, storedProduct.productAddress);
    assert.equal(newProductValues.coverAssets, storedProduct.coverAssets);
    assert.equal(newProductValues.initialPriceRatio, storedProduct.initialPriceRatio);
    assert.equal(newProductValues.capacityReductionRatio, storedProduct.capacityReductionRatio);
  });
});

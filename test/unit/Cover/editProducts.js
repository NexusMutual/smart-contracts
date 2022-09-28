const { expect } = require('chai');

describe.only('editProducts', function () {
  it('should edit existing product', async function () {
    const { cover } = this;

    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;

    const newProductValues = {
      productType: 0,
      productAddress: '0x0000000000000000000000000000000000000032',
      coverAssets: parseInt('111', 2), // ETH DAI and USDC supported
      initialPriceRatio: 100, // 10%
      capacityReductionRatio: 500,
    };

    await cover.connect(advisoryBoardMember0).editProducts([0], [newProductValues], ['magic metadata']);

    const storedProduct = await cover.products(0);

    expect(newProductValues.productType).to.be.equal(storedProduct.productType);
    expect(newProductValues.productAddress).to.be.equal(storedProduct.productAddress);
    expect(newProductValues.coverAssets).to.be.equal(storedProduct.coverAssets);
    expect(newProductValues.initialPriceRatio).to.be.equal(storedProduct.initialPriceRatio);
    expect(newProductValues.capacityReductionRatio).to.be.equal(storedProduct.capacityReductionRatio);
  });
});

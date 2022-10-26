const { expect } = require('chai');

describe('addProducts', function () {
  it('should add a new product', async function () {
    const { cover } = this;

    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;

    const newProduct = {
      productType: 0,
      yieldTokenAddress: '0x0000000000000000000000000000000000000001',
      coverAssets: parseInt('110', 2), // DAI and USDC supported
      initialPriceRatio: 1000, // 10%
      capacityReductionRatio: 0,
    };

    const newProductId = await cover.productsCount();
    const ipfsHash = 'magic metadata';

    await expect(cover.connect(advisoryBoardMember0).addProducts([newProduct], [ipfsHash]))
      .to.emit(cover, 'ProductSet')
      .withArgs(newProductId, ipfsHash);

    const productAfter = await cover.products(newProductId);

    expect(newProduct.productType).to.be.equal(productAfter.productType);
    expect(newProduct.yieldTokenAddress).to.be.equal(productAfter.yieldTokenAddress);
    expect(newProduct.coverAssets).to.be.equal(productAfter.coverAssets);
    expect(newProduct.initialPriceRatio).to.be.equal(productAfter.initialPriceRatio);
    expect(newProduct.capacityReductionRatio).to.be.equal(productAfter.capacityReductionRatio);
  });

  it('should revert if updated coverAssets are unsupported', async function () {
    const { cover } = this;

    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;

    const newProduct = {
      productType: '0',
      yieldTokenAddress: '0x0000000000000000000000000000000000000001',
      coverAssets: parseInt('1110', 2), // DAI, USDC and WBTC supported
      initialPriceRatio: '1000', // 10%
      capacityReductionRatio: '0',
    };

    await expect(cover.connect(advisoryBoardMember0).addProducts([newProduct], ['magic metadata'])).to.be.revertedWith(
      'Cover: Unsupported cover assets',
    );
  });

  it('should revert if initialPriceRatio is below GLOBAL_MIN_PRICE_RATIO', async function () {
    const { cover } = this;

    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;

    const newProduct = {
      productType: 0,
      yieldTokenAddress: '0x0000000000000000000000000000000000000001',
      coverAssets: parseInt('110', 2), // DAI and USDC supported
      initialPriceRatio: 50, // 0.5%
      capacityReductionRatio: 0,
    };

    await expect(cover.connect(advisoryBoardMember0).addProducts([newProduct], ['magic metadata'])).to.be.revertedWith(
      'Cover: initialPriceRatio < GLOBAL_MIN_PRICE_RATIO',
    );
  });

  it('should revert if initialPriceRatio > 100', async function () {
    const { cover } = this;

    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;

    const newProduct = {
      productType: 0,
      yieldTokenAddress: '0x0000000000000000000000000000000000000001',
      coverAssets: parseInt('110', 2), // DAI and USDC supported
      initialPriceRatio: 10100, // 101%
      capacityReductionRatio: 0,
    };

    await expect(cover.connect(advisoryBoardMember0).addProducts([newProduct], ['magic metadata'])).to.be.revertedWith(
      'Cover: initialPriceRatio > 100%',
    );
  });

  it('should revert if capacityReductionRatio > 100%', async function () {
    const { cover } = this;

    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;

    const newProduct = {
      productType: 0,
      yieldTokenAddress: '0x0000000000000000000000000000000000000001',
      coverAssets: parseInt('110', 2), // DAI and USDC supported
      initialPriceRatio: 1000, // 101%
      capacityReductionRatio: 10100,
    };

    await expect(cover.connect(advisoryBoardMember0).addProducts([newProduct], ['magic metadata'])).to.be.revertedWith(
      'Cover: capacityReductionRatio > 100%',
    );
  });
});

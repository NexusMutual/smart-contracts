const { expect } = require('chai');

describe('editProducts', function () {
  it('should edit existing product', async function () {
    const { cover } = this;

    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;

    const newProductValues = {
      coverAssets: parseInt('111', 2), // ETH DAI and USDC supported
      initialPriceRatio: 100, // 10%
      capacityReductionRatio: 500,
    };

    const productId = 0;
    const productBefore = await cover.products(productId);
    const ipfsHash = 'magic metadata';

    await expect(cover.connect(advisoryBoardMember0).editProducts([0], [newProductValues], [ipfsHash]))
      .to.emit(cover, 'ProductSet')
      .withArgs(productId, ipfsHash);

    const productAfter = await cover.products(productId);

    expect(productBefore.productType).to.be.equal(productAfter.productType);
    expect(productBefore.ytcUnderlyingAsset).to.be.equal(productAfter.ytcUnderlyingAsset);
    expect(newProductValues.coverAssets).to.be.equal(productAfter.coverAssets);
    expect(newProductValues.initialPriceRatio).to.be.equal(productAfter.initialPriceRatio);
    expect(newProductValues.capacityReductionRatio).to.be.equal(productAfter.capacityReductionRatio);
  });

  it('should revert if updated coverAssets are unsupported', async function () {
    const { cover } = this;

    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;

    const newProductValues = {
      coverAssets: parseInt('1111', 2), // ETH DAI, USDC and WBTC supported
      initialPriceRatio: 100, // 1%
      capacityReductionRatio: 500,
    };

    await expect(
      cover.connect(advisoryBoardMember0).editProducts([0], [newProductValues], ['magic metadata']),
    ).to.be.revertedWith('Cover: Unsupported cover assets');
  });

  it('should revert if initialPriceRatio is below GLOBAL_MIN_PRICE_RATIO', async function () {
    const { cover } = this;

    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;

    const newProductValues = {
      coverAssets: parseInt('111', 2), // ETH, DAI, USDC supported
      initialPriceRatio: 50, // 0.5%
      capacityReductionRatio: 500,
    };

    await expect(
      cover.connect(advisoryBoardMember0).editProducts([0], [newProductValues], ['magic metadata']),
    ).to.be.revertedWith('Cover: initialPriceRatio < GLOBAL_MIN_PRICE_RATIO');
  });

  it('should revert if initialPriceRatio > 100', async function () {
    const { cover } = this;

    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;

    const newProductValues = {
      coverAssets: parseInt('111', 2), // ETH, DAI, USDC supported
      initialPriceRatio: 10100, // 101%
      capacityReductionRatio: 500,
    };

    await expect(
      cover.connect(advisoryBoardMember0).editProducts([0], [newProductValues], ['magic metadata']),
    ).to.be.revertedWith('Cover: initialPriceRatio > 100%');
  });

  it('should revert if capacityReductionRatio > 100%', async function () {
    const { cover } = this;

    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;

    const newProductValues = {
      coverAssets: parseInt('111', 2), // ETH, DAI, USDC supported
      initialPriceRatio: 1000, // 10%
      capacityReductionRatio: 10100, // 101%
    };

    await expect(
      cover.connect(advisoryBoardMember0).editProducts([0], [newProductValues], ['magic metadata']),
    ).to.be.revertedWith('Cover: capacityReductionRatio > 100%');
  });
});

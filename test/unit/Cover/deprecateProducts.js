const { ethers } = require('hardhat');
const { expect } = require('chai');
const { createStakingPool, assertCoverFields } = require('./helpers');
const { parseEther } = ethers.utils;
const { AddressZero } = ethers.constants;

describe('deprecateProducts', function () {
  const productId = 0;
  const coverAsset = 0; // ETH
  const period = 3600 * 24 * 364; // 30 days
  const amount = parseEther('1000');
  const targetPriceRatio = '260';
  const priceDenominator = '10000';
  const activeCover = parseEther('8000');
  const capacity = parseEther('10000');
  const capacityFactor = '10000';

  it('should deprecate product and set initialPriceRatio to 0', async function () {
    const { cover } = this;
    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;
    await cover.connect(advisoryBoardMember0).deprecateProducts([0]);
    const product = await cover.products(0);
    expect(product.initialPriceRatio).to.be.equal(0);
  });

  it('should re-enable deprecated product by editing initialPriceRatio', async function () {
    const { cover } = this;
    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;
    const initialPriceRatio = 100; // 10%
    await cover.connect(advisoryBoardMember0).deprecateProducts([0]);
    const product = await cover.products(0);
    const newProductValues = {
      coverAssets: product.coverAssets,
      initialPriceRatio: 100,
      capacityReductionRatio: product.capacityReductionRatio,
    };
    await cover.connect(advisoryBoardMember0).editProducts([0], [newProductValues], ['ipfs hash']);
    const productAfter = await cover.products(0);
    expect(productAfter.initialPriceRatio).to.be.equal(initialPriceRatio);
    await cover.connect(advisoryBoardMember0).deprecateProducts([0]);
  });

  it('should fail to deprecate product using editProducts()', async function () {
    const { cover } = this;
    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;
    const productId = 0;
    const product = await cover.products(productId);
    const newProductValues = {
      coverAssets: product.coverAssets,
      initialPriceRatio: 0,
      capacityReductionRatio: product.capacityReductionRatio,
    };
    await expect(
      cover.connect(advisoryBoardMember0).editProducts([productId], [newProductValues], ['ipfs hash']),
    ).to.be.revertedWith('Cover: initialPriceRatio < GLOBAL_MIN_PRICE_RATIO');
  });

  it('should fail to buy cover for deprecated product', async function () {
    const { cover } = this;
    const {
      governanceContracts: [gv1],
      members: [coverBuyer, stakingPoolManager],
      advisoryBoardMembers: [advisoryBoardMember0],
    } = this.accounts;

    // create staking pool
    await cover.connect(gv1).updateUintParameters([0], [capacityFactor]);
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

    // deprecate product
    await cover.connect(advisoryBoardMember0).deprecateProducts([productId]);

    const expectedPremium = amount.mul(targetPriceRatio).div(priceDenominator);
    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: expectedPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: '0', coverAmountInAsset: amount }],
        {
          value: expectedPremium,
        },
      ),
    ).to.be.revertedWith('Cover: Product deprecated or not initialized');
  });

  it('should purchase cover after deprecated product has been restored', async function () {
    const { cover } = this;
    const {
      governanceContracts: [gv1],
      members: [coverBuyer, stakingPoolManager],
      advisoryBoardMembers: [advisoryBoardMember0],
    } = this.accounts;

    await cover.connect(gv1).updateUintParameters([0], [capacityFactor]);

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

    // Deprecate product
    await cover.connect(advisoryBoardMember0).deprecateProducts([productId]);

    // Restore product
    const product = await cover.products(productId);
    const newProductValues = {
      coverAssets: product.coverAssets,
      initialPriceRatio: 100,
      capacityReductionRatio: product.capacityReductionRatio,
    };
    await cover.connect(advisoryBoardMember0).editProducts([productId], [newProductValues], ['ipfs hash']);

    const expectedPremium = amount.mul(targetPriceRatio).div(priceDenominator);

    const tx = await cover.connect(coverBuyer).buyCover(
      {
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: '0', coverAmountInAsset: amount }],
      {
        value: expectedPremium,
      },
    );
    await tx.wait();

    const expectedCoverId = '0';

    await assertCoverFields(cover, expectedCoverId, { productId, coverAsset, period, amount, targetPriceRatio });
  });

  it('should fail to edit cover for a deprecated product', async function () {
    const { cover } = this;
    const {
      governanceContracts: [gv1],
      members: [coverBuyer, stakingPoolManager],
      advisoryBoardMembers: [advisoryBoardMember0],
    } = this.accounts;

    await cover.connect(gv1).updateUintParameters([0], [capacityFactor]);

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

    // buy cover
    const expectedPremium = amount.mul(targetPriceRatio).div(priceDenominator);
    const tx = await cover.connect(coverBuyer).buyCover(
      {
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: '0', coverAmountInAsset: amount }],
      {
        value: expectedPremium,
      },
    );
    await tx.wait();

    await cover.connect(advisoryBoardMember0).deprecateProducts([productId]);

    const increasedAmount = amount.add(1);

    await expect(
      cover.connect(coverBuyer).editCover(
        0,
        {
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount: increasedAmount,
          period: period / 2,
          maxPremiumInAsset: expectedPremium.add(1),
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: '0', coverAmountInAsset: increasedAmount.toString() }],
        {
          value: expectedPremium.add(1),
        },
      ),
    ).to.be.revertedWith('Cover: Product deprecated or not initialized');
  });

  it('should fail to create staking pool using deprecated product', async function () {
    const { cover } = this;
    const {
      advisoryBoardMembers: [advisoryBoardMember0],
      members: [stakingPoolManager],
    } = this.accounts;
    const productId = 0;
    await cover.connect(advisoryBoardMember0).deprecateProducts([0]);

    await expect(
      createStakingPool(
        cover,
        productId,
        capacity,
        targetPriceRatio,
        activeCover,
        stakingPoolManager,
        stakingPoolManager,
        targetPriceRatio,
      ),
    ).to.be.revertedWith('CoverUtils: Product deprecated or uninitialized');
  });
});

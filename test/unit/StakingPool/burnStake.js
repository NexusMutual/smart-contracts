const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');
const { AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;
const daysToSeconds = days => days * 24 * 60 * 60;

const ProductTypeFixture = {
  claimMethod: 1,
  gracePeriodInDays: 7,
};

const coverProductTemplate = {
  productType: 1,
  yieldTokenAddress: AddressZero,
  coverAssets: 1111,
  initialPriceRatio: 500,
  capacityReductionRatio: 0,
};

const initialProductTemplate = {
  productId: 0,
  weight: 100, // 1.00
  initialPrice: 500, // 5%
  targetPrice: 100, // 1%
};

const newProductTemplate = {
  productId: 0,
  setTargetWeight: true,
  recalculateEffectiveWeight: true,
  targetWeight: 100,
  setTargetPrice: true,
  targetPrice: 500,
};

const buyCoverParamsTemplate = {
  owner: AddressZero,
  productId: 0,
  coverAsset: 0, // ETH
  amount: parseEther('100'),
  period: daysToSeconds('30'),
  maxPremiumInAsset: parseEther('100'),
  paymentAsset: 0,
  payWithNXM: false,
  commissionRatio: 1,
  commissionDestination: AddressZero,
  ipfsData: 'ipfs data',
};

describe('burnStake', function () {
  // Create a default deposit request to the staking pool
  const depositRequest = async (stakingPool, amount, destination) => {
    const tokenId = 0;
    const block = await ethers.provider.getBlock('latest');
    const currentTrancheId = Math.floor(block.timestamp / daysToSeconds(91));
    return {
      amount,
      trancheId: currentTrancheId + 2,
      tokenId,
      destination,
    };
  };

  it('Should burn 99.99% of a large stake causing effective weight to reach uint16.max', async function () {
    const { stakingPool, cover, nxm, tokenController } = this;
    const [manager, staker, coverBuyer] = this.accounts.members;
    const stakeAmount = BigNumber.from(2).pow(64).sub(1);
    const UINT16_MAX = BigNumber.from(2).pow(16).sub(1);
    let productIdCounter = 0;
    // Initialize Products
    const products = await Promise.all(
      Array(20)
        .fill('')
        .map(() => {
          const product = { ...newProductTemplate, productId: productIdCounter++ };
          cover.setProduct({ ...coverProductTemplate }, product.productId);
          return product;
        }),
    );

    // Initialize pool and set products
    await cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, [], 0);
    await stakingPool.connect(manager).setProducts(products);

    // Deposit into staking pool
    await nxm.connect(staker).approve(tokenController.address, stakeAmount);
    const request = await depositRequest(stakingPool, stakeAmount, manager.address);
    await stakingPool.connect(staker).depositTo([request]);

    // Build CoverBuy parameters
    const coverageAmount = stakeAmount.mul(2);
    const coverId = 1;
    const coverBuyParams = Array(20)
      .fill('')
      .map(() => {
        return {
          ...buyCoverParamsTemplate,
          owner: coverBuyer.address,
          productId: --productIdCounter,
          amount: coverageAmount,
        };
      });

    // Buy covers
    await Promise.all(
      coverBuyParams.map(cb => {
        return cover.connect(coverBuyer).allocateCapacity(cb, coverId, stakingPool.address);
      }),
    );
    const { timestamp: start } = await ethers.provider.getBlock('latest');

    // Burn stake
    await cover.performStakeBurn(
      stakingPool.address,
      productIdCounter,
      start,
      buyCoverParamsTemplate.period,
      stakeAmount.sub(1),
    );

    // Recalculate effective weight
    const productIds = products.map(p => {
      return p.productId;
    });
    const maxWeight = await stakingPool.MAX_TOTAL_WEIGHT();
    expect(await stakingPool.totalEffectiveWeight()).to.be.equal(maxWeight);
    await stakingPool.recalculateEffectiveWeights(productIds);
    expect(await stakingPool.totalEffectiveWeight()).to.be.equal(UINT16_MAX.mul(productIds.length));

    // lower product 10 to half weight to add half weight on another product
    const newProducts = [
      { ...newProductTemplate, targetWeight: 50, productId: 10 },
      { ...newProductTemplate, productId: 50 },
    ];
    await cover.setProduct({ ...coverProductTemplate }, newProducts[1].productId);
    await expect(stakingPool.connect(manager).setProducts(newProducts)).to.be.revertedWith(
      'StakingPool: Total max effective weight exceeded',
    );

    {
      // Deposit into staking pool
      await nxm.connect(staker).approve(tokenController.address, stakeAmount);
      const request = await depositRequest(stakingPool, stakeAmount, manager.address);
      await stakingPool.connect(staker).depositTo([request]);
    }
  });

  it('Should be able to lower target weights after a burn puts totalEffectiveWeight above the max', async function () {
    const { stakingPool, cover, nxm, tokenController } = this;
    const [manager, staker, coverBuyer] = this.accounts.members;
    const stakeAmount = BigNumber.from(2).pow(64).sub(1);
    const UINT16_MAX = BigNumber.from(2).pow(16).sub(1);
    let productIdCounter = 0;
    // Initialize Products
    const products = await Promise.all(
      Array(20)
        .fill('')
        .map(() => {
          const product = { ...newProductTemplate, productId: productIdCounter++ };
          cover.setProduct({ ...coverProductTemplate }, product.productId);
          return product;
        }),
    );

    // Initialize pool and set products
    await cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, [], 0);
    await stakingPool.connect(manager).setProducts(products);

    // Deposit into staking pool
    await nxm.connect(staker).approve(tokenController.address, stakeAmount);
    const request = await depositRequest(stakingPool, stakeAmount, manager.address);
    await stakingPool.connect(staker).depositTo([request]);

    // Build CoverBuy parameters
    const coverageAmount = stakeAmount.mul(2);
    const coverId = 1;
    const coverBuyParams = Array(20)
      .fill('')
      .map(() => {
        return {
          ...buyCoverParamsTemplate,
          owner: coverBuyer.address,
          productId: --productIdCounter,
          amount: coverageAmount,
        };
      });

    // Buy covers
    await Promise.all(
      coverBuyParams.map(cb => {
        return cover.connect(coverBuyer).allocateCapacity(cb, coverId, stakingPool.address);
      }),
    );
    const { timestamp: start } = await ethers.provider.getBlock('latest');

    // Burn stake
    await cover.performStakeBurn(
      stakingPool.address,
      productIdCounter,
      start,
      buyCoverParamsTemplate.period,
      stakeAmount.sub(1),
    );

    // Recalculate effective weight
    const productIds = products.map(p => {
      return p.productId;
    });
    const maxWeight = await stakingPool.MAX_TOTAL_WEIGHT();
    expect(await stakingPool.totalEffectiveWeight()).to.be.equal(maxWeight);
    await stakingPool.recalculateEffectiveWeights(productIds);
    expect(await stakingPool.totalEffectiveWeight()).to.be.equal(UINT16_MAX.mul(productIds.length));

    // Remove all products
    const productEdits = Array(20)
      .fill('')
      .map(() => {
        return {
          ...newProductTemplate,
          productId: productIdCounter++,
          targetWeight: 0,
        };
      });

    await stakingPool.connect(manager).setProducts(productEdits);
    const product0 = await stakingPool.products(0);
    expect(product0.targetWeight).to.be.equal(0);
    expect(await stakingPool.totalEffectiveWeight()).to.be.gt(maxWeight);
  });

  it('Should burn 100% of the current stake when fully allocated', async function () {
    const { stakingPool, cover, nxm, tokenController } = this;
    const [manager, staker, coverBuyer] = this.accounts.members;
    const stakeAmount = parseEther('1');

    let productIdCounter = 0;
    const initialProducts = Array(20)
      .fill('')
      .map(() => ({ ...initialProductTemplate, productId: productIdCounter++ }));

    // Add products to cover contract
    await Promise.all(
      initialProducts.map(({ productId, initialPrice: initialPriceRatio }) => [
        cover.setProduct({ ...coverProductTemplate, initialPriceRatio }, productId),
        cover.setProductType(ProductTypeFixture, productId),
      ]),
    );
    await cover.initializeStaking(stakingPool.address, manager.address, false, 5, 5, initialProducts, 0);

    // Get capacity in staking pool
    await nxm.connect(staker).approve(tokenController.address, stakeAmount);
    const request = await depositRequest(stakingPool, stakeAmount, manager.address);
    await stakingPool.connect(staker).depositTo([request]);

    const ratio = await cover.getPriceAndCapacityRatios([0]);
    const { totalCapacity } = await stakingPool.getTotalCapacitiesForActiveTranches(
      0,
      ratio._globalCapacityRatio,
      ratio._capacityReductionRatios[0],
    );
    expect(totalCapacity).to.be.equal(200);

    // Initialize Products and CoverBuy requests
    const coverageAmount = stakeAmount.mul(2);
    const coverId = 1;
    const coverBuyParams = Array(20)
      .fill('')
      .map(() => {
        return {
          ...buyCoverParamsTemplate,
          owner: coverBuyer.address,
          productId: --productIdCounter,
          amount: coverageAmount,
        };
      });
    await Promise.all(
      coverBuyParams.map(cb => {
        return cover.connect(coverBuyer).allocateCapacity(cb, coverId, stakingPool.address);
      }),
    );
    const { timestamp: start } = await ethers.provider.getBlock('latest');

    // Burn all stake
    await cover.performStakeBurn(
      stakingPool.address,
      productIdCounter,
      start,
      buyCoverParamsTemplate.period,
      stakeAmount,
    );

    {
      const { totalCapacity } = await stakingPool.getTotalCapacitiesForActiveTranches(
        productIdCounter,
        ratio._globalCapacityRatio,
        ratio._capacityReductionRatios[0],
      );
      expect(totalCapacity).to.be.equal(0);
    }

    const productIds = initialProducts.map(p => {
      return p.productId;
    });
    await stakingPool.recalculateEffectiveWeights(productIds);

    // lower product 10 to half weight to add half weight on another product
    const newProducts = [
      { ...newProductTemplate, targetWeight: 50, productId: 10 },
      { ...newProductTemplate, productId: 50 },
    ];
    await cover.setProduct({ ...coverProductTemplate }, newProducts[1].productId);
    await expect(stakingPool.connect(manager).setProducts(newProducts)).to.be.revertedWith(
      'StakingPool: Total max effective weight exceeded',
    );
  });
});

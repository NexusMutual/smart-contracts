const { ethers } = require('hardhat');
const { expect } = require('chai');
const { setEtherBalance } = require('../utils/evm');
const { parseEther } = ethers.utils;
const { V2Addresses, upgradeMultipleContracts, getConfig, getActiveProductsInPool } = require('./utils');

const evm = require('./evm')();

describe('Staked Product Allowed Pools', function () {
  // Upgrade cover contract and setup test environment
  before(async function () {
    await evm.connect(ethers.provider);

    const coverProxy = await ethers.getContractAt('Cover', V2Addresses.Cover);
    const stakingPoolImplementation = await coverProxy.stakingPoolImplementation();

    // Deploy new cover contract
    const newCoverImpl = await ethers.deployContract('Cover', [
      V2Addresses.CoverNFT,
      V2Addresses.StakingNFT,
      V2Addresses.StakingPoolFactory,
      stakingPoolImplementation,
    ]);

    this.stakingPoolFactory = await ethers.getContractAt('StakingPoolFactory', V2Addresses.StakingPoolFactory);
    this.cover = coverProxy;
    this.stakingProducts = await ethers.getContractAt('StakingProducts', V2Addresses.StakingProducts);
    this.config = await getConfig.call(this);

    // Submit governance proposal to update cover contract address
    this.abMembers = await upgradeMultipleContracts.call(this, { codes: ['CO'], addresses: [newCoverImpl] });
  });

  it('should not find any incompatible products in deployed pools', async function () {
    const { cover, stakingPoolFactory } = this;

    const poolCount = await stakingPoolFactory.stakingPoolCount();

    // get all products in pool and assert they are allowed
    for (let i = 1; i <= poolCount; i++) {
      const products = await getActiveProductsInPool.call(this, { poolId: i });
      // call isPoolAllowed() and assert it returns true
      const allowedResults = await Promise.all(products.map(product => cover.isPoolAllowed(i, product.productId)));
      allowedResults.map(result => expect(result).to.be.true);
    }
  });

  it('should fail to deploy staking pool that uses a forbidden products', async function () {
    const {
      cover,
      abMembers: [member],
    } = this;

    const products = await cover.getProducts();
    const [poolId] = await cover.connect(member).callStatic.createStakingPool(true, 10, 10, [], 'ipfs hash');

    // check which products are allowed for the new pool
    const isPoolAllowedPromises = [];
    for (let i = 0; i < products.length; i++) {
      isPoolAllowedPromises.push(cover.isPoolAllowed(i, poolId));
    }
    const allowedPools = await Promise.all(isPoolAllowedPromises);

    // setup list of forbidden products for this pool
    const forbiddenProducts = [];
    for (let i = 0; i < allowedPools.length; i++) {
      if (!allowedPools[i]) {
        forbiddenProducts.push({ productId: i, weight: 5, initialPrice: 1000, targetPrice: 200 });
      }
    }

    expect(forbiddenProducts.length).to.be.greaterThan(
      0,
      'No forbidden products found for the new pool on mainnet fork',
    );

    // create new staking pool with forbidden products (first product should trigger revert)
    await expect(
      cover.connect(member).createStakingPool(
        true, // isPrivate
        100, // initialPoolFee
        10, // maxPoolFee
        forbiddenProducts,
        'ipfs hash',
      ),
    )
      .to.be.revertedWithCustomError(cover, 'PoolNotAllowedForThisProduct')
      .withArgs(forbiddenProducts[0].productId);
  });

  it('should fail to deploy staking pool that uses a non existing product', async function () {
    const { cover } = this;
    const [member] = this.abMembers;

    const [poolId] = await cover.connect(member).callStatic.createStakingPool(true, 10, 10, [], 'ipfs hash');

    const nonExistingProduct = { productId: 999999, weight: 10, initialPrice: 100, targetPrice: 200 };
    expect(await cover.isPoolAllowed(nonExistingProduct.productId, poolId)).to.be.equal(false);

    await expect(
      cover.connect(member).createStakingPool(
        true, // isPrivate
        100, // initialPoolFee
        10, // maxPoolFee
        [nonExistingProduct],
        'ipfs hash',
      ),
    )
      .to.be.revertedWithCustomError(cover, 'PoolNotAllowedForThisProduct')
      .withArgs(nonExistingProduct.productId);
  });

  it('should fail to deploy pool with a non existing product, called from pooled staking', async function () {
    const { cover } = this;

    const pooledStakingSigner = await ethers.getImpersonatedSigner(V2Addresses.LegacyPooledStaking);
    await setEtherBalance(V2Addresses.LegacyPooledStaking, parseEther('1000'));

    const [poolId] = await cover
      .connect(pooledStakingSigner)
      .callStatic.createStakingPool(true, 10, 10, [], 'ipfs hash');

    const nonExistingProduct = { productId: 999999, weight: 10, initialPrice: 100, targetPrice: 200 };
    expect(await cover.isPoolAllowed(nonExistingProduct.productId, poolId)).to.be.equal(false);

    await expect(
      cover.connect(pooledStakingSigner).createStakingPool(
        true, // isPrivate
        100, // initialPoolFee
        10, // maxPoolFee
        [nonExistingProduct],
        'ipfs hash',
      ),
    )
      .to.be.revertedWithCustomError(cover, 'PoolNotAllowedForThisProduct')
      .withArgs(nonExistingProduct.productId);
  });
});

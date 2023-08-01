const { ethers } = require('hardhat');
const { expect } = require('chai');
const { setEtherBalance } = require('../utils').evm;

describe('setPoolPrivacy', function () {
  const product0 = {
    productId: 0,
    weight: 100,
    initialPrice: '500',
    targetPrice: '500',
  };

  const initializeParams = {
    poolId: 1,
    isPrivatePool: false,
    initialPoolFee: 5, // 5%
    maxPoolFee: 5, // 5%
    products: [product0],
    ipfsDescriptionHash: 'Descrition Hash',
  };

  beforeEach(async function () {
    const { stakingPool, stakingProducts, tokenController } = this;
    const manager = this.accounts.defaultSender;

    const { poolId, initialPoolFee, maxPoolFee, products, isPrivatePool, ipfsDescriptionHash } = initializeParams;

    await stakingPool
      .connect(this.stakingProductsSigner)
      .initialize(isPrivatePool, initialPoolFee, maxPoolFee, poolId, ipfsDescriptionHash);
    await tokenController.setStakingPoolManager(poolId, manager.address);

    await stakingProducts.connect(this.stakingProductsSigner).setInitialProducts(poolId, products);
  });

  it('reverts if manager is not the caller', async function () {
    const { stakingPool, tokenController } = this;
    const { defaultSender: manager } = this.accounts;
    const [nonManager] = this.accounts.nonMembers;

    const poolId = await stakingPool.getPoolId();
    await tokenController.setStakingPoolManager(poolId, manager.address);

    await expect(stakingPool.connect(nonManager).setPoolPrivacy(true)).to.be.revertedWithCustomError(
      stakingPool,
      'OnlyManager',
    );
    await expect(stakingPool.connect(manager).setPoolPrivacy(true)).to.not.be.reverted;
  });

  it('updates isPrivatePool flag', async function () {
    const { stakingPool } = this;
    const manager = this.accounts.defaultSender;

    const isPrivateBefore = await stakingPool.isPrivatePool();
    await stakingPool.connect(manager).setPoolPrivacy(true);
    const isPrivateAfter = await stakingPool.isPrivatePool();

    expect(isPrivateAfter).not.to.be.equal(isPrivateBefore);
    expect(isPrivateAfter).to.be.equal(true);
  });

  it('emits an event PoolPrivacyChanged', async function () {
    const { stakingPool } = this;
    const manager = this.accounts.defaultSender;

    await expect(stakingPool.connect(manager).setPoolPrivacy(true))
      .to.emit(stakingPool, 'PoolPrivacyChanged')
      .withArgs(manager.address, true);
  });
});

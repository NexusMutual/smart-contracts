const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

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
};

async function setPoolPrivacySetup() {
  const fixture = await loadFixture(setup);
  const { stakingPool, stakingProducts, tokenController } = fixture;
  const manager = fixture.accounts.defaultSender;

  const { poolId, initialPoolFee, maxPoolFee, products, isPrivatePool } = initializeParams;

  await stakingPool
    .connect(fixture.stakingProductsSigner)
    .initialize(isPrivatePool, initialPoolFee, maxPoolFee, poolId);
  await tokenController.setStakingPoolManager(poolId, manager.address);

  await stakingProducts.connect(fixture.stakingProductsSigner).setInitialProducts(poolId, products);

  return fixture;
}

describe('setPoolPrivacy', function () {
  it('reverts if manager is not the caller', async function () {
    const fixture = await loadFixture(setPoolPrivacySetup);
    const { stakingPool, tokenController } = fixture;
    const { defaultSender: manager } = fixture.accounts;
    const [nonManager] = fixture.accounts.nonMembers;

    const poolId = await stakingPool.getPoolId();
    await tokenController.setStakingPoolManager(poolId, manager.address);

    await expect(stakingPool.connect(nonManager).setPoolPrivacy(true)).to.be.revertedWithCustomError(
      stakingPool,
      'OnlyManager',
    );
    await expect(stakingPool.connect(manager).setPoolPrivacy(true)).to.not.be.reverted;
  });

  it('updates isPrivatePool flag', async function () {
    const fixture = await loadFixture(setPoolPrivacySetup);
    const { stakingPool } = fixture;
    const manager = fixture.accounts.defaultSender;

    const isPrivateBefore = await stakingPool.isPrivatePool();
    await stakingPool.connect(manager).setPoolPrivacy(true);
    const isPrivateAfter = await stakingPool.isPrivatePool();

    expect(isPrivateAfter).not.to.be.equal(isPrivateBefore);
    expect(isPrivateAfter).to.be.equal(true);
  });

  it('emits an event PoolPrivacyChanged', async function () {
    const fixture = await loadFixture(setPoolPrivacySetup);
    const { stakingPool } = fixture;
    const manager = fixture.accounts.defaultSender;

    await expect(stakingPool.connect(manager).setPoolPrivacy(true))
      .to.emit(stakingPool, 'PoolPrivacyChanged')
      .withArgs(manager.address, true);
  });
});

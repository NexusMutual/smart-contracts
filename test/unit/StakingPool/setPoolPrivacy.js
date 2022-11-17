const { ethers, expect } = require('hardhat');
const { setEtherBalance } = require('../../utils/evm');

describe('setPoolPrivacy', function () {
  const product0 = {
    productId: 0,
    weight: 100,
    initialPrice: '500',
    targetPrice: '500',
  };

  const initializeParams = {
    poolId: 0,
    isPrivatePool: false,
    initialPoolFee: 5, // 5%
    maxPoolFee: 5, // 5%
    productInitializationParams: [product0],
  };

  beforeEach(async function () {
    const {
      stakingPool,
      cover,
      accounts: { defaultSender: manager },
    } = this;

    const { poolId, initialPoolFee, maxPoolFee, productInitializationParams, isPrivatePool } = initializeParams;

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));

    await stakingPool
      .connect(coverSigner)
      .initialize(manager.address, isPrivatePool, initialPoolFee, maxPoolFee, productInitializationParams, poolId);
  });

  it('reverts if manager is not the caller', async function () {
    const {
      stakingPool,
      accounts: {
        defaultSender: manager,
        nonMembers: [nonManager],
      },
    } = this;

    await expect(stakingPool.connect(nonManager).setPoolPrivacy(true)).to.be.revertedWith(
      'StakingPool: Only pool manager can call this function',
    );
    await expect(stakingPool.connect(manager).setPoolPrivacy(true)).to.not.be.reverted;
  });

  it('updates isPrivatePool flag', async function () {
    const {
      stakingPool,
      accounts: { defaultSender: manager },
    } = this;

    const isPrivateBefore = await stakingPool.isPrivatePool();
    await stakingPool.connect(manager).setPoolPrivacy(true);
    const isPrivateAfter = await stakingPool.isPrivatePool();

    expect(isPrivateAfter).to.not.eq(isPrivateBefore);
    expect(isPrivateAfter).to.be.eq(true);
  });

  it('emits an event PoolPrivacyChanged', async function () {
    const {
      stakingPool,
      accounts: { defaultSender: manager },
    } = this;

    await expect(stakingPool.connect(manager).setPoolPrivacy(true))
      .to.emit(stakingPool, 'PoolPrivacyChanged')
      .withArgs(manager.address, true);
  });
});

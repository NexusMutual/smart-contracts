const { ethers, expect } = require('hardhat');
const { setEtherBalance } = require('../../utils/evm');

describe('setPoolFee', function () {
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

    await expect(stakingPool.connect(nonManager).setPoolFee(5)).to.be.revertedWith(
      'StakingPool: Only pool manager can call this function',
    );
    await expect(stakingPool.connect(manager).setPoolFee(5)).to.not.be.reverted;
  });

  it('reverts if new fee exceeds max pool fee', async function () {
    const {
      stakingPool,
      accounts: { defaultSender: manager },
    } = this;

    const { maxPoolFee } = initializeParams;

    await expect(stakingPool.connect(manager).setPoolFee(maxPoolFee + 1)).to.be.revertedWith(
      'StakingPool: new fee exceeds max fee',
    );
    await expect(stakingPool.connect(manager).setPoolFee(maxPoolFee)).to.not.be.reverted;
  });

  it('updates pool fee', async function () {
    const {
      stakingPool,
      accounts: { defaultSender: manager },
    } = this;

    const { maxPoolFee } = initializeParams;

    const newPoolFee = maxPoolFee - 2;
    expect(await stakingPool.poolFee()).to.be.eq(maxPoolFee);
    await stakingPool.connect(manager).setPoolFee(newPoolFee);
    expect(await stakingPool.poolFee()).to.be.eq(newPoolFee);
  });

  xit('updates pool manager rewards', async function () {});

  it('emits and PoolFeeChanged', async function () {
    const {
      stakingPool,
      accounts: { defaultSender: manager },
    } = this;

    const { maxPoolFee } = initializeParams;

    const newPoolFee = maxPoolFee - 2;

    await expect(stakingPool.connect(manager).setPoolFee(newPoolFee))
      .to.emit(stakingPool, 'PoolFeeChanged')
      .withArgs(manager.address, newPoolFee);
  });
});

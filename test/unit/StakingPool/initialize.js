const { expect } = require('chai');
const { ethers } = require('hardhat');
const { setEtherBalance } = require('../../utils/evm');

describe('initialize', function () {
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

  it('reverts if cover contract is not the caller', async function () {
    const {
      stakingPool,
      cover,
      accounts: { defaultSender: manager },
    } = this;

    const { poolId, initialPoolFee, maxPoolFee, productInitializationParams, isPrivatePool } = initializeParams;

    await expect(
      stakingPool.initialize(
        manager.address,
        isPrivatePool,
        initialPoolFee,
        maxPoolFee,
        productInitializationParams,
        poolId,
      ),
    ).to.be.revertedWith('StakingPool: Only Cover contract can call this function');

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));

    await expect(
      stakingPool
        .connect(coverSigner)
        .initialize(manager.address, isPrivatePool, initialPoolFee, maxPoolFee, productInitializationParams, poolId),
    ).to.not.be.reverted;
  });

  it('reverts if initial pool fee exceeds max pool fee', async function () {
    const {
      stakingPool,
      cover,
      accounts: { defaultSender: manager },
    } = this;

    const { poolId, maxPoolFee, productInitializationParams, isPrivatePool } = initializeParams;

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));

    await expect(
      stakingPool
        .connect(coverSigner)
        .initialize(manager.address, isPrivatePool, maxPoolFee + 1, maxPoolFee, productInitializationParams, poolId),
    ).to.be.revertedWith('StakingPool: Pool fee should not exceed max pool fee');
  });

  it('reverts if max pool fee is 100%', async function () {
    const {
      stakingPool,
      cover,
      accounts: { defaultSender: manager },
    } = this;

    const { poolId, initialPoolFee, productInitializationParams, isPrivatePool } = initializeParams;

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));

    await expect(
      stakingPool
        .connect(coverSigner)
        .initialize(manager.address, isPrivatePool, initialPoolFee, 100, productInitializationParams, poolId),
    ).to.be.revertedWith('StakingPool: Max pool fee cannot be 100%');
  });

  it('reverts if product target price is too high', async function () {
    const {
      stakingPool,
      cover,
      accounts: { defaultSender: manager },
    } = this;

    const { poolId, initialPoolFee, maxPoolFee, productInitializationParams, isPrivatePool } = initializeParams;

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));

    const TARGET_PRICE_DENOMINATOR = (await stakingPool.TARGET_PRICE_DENOMINATOR()).toNumber();

    await expect(
      stakingPool
        .connect(coverSigner)
        .initialize(
          manager.address,
          isPrivatePool,
          initialPoolFee,
          maxPoolFee,
          [{ ...productInitializationParams[0], targetPrice: (TARGET_PRICE_DENOMINATOR + 1).toString() }],
          poolId,
        ),
    ).to.be.revertedWith('StakingPool: Target price too high');

    await expect(
      stakingPool
        .connect(coverSigner)
        .initialize(
          manager.address,
          isPrivatePool,
          initialPoolFee,
          maxPoolFee,
          [{ ...productInitializationParams[0], targetPrice: TARGET_PRICE_DENOMINATOR.toString() }],
          poolId,
        ),
    ).to.not.be.reverted;
  });

  it('reverts if product weight bigger than 1', async function () {
    const {
      stakingPool,
      cover,
      accounts: { defaultSender: manager },
    } = this;

    const { poolId, initialPoolFee, maxPoolFee, productInitializationParams, isPrivatePool } = initializeParams;

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));

    const WEIGHT_DENOMINATOR = (await stakingPool.WEIGHT_DENOMINATOR()).toNumber();

    await expect(
      stakingPool
        .connect(coverSigner)
        .initialize(
          manager.address,
          isPrivatePool,
          initialPoolFee,
          maxPoolFee,
          [{ ...productInitializationParams[0], weight: WEIGHT_DENOMINATOR + 1 }],
          poolId,
        ),
    ).to.be.revertedWith('StakingPool: Cannot set weight beyond 1');

    await expect(
      stakingPool
        .connect(coverSigner)
        .initialize(
          manager.address,
          isPrivatePool,
          initialPoolFee,
          maxPoolFee,
          [{ ...productInitializationParams[0], weight: WEIGHT_DENOMINATOR }],
          poolId,
        ),
    ).to.not.be.reverted;
  });

  it('reverts if products total target exceeds max total weight', async function () {
    const {
      stakingPool,
      cover,
      accounts: { defaultSender: manager },
    } = this;

    const { poolId, initialPoolFee, maxPoolFee, isPrivatePool } = initializeParams;

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));

    const MAX_TOTAL_WEIGHT = (await stakingPool.MAX_TOTAL_WEIGHT()).toNumber();

    const validProducts = Array(Math.floor(MAX_TOTAL_WEIGHT / product0.weight))
      .fill(product0)
      .map((value, index) => {
        return { ...value, productId: index };
      });

    await expect(
      stakingPool
        .connect(coverSigner)
        .initialize(
          manager.address,
          isPrivatePool,
          initialPoolFee,
          maxPoolFee,
          [...validProducts, { ...product0, productId: validProducts.length }],
          poolId,
        ),
    ).to.be.revertedWith('StakingPool: Total max target weight exceeded');

    await expect(
      stakingPool
        .connect(coverSigner)
        .initialize(manager.address, isPrivatePool, initialPoolFee, maxPoolFee, [...validProducts], poolId),
    ).to.not.be.reverted;
  });
});

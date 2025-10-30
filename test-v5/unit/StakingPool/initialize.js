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

describe('initialize', function () {
  it('reverts if cover contract is not the caller', async function () {
    const fixture = await loadFixture(setup);
    const { stakingPool, stakingProductsSigner } = fixture;
    const { poolId, initialPoolFee, maxPoolFee, isPrivatePool } = initializeParams;

    await expect(
      stakingPool.initialize(isPrivatePool, initialPoolFee, maxPoolFee, poolId),
    ).to.be.revertedWithCustomError(stakingPool, 'OnlyStakingProductsContract');

    await expect(
      stakingPool.connect(stakingProductsSigner).initialize(isPrivatePool, initialPoolFee, maxPoolFee, poolId),
    ).to.not.be.reverted;
  });

  it('reverts if initial pool fee exceeds max pool fee', async function () {
    const fixture = await loadFixture(setup);
    const { stakingPool, stakingProductsSigner } = fixture;

    const { poolId, maxPoolFee, isPrivatePool } = initializeParams;

    await expect(
      stakingPool.connect(stakingProductsSigner).initialize(isPrivatePool, maxPoolFee + 1, maxPoolFee, poolId),
    ).to.be.revertedWithCustomError(stakingPool, 'PoolFeeExceedsMax');
  });

  it('reverts if max pool fee is 100%', async function () {
    const fixture = await loadFixture(setup);
    const { stakingPool, stakingProductsSigner } = fixture;
    const { poolId, initialPoolFee, isPrivatePool } = initializeParams;

    await expect(
      stakingPool.connect(stakingProductsSigner).initialize(isPrivatePool, initialPoolFee, 100, poolId),
    ).to.be.revertedWithCustomError(stakingPool, 'MaxPoolFeeAbove100');
  });

  it('correctly initialize pool parameters', async function () {
    const fixture = await loadFixture(setup);
    const { stakingPool, stakingProductsSigner } = fixture;
    const { poolId, initialPoolFee, maxPoolFee, isPrivatePool } = initializeParams;

    await stakingPool.connect(stakingProductsSigner).initialize(isPrivatePool, initialPoolFee, maxPoolFee, poolId);

    expect(await stakingPool.getPoolFee()).to.be.equal(initialPoolFee);
    expect(await stakingPool.getMaxPoolFee()).to.be.equal(maxPoolFee);
    expect(await stakingPool.isPrivatePool()).to.be.equal(isPrivatePool);
  });
});

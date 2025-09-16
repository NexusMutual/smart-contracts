const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

const poolId = 2n ** 95n; // overflows at uint96

describe('assignStakingPoolManager', function () {
  it('should revert if not called from internal address', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;

    await expect(tokenController.assignStakingPoolManager(poolId, ethers.ZeroAddress)).to.be.revertedWithCustomError(
      tokenController,
      'Unauthorized',
    );
  });

  it('should transfer a staking pool when there is a previous manager', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const {
      members: [oldManager, newManager],
      stakingProducts: [stakingProducts],
    } = fixture.accounts;

    // Set old manager
    await tokenController.connect(stakingProducts).assignStakingPoolManager(poolId, oldManager.address);

    // Set new manager
    await tokenController.connect(stakingProducts).assignStakingPoolManager(poolId, newManager.address);

    const pools = await tokenController.getManagerStakingPools(newManager.address);
    expect(pools).to.be.deep.equal([poolId]);
    expect(pools.length).to.be.equal(1);

    expect(await tokenController.getStakingPoolManager(poolId)).to.equal(newManager.address);
    expect(await tokenController.isStakingPoolManager(newManager.address)).to.be.equal(true);

    expect(await tokenController.getManagerStakingPools(oldManager.address)).to.be.deep.equal([]);
    expect(await tokenController.isStakingPoolManager(oldManager.address)).to.be.equal(false);
  });

  it('should transfer a staking pool when there is no previous manager', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const {
      members: [newManager],
      stakingProducts: [stakingProducts],
    } = fixture.accounts;

    // Set new manager
    await tokenController.connect(stakingProducts).assignStakingPoolManager(poolId, newManager.address);

    expect(await tokenController.getStakingPoolManager(poolId)).to.equal(newManager.address);
    expect(await tokenController.isStakingPoolManager(newManager.address)).to.be.equal(true);
  });

  it('should transfer staking pools when the new owner is already a manager of another pool', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const {
      members: [oldManager, newManager],
      stakingProducts: [stakingProducts],
    } = fixture.accounts;

    // Set old manager
    await tokenController.connect(stakingProducts).assignStakingPoolManager(poolId, oldManager.address);

    // Set new manager
    await tokenController.connect(stakingProducts).assignStakingPoolManager(poolId + 1n, newManager.address);

    await tokenController.connect(stakingProducts).assignStakingPoolManager(poolId, newManager.address);

    const pools = await tokenController.getManagerStakingPools(newManager.address);
    expect(pools).to.be.deep.equal([poolId + 1n, poolId]);
    expect(pools.length).to.be.equal(2);

    expect(await tokenController.getStakingPoolManager(poolId + 1n)).to.equal(newManager.address);
    expect(await tokenController.getStakingPoolManager(poolId)).to.equal(newManager.address);
    expect(await tokenController.isStakingPoolManager(newManager.address)).to.be.equal(true);

    expect(await tokenController.getManagerStakingPools(oldManager.address)).to.be.deep.equal([]);
    expect(await tokenController.isStakingPoolManager(oldManager.address)).to.be.equal(false);
  });

  it('should transfer several staking pools to a new manager', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const {
      members: [oldManager, newManager],
      stakingProducts: [stakingProducts],
    } = fixture.accounts;

    // Set old manager
    await tokenController.connect(stakingProducts).assignStakingPoolManager(poolId, oldManager.address);
    await tokenController.connect(stakingProducts).assignStakingPoolManager(poolId + 1n, oldManager.address);
    await tokenController.connect(stakingProducts).assignStakingPoolManager(poolId + 2n, oldManager.address);

    // Set new manager
    await tokenController.connect(stakingProducts).assignStakingPoolManager(poolId, newManager.address);
    await tokenController.connect(stakingProducts).assignStakingPoolManager(poolId + 1n, newManager.address);
    await tokenController.connect(stakingProducts).assignStakingPoolManager(poolId + 2n, newManager.address);

    const pools = await tokenController.getManagerStakingPools(newManager.address);
    expect(pools).to.be.deep.equal([poolId, poolId + 1n, poolId + 2n]);
    expect(pools.length).to.be.equal(3);

    // New manager is the owner of all the pools
    expect(await tokenController.getStakingPoolManager(poolId)).to.equal(newManager.address);
    expect(await tokenController.getStakingPoolManager(poolId + 1n)).to.equal(newManager.address);
    expect(await tokenController.getStakingPoolManager(poolId + 2n)).to.equal(newManager.address);
    expect(await tokenController.isStakingPoolManager(newManager.address)).to.be.equal(true);

    // Old manager is no longer staking pool manager
    expect(await tokenController.getManagerStakingPools(oldManager.address)).to.be.deep.equal([]);
    expect(await tokenController.isStakingPoolManager(oldManager.address)).to.be.equal(false);
  });
});

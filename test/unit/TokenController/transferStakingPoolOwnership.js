const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');
const { AddressZero, Two } = ethers.constants;

const poolId = Two.pow(95); // overflows at uint96

describe('transferStakingPoolOwnership', function () {
  it('should revert if not called from internal address', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const {
      members: [oldManager, newManager],
    } = fixture.accounts;

    await expect(
      tokenController.transferStakingPoolsOwnership(oldManager.address, newManager.address),
    ).to.be.revertedWith('Caller is not an internal contract');
  });

  it('should return with no state changes if staking pool count is 0', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const {
      members: [oldManager, newManager],
      internalContracts: [internalContract],
    } = fixture.accounts;

    await expect(
      tokenController.connect(internalContract).transferStakingPoolsOwnership(oldManager.address, newManager.address),
    ).to.not.be.reverted;

    expect(await tokenController.getManagerStakingPools(newManager.address)).to.be.deep.equal([]);
    expect(await tokenController.isStakingPoolManager(newManager.address)).to.be.equal(false);
    expect(await tokenController.getStakingPoolManager(poolId)).to.be.equal(AddressZero);

    expect(await tokenController.getManagerStakingPools(oldManager.address)).to.be.deep.equal([]);
    expect(await tokenController.isStakingPoolManager(oldManager.address)).to.be.equal(false);
  });

  it('should set new address of manager of pools, and remove from old', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const {
      members: [oldManager, newManager],
      internalContracts: [internalContract],
    } = fixture.accounts;

    // Set old manager
    await tokenController.connect(internalContract).assignStakingPoolManager(poolId, oldManager.address);

    await expect(
      tokenController.connect(internalContract).transferStakingPoolsOwnership(oldManager.address, newManager.address),
    ).to.not.be.reverted;

    // Check new manager
    const poolsNewManager = await tokenController.getManagerStakingPools(newManager.address);
    expect(poolsNewManager).to.be.deep.equal([poolId]);
    expect(await tokenController.isStakingPoolManager(newManager.address)).to.be.equal(true);
    expect(await tokenController.getStakingPoolManager(poolId)).to.be.equal(newManager.address);

    // Check old manager
    const poolsOldManager = await tokenController.getManagerStakingPools(oldManager.address);
    expect(poolsOldManager).to.be.deep.equal([]);
    expect(await tokenController.isStakingPoolManager(oldManager.address)).to.be.equal(false);
  });

  it('should transfer 20 pools from old manager to new manager', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const {
      members: [oldManager, newManager],
      internalContracts: [internalContract],
    } = fixture.accounts;

    const assignPromises = [];
    for (let i = 0; i < 20; i++) {
      assignPromises.push(tokenController.connect(internalContract).assignStakingPoolManager(i, oldManager.address));
    }
    await Promise.all(assignPromises);

    await tokenController
      .connect(internalContract)
      .transferStakingPoolsOwnership(oldManager.address, newManager.address);

    // Check new manager
    const poolsNewManager = await tokenController.getManagerStakingPools(newManager.address);
    expect(poolsNewManager.length).to.be.equal(20);
    expect(await tokenController.isStakingPoolManager(newManager.address)).to.be.equal(true);

    // Check old manager
    const poolsOldManager = await tokenController.getManagerStakingPools(oldManager.address);
    expect(poolsOldManager.length).to.be.equal(0);
    expect(await tokenController.isStakingPoolManager(oldManager.address)).to.be.equal(false);
  });

  it('should transfer pool ownership to zero address', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const {
      members: [oldManager],
      internalContracts: [internalContract],
    } = fixture.accounts;

    // Set old manager
    await tokenController.connect(internalContract).assignStakingPoolManager(poolId, oldManager.address);

    await expect(
      tokenController.connect(internalContract).transferStakingPoolsOwnership(oldManager.address, AddressZero),
    ).to.not.be.reverted;

    // Check new manager
    const poolsNewManager = await tokenController.getManagerStakingPools(AddressZero);
    expect(poolsNewManager).to.be.deep.equal([poolId]);
    expect(await tokenController.isStakingPoolManager(AddressZero)).to.be.equal(true);

    // Check old manager
    const poolsOldManager = await tokenController.getManagerStakingPools(oldManager.address);
    expect(poolsOldManager).to.be.deep.equal([]);
    expect(await tokenController.isStakingPoolManager(oldManager.address)).to.be.equal(false);
  });
});

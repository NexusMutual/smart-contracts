const { expect } = require('chai');
const { ethers } = require('hardhat');
const { AddressZero, Two } = ethers.constants;

const poolId = Two.pow(95); // overflows at uint96

describe('transferStakingPoolOwnership', function () {
  it('should revert if not called from internal address', async function () {
    const { tokenController } = this.contracts;
    const {
      members: [oldManager, newManager],
    } = this.accounts;

    await expect(
      tokenController.transferStakingPoolsOwnership(oldManager.address, newManager.address),
    ).to.be.revertedWith('Caller is not an internal contract');
  });

  it('should return with no state changes if staking pool count is 0', async function () {
    const { tokenController } = this.contracts;
    const {
      members: [oldManager, newManager],
      internalContracts: [internalContract],
    } = this.accounts;

    await expect(
      tokenController.connect(internalContract).transferStakingPoolsOwnership(oldManager.address, newManager.address),
    ).to.not.be.reverted;

    expect(await tokenController.getManagerStakingPools(newManager.address)).to.be.deep.equal([]);
    expect(await tokenController.isStakingPoolManager(newManager.address)).to.be.equal(false);

    expect(await tokenController.getManagerStakingPools(oldManager.address)).to.be.deep.equal([]);
    expect(await tokenController.isStakingPoolManager(oldManager.address)).to.be.equal(false);
  });

  it('should set new address of manager of pools, and remove from old', async function () {
    const { tokenController } = this.contracts;
    const {
      members: [oldManager, newManager],
      internalContracts: [internalContract],
    } = this.accounts;

    // Set old manager
    await tokenController.connect(internalContract).assignStakingPoolManager(poolId, oldManager.address);

    await expect(
      tokenController.connect(internalContract).transferStakingPoolsOwnership(oldManager.address, newManager.address),
    ).to.not.be.reverted;

    // Check new manager
    const poolsNewManager = await tokenController.getManagerStakingPools(newManager.address);
    expect(poolsNewManager).to.be.deep.equal([poolId]);
    expect(await tokenController.isStakingPoolManager(newManager.address)).to.be.equal(true);

    // Check old manager
    const poolsOldManager = await tokenController.getManagerStakingPools(oldManager.address);
    expect(poolsOldManager).to.be.deep.equal([]);
    expect(await tokenController.isStakingPoolManager(oldManager.address)).to.be.equal(false);
  });

  it('should transfer 20 pools from old manager to new manager', async function () {
    const { tokenController } = this.contracts;
    const {
      members: [oldManager, newManager],
      internalContracts: [internalContract],
    } = this.accounts;

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
  // TODO: not sure if we want this behavior
  it('should transfer pool ownership to zero address', async function () {
    const { tokenController } = this.contracts;
    const {
      members: [oldManager],
      internalContracts: [internalContract],
    } = this.accounts;

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

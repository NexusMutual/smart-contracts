const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');
const { Two } = ethers.constants;

const poolId = 150;
describe('createStakingPoolOwnershipOffer', function () {
  it('should revert if caller is not the staking pool manager', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const [caller] = fixture.accounts.members;

    await expect(
      tokenController.connect(caller).createStakingPoolOwnershipOffer(poolId, caller.address, 1000000),
    ).to.be.revertedWithCustomError(tokenController, 'OnlyStakingPoolManager');
  });

  it('should revert if the deadline is not in the future', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const {
      members: [oldManager, newManager],
      internalContracts: [internalContract],
    } = fixture.accounts;

    // Set old manager
    await tokenController.connect(internalContract).assignStakingPoolManager(poolId, oldManager.address);

    // Create offer that expires now
    const { timestamp: deadline } = await ethers.provider.getBlock('latest');
    await expect(
      tokenController.connect(oldManager).createStakingPoolOwnershipOffer(poolId, newManager.address, deadline),
    ).to.be.revertedWithCustomError(tokenController, 'DeadlinePassed');
  });

  it('should successfully create a new pool ownership offer', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const {
      members: [oldManager, newManager],
      internalContracts: [internalContract],
    } = fixture.accounts;

    // Set old manager
    await tokenController.connect(internalContract).assignStakingPoolManager(poolId, oldManager.address);
    let { timestamp: expectedDeadline } = await ethers.provider.getBlock('latest');
    expectedDeadline += 2;

    await tokenController
      .connect(oldManager)
      .createStakingPoolOwnershipOffer(poolId, newManager.address, expectedDeadline);

    const { proposedManager, deadline } = await tokenController.getStakingPoolOwnershipOffer(poolId);
    expect(proposedManager).to.be.equal(newManager.address);
    expect(deadline).to.be.equal(expectedDeadline);
  });

  it('should be able to overwrite a previous pool ownership offer', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const {
      members: [oldManager, newManager, newManager2],
      internalContracts: [internalContract],
    } = fixture.accounts;

    // Set old manager
    await tokenController.connect(internalContract).assignStakingPoolManager(poolId, oldManager.address);
    let { timestamp: expectedDeadline } = await ethers.provider.getBlock('latest');

    // Create first offer
    expectedDeadline += 2;
    await tokenController
      .connect(oldManager)
      .createStakingPoolOwnershipOffer(poolId, newManager.address, expectedDeadline);

    // Overwrite offer
    const expectedDeadline2 = expectedDeadline + 8456;
    await tokenController
      .connect(oldManager)
      .createStakingPoolOwnershipOffer(poolId, newManager2.address, expectedDeadline2);

    const { proposedManager, deadline } = await tokenController.getStakingPoolOwnershipOffer(poolId);
    expect(proposedManager).to.be.equal(newManager2.address);
    expect(deadline).to.be.equal(expectedDeadline2);
  });

  it('should successfully transfer ownership to the same address', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const {
      members: [manager],
      internalContracts: [internalContract],
    } = fixture.accounts;

    // Set manager
    await tokenController.connect(internalContract).assignStakingPoolManager(poolId, manager.address);
    let { timestamp: expectedDeadline } = await ethers.provider.getBlock('latest');
    expectedDeadline += Two.pow(31);

    await tokenController.connect(manager).createStakingPoolOwnershipOffer(poolId, manager.address, expectedDeadline);

    const { proposedManager, deadline } = await tokenController.getStakingPoolOwnershipOffer(poolId);
    expect(proposedManager).to.be.equal(manager.address);
    expect(deadline).to.be.equal(expectedDeadline);
  });
});

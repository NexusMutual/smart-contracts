const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');
const { setNextBlockTime } = require('../../utils').evm;
const { Two } = ethers.constants;

const poolId = Two.pow(95); // overflows at uint96
const maxDeadline = Two.pow(31);
describe('acceptStakingPoolOwnershipOffer', function () {
  it('should revert if the caller is not the proposed manager', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;

    await expect(tokenController.acceptStakingPoolOwnershipOffer(poolId)).to.be.revertedWithCustomError(
      tokenController,
      'OnlyProposedManager',
    );
  });

  it('should fail to accept a canceled offer', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const {
      members: [oldManager, newManager],
      internalContracts: [internalContract],
    } = fixture.accounts;

    // Set old manager
    await tokenController.connect(internalContract).assignStakingPoolManager(poolId, oldManager.address);

    // Create offer
    await tokenController.connect(oldManager).createStakingPoolOwnershipOffer(poolId, newManager.address, maxDeadline);

    // Cancel offer
    await tokenController.connect(oldManager).cancelStakingPoolOwnershipOffer(poolId);

    await expect(
      tokenController.connect(newManager).acceptStakingPoolOwnershipOffer(poolId),
    ).to.be.revertedWithCustomError(tokenController, 'OnlyProposedManager');
  });

  it('should revert if the ownership offer has expired', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const {
      members: [oldManager, newManager],
      internalContracts: [internalContract],
    } = fixture.accounts;

    // Set old manager
    await tokenController.connect(internalContract).assignStakingPoolManager(poolId, oldManager.address);

    const { timestamp: deadline } = await ethers.provider.getBlock('latest');
    // Create offer
    await tokenController.connect(oldManager).createStakingPoolOwnershipOffer(poolId, newManager.address, deadline + 2);

    await setNextBlockTime(deadline + 3);

    await expect(
      tokenController.connect(newManager).acceptStakingPoolOwnershipOffer(poolId),
    ).to.be.revertedWithCustomError(tokenController, 'OwnershipOfferHasExpired');
  });

  it('should successfully remove pools from last manager and add them to new managers list', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const {
      members: [oldManager, newManager],
      internalContracts: [internalContract],
    } = fixture.accounts;

    // Set old manager
    await tokenController.connect(internalContract).assignStakingPoolManager(poolId, oldManager.address);

    // Create offer
    await tokenController.connect(oldManager).createStakingPoolOwnershipOffer(poolId, newManager.address, maxDeadline);

    // Accept offer
    await tokenController.connect(newManager).acceptStakingPoolOwnershipOffer(poolId);

    // Check that new manager is assigned
    const stakingPools = await tokenController.getManagerStakingPools(newManager.address);
    expect(await tokenController.getStakingPoolManager(poolId)).to.be.equal(newManager.address);
    expect(stakingPools).to.be.deep.equal([poolId]);
    expect(stakingPools.length).to.be.equal(1);
    expect(await tokenController.isStakingPoolManager(newManager.address)).to.be.eq(true);

    // Check that old manager is unassigned
    expect(await tokenController.getManagerStakingPools(oldManager.address)).to.be.deep.equal([]);
    expect(!(await tokenController.isStakingPoolManager(oldManager.address))).to.be.eq(true);

    // Make sure the offer is removed
    expect(await tokenController.getStakingPoolOwnershipOffer(poolId)).to.be.deep.equal([
      ethers.constants.AddressZero,
      0,
    ]);
  });

  it('should revert if current manager is locked for voting', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController, nxm } = fixture.contracts;
    const {
      members: [oldManager, newManager],
      internalContracts: [internalContract],
    } = fixture.accounts;

    // Set old manager
    await tokenController.connect(internalContract).assignStakingPoolManager(poolId, oldManager.address);

    // Create offer
    await tokenController.connect(oldManager).createStakingPoolOwnershipOffer(poolId, newManager.address, maxDeadline);

    // Lock old manager
    await nxm.setLock(oldManager.address, Two.pow(30));

    await expect(
      tokenController.connect(newManager).acceptStakingPoolOwnershipOffer(poolId),
    ).to.be.revertedWithCustomError(tokenController, 'ManagerIsLockedForVoting');
  });
});

const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

const { ZeroAddress } = ethers;

const poolId = 2n ** 95n; // overflows at uint96
const maxDeadline = 2n ** 31n;

describe('cancelStakingPoolOwnershipOffer', function () {
  it('should revert if caller is not manager of pool', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const {
      members: [newManager],
    } = fixture.accounts;

    await expect(
      tokenController.connect(newManager).cancelStakingPoolOwnershipOffer(poolId),
    ).to.be.revertedWithCustomError(tokenController, 'OnlyStakingPoolManager');
  });

  it('should successfully remove ownership offer', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const {
      members: [oldManager, newManager],
      stakingProducts: [stakingProducts],
    } = fixture.accounts;

    // Set old manager
    await tokenController.connect(stakingProducts).assignStakingPoolManager(poolId, oldManager.address);

    // Create offer
    await tokenController.connect(oldManager).createStakingPoolOwnershipOffer(poolId, newManager.address, maxDeadline);

    // Cancel offer
    await tokenController.connect(oldManager).cancelStakingPoolOwnershipOffer(poolId);

    const { proposedManager, deadline } = await tokenController.getStakingPoolOwnershipOffer(poolId);

    expect(proposedManager).to.equal(ZeroAddress);
    expect(deadline).to.equal(0);

    // Check that new manager is no longer able to accept offer
    await expect(
      tokenController.connect(newManager).acceptStakingPoolOwnershipOffer(poolId),
    ).to.be.revertedWithCustomError(tokenController, 'OnlyProposedManager');
  });

  it('should be able to cancel the same pool twice - noop', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const {
      members: [oldManager],
      stakingProducts: [stakingProducts],
    } = fixture.accounts;

    // Set old manager
    await tokenController.connect(stakingProducts).assignStakingPoolManager(poolId, oldManager.address);

    // Create offer
    await tokenController.connect(oldManager).createStakingPoolOwnershipOffer(poolId, oldManager.address, maxDeadline);

    // Cancel offer
    await tokenController.connect(oldManager).cancelStakingPoolOwnershipOffer(poolId);

    // Cancel offer again
    await tokenController.connect(oldManager).cancelStakingPoolOwnershipOffer(poolId);

    const { proposedManager, deadline } = await tokenController.getStakingPoolOwnershipOffer(poolId);

    expect(proposedManager).to.equal(ZeroAddress);
    expect(deadline).to.equal(0);
  });
});

const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

const { setup } = require('./setup');

describe('getManagedStakingPools', function () {
  it('getManagedStakingPools should return the correct staking pools for the manager', async function () {
    const fixture = await loadFixture(setup);
    const [manager, otherManager] = fixture.accounts.members;
    const { stakingViewer, stakingProducts, tokenController } = fixture.contracts;
    const { stakedNxmAmount } = fixture.stakingPool;

    // create a 2nd staking pool that does not belong to the manager
    const params = [false, 5, 5, [], 'ipfs hash'];
    const [othersPoolId] = await stakingProducts.connect(otherManager).callStatic.createStakingPool(...params);
    await stakingProducts.connect(otherManager).createStakingPool(...params);
    await tokenController.setStakingPoolManager(othersPoolId, otherManager.address);

    const [managedStakingPool] = await stakingViewer.getManagedStakingPools(manager.address);

    expect(managedStakingPool.poolId).to.not.equal(othersPoolId);
    expect(managedStakingPool.poolId.toString()).to.equal('1');
    expect(managedStakingPool.isPrivatePool).to.equal(false);
    expect(managedStakingPool.manager).to.equal(manager.address);
    expect(managedStakingPool.poolFee.toString()).to.equal('5');
    expect(managedStakingPool.maxPoolFee.toString()).to.equal('5');
    expect(managedStakingPool.activeStake).to.equal(stakedNxmAmount);
    expect(managedStakingPool.currentAPY.toString()).to.equal('0');
  });
});

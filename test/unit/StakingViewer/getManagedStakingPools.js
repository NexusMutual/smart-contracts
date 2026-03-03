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
    const [othersPoolId] = await stakingProducts.connect(otherManager).createStakingPool.staticCall(...params);
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

  it('returns empty array for a manager with no pools', async function () {
    const fixture = await loadFixture(setup);
    const [nonPoolManager] = fixture.accounts.nonMembers;
    const { stakingViewer } = fixture.contracts;

    const pools = await stakingViewer.getManagedStakingPools(nonPoolManager.address);
    expect(pools.length).to.equal(0);
  });

  it('returns all pools for a manager with multiple pools', async function () {
    const fixture = await loadFixture(setup);
    const [manager] = fixture.accounts.members;
    const { stakingViewer, stakingProducts, tokenController } = fixture.contracts;

    const params = [false, 5, 5, [], 'ipfs hash'];
    const [secondPoolId] = await stakingProducts.connect(manager).createStakingPool.staticCall(...params);
    await stakingProducts.connect(manager).createStakingPool(...params);
    await tokenController.setStakingPoolManager(secondPoolId, manager.address);

    const pools = await stakingViewer.getManagedStakingPools(manager.address);
    expect(pools.length).to.equal(2);
    expect(pools[0].manager).to.equal(manager.address);
    expect(pools[1].manager).to.equal(manager.address);
    expect(pools.map(pool => pool.poolId)).to.deep.equal([1n, secondPoolId]);
  });
});

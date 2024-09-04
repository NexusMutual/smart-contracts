const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

const { setup } = require('./setup');

describe('getPool', function () {
  it('should retrieve pool info for the given poolId', async function () {
    const fixture = await loadFixture(setup);
    const { stakingPool, stakingViewer } = fixture.contracts;
    const { poolId } = fixture.stakingPool;

    const poolInfo = await stakingViewer.getPool(poolId);

    expect(poolInfo.poolId.toString()).to.equal(poolId.toString());
    expect(poolInfo.isPrivatePool).to.equal(await stakingPool.isPrivatePool());
    expect(poolInfo.manager).to.equal(await stakingPool.manager());
    expect(poolInfo.poolFee).to.equal(await stakingPool.getPoolFee());
    expect(poolInfo.maxPoolFee).to.equal(await stakingPool.getMaxPoolFee());
    expect(poolInfo.activeStake).to.equal(await stakingPool.getActiveStake());
    expect(poolInfo.currentAPY.toString()).to.equal('0');
    expect(poolInfo.metadataIpfsHash).to.equal('ipfs hash');
  });
});

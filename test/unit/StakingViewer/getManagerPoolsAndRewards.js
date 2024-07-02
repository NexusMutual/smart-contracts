const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

describe('getManagerPoolsAndRewards', function () {
  it.only('should get all manager pools and rewards', async function () {
    console.log('calling fixture setup');
    const fixture = await loadFixture(setup);
    const { stakingViewer } = fixture.contracts;
    //
    const pool = await stakingViewer.getPool(1);
    console.log('pool: ', pool);
  });
});

const { assert, expect } = require('chai');

describe('initialize', function () {
  it('should edit purchased cover and increase amount', async function () {
    const { cover, accounts } = this;

    // reset initialization
    await cover.connect(accounts.governanceContracts[0]).updateUintParameters([0], ['0']);

    await cover.initialize();

    const globalCapacityRatio = await cover.globalCapacityRatio();
    const globalRewardsRatio = await cover.globalRewardsRatio();
    const coverAssetsFallback = await cover.coverAssetsFallback();

    assert.equal(globalCapacityRatio, 20000);
    assert.equal(globalRewardsRatio, 5000);
    assert.equal(coverAssetsFallback, 3); // 3 = 0x11 - DAI and ETH
  });

  it('should revert if globalCapacityRatio already set to a non-zero value', async function () {
    const { cover, accounts } = this;

    await cover.connect(accounts.governanceContracts[0]).updateUintParameters([0], ['10000']);

    await expect(cover.initialize()).to.be.revertedWith('Cover: already initialized');
  });
});

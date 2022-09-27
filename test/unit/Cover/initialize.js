const { expect } = require('chai');

describe('initialize', function () {
  it('should edit purchased cover and increase amount', async function () {
    const { cover, accounts } = this;

    // reset initialization
    await cover.connect(accounts.governanceContracts[0]).updateUintParameters([0], ['0']);

    await cover.initialize();

    const globalCapacityRatio = await cover.globalCapacityRatio();
    const globalRewardsRatio = await cover.globalRewardsRatio();
    const coverAssetsFallback = await cover.coverAssetsFallback();

    expect(globalCapacityRatio).to.be.equal(20000);
    expect(globalRewardsRatio).to.be.equal(5000);
    expect(coverAssetsFallback).to.be.equal(3); // 3 = 0x11 - DAI and ETH
  });

  it('should revert if globalCapacityRatio already set to a non-zero value', async function () {
    const { cover, accounts } = this;

    await cover.connect(accounts.governanceContracts[0]).updateUintParameters([0], ['10000']);

    await expect(cover.initialize()).to.be.revertedWith('Cover: already initialized');
  });
});

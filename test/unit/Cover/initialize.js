const { expectRevert } = require('@openzeppelin/test-helpers');

const { bnEqual } = require('../utils').helpers;

describe('initialize', function () {
  it('should edit purchased cover and increase amount', async function () {
    const { cover, accounts } = this;

    // reset initialization
    await cover.connect(accounts.governanceContracts[0]).updateUintParameters([0], ['0']);

    await cover.initialize();

    const globalCapacityRatio = await cover.globalCapacityRatio();
    const globalRewardsRatio = await cover.globalRewardsRatio();
    const coverAssetsFallback = await cover.coverAssetsFallback();

    bnEqual(globalCapacityRatio, 20000);
    bnEqual(globalRewardsRatio, 5000);
    bnEqual(coverAssetsFallback, 3); // 3 = 0x11 - DAI and ETH
  });

  it('should revert if globalCapacityRatio already set to a non-zero value', async function () {
    const { cover, accounts } = this;

    await cover.connect(accounts.governanceContracts[0]).updateUintParameters([0], ['10000']);

    await expectRevert(cover.initialize(), 'Cover: already initialized');
  });
});

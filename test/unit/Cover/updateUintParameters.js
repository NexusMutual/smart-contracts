const { expect } = require('chai');

describe('updateUintParameters', function () {
  it('should revert if caller is not governance', async function () {
    const { cover, accounts } = this;

    await expect(cover.connect(accounts.nonMembers[0]).updateUintParameters([0], ['0'])).to.be.revertedWith(
      'Caller is not authorized to govern',
    );
  });

  it('should allow to update coverAssetsFallback', async function () {
    const { cover, accounts } = this;

    const coverAssetsFallbackBefore = await cover.coverAssetsFallback();
    await cover.connect(accounts.governanceContracts[0]).updateUintParameters([2], ['1']);
    const coverAssetsFallbackAfter = await cover.coverAssetsFallback();

    expect(coverAssetsFallbackBefore).to.not.be.eq(coverAssetsFallbackAfter);
  });

  it('should allow to update globalRewardsRatio', async function () {
    const { cover, accounts } = this;

    const globalRewardsRatioBefore = await cover.globalRewardsRatio();
    await cover.connect(accounts.governanceContracts[0]).updateUintParameters([1], ['1']);
    const globalRewardsRatioAfter = await cover.globalRewardsRatio();

    expect(globalRewardsRatioBefore).to.not.be.eq(globalRewardsRatioAfter);
  });

  it('should allow to update globalCapacityRatio', async function () {
    const { cover, accounts } = this;

    const globalCapacityRatioBefore = await cover.globalCapacityRatio();
    await cover.connect(accounts.governanceContracts[0]).updateUintParameters([0], ['1']);
    const globalCapacityRatioAfter = await cover.globalCapacityRatio();

    expect(globalCapacityRatioBefore).to.not.be.eq(globalCapacityRatioAfter);
  });

  it('should allow to update all parameters', async function () {
    const { cover, accounts } = this;

    const globalCapacityRatioBefore = await cover.globalCapacityRatio();
    const globalRewardsRatioBefore = await cover.globalRewardsRatio();
    const coverAssetsFallbackBefore = await cover.coverAssetsFallback();
    await cover.connect(accounts.governanceContracts[0]).updateUintParameters([0, 1, 2], ['1', '2', '3']);
    const globalCapacityRatioAfter = await cover.globalCapacityRatio();
    const globalRewardsRatioAfter = await cover.globalRewardsRatio();
    const coverAssetsFallbackAfter = await cover.coverAssetsFallback();

    expect(globalCapacityRatioBefore).to.not.be.eq(globalCapacityRatioAfter);
    expect(globalRewardsRatioBefore).to.not.be.eq(globalRewardsRatioAfter);
    expect(coverAssetsFallbackBefore).to.not.be.eq(coverAssetsFallbackAfter);
  });
});

const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

async function setAssetDetailsSetup() {
  const fixture = await loadFixture(setup);
  const { safeTracker, trackedAssetAggregator } = fixture.contracts;
  const { trackedAsset } = fixture.tokens;
  const { defaultSender } = fixture.accounts;

  await safeTracker.connect(defaultSender).addAsset(trackedAsset, trackedAssetAggregator);

  return fixture;
}

describe('setAssetDetails', function () {
  it('reverts when not called by the safe', async function () {
    const fixture = await loadFixture(setAssetDetailsSetup);
    const { safeTracker } = fixture.contracts;
    const [member] = fixture.accounts.members;

    await expect(safeTracker.connect(member).setAssetDetails(0, true)).to.be.revertedWithCustomError(
      safeTracker,
      'OnlySafe',
    );
  });

  it('reverts for an invalid asset id', async function () {
    const fixture = await loadFixture(setAssetDetailsSetup);
    const { safeTracker } = fixture.contracts;
    const { defaultSender } = fixture.accounts;

    await expect(safeTracker.connect(defaultSender).setAssetDetails(1, true)).to.be.revertedWithCustomError(
      safeTracker,
      'InvalidAssetId',
    );
  });

  it('should toggle isAbandoned', async function () {
    const fixture = await loadFixture(setAssetDetailsSetup);
    const { safeTracker } = fixture.contracts;
    const { defaultSender } = fixture.accounts;

    expect((await safeTracker.getAsset(0)).isAbandoned).to.equal(false);

    await expect(safeTracker.connect(defaultSender).setAssetDetails(0, true))
      .to.emit(safeTracker, 'AssetDetailsUpdated')
      .withArgs(0, true);
    expect((await safeTracker.getAsset(0)).isAbandoned).to.equal(true);

    await expect(safeTracker.connect(defaultSender).setAssetDetails(0, false))
      .to.emit(safeTracker, 'AssetDetailsUpdated')
      .withArgs(0, false);
    expect((await safeTracker.getAsset(0)).isAbandoned).to.equal(false);
  });
});

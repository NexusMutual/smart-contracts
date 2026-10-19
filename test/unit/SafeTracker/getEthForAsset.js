const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

const { parseEther, parseUnits } = ethers;

async function getEthForAssetSetup() {
  const fixture = await loadFixture(setup);
  const { safeTracker, trackedAssetAggregator } = fixture.contracts;
  const { trackedAsset } = fixture.tokens;
  const { defaultSender } = fixture.accounts;

  await safeTracker.connect(defaultSender).addAsset(trackedAsset, trackedAssetAggregator);

  return fixture;
}

describe('getEthForAsset', function () {
  it('reverts for an asset without an oracle', async function () {
    const fixture = await loadFixture(getEthForAssetSetup);
    const { safeTracker } = fixture.contracts;
    const { usdc } = fixture.tokens;

    await expect(safeTracker.getEthForAsset(usdc, 1)).to.be.revertedWithCustomError(safeTracker, 'AssetNotFound');
  });

  it('reverts when the rate is zero', async function () {
    const fixture = await loadFixture(getEthForAssetSetup);
    const { safeTracker, trackedAssetAggregator } = fixture.contracts;
    const { trackedAsset } = fixture.tokens;

    await trackedAssetAggregator.setLatestAnswer(0);

    await expect(safeTracker.getEthForAsset(trackedAsset, 1))
      .to.be.revertedWithCustomError(safeTracker, 'NonPositiveRate')
      .withArgs(trackedAssetAggregator.target, 0);
  });

  it('converts asset amount to ETH using asset decimals and oracle rate', async function () {
    const fixture = await loadFixture(getEthForAssetSetup);
    const { safeTracker, trackedAssetAggregator } = fixture.contracts;
    const { trackedAsset } = fixture.tokens;
    const { trackedAssetDecimals } = fixture;

    // rate is 0.5 ETH per unit
    const amount = parseUnits('10', trackedAssetDecimals);
    expect(await safeTracker.getEthForAsset(trackedAsset, amount)).to.equal(parseEther('5'));

    await trackedAssetAggregator.setLatestAnswer(parseEther('3'));
    expect(await safeTracker.getEthForAsset(trackedAsset, amount)).to.equal(parseEther('30'));

    expect(await safeTracker.getEthForAsset(trackedAsset, 0)).to.equal(0);
  });
});

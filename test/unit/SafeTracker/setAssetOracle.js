const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

const { ZeroAddress, parseEther } = ethers;

async function setAssetOracleSetup() {
  const fixture = await loadFixture(setup);
  const { safeTracker, trackedAssetAggregator } = fixture.contracts;
  const { trackedAsset } = fixture.tokens;
  const { defaultSender } = fixture.accounts;

  await safeTracker.connect(defaultSender).addAsset(trackedAsset, trackedAssetAggregator);

  const newAggregator = await ethers.deployContract('ChainlinkAggregatorMock');
  await newAggregator.setDecimals(18);
  await newAggregator.setLatestAnswer(parseEther('2'));

  return { ...fixture, newAggregator };
}

describe('setAssetOracle', function () {
  it('reverts when not called by the safe', async function () {
    const fixture = await loadFixture(setAssetOracleSetup);
    const { safeTracker } = fixture.contracts;
    const { trackedAsset } = fixture.tokens;
    const [member] = fixture.accounts.members;

    await expect(
      safeTracker.connect(member).setAssetOracle(trackedAsset, fixture.newAggregator),
    ).to.be.revertedWithCustomError(safeTracker, 'OnlySafe');
  });

  it('reverts when asset is not registered', async function () {
    const fixture = await loadFixture(setAssetOracleSetup);
    const { safeTracker } = fixture.contracts;
    const { usdc } = fixture.tokens;
    const { defaultSender } = fixture.accounts;

    await expect(
      safeTracker.connect(defaultSender).setAssetOracle(usdc, fixture.newAggregator),
    ).to.be.revertedWithCustomError(safeTracker, 'AssetNotFound');
  });

  it('reverts when aggregator address is zero address', async function () {
    const fixture = await loadFixture(setAssetOracleSetup);
    const { safeTracker } = fixture.contracts;
    const { trackedAsset } = fixture.tokens;
    const { defaultSender } = fixture.accounts;

    await expect(
      safeTracker.connect(defaultSender).setAssetOracle(trackedAsset, ZeroAddress),
    ).to.be.revertedWithCustomError(safeTracker, 'AggregatorMustNotBeZeroAddress');
  });

  it('reverts when aggregator decimals are not 18', async function () {
    const fixture = await loadFixture(setAssetOracleSetup);
    const { safeTracker } = fixture.contracts;
    const { trackedAsset } = fixture.tokens;
    const { defaultSender } = fixture.accounts;

    const usdAggregator = await ethers.deployContract('ChainlinkAggregatorMock');
    await usdAggregator.setDecimals(8);

    await expect(safeTracker.connect(defaultSender).setAssetOracle(trackedAsset, usdAggregator))
      .to.be.revertedWithCustomError(safeTracker, 'IncompatibleAggregatorDecimals')
      .withArgs(usdAggregator.target, 18, 8);
  });

  it('should update the asset oracle', async function () {
    const fixture = await loadFixture(setAssetOracleSetup);
    const { safeTracker } = fixture.contracts;
    const { trackedAsset } = fixture.tokens;
    const { defaultSender } = fixture.accounts;
    const { trackedAssetDecimals, newAggregator } = fixture;

    await expect(safeTracker.connect(defaultSender).setAssetOracle(trackedAsset, newAggregator))
      .to.emit(safeTracker, 'AssetOracleUpdated')
      .withArgs(trackedAsset.target, newAggregator.target);

    const oracle = await safeTracker.oracles(trackedAsset);
    expect(oracle.aggregator).to.equal(newAggregator.target);
    expect(oracle.assetDecimals).to.equal(trackedAssetDecimals);

    // 1 unit of the asset is now worth 2 ETH
    const oneUnit = 10n ** BigInt(trackedAssetDecimals);
    expect(await safeTracker.getEthForAsset(trackedAsset, oneUnit)).to.equal(parseEther('2'));
  });
});

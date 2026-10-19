const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

const { ZeroAddress, parseEther, parseUnits } = ethers;
const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

describe('addAsset', function () {
  it('reverts when not called by the safe', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker, trackedAssetAggregator } = fixture.contracts;
    const { trackedAsset } = fixture.tokens;
    const [member] = fixture.accounts.members;

    await expect(
      safeTracker.connect(member).addAsset(trackedAsset, trackedAssetAggregator),
    ).to.be.revertedWithCustomError(safeTracker, 'OnlySafe');
  });

  it('reverts when asset address is zero address', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker, trackedAssetAggregator } = fixture.contracts;
    const { defaultSender } = fixture.accounts;

    await expect(
      safeTracker.connect(defaultSender).addAsset(ZeroAddress, trackedAssetAggregator),
    ).to.be.revertedWithCustomError(safeTracker, 'AssetMustNotBeZeroAddress');
  });

  it('reverts when asset is ETH', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker, trackedAssetAggregator } = fixture.contracts;
    const { defaultSender } = fixture.accounts;

    await expect(
      safeTracker.connect(defaultSender).addAsset(ETH, trackedAssetAggregator),
    ).to.be.revertedWithCustomError(safeTracker, 'AssetMustNotBeETH');
  });

  it('reverts when asset is already tracked by the aave position', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker, trackedAssetAggregator } = fixture.contracts;
    const { aweth, debtUsdc } = fixture.tokens;
    const { defaultSender } = fixture.accounts;

    for (const token of [aweth, debtUsdc]) {
      await expect(
        safeTracker.connect(defaultSender).addAsset(token, trackedAssetAggregator),
      ).to.be.revertedWithCustomError(safeTracker, 'AssetAlreadyTracked');
    }
  });

  it('reverts when asset already exists', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker, trackedAssetAggregator } = fixture.contracts;
    const { trackedAsset } = fixture.tokens;
    const { defaultSender } = fixture.accounts;

    await safeTracker.connect(defaultSender).addAsset(trackedAsset, trackedAssetAggregator);

    await expect(
      safeTracker.connect(defaultSender).addAsset(trackedAsset, trackedAssetAggregator),
    ).to.be.revertedWithCustomError(safeTracker, 'AssetAlreadyExists');
  });

  it('reverts when aggregator address is zero address', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker } = fixture.contracts;
    const { trackedAsset } = fixture.tokens;
    const { defaultSender } = fixture.accounts;

    await expect(safeTracker.connect(defaultSender).addAsset(trackedAsset, ZeroAddress)).to.be.revertedWithCustomError(
      safeTracker,
      'AggregatorMustNotBeZeroAddress',
    );
  });

  it('reverts when aggregator decimals are not 18', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker } = fixture.contracts;
    const { trackedAsset } = fixture.tokens;
    const { defaultSender } = fixture.accounts;

    const usdAggregator = await ethers.deployContract('ChainlinkAggregatorMock');
    await usdAggregator.setDecimals(8);
    await usdAggregator.setLatestAnswer(parseEther('1'));

    await expect(safeTracker.connect(defaultSender).addAsset(trackedAsset, usdAggregator))
      .to.be.revertedWithCustomError(safeTracker, 'IncompatibleAggregatorDecimals')
      .withArgs(usdAggregator.target, 18, 8);
  });

  it('should add an asset and its oracle', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker, trackedAssetAggregator } = fixture.contracts;
    const { trackedAsset } = fixture.tokens;
    const { defaultSender } = fixture.accounts;
    const { trackedAssetDecimals } = fixture;

    await expect(safeTracker.connect(defaultSender).addAsset(trackedAsset, trackedAssetAggregator))
      .to.emit(safeTracker, 'AssetAdded')
      .withArgs(trackedAsset.target, trackedAssetAggregator.target);

    const assets = await safeTracker.getAssets();
    expect(assets.length).to.equal(1);

    const asset = await safeTracker.getAsset(0);
    expect(asset.assetAddress).to.equal(trackedAsset.target);
    expect(asset.isAbandoned).to.equal(false);

    expect(await safeTracker.getAssetId(trackedAsset)).to.equal(0);

    const oracle = await safeTracker.oracles(trackedAsset);
    expect(oracle.aggregator).to.equal(trackedAssetAggregator.target);
    expect(oracle.assetDecimals).to.equal(trackedAssetDecimals);
  });

  it('should allow adding usdc and weth as assets', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker, usdcAggregator } = fixture.contracts;
    const { usdc, weth } = fixture.tokens;
    const { defaultSender } = fixture.accounts;

    // weth is 1:1 to eth, safeTracker can be used as its own oracle
    await safeTracker.connect(defaultSender).addAsset(weth, safeTracker);
    await safeTracker.connect(defaultSender).addAsset(usdc, usdcAggregator);

    expect(await safeTracker.getAssetId(weth)).to.equal(0);
    expect(await safeTracker.getAssetId(usdc)).to.equal(1);

    expect(await safeTracker.getEthForAsset(weth, parseEther('1'))).to.equal(parseEther('1'));
    expect(await safeTracker.getEthForAsset(usdc, parseUnits('2000', 6))).to.equal(parseEther('1'));
  });

  it('getAsset reverts for an invalid asset id', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker } = fixture.contracts;

    await expect(safeTracker.getAsset(0)).to.be.revertedWithCustomError(safeTracker, 'InvalidAssetId');
  });

  it('getAssetId reverts for an unknown asset', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker } = fixture.contracts;
    const { trackedAsset } = fixture.tokens;

    await expect(safeTracker.getAssetId(trackedAsset)).to.be.revertedWithCustomError(safeTracker, 'AssetNotFound');
  });
});

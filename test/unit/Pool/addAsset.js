const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');

const { ZeroAddress, parseEther } = ethers;

async function addAssetSetup() {
  const fixture = await loadFixture(setup);

  const tokenOneDecimals = 6;
  const tokenOne = await ethers.deployContract('ERC20Mock');
  await tokenOne.setMetadata('MockUsdc', 'USDC', tokenOneDecimals);

  const tokenOneAggregator = await ethers.deployContract('ChainlinkAggregatorMock');
  await tokenOneAggregator.setLatestAnswer(parseEther('1'));

  const tokenTwoDecimals = 8;
  const tokenTwo = await ethers.deployContract('ERC20Mock');
  await tokenTwo.setMetadata('MockUsdc', 'USDC', tokenTwoDecimals);

  const tokenTwoAggregator = await ethers.deployContract('ChainlinkAggregatorMock');
  await tokenTwoAggregator.setLatestAnswer(parseEther('1'));
  await tokenTwoAggregator.setDecimals(8); // USD based aggregator

  return {
    ...fixture,
    tokenOne,
    tokenTwo,
    tokenOneAggregator,
    tokenTwoAggregator,
  };
}

describe('addAsset', function () {
  it('reverts when not called by governor', async function () {
    const fixture = await loadFixture(addAssetSetup);
    const { pool } = fixture;

    await expect(pool.addAsset(ZeroAddress, true, ZeroAddress, 0)).to.be.revertedWithCustomError(pool, 'Unauthorized');
  });

  it('reverts when asset address is zero address', async function () {
    const fixture = await loadFixture(addAssetSetup);
    const { pool, governor } = fixture;

    await expect(pool.connect(governor).addAsset(ZeroAddress, false, ZeroAddress, 0)).to.be.revertedWithCustomError(
      pool,
      'AssetMustNotBeZeroAddress',
    );
  });

  it('reverts when aggregator address is zero address', async function () {
    const fixture = await loadFixture(addAssetSetup);
    const { pool, governor, tokenOne } = fixture;

    await expect(pool.connect(governor).addAsset(tokenOne, false, ZeroAddress, 0)).to.be.revertedWithCustomError(
      pool,
      'AggregatorMustNotBeZeroAddress',
    );
  });

  it('reverts if incompatible aggregator decimals are used for ETH', async function () {
    const fixture = await loadFixture(addAssetSetup);
    const { pool, governor, tokenOne, tokenOneAggregator } = fixture;

    await expect(pool.connect(governor).addAsset(tokenOne, false, tokenOneAggregator, 1)).to.be.revertedWithCustomError(
      pool,
      'IncompatibleAggregatorDecimals',
    );
  });

  it('reverts if incompatible aggregator decimals are used for USD', async function () {
    const fixture = await loadFixture(addAssetSetup);
    const { pool, governor, tokenTwo, tokenTwoAggregator } = fixture;

    await expect(pool.connect(governor).addAsset(tokenTwo, false, tokenTwoAggregator, 0)).to.be.revertedWithCustomError(
      pool,
      'IncompatibleAggregatorDecimals',
    );
  });

  it('reverts asset already exists', async function () {
    const fixture = await loadFixture(addAssetSetup);
    const { pool, governor, usdc, usdcAggregator } = fixture;

    await expect(pool.connect(governor).addAsset(usdc, false, usdcAggregator, 0)).to.be.revertedWithCustomError(
      pool,
      'AssetAlreadyExists',
    );
  });

  it('should add an asset', async function () {
    const fixture = await loadFixture(addAssetSetup);
    const { pool, governor, tokenOne, tokenOneAggregator } = fixture;

    await pool.connect(governor).addAsset(tokenOne.target, false, tokenOneAggregator.target, 0);

    const tokenOneAsset = await pool.getAsset(3);
    const tokenOneOracle = await pool.oracles(tokenOne);

    expect(tokenOneAsset.assetAddress).to.equal(tokenOne);
    expect(tokenOneAsset.isCoverAsset).to.equal(false);
    expect(tokenOneAsset.isAbandoned).to.equal(false);

    expect(tokenOneOracle.aggregator).to.equal(tokenOneAggregator);
    expect(tokenOneOracle.aggregatorType).to.equal(0);
    expect(tokenOneOracle.assetDecimals).to.equal(6);
  });
});

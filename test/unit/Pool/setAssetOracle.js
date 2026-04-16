const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');

const { ZeroAddress, parseEther } = ethers;
const { ETH } = nexus.constants.Assets;

async function setAssetOracleSetup() {
  const fixture = await loadFixture(setup);

  const { pool, governor } = fixture;

  const tokenDecimals = 18;
  const token = await ethers.deployContract('ERC20Mock');
  await token.setMetadata('MockRETH', 'rETH', tokenDecimals);

  const tokenAggregatorOne = await ethers.deployContract('ChainlinkAggregatorMock');
  await tokenAggregatorOne.setLatestAnswer(parseEther('1'));
  await tokenAggregatorOne.setDecimals(18);

  const tokenAggregatorTwo = await ethers.deployContract('ChainlinkAggregatorMock');
  await tokenAggregatorTwo.setLatestAnswer(parseEther('1'));
  await tokenAggregatorTwo.setDecimals(18);

  await pool.connect(governor).addAsset(token, true, tokenAggregatorOne, 0);
  return {
    ...fixture,
    token,
    tokenAggregatorOne,
    tokenAggregatorTwo,
  };
}

describe('setAssetOracle', function () {
  it('reverts when not called by governor', async function () {
    const fixture = await loadFixture(setAssetOracleSetup);
    const { pool, token, tokenAggregatorOne } = fixture;

    await expect(pool.setAssetOracle(token, tokenAggregatorOne, 0)).to.be.revertedWithCustomError(pool, 'Unauthorized');
  });

  it('reverts when asset address is zero address', async function () {
    const fixture = await loadFixture(setAssetOracleSetup);
    const { pool, governor, tokenAggregatorOne } = fixture;

    await expect(
      pool.connect(governor).setAssetOracle(ZeroAddress, tokenAggregatorOne.target, 0),
    ).to.be.revertedWithCustomError(pool, 'AssetMustNotBeZeroAddress');
  });

  it('reverts when asset address is ETH', async function () {
    const fixture = await loadFixture(setAssetOracleSetup);
    const { pool, governor, tokenAggregatorOne } = fixture;

    await expect(pool.connect(governor).setAssetOracle(ETH, tokenAggregatorOne, 0)).to.be.revertedWithCustomError(
      pool,
      'AggregatorAssetMustNotBeETH',
    );
  });

  it('reverts when aggregator address is zero address', async function () {
    const fixture = await loadFixture(setAssetOracleSetup);
    const { pool, governor, token } = fixture;

    await expect(pool.connect(governor).setAssetOracle(token, ZeroAddress, 0)).to.be.revertedWithCustomError(
      pool,
      'AggregatorMustNotBeZeroAddress',
    );
  });

  it('reverts if incompatible aggregator decimals are used for ETH', async function () {
    const fixture = await loadFixture(setAssetOracleSetup);
    const { pool, governor, token } = fixture;

    const ethWrongDecimalsAggregator = await ethers.deployContract('ChainlinkAggregatorMock');
    await ethWrongDecimalsAggregator.setLatestAnswer(parseEther('1'));
    await ethWrongDecimalsAggregator.setDecimals(8);

    await expect(
      pool.connect(governor).setAssetOracle(token, ethWrongDecimalsAggregator, 0),
    ).to.be.revertedWithCustomError(pool, 'IncompatibleAggregatorDecimals');
  });

  it('reverts if incompatible aggregator decimals are used for USD', async function () {
    const fixture = await loadFixture(setAssetOracleSetup);
    const { pool, governor, token, tokenAggregatorTwo } = fixture;

    await expect(pool.connect(governor).setAssetOracle(token, tokenAggregatorTwo, 1)).to.be.revertedWithCustomError(
      pool,
      'IncompatibleAggregatorDecimals',
    );
  });

  it("reverts if asset doesn't exists", async function () {
    const fixture = await loadFixture(setAssetOracleSetup);
    const { pool, governor, tokenAggregatorOne } = fixture;

    const tokenDecimals = 18;
    const token = await ethers.deployContract('ERC20Mock');
    await token.setMetadata('MockWSETH', 'wsETH', tokenDecimals);

    await expect(pool.connect(governor).setAssetOracle(token, tokenAggregatorOne, 0)).to.be.revertedWithCustomError(
      pool,
      'AssetNotFound',
    );
  });

  it('should add new aggregator for an asset', async function () {
    const fixture = await loadFixture(setAssetOracleSetup);
    const { pool, governor, token, tokenAggregatorTwo } = fixture;

    await pool.connect(governor).setAssetOracle(token, tokenAggregatorTwo, 0);
    const tokenAsset = await pool.getAsset(3);

    const tokenOracle = await pool.oracles(token);

    expect(tokenAsset.assetAddress).to.equal(token);
    expect(tokenAsset.isCoverAsset).to.equal(true);
    expect(tokenAsset.isAbandoned).to.equal(false);

    expect(tokenOracle.aggregator).to.equal(tokenAggregatorTwo);
    expect(tokenOracle.aggregatorType).to.equal(0);
    expect(tokenOracle.assetDecimals).to.equal(18);
  });
});

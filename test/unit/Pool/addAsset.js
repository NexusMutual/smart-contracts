const { artifacts, web3 } = require('hardhat');
const {
  constants: { ZERO_ADDRESS },
  ether,
  expectRevert,
} = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { hex } = require('../utils').helpers;
const {
  governanceContracts: [governance],
} = require('../utils').accounts;
const { BN } = web3.utils;

const PriceFeedOracle = artifacts.require('PriceFeedOracle');
const ChainlinkAggregatorMock = artifacts.require('ChainlinkAggregatorMock');

describe('addAsset', function () {
  it('reverts when not called by goverance', async function () {
    const { pool, otherAsset } = this;

    await expectRevert(
      pool.addAsset(otherAsset.address, 18, '0', '1', '0', false),
      'Caller is not authorized to govern',
    );
    await expectRevert(
      pool.addAsset(otherAsset.address, 18, '0', '1', '0', true),
      'Caller is not authorized to govern',
    );
  });

  it('reverts when asset address is zero address', async function () {
    const { pool } = this;

    await expectRevert(
      pool.addAsset(ZERO_ADDRESS, 18, '0', '1', '0', false, { from: governance }),
      'Pool: Asset is zero address',
    );

    await expectRevert(
      pool.addAsset(ZERO_ADDRESS, 18, '0', '1', '0', true, { from: governance }),
      'Pool: Asset is zero address',
    );
  });

  it('reverts when max < min', async function () {
    const { pool, otherAsset } = this;

    await expectRevert(
      pool.addAsset(otherAsset.address, 18, '1', '0', '0', true, { from: governance }),
      'Pool: max < min',
    );
    await expectRevert(
      pool.addAsset(otherAsset.address, 18, '1', '0', '0', false, { from: governance }),
      'Pool: max < min',
    );
  });

  it('reverts when max slippage ratio > 1', async function () {
    const { pool, otherAsset } = this;

    await expectRevert(
      pool.addAsset(otherAsset.address, 18, '0', '1', 10001 /* 100.01% */, false, { from: governance }),
      'Pool: Max slippage ratio > 1',
    );

    // should work with slippage rate = 1
    await pool.addAsset(otherAsset.address, 18, '0', '1', 10000 /* 100% */, false, { from: governance });
  });

  it('reverts when asset exists', async function () {
    const { pool, dai } = this;

    await expectRevert(
      pool.addAsset(dai.address, 18, '0', '1', '0', false, { from: governance }),
      'Pool: Asset exists',
    );
    await expectRevert(pool.addAsset(dai.address, 18, '0', '1', '0', true, { from: governance }), 'Pool: Asset exists');
  });

  it('should correctly add the asset with its min, max, and slippage ratio', async function () {
    const { pool, dai, stETH, chainlinkDAI, chainlinkSteth } = this;

    const ERC20Mock = artifacts.require('ERC20Mock');
    const token = await ERC20Mock.new();

    const chainlinkNewAsset = await ChainlinkAggregatorMock.new();
    await chainlinkNewAsset.setLatestAnswer(new BN((1e18).toString()));
    const priceFeedOracle = await PriceFeedOracle.new(
      [dai.address, stETH.address, token.address],
      [chainlinkDAI.address, chainlinkSteth.address, chainlinkNewAsset.address],
      [18, 18, 18],
    );

    await pool.updateAddressParameters(hex('PRC_FEED'), priceFeedOracle.address, { from: governance });

    await pool.addAsset(token.address, 18, '1', '2', '3', true, { from: governance });
    await token.mint(pool.address, ether('100'));

    const assetDetails = await pool.getAssetSwapDetails(token.address);
    const { minAmount, maxAmount, maxSlippageRatio } = assetDetails;

    assert.strictEqual(minAmount.toString(), '1');
    assert.strictEqual(maxAmount.toString(), '2');
    assert.strictEqual(maxSlippageRatio.toString(), '3');
  });

  it('should correctly add the asset to either investment or cover asset arrays', async function () {
    const { pool, dai, stETH, chainlinkDAI, chainlinkSteth } = this;

    const ERC20Mock = artifacts.require('ERC20Mock');

    const coverAsset = await ERC20Mock.new();
    const investmentAsset = await ERC20Mock.new();

    const chainlinkNewAsset = await ChainlinkAggregatorMock.new();
    await chainlinkNewAsset.setLatestAnswer(new BN((1e18).toString()));

    const priceFeedOracle = await PriceFeedOracle.new(
      [dai.address, stETH.address, coverAsset.address, investmentAsset.address],
      [chainlinkDAI.address, chainlinkSteth.address, chainlinkNewAsset.address, chainlinkNewAsset.address],
      [18, 18, 18, 18],
    );

    await pool.updateAddressParameters(hex('PRC_FEED'), priceFeedOracle.address, { from: governance });

    // Cover asset
    {
      const token = coverAsset;
      await pool.addAsset(token.address, 18, '1', '2', '3', true, { from: governance });
      const coverAssets = await pool.getCoverAssets();
      const investmentAssets = await pool.getInvestmentAssets();
      assert.strictEqual(coverAssets[coverAssets.length - 1].assetAddress, token.address);
      assert.strictEqual(coverAssets[coverAssets.length - 1].decimals, '18');
      const insertedInInvestmentAssets = !!investmentAssets.find(x => x.assetAddress === token.address);
      assert.strictEqual(insertedInInvestmentAssets, false);
    }

    // Investment asset
    {
      const token = investmentAsset;
      await pool.addAsset(token.address, 8, '4', '5', '6', false, { from: governance });
      const coverAssets = await pool.getCoverAssets();
      const investmentAssets = await pool.getInvestmentAssets();
      assert.strictEqual(investmentAssets[investmentAssets.length - 1].assetAddress, token.address);
      assert.strictEqual(investmentAssets[investmentAssets.length - 1].decimals, '8');
      const insertedInCoverAssets = !!coverAssets.find(x => x.assetAddress === token.address);
      assert.strictEqual(insertedInCoverAssets, false);
    }
  });
});

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

const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

describe('removeAsset', function () {
  it('reverts when not called by goverance', async function () {
    const { pool } = this;

    await expectRevert(pool.removeAsset(1, true), 'Caller is not authorized to govern');

    await expectRevert(pool.removeAsset(1, false), 'Caller is not authorized to govern');
  });

  it('reverts when asset does not exist', async function () {
    const { pool } = this;

    // Remove dai
    await pool.removeAsset(1, true, { from: governance });

    // Try to remove dai again (it should be deprecated)
    await expectRevert(pool.removeAsset(1, true, { from: governance }), 'Pool: Cover asset is deprecated');

    // Try to remove an unexisting investment asset
    await expectRevert(pool.removeAsset(1, false, { from: governance }), 'Pool: Investment asset does not exist');
  });

  it('should correctly remove the asset with its minAmount, maxAmount, and slippage ratio', async function () {
    const { pool, dai, stETH, chainlinkDAI, chainlinkSteth } = this;

    const ERC20Mock = artifacts.require('ERC20Mock');
    const ChainlinkAggregatorMock = artifacts.require('ChainlinkAggregatorMock');
    const PriceFeedOracle = artifacts.require('PriceFeedOracle');

    const coverToken = await ERC20Mock.new();
    const investmentToken = await ERC20Mock.new();

    const chainlinkNewAsset = await ChainlinkAggregatorMock.new();
    await chainlinkNewAsset.setLatestAnswer(new BN((1e18).toString()));

    const priceFeedOracle = await PriceFeedOracle.new(
      [dai.address, stETH.address, coverToken.address, investmentToken.address],
      [chainlinkDAI.address, chainlinkSteth.address, chainlinkNewAsset.address, chainlinkNewAsset.address],
      [18, 18, 18, 18],
    );

    await pool.updateAddressParameters(hex('PRC_FEED'), priceFeedOracle.address, { from: governance });

    {
      // add token as cover asset
      await pool.addAsset(coverToken.address, 18, '1', '2', '3', true, { from: governance });
      await coverToken.mint(pool.address, ether('100'));

      const expectedCoverAssets = [ETH, dai.address, coverToken.address];
      const coverAssets = await pool.getCoverAssets();
      assert.deepEqual(
        coverAssets.map(x => x.assetAddress),
        expectedCoverAssets,
        'Unexpected assets found',
      );
    }

    {
      // add token as investment asset
      await pool.addAsset(investmentToken.address, 18, '1', '2', '3', false, { from: governance });

      const expectedInvestmentAssets = [stETH.address, investmentToken.address];
      const investmentAssets = await pool.getInvestmentAssets();
      assert.deepEqual(
        investmentAssets.map(x => x.assetAddress),
        expectedInvestmentAssets,
        'Unexpected assets found',
      );
    }

    {
      // remove DAI

      {
        const deprecatedCoverAssetsBitmap = await pool.deprecatedCoverAssetsBitmap();
        assert.equal(deprecatedCoverAssetsBitmap.toNumber(), 0);
      }

      await pool.removeAsset(1, true, { from: governance });

      const assetDetails = await pool.getAssetSwapDetails(dai.address);
      const { minAmount, maxAmount, maxSlippageRatio, lastSwapTime } = assetDetails;

      assert.strictEqual(minAmount.toString(), '0');
      assert.strictEqual(maxAmount.toString(), '0');
      assert.strictEqual(maxSlippageRatio.toString(), '0');
      assert.strictEqual(lastSwapTime.toString(), '0');

      const expectedCoverAssets = [ETH, dai.address, coverToken.address];
      const coverAssets = await pool.getCoverAssets();
      assert.deepEqual(
        coverAssets.map(x => x.assetAddress),
        expectedCoverAssets,
        'Unexpected assets found',
      );

      {
        const deprecatedCoverAssetsBitmap = await pool.deprecatedCoverAssetsBitmap();
        assert.equal(deprecatedCoverAssetsBitmap.toNumber(), 0b10);
      }

      const expectedInvestmentAssets = [stETH.address, investmentToken.address];
      const investmentAssets = await pool.getInvestmentAssets();
      assert.deepEqual(
        investmentAssets.map(x => x.assetAddress),
        expectedInvestmentAssets,
        'Unexpected assets found',
      );
    }

    {
      // check that cover token swap details were unaffected by dai removal
      const assetDetails = await pool.getAssetSwapDetails(coverToken.address);
      const { minAmount, maxAmount, maxSlippageRatio, lastSwapTime } = assetDetails;

      assert.strictEqual(minAmount.toString(), '1');
      assert.strictEqual(maxAmount.toString(), '2');
      assert.strictEqual(maxSlippageRatio.toString(), '3');
      assert.strictEqual(lastSwapTime.toString(), '0');
    }

    {
      // remove investment token
      await pool.removeAsset(1, false, { from: governance });

      const assetDetails = await pool.getAssetSwapDetails(investmentToken.address);
      const { minAmount, maxAmount, maxSlippageRatio, lastSwapTime } = assetDetails;

      assert.strictEqual(minAmount.toString(), '0');
      assert.strictEqual(maxAmount.toString(), '0');
      assert.strictEqual(maxSlippageRatio.toString(), '0');
      assert.strictEqual(lastSwapTime.toString(), '0');

      const expectedInvestmentAssets = [stETH.address];
      const investmentAssets = await pool.getInvestmentAssets();
      assert.deepEqual(
        investmentAssets.map(x => x.assetAddress),
        expectedInvestmentAssets,
        'Unexpected assets found',
      );
    }

    {
      // check that stETH was not affected by the investment token removal
      const assetDetails = await pool.getAssetSwapDetails(stETH.address);
      const { minAmount, maxAmount, maxSlippageRatio, lastSwapTime } = assetDetails;

      assert.strictEqual(minAmount.toString(), ether('24360').toString());
      assert.strictEqual(maxAmount.toString(), ether('32500').toString());
      assert.strictEqual(maxSlippageRatio.toString(), '0');
      assert.strictEqual(lastSwapTime.toString(), '1633425218');

      const expectedInvestmentAssets = [stETH.address];
      const investmentAssets = await pool.getInvestmentAssets();
      assert.deepEqual(
        investmentAssets.map(x => x.assetAddress),
        expectedInvestmentAssets,
        'Unexpected assets found',
      );
    }
  });
});

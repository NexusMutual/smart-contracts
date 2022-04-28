const { artifacts } = require('hardhat');
const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const {
  governanceContracts: [governance],
} = require('../utils').accounts;

const assetId = 255;
const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

describe('deprecateAsset', function () {
  it('reverts when not called by goverance', async function () {
    const { pool } = this;

    await expectRevert(pool.deprecateAsset(assetId), 'Caller is not authorized to govern');
  });

  it('reverts when asset does not exist', async function () {
    const { pool } = this;

    await expectRevert(pool.deprecateAsset(assetId, { from: governance }), 'Pool: Asset does not exist');
  });

  it('should correctly add the asset with its min, max, and slippage ratio', async function () {
    const { pool, dai } = this;

    const ERC20Mock = artifacts.require('ERC20Mock');
    const token = await ERC20Mock.new();

    const { assetAddresses: existingAssetAddresses, deprecated: existingAssetsDeprecated } = await pool.getAssets();

    {
      // add token as asset
      await pool.addAsset(token.address, 18, '1', '2', '3', { from: governance });
      await token.mint(pool.address, ether('100'));

      const expectedAssetAddresses = [...existingAssetAddresses, token.address];
      const expectedDeprecatedAssets = [...existingAssetsDeprecated, false];
      const { assetAddresses, deprecated } = await pool.getAssets();
      assert.deepEqual(assetAddresses, expectedAssetAddresses, 'Unexpected asset addresses found');
      assert.deepEqual(deprecated, expectedDeprecatedAssets, 'Unexpected deprecated assets found');
    }

    {
      // deprecate DAI
      await pool.deprecateAsset(1, { from: governance });

      const swapDetails = await pool.getAssetSwapDetails(dai.address);
      const { minAmount, maxAmount, maxSlippageRatio, lastSwapTime } = swapDetails;

      assert.strictEqual(minAmount.toString(), '0');
      assert.strictEqual(maxAmount.toString(), '0');
      assert.strictEqual(maxSlippageRatio.toString(), '0');
      assert.strictEqual(lastSwapTime.toString(), '0');

      const expectedAssetAddresses = [...existingAssetAddresses, token.address];
      const expectedDeprecatedAssets = expectedAssetAddresses.map(asset => asset === dai.address);
      const { assetAddresses, deprecated } = await pool.getAssets();
      assert.deepEqual(assetAddresses, expectedAssetAddresses, 'Unexpected assets found');
      assert.deepEqual(deprecated, expectedDeprecatedAssets, 'Unexpected deprecated assets found');
    }

    {
      // check that token was unaffected by dai removal
      const swapDetails = await pool.getAssetSwapDetails(token.address);
      const { minAmount, maxAmount, maxSlippageRatio, lastSwapTime } = swapDetails;

      assert.strictEqual(minAmount.toString(), '1');
      assert.strictEqual(maxAmount.toString(), '2');
      assert.strictEqual(maxSlippageRatio.toString(), '3');
      assert.strictEqual(lastSwapTime.toString(), '0');
    }
    {
      // deprecate token as asset
      await pool.deprecateAsset(existingAssetAddresses.length, { from: governance });

      const swapDetails = await pool.getAssetSwapDetails(token.address);
      const { minAmount, maxAmount, maxSlippageRatio, lastSwapTime } = swapDetails;

      assert.strictEqual(minAmount.toString(), '0');
      assert.strictEqual(maxAmount.toString(), '0');
      assert.strictEqual(maxSlippageRatio.toString(), '0');
      assert.strictEqual(lastSwapTime.toString(), '0');

      const expectedAssetAddresses = [...existingAssetAddresses, token.address];
      const expectedDeprecatedAssets = expectedAssetAddresses.map(asset => [dai.address, token.address].includes(asset));
      const { assetAddresses, deprecated } = await pool.getAssets();
      assert.deepEqual(assetAddresses, expectedAssetAddresses, 'Unexpected assets found');
      assert.deepEqual(deprecated, expectedDeprecatedAssets, 'Unexpected deprecated assets found');
    }
  });
});

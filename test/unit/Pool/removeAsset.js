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

    await expectRevert(pool.deprecateAsset(assetId, { from: governance }), 'Pool: Asset not found');
  });

  it('should correctly add the asset with its min, max, and slippage ratio', async function () {
    const { pool, dai } = this;

    const ERC20Mock = artifacts.require('ERC20Mock');
    const token = await ERC20Mock.new();

    {
      // add token as asset
      await pool.addAsset(token.address, '1', '2', '3', { from: governance });
      await token.mint(pool.address, ether('100'));

      const expectedAssets = [ETH, dai.address, token.address];
      const [actualAssets] = await pool.getAssets();
      assert.deepEqual(actualAssets, expectedAssets, 'Unexpected assets found');
    }

    {
      // remove DAI
      await pool.deprecateAsset(1, { from: governance });

      const assetDetails = await pool.getAssetSwapDetails(dai.address);
      const { min, max, maxSlippageRatio, lastAssetSwapTime } = assetDetails;

      assert.strictEqual(min.toString(), '0');
      assert.strictEqual(max.toString(), '0');
      assert.strictEqual(maxSlippageRatio.toString(), '0');
      assert.strictEqual(lastAssetSwapTime.toString(), '0');

      const expectedAssets = [ETH, token.address];
      const [actualAssets] = await pool.getAssets();
      assert.deepEqual(actualAssets, expectedAssets, 'Unexpected assets found');
    }

    {
      // check that token was unaffected by dai removal
      const assetDetails = await pool.getAssetSwapDetails(token.address);
      const { min, max, maxSlippageRatio, lastAssetSwapTime } = assetDetails;

      assert.strictEqual(min.toString(), '1');
      assert.strictEqual(max.toString(), '2');
      assert.strictEqual(maxSlippageRatio.toString(), '3');
      assert.strictEqual(lastAssetSwapTime.toString(), '0');

      const expectedAssets = [ETH, token.address];
      const [actualAssets] = await pool.getAssets();
      assert.deepEqual(actualAssets, expectedAssets, 'Unexpected assets found');
    }

    {
      // remove token as asset
      await pool.deprecateAsset(1, { from: governance });

      const assetDetails = await pool.getAssetSwapDetails(token.address);
      const { min, max, maxSlippageRatio, lastAssetSwapTime } = assetDetails;

      assert.strictEqual(min.toString(), '0');
      assert.strictEqual(max.toString(), '0');
      assert.strictEqual(maxSlippageRatio.toString(), '0');
      assert.strictEqual(lastAssetSwapTime.toString(), '0');

      const expectedAssets = [ETH];
      const [actualAssets] = await pool.getAssets();
      assert.deepEqual(actualAssets, expectedAssets, 'Unexpected assets found');
    }
  });
});

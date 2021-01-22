const { artifacts } = require('hardhat');
const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const { governanceContracts: [governance] } = require('../utils').accounts;

const assetAddress = '0xC0FfEec0ffeeC0FfEec0fFEec0FfeEc0fFEe0000';

describe('removeAsset', function () {

  it('reverts when not called by goverance', async function () {
    const { pool } = this;

    await expectRevert(
      pool.removeAsset(assetAddress),
      'Caller is not authorized to govern',
    );
  });

  it('reverts when asset does not exist', async function () {
    const { pool } = this;

    await expectRevert(
      pool.removeAsset(assetAddress, { from: governance }),
      'Pool: asset not found',
    );
  });

  it('should add correctly the asset with its min, max, and slippage ratio', async function () {
    const { pool, dai } = this;

    const ERC20Mock = artifacts.require('ERC20Mock');
    const token = await ERC20Mock.new();

    {
      // add token as asset
      await pool.addAsset(token.address, '1', '2', '3', { from: governance });
      await token.mint(pool.address, ether('100'));

      const expectedAssets = [dai.address, token.address];
      const actualAssets = await pool.getAssets();
      assert.deepEqual(actualAssets, expectedAssets, 'Unexpected assets found');
    }

    {
      // remove DAI
      await pool.removeAsset(dai.address, { from: governance });

      const assetDetails = await pool.getAssetDetails(dai.address);
      const { balance, min, max, maxSlippageRatio, lastAssetSwapTime } = assetDetails;

      const expectedBalance = await dai.balanceOf(pool.address);
      assert.strictEqual(balance.toString(), expectedBalance.toString());

      assert.strictEqual(min.toString(), '0');
      assert.strictEqual(max.toString(), '0');
      assert.strictEqual(maxSlippageRatio.toString(), '0');
      assert.strictEqual(lastAssetSwapTime.toString(), '0');

      const expectedAssets = [token.address];
      const actualAssets = await pool.getAssets();
      assert.deepEqual(actualAssets, expectedAssets, 'Unexpected assets found');
    }

    {
      // check that token was unaffected by dai removal
      const assetDetails = await pool.getAssetDetails(token.address);
      const { balance, min, max, maxSlippageRatio, lastAssetSwapTime } = assetDetails;

      const expectedBalance = await token.balanceOf(pool.address);
      assert.strictEqual(balance.toString(), expectedBalance.toString());

      assert.strictEqual(min.toString(), '1');
      assert.strictEqual(max.toString(), '2');
      assert.strictEqual(maxSlippageRatio.toString(), '3');
      assert.strictEqual(lastAssetSwapTime.toString(), '0');

      const expectedAssets = [token.address];
      const actualAssets = await pool.getAssets();
      assert.deepEqual(actualAssets, expectedAssets, 'Unexpected assets found');
    }

    {
      // remove token as asset
      await pool.removeAsset(token.address, { from: governance });

      const assetDetails = await pool.getAssetDetails(token.address);
      const { balance, min, max, maxSlippageRatio, lastAssetSwapTime } = assetDetails;

      const expectedBalance = await token.balanceOf(pool.address);
      assert.strictEqual(balance.toString(), expectedBalance.toString());

      assert.strictEqual(min.toString(), '0');
      assert.strictEqual(max.toString(), '0');
      assert.strictEqual(maxSlippageRatio.toString(), '0');
      assert.strictEqual(lastAssetSwapTime.toString(), '0');

      const expectedAssets = [];
      const actualAssets = await pool.getAssets();
      assert.deepEqual(actualAssets, expectedAssets, 'Unexpected assets found');
    }

  });

});

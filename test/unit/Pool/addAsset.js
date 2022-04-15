const { artifacts } = require('hardhat');
const {
  constants: { ZERO_ADDRESS },
  ether,
  expectRevert,
} = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const {
  governanceContracts: [governance],
} = require('../utils').accounts;

const assetAddress = '0xC0FfEec0ffeeC0FfEec0fFEec0FfeEc0fFEe0000';

describe('addAsset', function () {
  it('reverts when not called by goverance', async function () {
    const { pool } = this;

    await expectRevert(pool.addAsset(assetAddress, 18, '0', '1', '0', false), 'Caller is not authorized to govern');
    await expectRevert(pool.addAsset(assetAddress, 18, '0', '1', '0', true), 'Caller is not authorized to govern');
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
    const { pool } = this;

    await expectRevert(pool.addAsset(assetAddress, 18, '1', '0', '0', true, { from: governance }), 'Pool: max < min');
    await expectRevert(pool.addAsset(assetAddress, 18, '1', '0', '0', false, { from: governance }), 'Pool: max < min');
  });

  it('reverts when max slippage ratio > 1', async function () {
    const { pool } = this;

    await expectRevert(
      pool.addAsset(assetAddress, 18, '0', '1', 10001 /* 100.01% */, false, { from: governance }),
      'Pool: Max slippage ratio > 1',
    );

    // should work with slippage rate = 1
    await pool.addAsset(assetAddress, 18, '0', '1', 10000 /* 100% */, false, { from: governance });
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
    const { pool } = this;

    const ERC20Mock = artifacts.require('ERC20Mock');
    const token = await ERC20Mock.new();

    await pool.addAsset(token.address, 18, '1', '2', '3', true, { from: governance });
    await token.mint(pool.address, ether('100'));

    const assetDetails = await pool.getAssetSwapDetails(token.address);
    const { min, max, maxSlippageRatio } = assetDetails;

    assert.strictEqual(min.toString(), '1');
    assert.strictEqual(max.toString(), '2');
    assert.strictEqual(maxSlippageRatio.toString(), '3');
  });

  it('should correctly add the asset to either investment or cover asset arrays', async function () {
    const { pool } = this;

    const ERC20Mock = artifacts.require('ERC20Mock');

    // Cover asset
    {
      const token = await ERC20Mock.new();
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
      const token = await ERC20Mock.new();
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

const { ether } = require('@openzeppelin/test-helpers');
const { expectRevert } = require('@openzeppelin/test-helpers');
const { web3 } = require('hardhat');
const { assert } = require('chai');

const { governanceContracts: [governance], generalPurpose: [arbitraryCaller] } = require('../utils').accounts;

const ERC20Mock = artifacts.require('ERC20Mock');

describe('setAssetDataLastSwapTime', function () {

  it('set last swap time for asset', async function () {
    const { pool, swapOperator } = this;

    const tokenAmount = ether('100000');
    const otherToken = await ERC20Mock.new();
    await pool.addAsset(otherToken.address, '0', '0', ether('0.01'), {
      from: governance,
    });
    await otherToken.mint(pool.address, tokenAmount);

    const lastSwapTime = '11512651';

    await pool.setAssetDataLastSwapTime(
      otherToken.address, lastSwapTime,
      { from: swapOperator },
    );

    const assetData = await pool.assetData(otherToken.address);
    assert.equal(assetData.lastSwapTime.toString(), lastSwapTime);
  });

  it('revers if not called by swap operator', async function () {
    const { pool } = this;

    const tokenAmount = ether('100000');
    const otherToken = await ERC20Mock.new();
    await pool.addAsset(otherToken.address, '0', '0', ether('0.01'), {
      from: governance,
    });
    await otherToken.mint(pool.address, tokenAmount);

    const lastSwapTime = '11512651';

    await expectRevert(
      pool.setAssetDataLastSwapTime(
        otherToken.address, lastSwapTime,
        { from: arbitraryCaller },
      ),
      'Pool: not swapOperator',
    );
  });
});

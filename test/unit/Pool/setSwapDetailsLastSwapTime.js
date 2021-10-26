const { ether } = require('@openzeppelin/test-helpers');
const { expectRevert } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const {
  governanceContracts: [governance],
  generalPurpose: [arbitraryCaller],
} = require('../utils').accounts;

const ERC20Mock = artifacts.require('ERC20Mock');

describe('setSwapDetailsLastSwapTime', function () {
  it('set last swap time for asset', async function () {
    const { pool, swapOperator } = this;

    const tokenAmount = ether('100000');
    const otherToken = await ERC20Mock.new();
    await pool.addAsset(otherToken.address, 18, '0', '0', 100, {
      from: governance,
    });
    await otherToken.mint(pool.address, tokenAmount);

    const lastSwapTime = '11512651';

    await pool.setSwapDetailsLastSwapTime(otherToken.address, lastSwapTime, { from: swapOperator });

    const swapDetails = await pool.swapDetails(otherToken.address);
    assert.equal(swapDetails.lastSwapTime.toString(), lastSwapTime);
  });

  it('revers if not called by swap operator', async function () {
    const { pool } = this;

    const tokenAmount = ether('100000');
    const otherToken = await ERC20Mock.new();
    await pool.addAsset(otherToken.address, 18, '0', '0', 100, {
      from: governance,
    });
    await otherToken.mint(pool.address, tokenAmount);

    const lastSwapTime = '11512651';

    await expectRevert(
      pool.setSwapDetailsLastSwapTime(otherToken.address, lastSwapTime, { from: arbitraryCaller }),
      'Pool: Not swapOperator',
    );
  });
});

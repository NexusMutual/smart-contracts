const { ether } = require('@openzeppelin/test-helpers');
const { expectRevert } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const {
  governanceContracts: [governance],
  generalPurpose: [arbitraryCaller],
} = require('../utils').accounts;

const ERC20Mock = artifacts.require('ERC20Mock');

describe('transferAssetToSwapOperator', function () {
  it('transfers added ERC20 asset to swap operator', async function () {
    const { pool, swapOperator } = this;

    const tokenAmount = ether('100000');
    const otherToken = await ERC20Mock.new();
    await pool.addAsset(otherToken.address, 18, '0', '0', 100 /* 1% */, {
      from: governance,
    });
    await otherToken.mint(pool.address, tokenAmount);

    const amountToTransfer = tokenAmount.divn(2);

    await pool.transferAssetToSwapOperator(otherToken.address, amountToTransfer, { from: swapOperator });
    const destinationBalance = await otherToken.balanceOf(swapOperator);
    assert.equal(destinationBalance.toString(), amountToTransfer.toString());

    const poolBalance = await otherToken.balanceOf(pool.address);
    assert.equal(poolBalance.toString(), tokenAmount.sub(amountToTransfer).toString());
  });

  it('revers if not called by swap operator', async function () {
    const { pool } = this;

    const tokenAmount = ether('100000');
    const otherToken = await ERC20Mock.new();
    await pool.addAsset(otherToken.address, 18, '0', '0', 100 /* 1% */, {
      from: governance,
    });
    await otherToken.mint(pool.address, tokenAmount);

    const amountToTransfer = tokenAmount.divn(2);

    await expectRevert(
      pool.transferAssetToSwapOperator(otherToken.address, amountToTransfer, { from: arbitraryCaller }),
      'Pool: Not swapOperator',
    );
  });
});

const { ether } = require('@openzeppelin/test-helpers');
const { expectRevert } = require('@openzeppelin/test-helpers');
const { ethers } = require('hardhat');
const { assert, expect } = require('chai');
const { setEtherBalance } = require('../../utils/evm');
const { utils: { parseEther } } = ethers;

const {
  governanceContracts: [governance],
  generalPurpose: [arbitraryCaller],
} = require('../utils').accounts;

const { ETH } = require('../../../lib/constants').Assets;

const ERC20Mock = artifacts.require('ERC20Mock');

describe.only('transferAssetToSwapOperator', function () {
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

  describe('setting swapValue', function () {
    it('works when transfering eth', async function () {
      const { pool, swapOperator } = this;
      await setEtherBalance(pool.address, 123);
      await pool.transferAssetToSwapOperator(ETH, 123, { from: swapOperator });

      expect((await pool.swapValue()).toString()).to.eq('123');
    });

    it('works when transfering ERC20', async function () {
      const { pool, swapOperator, dai, chainlinkDAI } = this;

      await chainlinkDAI.setLatestAnswer(0.001 * 1e18); // 1 dai = 0.001 eth, 1 eth = 1000 dai
      await dai.setBalance(pool.address, parseEther('1000'));

      // Transfer 1000 dai to swap operator, swapValue should be 1 eth
      await pool.transferAssetToSwapOperator(dai.address, parseEther('1000'), { from: swapOperator });

      expect((await pool.swapValue()).toString()).to.eq(parseEther('1'));
    });
  });
});

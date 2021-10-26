const { ether } = require('@openzeppelin/test-helpers');
const { ZERO_ADDRESS } = require('@openzeppelin/test-helpers').constants;
const { web3 } = require('hardhat');
const { assert } = require('chai');

const {
  defaultSender,
  governanceContracts: [governance],
} = require('../utils').accounts;

const Pool = artifacts.require('Pool');
const ERC20Mock = artifacts.require('ERC20Mock');

describe('upgradeCapitalPool', function () {
  it('moves pool funds to new pool', async function () {
    const { pool, master, dai } = this;

    const ethAmount = ether('10000');
    const tokenAmount = ether('100000');
    await pool.sendTransaction({ value: ethAmount });

    const otherToken = await ERC20Mock.new();

    await pool.addAsset([otherToken.address, 18], '0', '0', ether('0.01'), {
      from: governance,
    });
    const tokens = [dai, otherToken];
    for (const token of tokens) {
      await token.mint(pool.address, tokenAmount);
    }

    const newPool = await Pool.new(
      tokens.map(a => a.address), // assets
      tokens.map(a => 0), // min
      tokens.map(a => 0), // max
      tokens.map(a => ether('0.01')), // maxSlippage 1%
      defaultSender,
      ZERO_ADDRESS,
      ZERO_ADDRESS, // we do not test swaps here
    );

    await master.upgradeCapitalPool(pool.address, newPool.address);

    for (const token of tokens) {
      const oldPoolBalance = await token.balanceOf(pool.address);
      const newPoolBalance = await token.balanceOf(newPool.address);
      assert.equal(oldPoolBalance.toString(), '0');
      assert.equal(newPoolBalance.toString(), tokenAmount.toString());
    }

    const oldPoolBalance = await web3.eth.getBalance(pool.address);
    const newPoolBalance = await web3.eth.getBalance(newPool.address);
    assert.equal(oldPoolBalance.toString(), '0');
    assert.equal(newPoolBalance.toString(), ethAmount.toString());
  });
});

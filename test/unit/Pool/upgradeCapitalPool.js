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

describe.only('upgradeCapitalPool', function () {
  it('moves pool funds to new pool', async function () {
    const { pool, master, dai, stETH } = this;

    const ethAmount = ether('10000');
    const tokenAmount = ether('100000');
    await pool.sendTransaction({ value: ethAmount });

    const coverToken = await ERC20Mock.new();

    await pool.addAsset(coverToken.address, 18, '0', '0', 100, true, {
      from: governance,
    });
    const tokens = [dai, coverToken];
    for (const token of tokens) {
      await token.mint(pool.address, tokenAmount);
    }

    const newPool = await Pool.new(
      defaultSender,
      ZERO_ADDRESS,
      ZERO_ADDRESS, // we do not test swaps here
      dai.address,
      stETH.address,
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

  it.only('abandons marked assets on pool upgrade', async function () {
    const { pool, master, dai, stETH } = this;

    const ethAmount = ether('10000');
    const tokenAmount = ether('100000');
    await pool.sendTransaction({ value: ethAmount });

    const coverToken = await ERC20Mock.new();

    await pool.addAsset(coverToken.address, 18, '0', '0', 100, true, {
      from: governance,
    });
    const tokens = [dai, coverToken];
    for (const token of tokens) {
      await token.mint(pool.address, tokenAmount);
    }

    const newPool = await Pool.new(
      defaultSender,
      ZERO_ADDRESS,
      ZERO_ADDRESS, // we do not test swaps here
      dai.address,
      stETH.address,
    );

    await stETH.blacklistSender(pool.address);

    // [todo]  Expect revert
    await master.upgradeCapitalPool(pool.address, newPool.address);

    await pool.setAssetsToAbandon([stETH.address], true, {
      from: governance,
    });

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

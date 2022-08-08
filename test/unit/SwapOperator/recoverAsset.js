const { accounts, artifacts } = require('hardhat');
const { ether } = require('@openzeppelin/test-helpers');

const [, governance, receiver] = accounts;
const contracts = require('./setup').contracts;

const ERC20Mock = artifacts.require('ERC20Mock');

describe('recoverAsset', function () {

  it('recovers enzyme vault shares', async function () {

    const { swapOperator, enzymeV4Vault, pool } = contracts();

    await pool.setAssetDetails(
      enzymeV4Vault.address,
      ether('100'), // asset minimum
      ether('1000'), // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    const amountInPool = ether('2000');
    enzymeV4Vault.mint(pool.address, amountInPool);

    const amountInSwapOperator = ether('10');
    await enzymeV4Vault.mint(swapOperator.address, amountInSwapOperator);

    await swapOperator.recoverAsset(enzymeV4Vault.address, receiver);

    const balanceAfter = await enzymeV4Vault.balanceOf(pool.address);

    assert.equal(balanceAfter.sub(amountInPool).toString(), amountInSwapOperator);
  });

  it('recovers arbitrary unknown asset', async function () {

    const { swapOperator } = contracts();

    const arbitraryAsset = await ERC20Mock.new();

    const amountInSwapOperator = ether('10');
    await arbitraryAsset.mint(swapOperator.address, amountInSwapOperator);

    await swapOperator.recoverAsset(arbitraryAsset.address, receiver);

    const balanceAfter = await arbitraryAsset.balanceOf(receiver);

    assert.equal(balanceAfter.toString(), amountInSwapOperator.toString());
  });
});

const { ethers } = require('hardhat');
const { expect } = require('chai');
const { BigNumber } = require('ethers');
const { ETH } = require('../../../lib/constants').Assets;
const { hex } = require('../utils').helpers;
const { mineNextBlock, increaseTime } = require('../../utils/evm');
const {
  utils: { parseEther },
} = ethers;

describe('swapETHForEnzymeVaultShare', function () {
  it('should revert when called while the system is paused', async function () {
    const { master, swapOperator, enzymeV4Vault, pool } = this.contracts;

    const governance = this.accounts.governanceAccounts[0];

    await pool.connect(governance).addAsset(
      enzymeV4Vault.address,
      18, // decimals
      parseEther('100'), // asset minimum
      parseEther('1000'), // asset maximum
      '100', // 1% max slippage
      false, // isCoverAsset
    );

    await master.pause();

    await expect(swapOperator.swapETHForEnzymeVaultShare('0', '0')).to.be.revertedWith('System is paused');
  });

  it('should revert when called by an address that is not swap controller', async function () {
    const { swapOperator } = this.contracts;

    const nobody = this.accounts.nonMembers[0];

    await expect(swapOperator.connect(nobody).swapETHForEnzymeVaultShare('0', '0')).to.be.revertedWith(
      'SwapOp: only controller can execute',
    );
  });

  it('should revert when asset is not enabled', async function () {
    const { pool, swapOperator, enzymeV4Vault } = this.contracts;

    const governance = this.accounts.governanceAccounts[0];

    await pool.connect(governance).addAsset(
      enzymeV4Vault.address,
      18, // decimals
      parseEther('0'), // asset minimum
      parseEther('0'), // asset maximum
      '100', // 1% max slippage
      false, // isCoverAsset
    );
    const etherIn = parseEther('1');

    await expect(swapOperator.swapETHForEnzymeVaultShare(etherIn, '0')).to.be.revertedWith(
      'SwapOp: asset is not enabled',
    );
  });

  it('should revert if ether left in pool is less than minPoolEth', async function () {
    const { pool, swapOperator, enzymeV4Vault } = this.contracts;

    const governance = this.accounts.governanceAccounts[0];

    await pool.connect(governance).addAsset(
      enzymeV4Vault.address,
      18, // decimals
      parseEther('100'), // asset minimum
      parseEther('1000'), // asset maximum
      '500', // 1% max slippage
      false, // isCoverAsset
    );

    const currentEther = parseEther('10000');
    // add ether to pool
    await this.accounts.defaultSender.sendTransaction({
      to: pool.address,
      value: parseEther('10000'),
    });

    // allow to send max 1 ether out of pool
    const maxPoolTradableEther = parseEther('1');
    const minEther = currentEther.sub(maxPoolTradableEther);

    await pool.connect(governance).updateUintParameters(hex('MIN_ETH'.padEnd(8, '\0')), minEther);

    // should fail with max + 1
    await expect(
      swapOperator.swapETHForEnzymeVaultShare(maxPoolTradableEther.add(1), maxPoolTradableEther),
    ).to.be.revertedWith('SwapOp: insufficient ether left');

    // should work with max
    await swapOperator.swapETHForEnzymeVaultShare(maxPoolTradableEther, maxPoolTradableEther);
  });

  it('should revert if amountIn > pool balance', async function () {
    const { pool, swapOperator, enzymeV4Vault } = this.contracts;

    const governance = this.accounts.governanceAccounts[0];

    await pool.connect(governance).addAsset(
      enzymeV4Vault.address,
      18, // decimals
      parseEther('100'), // asset minimum
      parseEther('1000'), // asset maximum
      '100', // 1% max slippage
      false, // isCoverAsset
    );

    const currentEther = parseEther('10000');
    // add ether to pool
    await this.accounts.defaultSender.sendTransaction({
      to: pool.address,
      value: parseEther('10000'),
    });
    await expect(swapOperator.swapETHForEnzymeVaultShare(currentEther.add(1), currentEther)).to.be.revertedWith(
      'Pool: ETH transfer failed',
    );
  });

  it('should revert if Enzyme does not sent enough shares back', async function () {
    const { pool, swapOperator, enzymeV4Vault, enzymeV4Comptroller } = this.contracts;

    const governance = this.accounts.governanceAccounts[0];

    await pool.connect(governance).addAsset(
      enzymeV4Vault.address,
      18, // decimals
      parseEther('100'), // asset minimum
      parseEther('1000'), // asset maximum
      '100', // 1% max slippage
      false, // isCoverAsset
    );

    // add ether to pool
    await this.accounts.defaultSender.sendTransaction({
      to: pool.address,
      value: parseEther('10000'),
    });

    const amountIn = parseEther('1000');

    // enzyme lowers the rate.
    await enzymeV4Comptroller.setETHToVaultSharesRate('500');
    await expect(swapOperator.swapETHForEnzymeVaultShare(amountIn, amountIn)).to.be.revertedWith(
      'SwapOp: amountOut < amountOutMin',
    );
  });

  it('should revert if balanceAfter > max', async function () {
    const { pool, swapOperator, enzymeV4Vault } = this.contracts;

    const governance = this.accounts.governanceAccounts[0];

    const max = parseEther('1000');
    await pool.connect(governance).addAsset(
      enzymeV4Vault.address,
      18, // decimals
      parseEther('100'), // asset minimum
      max, // asset maximum
      '100', // 1% max slippage
      false, // isCoverAsset
    );

    // add ether to pool
    await this.accounts.defaultSender.sendTransaction({
      to: pool.address,
      value: parseEther('10000'),
    });

    const etherIn = max.add(10001);
    await expect(swapOperator.swapETHForEnzymeVaultShare(etherIn, etherIn)).to.be.revertedWith(
      'SwapOp: balanceAfter > max',
    );
  });

  it('should swap asset for eth and emit a Swapped event with correct values', async function () {
    const { pool, swapOperator, enzymeV4Vault } = this.contracts;

    const governance = this.accounts.governanceAccounts[0];

    const max = parseEther('1000');
    await pool.connect(governance).addAsset(
      enzymeV4Vault.address,
      18, // decimals
      parseEther('100'), // asset minimum
      max, // asset maximum
      '100', // 1% max slippage
      false, // isCoverAsset
    );

    // add ether to pool
    await this.accounts.defaultSender.sendTransaction({
      to: pool.address,
      value: parseEther('10000'),
    });

    const etherBefore = await ethers.provider.getBalance(pool.address);
    const tokensBefore = await enzymeV4Vault.balanceOf(pool.address);

    // amounts in/out of the trade
    const etherIn = parseEther('100');
    const minTokenOut = etherIn.sub(1);
    const swapTx = await swapOperator.swapETHForEnzymeVaultShare(etherIn, etherIn);

    const etherAfter = await ethers.provider.getBalance(pool.address);
    const tokensAfter = await enzymeV4Vault.balanceOf(pool.address);
    const etherSent = etherBefore.sub(etherAfter);
    const tokensReceived = tokensAfter.sub(tokensBefore);

    assert.strictEqual(etherSent.toString(), etherIn.toString());
    assert(tokensReceived.gte(minTokenOut), 'tokensReceived < minTokenOut');

    await expect(swapTx).to.emit(swapOperator, 'Swapped').withArgs(ETH, enzymeV4Vault.address, etherIn, tokensReceived);
  });

  it('should swap asset for eth for a dust amount of wei equal to the precision error tolerance', async function () {
    const { pool, swapOperator, enzymeV4Vault } = this.contracts;

    const governance = this.accounts.governanceAccounts[0];

    const max = parseEther('1000');
    await pool.connect(governance).addAsset(
      enzymeV4Vault.address,
      18, // decimals
      parseEther('100'), // asset minimum
      max, // asset maximum
      '100', // 1% max slippage
      false, // isCoverAsset
    );

    // add ether to pool
    await this.accounts.defaultSender.sendTransaction({
      to: pool.address,
      value: parseEther('10000'),
    });

    const etherBefore = await ethers.provider.getBalance(pool.address);
    const tokensBefore = await enzymeV4Vault.balanceOf(pool.address);

    // amounts in/out of the trade
    const etherIn = BigNumber.from(10000);
    const minTokenOut = etherIn.sub(1);
    await swapOperator.swapETHForEnzymeVaultShare(etherIn, etherIn);

    const etherAfter = await ethers.provider.getBalance(pool.address);
    const tokensAfter = await enzymeV4Vault.balanceOf(pool.address);

    const etherSent = etherBefore.sub(etherAfter);
    const tokensReceived = tokensAfter.sub(tokensBefore);
    assert.strictEqual(etherSent.toString(), etherIn.toString());
    assert(tokensReceived.gte(minTokenOut), 'tokensReceived < minTokenOut');
  });

  it('should swap asset for eth in 3 sequential calls', async function () {
    const { pool, swapOperator, enzymeV4Vault } = this.contracts;

    const governance = this.accounts.governanceAccounts[0];

    const minAssetAmount = parseEther('100');
    const maxAssetAmount = parseEther('1000');
    await pool.connect(governance).addAsset(
      enzymeV4Vault.address,
      18, // decimals
      minAssetAmount, // asset minimum
      maxAssetAmount, // asset maximum
      '100', // 1% max slippage
      false, // isCoverAsset
    );

    // add ether to pool
    await this.accounts.defaultSender.sendTransaction({
      to: pool.address,
      value: parseEther('10000'),
    });

    const TIME_BETWEEN_SWAPS = 15 * 60; // 15 minutes

    {
      const etherBefore = await ethers.provider.getBalance(pool.address);
      const tokensBefore = await enzymeV4Vault.balanceOf(pool.address);

      // amounts in/out of the trade
      const etherIn = minAssetAmount.div(3);
      const minTokenOut = etherIn.sub(1);
      await swapOperator.swapETHForEnzymeVaultShare(etherIn, etherIn);

      const etherAfter = await ethers.provider.getBalance(pool.address);
      const tokensAfter = await enzymeV4Vault.balanceOf(pool.address);
      const etherSent = etherBefore.sub(etherAfter);
      const tokensReceived = tokensAfter.sub(tokensBefore);

      assert.strictEqual(etherSent.toString(), etherIn.toString());
      assert(tokensReceived.gte(minTokenOut), 'tokensReceived < minTokenOut');

      await increaseTime(TIME_BETWEEN_SWAPS);
      await mineNextBlock();
    }

    {
      const etherBefore = await ethers.provider.getBalance(pool.address);
      const tokensBefore = await enzymeV4Vault.balanceOf(pool.address);

      // amounts in/out of the trade
      const etherIn = minAssetAmount.div(3);
      const minTokenOut = etherIn.sub(1);
      await swapOperator.swapETHForEnzymeVaultShare(etherIn, etherIn);

      const etherAfter = await ethers.provider.getBalance(pool.address);
      const tokensAfter = await enzymeV4Vault.balanceOf(pool.address);
      const etherSent = etherBefore.sub(etherAfter);
      const tokensReceived = tokensAfter.sub(tokensBefore);

      assert.strictEqual(etherSent.toString(), etherIn.toString());
      assert(tokensReceived.gte(minTokenOut), 'tokensReceived < minTokenOut');

      await increaseTime(TIME_BETWEEN_SWAPS);
      await mineNextBlock();
    }

    {
      const etherBefore = await ethers.provider.getBalance(pool.address);
      const tokensBefore = await enzymeV4Vault.balanceOf(pool.address);

      // amounts in/out of the trade
      const etherIn = minAssetAmount.div(2);
      const minTokenOut = etherIn.sub(1);
      await swapOperator.swapETHForEnzymeVaultShare(etherIn, etherIn);

      const etherAfter = await ethers.provider.getBalance(pool.address);
      const tokensAfter = await enzymeV4Vault.balanceOf(pool.address);
      const etherSent = etherBefore.sub(etherAfter);
      const tokensReceived = tokensAfter.sub(tokensBefore);

      assert.strictEqual(etherSent.toString(), etherIn.toString());
      assert(tokensReceived.gte(minTokenOut), 'tokensReceived < minTokenOut');

      await increaseTime(TIME_BETWEEN_SWAPS);
      await mineNextBlock();
    }

    const etherIn = minAssetAmount.div(2);
    await expect(swapOperator.swapETHForEnzymeVaultShare(etherIn, etherIn)).to.be.revertedWith(
      'SwapOp: balanceBefore >= min',
    );
  });
});

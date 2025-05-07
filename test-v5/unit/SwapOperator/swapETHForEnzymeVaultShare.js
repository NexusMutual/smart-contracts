const { ethers } = require('hardhat');
const { expect } = require('chai');
const { BigNumber } = require('ethers');
const { ETH } = require('../../../lib/constants').Assets;
const { mineNextBlock, increaseTime } = require('../../utils/evm');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');
const {
  utils: { parseEther },
} = ethers;

describe('swapETHForEnzymeVaultShare', function () {
  it('should revert when called while the system is paused', async function () {
    const fixture = await loadFixture(setup);
    const { master, swapOperator } = fixture.contracts;

    await master.pause();

    await expect(swapOperator.swapETHForEnzymeVaultShare('0', '0')).to.be.revertedWith('System is paused');
  });

  it('should revert when called by an address that is not swap controller', async function () {
    const fixture = await loadFixture(setup);
    const { swapOperator } = fixture.contracts;
    const [nobody] = fixture.accounts.nonMembers;

    const swap = swapOperator.connect(nobody).swapETHForEnzymeVaultShare('0', '0');
    await expect(swap).to.revertedWithCustomError(swapOperator, 'OnlyController');
  });

  it('should revert when asset is not enabled', async function () {
    const fixture = await loadFixture(setup);
    const { pool, swapOperator, enzymeV4Vault } = fixture.contracts;
    const governance = fixture.accounts.governanceAccounts[0];

    await pool.connect(governance).setSwapDetails(
      enzymeV4Vault.address,
      parseEther('0'), // asset minimum
      parseEther('0'), // asset maximum
      '100', // 1% max slippage
    );

    const swap = swapOperator.swapETHForEnzymeVaultShare(parseEther('1'), '0');
    await expect(swap).to.be.revertedWithCustomError(swapOperator, 'TokenDisabled').withArgs(enzymeV4Vault.address);
  });

  it('should revert if ether left in pool is less than minPoolEth', async function () {
    const fixture = await loadFixture(setup);
    const { pool, swapOperator } = fixture.contracts;

    const currentEther = parseEther('10000');
    // add ether to pool
    await fixture.accounts.defaultSender.sendTransaction({
      to: pool.address,
      value: parseEther('10000'),
    });

    // allow to send max 1 ether out of pool

    const minPoolEth = await swapOperator.minPoolEth();
    const maxPoolTradableEther = currentEther.sub(minPoolEth);

    // should fail with max + 1
    await expect(swapOperator.swapETHForEnzymeVaultShare(currentEther, currentEther))
      .to.be.revertedWithCustomError(swapOperator, 'InvalidPostSwapBalance')
      .withArgs(0, minPoolEth);

    // should work with max
    await swapOperator.swapETHForEnzymeVaultShare(maxPoolTradableEther, maxPoolTradableEther);
  });

  it('should revert if amountIn > pool balance', async function () {
    const fixture = await loadFixture(setup);
    const { pool, swapOperator } = fixture.contracts;

    const currentEther = parseEther('10000');
    // add ether to pool
    await fixture.accounts.defaultSender.sendTransaction({
      to: pool.address,
      value: parseEther('10000'),
    });
    await expect(swapOperator.swapETHForEnzymeVaultShare(currentEther.add(1), currentEther)).to.be.revertedWith(
      'Pool: ETH transfer failed',
    );
  });

  it('should revert if Enzyme does not sent enough shares back', async function () {
    const fixture = await loadFixture(setup);
    const { pool, swapOperator, enzymeV4Comptroller } = fixture.contracts;

    // add ether to pool
    await fixture.accounts.defaultSender.sendTransaction({
      to: pool.address,
      value: parseEther('10000'),
    });

    const amountIn = parseEther('1000');

    // enzyme lowers the rate.
    await enzymeV4Comptroller.setETHToVaultSharesRate('500');
    await expect(swapOperator.swapETHForEnzymeVaultShare(amountIn, amountIn))
      .to.be.revertedWithCustomError(swapOperator, 'AmountOutTooLow')
      .withArgs(parseEther('50'), amountIn);
  });

  it('should revert if balanceAfter > max', async function () {
    const fixture = await loadFixture(setup);
    const { pool, swapOperator, enzymeV4Vault } = fixture.contracts;

    const governance = fixture.accounts.governanceAccounts[0];

    const max = parseEther('1000');
    await pool.connect(governance).setSwapDetails(
      enzymeV4Vault.address,
      parseEther('100'), // asset minimum
      max, // asset maximum
      '100', // 1% max slippage
    );

    // add ether to pool
    await fixture.accounts.defaultSender.sendTransaction({
      to: pool.address,
      value: parseEther('10000'),
    });

    const etherIn = max.add(10001);
    await expect(swapOperator.swapETHForEnzymeVaultShare(etherIn, etherIn))
      .to.be.revertedWithCustomError(swapOperator, 'InvalidPostSwapBalance')
      .withArgs(etherIn, max);
  });

  it('should swap asset for eth and emit a Swapped event with correct values', async function () {
    const fixture = await loadFixture(setup);
    const { pool, swapOperator, enzymeV4Vault } = fixture.contracts;

    const governance = fixture.accounts.governanceAccounts[0];

    const max = parseEther('1000');
    await pool.connect(governance).setSwapDetails(
      enzymeV4Vault.address,
      parseEther('100'), // asset minimum
      max, // asset maximum
      '100', // 1% max slippage
    );

    // add ether to pool
    await fixture.accounts.defaultSender.sendTransaction({
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

    expect(etherSent).to.be.equal(etherIn);
    expect(tokensReceived).to.be.greaterThanOrEqual(minTokenOut);

    await expect(swapTx).to.emit(swapOperator, 'Swapped').withArgs(ETH, enzymeV4Vault.address, etherIn, tokensReceived);
  });

  it('should swap asset for eth for a dust amount of wei equal to the precision error tolerance', async function () {
    const fixture = await loadFixture(setup);
    const { pool, swapOperator, enzymeV4Vault } = fixture.contracts;

    const governance = fixture.accounts.governanceAccounts[0];

    const max = parseEther('1000');
    await pool.connect(governance).setSwapDetails(
      enzymeV4Vault.address,
      parseEther('100'), // asset minimum
      max, // asset maximum
      '100', // 1% max slippage
    );

    // add ether to pool
    await fixture.accounts.defaultSender.sendTransaction({
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
    expect(etherSent).to.be.equal(etherIn);
    expect(tokensReceived).to.be.greaterThanOrEqual(minTokenOut);
  });

  it('should swap asset for eth in 3 sequential calls', async function () {
    const fixture = await loadFixture(setup);
    const { pool, swapOperator, enzymeV4Vault } = fixture.contracts;

    const governance = fixture.accounts.governanceAccounts[0];

    const minAssetAmount = parseEther('100');
    const maxAssetAmount = parseEther('1000');
    await pool.connect(governance).setSwapDetails(
      enzymeV4Vault.address,
      minAssetAmount, // asset minimum
      maxAssetAmount, // asset maximum
      '100', // 1% max slippage
    );

    // add ether to pool
    await fixture.accounts.defaultSender.sendTransaction({
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

      expect(etherSent).to.be.equal(etherIn);
      expect(tokensReceived).to.be.greaterThanOrEqual(minTokenOut);

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

      expect(etherSent).to.be.equal(etherIn);
      expect(tokensReceived).to.be.greaterThanOrEqual(minTokenOut);

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

      expect(etherSent).to.be.equal(etherIn);
      expect(tokensReceived).to.be.greaterThanOrEqual(minTokenOut);

      await increaseTime(TIME_BETWEEN_SWAPS);
      await mineNextBlock();
    }

    const etherIn = minAssetAmount.div(2);
    await expect(swapOperator.swapETHForEnzymeVaultShare(etherIn, etherIn))
      .to.be.revertedWithCustomError(swapOperator, 'InvalidBalance')
      .withArgs(BigNumber.from('116666666666666666666'), minAssetAmount);
  });
});

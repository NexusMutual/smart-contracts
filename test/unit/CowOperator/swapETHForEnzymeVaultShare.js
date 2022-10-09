const { contracts, makeWrongValue } = require('./setup');
const { ethers } = require('hardhat');
const { expect } = require('chai');
const { domain: makeDomain, computeOrderUid } = require('@cowprotocol/contracts');
const { setEtherBalance, setNextBlockTime, revertToSnapshot, takeSnapshot } = require('../../utils/evm');
const { time } = require('@openzeppelin/test-helpers');
const _ = require('lodash');
const { ETH } = require('../../../lib/constants').Assets;

const {
  utils: { parseEther, hexZeroPad, keccak256, toUtf8Bytes },
} = ethers;

describe.only('swapETHForEnzymeVaultShare', function () {
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

    const amountInPool = parseEther('2000');
    await enzymeV4Vault.mint(pool.address, amountInPool);

    await master.pause();

    await expect(swapOperator.swapEnzymeVaultShareForETH('0', '0')).to.be.revertedWith('System is paused');
  });
  /*

  it('should revert when called while the system is paused', async function () {

    const { master, swapOperator } = contracts();
    await master.pause();

    await expectRevert(
      swapOperator.swapETHForEnzymeVaultShare('0', '0'),
      'System is paused',
    );
  });

  it('should revert when called by an address that is not swap controller', async function () {

    const { swapOperator } = contracts();

    await expectRevert(
      swapOperator.swapETHForEnzymeVaultShare('0', '0', { from: nobody }),
      'SwapOperator: not swapController',
    );
  });

  it('should revert when asset is not enabled', async function () {
    const { pool, swapOperator, enzymeV4Vault } = contracts();

    await pool.setAssetDetails(
      enzymeV4Vault.address,
      ether('0'), // asset minimum
      ether('0'), // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );
    const etherIn = ether('1');

    await expectRevert(
      swapOperator.swapETHForEnzymeVaultShare(etherIn, '0'),
      'SwapOperator: asset is not enabled',
    );
  });

  it('should revert if ether left in pool is less than minPoolEth', async function () {

    const { pool, enzymeV4Vault, swapOperator } = contracts();

    // allow to send max 1 ether out of pool
    const maxPoolTradableEther = ether('1');
    const currentEther = await web3.eth.getBalance(pool.address);
    const minEther = toBN(currentEther).sub(maxPoolTradableEther);

    await pool.updateUintParameters(hex('MIN_ETH'), minEther, { from: governance });
    await pool.setAssetDetails(
      enzymeV4Vault.address,
      ether('100'), // asset minimum
      ether('1000'), // asset maximum
      ether('0.05'), // max slippage
      { from: governance },
    );

    // should fail with max + 1
    await expectRevert(
      swapOperator.swapETHForEnzymeVaultShare(maxPoolTradableEther.addn(1), maxPoolTradableEther),
      'SwapOperator: insufficient ether left',
    );

    // TODO: reenable
    // should work with max
    // await swapOperator.swapETHForEnzymeVaultShare(maxPoolTradableEther);
  });

  it('should revert if amountIn > pool balance', async function () {
    const { swapOperator, pool } = contracts();

    const poolBalance = toBN(await web3.eth.getBalance(pool.address));
    await expectRevert(
      swapOperator.swapETHForEnzymeVaultShare(poolBalance.addn(1), poolBalance),
      'Pool: Eth transfer failed',
    );
  });

  it('should revert if Enzyme does not sent enough shares back', async function () {
    const { swapOperator, enzymeV4Comptroller } = contracts();

    const amountIn = ether('1000');

    // enzyme lowers the rate.
    await enzymeV4Comptroller.setETHToVaultSharesRate('500');
    await expectRevert(
      swapOperator.swapETHForEnzymeVaultShare(amountIn, amountIn),
      'SwapOperator: amountOut < amountOutMin',
    );
  });

  it('should revert if balanceAfter > max', async function () {
    const { pool, swapOperator, enzymeV4Vault } = contracts();
    const windowStart = await nextWindowStartTime();

    const minAmount = ether('100');
    const maxAmount = ether('1000');
    await pool.setAssetDetails(
      enzymeV4Vault.address,
      minAmount, // asset minimum
      maxAmount, // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    // should be able to swap only during the last period within the window
    await setNextBlockTime(windowStart + periodSize * 7);

    const etherIn = maxAmount.addn(10001);
    await expectRevert(
      swapOperator.swapETHForEnzymeVaultShare(etherIn, etherIn),
      'SwapOperator: balanceAfter > max',
    );
  });

  it('should swap asset for eth and emit a Swapped event with correct values', async function () {
    const { pool, tokenA, swapOperator, enzymeV4Vault } = contracts();
    const windowStart = await nextWindowStartTime();

    await pool.setAssetDetails(
      enzymeV4Vault.address,
      ether('100'), // asset minimum
      ether('1000'), // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    // should be able to swap only during the last period within the window
    await setNextBlockTime(windowStart + periodSize * 7);

    const etherBefore = toBN(await web3.eth.getBalance(pool.address));
    const tokensBefore = await tokenA.balanceOf(pool.address);

    // amounts in/out of the trade
    const etherIn = ether('100');
    const minTokenOut = etherIn.subn(1);
    const swapTx = await swapOperator.swapETHForEnzymeVaultShare(etherIn, etherIn);

    const etherAfter = toBN(await web3.eth.getBalance(pool.address));
    const tokensAfter = await enzymeV4Vault.balanceOf(pool.address);
    const etherSent = etherBefore.sub(etherAfter);
    const tokensReceived = tokensAfter.sub(tokensBefore);

    assert.strictEqual(etherSent.toString(), etherIn.toString());
    assert(tokensReceived.gte(minTokenOut), 'tokensReceived < minTokenOut');

    expectEvent(swapTx, 'Swapped', {
      fromAsset: ETH,
      toAsset: enzymeV4Vault.address,
      amountIn: etherIn,
      amountOut: tokensReceived,
    });
  });

  it('should swap asset for eth for a dust amount of wei equal to the precision error tolerance', async function () {
    const { pool, tokenA, swapOperator, enzymeV4Vault } = contracts();

    await pool.setAssetDetails(
      enzymeV4Vault.address,
      ether('100'), // asset minimum
      ether('1000'), // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    const etherBefore = toBN(await web3.eth.getBalance(pool.address));
    const tokensBefore = await tokenA.balanceOf(pool.address);

    // amounts in/out of the trade
    const etherIn = toBN('10000');
    const minTokenOut = etherIn.subn(1);
    await swapOperator.swapETHForEnzymeVaultShare(etherIn, etherIn);
    const etherAfter = toBN(await web3.eth.getBalance(pool.address));
    const tokensAfter = await enzymeV4Vault.balanceOf(pool.address);
    const etherSent = etherBefore.sub(etherAfter);
    const tokensReceived = tokensAfter.sub(tokensBefore);

    assert.strictEqual(etherSent.toString(), etherIn.toString());
    assert(tokensReceived.gte(minTokenOut), 'tokensReceived < minTokenOut');
  });

  it('reverts if another swap is attempted too fast', async function () {
    const { pool, swapOperator, enzymeV4Vault } = contracts();

    await pool.setAssetDetails(
      enzymeV4Vault.address,
      ether('100'), // asset minimum
      ether('1000'), // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    // amounts in/out of the trade
    const etherIn = toBN('500');
    await swapOperator.swapETHForEnzymeVaultShare(etherIn, etherIn);

    await expectRevert(
      swapOperator.swapETHForEnzymeVaultShare(etherIn, etherIn),
      'SwapOperator: too fast',
    );
  });

  it('should swap asset for eth in 3 sequential calls', async function () {
    const { pool, tokenA, swapOperator, enzymeV4Vault } = contracts();

    const minAssetAmount = ether('100');

    await pool.setAssetDetails(
      enzymeV4Vault.address,
      minAssetAmount, // asset minimum
      ether('1000'), // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    const TIME_BETWEEN_SWAPS = time.duration.minutes(11);

    {
      const etherBefore = toBN(await web3.eth.getBalance(pool.address));
      const tokensBefore = await tokenA.balanceOf(pool.address);

      // amounts in/out of the trade
      const etherIn = minAssetAmount.divn(3);
      const minTokenOut = etherIn.subn(1);
      await swapOperator.swapETHForEnzymeVaultShare(etherIn, etherIn);

      const etherAfter = toBN(await web3.eth.getBalance(pool.address));
      const tokensAfter = await enzymeV4Vault.balanceOf(pool.address);
      const etherSent = etherBefore.sub(etherAfter);
      const tokensReceived = tokensAfter.sub(tokensBefore);

      assert.strictEqual(etherSent.toString(), etherIn.toString());
      assert(tokensReceived.gte(minTokenOut), 'tokensReceived < minTokenOut');

      await time.increase(TIME_BETWEEN_SWAPS);
    }

    {
      const etherBefore = toBN(await web3.eth.getBalance(pool.address));
      const tokensBefore = await tokenA.balanceOf(pool.address);

      // amounts in/out of the trade
      const etherIn = minAssetAmount.divn(3);
      const minTokenOut = etherIn.subn(1);
      await swapOperator.swapETHForEnzymeVaultShare(etherIn, etherIn);

      const etherAfter = toBN(await web3.eth.getBalance(pool.address));
      const tokensAfter = await enzymeV4Vault.balanceOf(pool.address);
      const etherSent = etherBefore.sub(etherAfter);
      const tokensReceived = tokensAfter.sub(tokensBefore);

      assert.strictEqual(etherSent.toString(), etherIn.toString());
      assert(tokensReceived.gte(minTokenOut), 'tokensReceived < minTokenOut');

      await time.increase(TIME_BETWEEN_SWAPS);
    }

    {
      const etherBefore = toBN(await web3.eth.getBalance(pool.address));
      const tokensBefore = await tokenA.balanceOf(pool.address);

      // amounts in/out of the trade
      const etherIn = minAssetAmount.divn(2);
      const minTokenOut = etherIn.subn(1);
      await swapOperator.swapETHForEnzymeVaultShare(etherIn, etherIn);

      const etherAfter = toBN(await web3.eth.getBalance(pool.address));
      const tokensAfter = await enzymeV4Vault.balanceOf(pool.address);
      const etherSent = etherBefore.sub(etherAfter);
      const tokensReceived = tokensAfter.sub(tokensBefore);

      assert.strictEqual(etherSent.toString(), etherIn.toString());
      assert(tokensReceived.gte(minTokenOut), 'tokensReceived < minTokenOut');

      await time.increase(TIME_BETWEEN_SWAPS);
    }

    const etherIn = minAssetAmount.divn(2);
    await expectRevert(
      swapOperator.swapETHForEnzymeVaultShare(etherIn, etherIn),
      'SwapOperator: balanceBefore >= min',
    );
  });
   */
});

const { accounts, web3 } = require('hardhat');
const { ether, expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers');
const { hex } = require('../utils').helpers;
const { setNextBlockTime } = require('../utils').evm;
const { assert } = require('chai');

const [owner, governance, nobody] = accounts;
const contracts = require('./setup').contracts;

const { toBN } = web3.utils;
const bnToNumber = bn => parseInt(bn.toString(), 10);
const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

const periodSize = 1800;
const windowSize = 14400;

const nextWindowStartTime = async () => {
  const now = bnToNumber(await time.latest());
  const currentWindow = Math.floor(now / windowSize);
  return (currentWindow + 1) * windowSize;
};

describe('swapEthForStETH', function () {

  it('should revert when called while the system is paused', async function () {

    const { master, swapOperator } = contracts();
    await master.pause();

    await expectRevert(
      swapOperator.swapETHForStETH('0'),
      'System is paused',
    );
  });

  it('should revert when called by an address that is not swap controller', async function () {

    const { swapOperator } = contracts();

    await expectRevert(
      swapOperator.swapETHForStETH('0', { from: nobody }),
      'SwapOperator: not swapController',
    );
  });

  it('should revert when asset is not enabled', async function () {
    const { pool, lido, swapOperator } = contracts();

    await pool.setAssetDetails(
      lido.address,
      ether('0'), // asset minimum
      ether('0'), // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );
    const etherIn = ether('1');

    await expectRevert(
      swapOperator.swapETHForStETH(etherIn),
      'SwapOperator: asset is not enabled',
    );
  });

  it('should revert if ether left in pool is less than minPoolEth', async function () {

    const { pool, lido, swapOperator } = contracts();

    // allow to send max 1 ether out of pool
    const maxPoolTradableEther = ether('1');
    const currentEther = await web3.eth.getBalance(pool.address);
    const minEther = toBN(currentEther).sub(maxPoolTradableEther);

    await pool.updateUintParameters(hex('MIN_ETH'), minEther, { from: governance });
    await pool.setAssetDetails(
      lido.address,
      ether('100'), // asset minimum
      ether('1000'), // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    // should fail with max + 1
    await expectRevert(
      swapOperator.swapETHForStETH(maxPoolTradableEther.addn(1)),
      'SwapOperator: insufficient ether left',
    );

    // should work with max
    await swapOperator.swapETHForStETH(maxPoolTradableEther);
  });

  it('should revert if amountIn > pool balance', async function () {
    const { swapOperator, pool } = contracts();

    const poolBalance = toBN(await web3.eth.getBalance(pool.address));
    await expectRevert(
      swapOperator.swapETHForStETH(poolBalance.addn(1)),
      'Pool: Eth transfer failed',
    );
  });

  it('should revert if Lido does not sent enough stETH back', async function () {
    const { swapOperator, pool, lido } = contracts();

    const amountIn = ether('1000');

    // lido lowers the rate (incorrect)
    await lido.setETHToStETHRate('9999');
    await expectRevert(
      swapOperator.swapETHForStETH(amountIn),
      'SwapOperator: amountOut < amountOutMin',
    );
  });

  it('should revert if balanceAfter > max', async function () {
    const { pool, swapOperator, lido } = contracts();
    const windowStart = await nextWindowStartTime();

    const minStEthAmount = ether('100');
    const maxStEthAmount = ether('1000');
    await pool.setAssetDetails(
      lido.address,
      minStEthAmount, // asset minimum
      maxStEthAmount, // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    // should be able to swap only during the last period within the window
    await setNextBlockTime(windowStart + periodSize * 7);

    const etherIn = maxStEthAmount.addn(10001);
    await expectRevert(
      swapOperator.swapETHForStETH(etherIn),
      'SwapOperator: balanceAfter > max',
    );
  });

  it('should swap asset for eth and emit a Swapped event with correct values', async function () {
    const { pool, tokenA, swapOperator, lido } = contracts();
    const windowStart = await nextWindowStartTime();

    await pool.setAssetDetails(
      lido.address,
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
    const swapTx = await swapOperator.swapETHForStETH(etherIn);

    const etherAfter = toBN(await web3.eth.getBalance(pool.address));
    const tokensAfter = await lido.balanceOf(pool.address);
    const etherSent = etherBefore.sub(etherAfter);
    const tokensReceived = tokensAfter.sub(tokensBefore);

    assert.strictEqual(etherSent.toString(), etherIn.toString());
    assert(tokensReceived.gte(minTokenOut), 'tokensReceived < minTokenOut');

    expectEvent(swapTx, 'Swapped', {
      fromAsset: ETH,
      toAsset: lido.address,
      amountIn: etherIn,
      amountOut: tokensReceived,
    });
  });

  it('should swap asset for eth for a dust amount of wei equal to the precision error tolerance', async function () {
    const { pool, tokenA, swapOperator, lido } = contracts();
    const windowStart = await nextWindowStartTime();

    await pool.setAssetDetails(
      lido.address,
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
    const etherIn = toBN('10000');
    const minTokenOut = etherIn.subn(1);
    await swapOperator.swapETHForStETH(etherIn);
    const etherAfter = toBN(await web3.eth.getBalance(pool.address));
    const tokensAfter = await lido.balanceOf(pool.address);
    const etherSent = etherBefore.sub(etherAfter);
    const tokensReceived = tokensAfter.sub(tokensBefore);

    assert.strictEqual(etherSent.toString(), etherIn.toString());
    assert(tokensReceived.gte(minTokenOut), 'tokensReceived < minTokenOut');
  });

  it('should swap asset for eth in 3 sequential calls', async function () {
    const { pool, tokenA, swapOperator, lido, twapOracle } = contracts();
    const windowStart = await nextWindowStartTime();

    const minStEthAmount = ether('100');

    await pool.setAssetDetails(
      lido.address,
      minStEthAmount, // asset minimum
      ether('1000'), // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    // should be able to swap only during the last period within the window
    await setNextBlockTime(windowStart + periodSize * 7);

    {
      const etherBefore = toBN(await web3.eth.getBalance(pool.address));
      const tokensBefore = await tokenA.balanceOf(pool.address);

      // amounts in/out of the trade
      const etherIn = minStEthAmount.divn(3);
      const minTokenOut = etherIn.subn(1);
      const swapTx = await swapOperator.swapETHForStETH(etherIn);

      const etherAfter = toBN(await web3.eth.getBalance(pool.address));
      const tokensAfter = await lido.balanceOf(pool.address);
      const etherSent = etherBefore.sub(etherAfter);
      const tokensReceived = tokensAfter.sub(tokensBefore);

      assert.strictEqual(etherSent.toString(), etherIn.toString());
      assert(tokensReceived.gte(minTokenOut), 'tokensReceived < minTokenOut');
    }

    await time.increase(periodSize);

    {
      const etherBefore = toBN(await web3.eth.getBalance(pool.address));
      const tokensBefore = await tokenA.balanceOf(pool.address);

      // amounts in/out of the trade
      const etherIn = minStEthAmount.divn(3);
      const minTokenOut = etherIn.subn(1);
      await swapOperator.swapETHForStETH(etherIn);

      const etherAfter = toBN(await web3.eth.getBalance(pool.address));
      const tokensAfter = await lido.balanceOf(pool.address);
      const etherSent = etherBefore.sub(etherAfter);
      const tokensReceived = tokensAfter.sub(tokensBefore);

      assert.strictEqual(etherSent.toString(), etherIn.toString());
      assert(tokensReceived.gte(minTokenOut), 'tokensReceived < minTokenOut');
    }

    await time.increase(periodSize);

    {
      const etherBefore = toBN(await web3.eth.getBalance(pool.address));
      const tokensBefore = await tokenA.balanceOf(pool.address);

      // amounts in/out of the trade
      const etherIn = minStEthAmount.divn(2);
      const minTokenOut = etherIn.subn(1);
      await swapOperator.swapETHForStETH(etherIn);

      const etherAfter = toBN(await web3.eth.getBalance(pool.address));
      const tokensAfter = await lido.balanceOf(pool.address);
      const etherSent = etherBefore.sub(etherAfter);
      const tokensReceived = tokensAfter.sub(tokensBefore);

      assert.strictEqual(etherSent.toString(), etherIn.toString());
      assert(tokensReceived.gte(minTokenOut), 'tokensReceived < minTokenOut');
    }

    const etherIn = minStEthAmount.divn(2);
    await expectRevert(
      swapOperator.swapETHForStETH(etherIn),
      'SwapOperator: balanceBefore >= min',
    );
  });
});

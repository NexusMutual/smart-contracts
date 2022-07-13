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

const TIME_BETWEEN_SWAPS = time.duration.minutes(11);

const nextWindowStartTime = async () => {
  const now = bnToNumber(await time.latest());
  const currentWindow = Math.floor(now / windowSize);
  return (currentWindow + 1) * windowSize;
};

describe('swapEnzymeVaultShareForETH', function () {

  it('should revert when called while the system is paused', async function () {

    const { master, swapOperator, enzymeV4Vault, pool, tokenA } = contracts();

    await pool.setAssetDetails(
      enzymeV4Vault.address,
      ether('100'), // asset minimum
      ether('1000'), // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    const amountInPool = ether('2000');
    enzymeV4Vault.mint(pool.address, amountInPool);

    await master.pause();

    await expectRevert(
      swapOperator.swapEnzymeVaultShareForETH('0', '0'),
      'System is paused',
    );
  });

  it('should revert when called by an address that is not swap controller', async function () {

    const { swapOperator } = contracts();

    await expectRevert(
      swapOperator.swapEnzymeVaultShareForETH('0', '0', { from: nobody }),
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
      swapOperator.swapEnzymeVaultShareForETH(etherIn, '0'),
      'SwapOperator: asset is not enabled',
    );
  });

  it('should revert if Enzyme does not sent enough shares back', async function () {
    const { swapOperator, enzymeV4Comptroller, pool, enzymeV4Vault } = contracts();

    await pool.setAssetDetails(
      enzymeV4Vault.address,
      ether('100'), // asset minimum
      ether('1000'), // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    const amountInPool = ether('2000');
    enzymeV4Vault.mint(pool.address, amountInPool);

    const amountIn = ether('1000');

    // enzyme lowers the rate.
    await enzymeV4Comptroller.setETHToVaultSharesRate('20000');
    await expectRevert(
      swapOperator.swapEnzymeVaultShareForETH(amountIn, amountIn),
      'SwapOperator: amountOut < amountOutMin',
    );
  });

  it('should revert if tokenBalanceAfter <  min', async function () {
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

    const amountInPool = ether('2000');
    enzymeV4Vault.mint(pool.address, amountInPool);

    // should be able to swap only during the last period within the window
    await setNextBlockTime(windowStart + periodSize * 7);

    const etherIn = ether('1950');
    await expectRevert(
      swapOperator.swapEnzymeVaultShareForETH(etherIn, etherIn),
      'SwapOperator: tokenBalanceAfter < min',
    );
  });

  it('should swap asset for eth and emit a Swapped event with correct values', async function () {
    const { pool, swapOperator, enzymeV4Vault } = contracts();
    const windowStart = await nextWindowStartTime();

    await pool.setAssetDetails(
      enzymeV4Vault.address,
      ether('100'), // asset minimum
      ether('1000'), // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    const amountInPool = ether('2000');
    enzymeV4Vault.mint(pool.address, amountInPool);

    // should be able to swap only during the last period within the window
    await setNextBlockTime(windowStart + periodSize * 7);

    const etherBefore = toBN(await web3.eth.getBalance(pool.address));
    const tokensBefore = await enzymeV4Vault.balanceOf(pool.address);

    // amounts in/out of the trade
    const sharesIn = ether('1500');
    const minTokenOut = sharesIn.subn(1);
    const swapTx = await swapOperator.swapEnzymeVaultShareForETH(sharesIn, sharesIn);

    const etherAfter = toBN(await web3.eth.getBalance(pool.address));
    const tokensAfter = await enzymeV4Vault.balanceOf(pool.address);
    const etherReceived = etherAfter.sub(etherBefore);
    const tokensSent = tokensBefore.sub(tokensAfter);

    assert.strictEqual(etherReceived.toString(), sharesIn.toString());
    assert(tokensSent.gte(minTokenOut), 'tokensReceived < minTokenOut');

    expectEvent(swapTx, 'Swapped', {
      fromAsset: enzymeV4Vault.address,
      toAsset: ETH,
      amountIn: sharesIn,
      amountOut: tokensSent,
    });
  });
});

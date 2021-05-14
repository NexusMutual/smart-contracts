const { accounts, web3 } = require('hardhat');
const { ether, expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers');
const { hex } = require('../utils').helpers;
const { setNextBlockTime } = require('../utils').evm;
const { assert } = require('chai');
const { MAX_UINT256 } = require('@openzeppelin/test-helpers').constants;

const [owner, governance, nobody] = accounts;
const contracts = require('./setup').contracts;

const { toBN } = web3.utils;
const bnToNumber = bn => parseInt(bn.toString(), 10);
const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

const addLiquidity = async (router, weth, token, ethAmount, tokenAmount) => {

  await weth.deposit({ value: ethAmount });
  await weth.approve(router.address, ethAmount);

  await token.mint(owner, tokenAmount);
  await token.approve(router.address, tokenAmount);

  await router.addLiquidity(
    token.address,
    weth.address,
    tokenAmount,
    ethAmount,
    ether('0'), // amountAMin
    ether('0'), // amountBMin
    owner, // send lp tokens to
    MAX_UINT256, // deadline infinity
  );
};

const periodSize = 1800;
const windowSize = 14400;

const nextWindowStartTime = async () => {
  const now = bnToNumber(await time.latest());
  const currentWindow = Math.floor(now / windowSize);
  return (currentWindow + 1) * windowSize;
};

describe('swapETHForAsset', function () {

  it('should revert when called while the system is paused', async function () {

    const { master, tokenA, swapOperator } = contracts();
    await master.pause();

    await expectRevert(
      swapOperator.swapETHForAsset(tokenA.address, '0', '0'),
      'System is paused',
    );
  });

  it('should revert when called by an address that is not swap controller', async function () {

    const { tokenA, swapOperator } = contracts();

    await expectRevert(
      swapOperator.swapETHForAsset(tokenA.address, '0', '0', { from: nobody }),
      'SwapOperator: not swapController',
    );
  });

  it('should revert when asset is not enabled', async function () {
    const { pool, tokenA, swapOperator } = contracts();

    await pool.setAssetDetails(
      tokenA.address,
      ether('0'), // asset minimum
      ether('0'), // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    const etherIn = ether('1');
    const minTokenOut = ether('198');

    await expectRevert(
      swapOperator.swapETHForAsset(tokenA.address, etherIn, minTokenOut),
      'SwapOperator: asset is not enabled',
    );
  });

  it('should revert when called more than once per period', async function () {

    const { oracle, pool, router, tokenA, weth, wethAPair, swapOperator } = contracts();
    const windowStart = await nextWindowStartTime();

    await pool.setAssetDetails(
      tokenA.address,
      ether('100'), // asset minimum
      ether('1000'), // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    // add liquidity and update twap oracle
    await addLiquidity(router, weth, tokenA, ether('10000'), ether('2000000'));
    await setNextBlockTime(windowStart);
    await oracle.update([wethAPair.address]);

    // should be able to swap only during the last period within the window
    const period8Start = windowStart + periodSize * 7;
    const period8End = windowStart + windowSize - 1;
    await setNextBlockTime(period8Start);

    const etherIn = ether('1');
    const minTokenOut = ether('198');
    await swapOperator.swapETHForAsset(tokenA.address, etherIn, minTokenOut);

    const { lastAssetSwapTime } = await pool.getAssetDetails(tokenA.address);
    assert.strictEqual(lastAssetSwapTime.toString(), period8Start.toString());

    await setNextBlockTime(period8End);

    await expectRevert(
      swapOperator.swapETHForAsset(tokenA.address, etherIn, minTokenOut),
      'SwapOperator: too fast',
    );
  });

  it('should revert when amountIn exceeds max tradable amount', async function () {

    const { oracle, pool, router, tokenA, weth, wethAPair, swapOperator } = contracts();
    const windowStart = await nextWindowStartTime();

    await pool.setAssetDetails(
      tokenA.address,
      ether('100'), // asset minimum
      ether('100000'), // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    // add liquidity and update twap oracle
    await addLiquidity(router, weth, tokenA, ether('10000'), ether('2000000'));
    await setNextBlockTime(windowStart);
    await oracle.update([wethAPair.address]);

    const { _reserve0, _reserve1 } = await wethAPair.getReserves();
    const wethIsToken0 = weth.address.toLowerCase() < tokenA.address.toLowerCase();
    const wethReserve = wethIsToken0 ? _reserve0 : _reserve1;

    const maxTradableRatio = ether('3').divn(1000); // 0.003
    const maxTradableAmount = wethReserve.mul(maxTradableRatio).div(ether('1'));

    const [, estimateOut] = await router.getAmountsOut(
      maxTradableAmount,
      [weth.address, tokenA.address],
    );

    await setNextBlockTime(windowStart + periodSize * 7);

    // should fail with max + 1
    await expectRevert(
      swapOperator.swapETHForAsset(tokenA.address, maxTradableAmount.addn(1), estimateOut),
      'SwapOperator: exceeds max tradable amount',
    );

    // should work with max
    await swapOperator.swapETHForAsset(tokenA.address, maxTradableAmount, estimateOut);
  });

  it('should revert if ether left in pool is less than minPoolEth', async function () {

    const { oracle, pool, router, tokenA, weth, wethAPair, swapOperator } = contracts();
    const windowStart = await nextWindowStartTime();

    // allow to send max 1 ether out of pool
    const maxPoolTradableEther = ether('1');
    const currentEther = await web3.eth.getBalance(pool.address);
    const minEther = toBN(currentEther).sub(maxPoolTradableEther);

    await pool.updateUintParameters(hex('MIN_ETH'), minEther, { from: governance });
    await pool.setAssetDetails(
      tokenA.address,
      ether('100'), // asset minimum
      ether('1000'), // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    // add liquidity and update twap oracle
    await addLiquidity(router, weth, tokenA, ether('10000'), ether('2000000'));
    await setNextBlockTime(windowStart);
    await oracle.update([wethAPair.address]);

    const [, estimateOut] = await router.getAmountsOut(
      maxPoolTradableEther,
      [weth.address, tokenA.address],
    );

    await setNextBlockTime(windowStart + periodSize * 7);

    // should fail with max + 1
    await expectRevert(
      swapOperator.swapETHForAsset(tokenA.address, maxPoolTradableEther.addn(1), estimateOut),
      'SwapOperator: insufficient ether left',
    );

    // should work with max
    await swapOperator.swapETHForAsset(tokenA.address, maxPoolTradableEther, estimateOut);
  });

  it('should revert when amountOutMin < minOutOnMaxSlippage', async function () {

    const { oracle, pool, router, tokenA, weth, wethAPair, swapOperator } = contracts();
    const windowStart = await nextWindowStartTime();
    const maxSlippageRatio = ether('0.01');

    await pool.setAssetDetails(
      tokenA.address,
      ether('100'), // asset minimum
      ether('1000'), // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    // add liquidity and update twap oracle
    await addLiquidity(router, weth, tokenA, ether('10000'), ether('2000000'));
    await setNextBlockTime(windowStart);
    await oracle.update([wethAPair.address]);

    const ethIn = ether('1');

    const { _reserve0, _reserve1 } = await wethAPair.getReserves();
    // using uq with 112 bits number format for precision
    const uqPrice0 = _reserve1.shln(112).div(_reserve0);
    const uqPrice1 = _reserve0.shln(112).div(_reserve1);

    const wethIsToken0 = weth.address.toLowerCase() < tokenA.address.toLowerCase();
    const uqWethPrice = wethIsToken0 ? uqPrice0 : uqPrice1;
    const tokenOutAtSpotPrice = uqWethPrice.mul(ethIn).shrn(112);

    const maxSlippageAmount = tokenOutAtSpotPrice.mul(maxSlippageRatio).div(ether('1'));
    const minOutOnMaxSlippage = tokenOutAtSpotPrice.sub(maxSlippageAmount);

    await setNextBlockTime(windowStart + periodSize * 7);

    // should fail with minOut - 1
    await expectRevert(
      swapOperator.swapETHForAsset(tokenA.address, ethIn, minOutOnMaxSlippage.subn(1)),
      'SwapOperator: amountOutMin < minOutOnMaxSlippage',
    );

    // should work with minOut
    await swapOperator.swapETHForAsset(tokenA.address, ethIn, minOutOnMaxSlippage);
  });

  it('should revert when asset balanceBefore >= minAmount', async function () {

    const { oracle, pool, router, tokenA, weth, wethAPair, swapOperator } = contracts();
    const windowStart = await nextWindowStartTime();

    const assetMinAmount = ether('100');
    await tokenA.mint(owner, assetMinAmount);
    await tokenA.transfer(pool.address, assetMinAmount);

    await pool.setAssetDetails(
      tokenA.address,
      assetMinAmount, // asset minimum
      ether('1000'), // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    // add liquidity and update twap oracle
    await addLiquidity(router, weth, tokenA, ether('10000'), ether('2000000'));
    await setNextBlockTime(windowStart);
    await oracle.update([wethAPair.address]);

    const ethIn = ether('1');
    const [, estimateTokenOut] = await router.getAmountsOut(ethIn, [weth.address, tokenA.address]);

    await setNextBlockTime(windowStart + periodSize * 7);

    await expectRevert(
      swapOperator.swapETHForAsset(tokenA.address, ethIn, estimateTokenOut),
      'SwapOperator: balanceBefore >= min',
    );
  });

  it('should revert when asset balanceBefore + amountOutMin > maxAmount', async function () {

    const { oracle, pool, router, tokenA, weth, wethAPair, swapOperator } = contracts();
    const windowStart = await nextWindowStartTime();

    await pool.setAssetDetails(
      tokenA.address,
      ether('100'), // asset minimum
      ether('200'), // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    // add liquidity and update twap oracle
    await addLiquidity(router, weth, tokenA, ether('10000'), ether('2000000'));
    await setNextBlockTime(windowStart);
    await oracle.update([wethAPair.address]);

    const ethIn = ether('2'); // => ~400 tokenA
    const [, estimateTokenOut] = await router.getAmountsOut(ethIn, [weth.address, tokenA.address]);

    await setNextBlockTime(windowStart + periodSize * 7);

    await expectRevert(
      swapOperator.swapETHForAsset(tokenA.address, ethIn, estimateTokenOut),
      'SwapOperator: balanceAfter > max',
    );
  });

  it('should swap eth for asset and emit a Swapped event with correct values', async function () {

    const { oracle, pool, router, tokenA, weth, wethAPair, swapOperator } = contracts();
    const windowStart = await nextWindowStartTime();

    await pool.setAssetDetails(
      tokenA.address,
      ether('100'), // asset minimum
      ether('1000'), // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    // add liquidity and update twap oracle
    await addLiquidity(router, weth, tokenA, ether('10000'), ether('2000000'));
    await setNextBlockTime(windowStart);
    await oracle.update([wethAPair.address]);

    // should be able to swap only during the last period within the window
    await setNextBlockTime(windowStart + periodSize * 7);

    const etherBefore = toBN(await web3.eth.getBalance(pool.address));
    const tokensBefore = await tokenA.balanceOf(pool.address);

    // amounts in/out of the trade
    const etherIn = ether('1');
    const minTokenOut = ether('198');
    const swapTx = await swapOperator.swapETHForAsset(tokenA.address, etherIn, minTokenOut);

    const etherAfter = toBN(await web3.eth.getBalance(pool.address));
    const tokensAfter = await tokenA.balanceOf(pool.address);
    const etherSent = etherBefore.sub(etherAfter);
    const tokensReceived = tokensAfter.sub(tokensBefore);

    assert.strictEqual(etherSent.toString(), etherIn.toString());
    assert(tokensReceived.gte(minTokenOut));

    expectEvent(swapTx, 'Swapped', {
      fromAsset: ETH,
      toAsset: tokenA.address,
      amountIn: etherIn,
      amountOut: tokensReceived,
    });
  });

});

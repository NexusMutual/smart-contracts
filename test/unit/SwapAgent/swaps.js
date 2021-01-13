const { accounts, web3 } = require('hardhat');
const { ether, expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers');
const { hex } = require('../utils').helpers;
const { setNextBlockTime } = require('../utils').evm;
const { assert } = require('chai');

const [owner, governance, nobody] = accounts;
const contracts = require('./setup').contracts;

const { toBN } = web3.utils;
const bnToNumber = bn => parseInt(bn.toString(), 10);

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
    -1, // deadline infinity
  );
};

const periodSize = 1800;
const windowSize = 14400;

const nextWindowStartTime = async () => {
  const now = bnToNumber(await time.latest());
  const currentWindow = Math.floor(now / windowSize);
  return (currentWindow + 1) * windowSize;
};

describe('swaps', function () {

  /* eth to asset */

  it('should revert when swapETHForAsset is called while the system is paused', async function () {

    const { master, pool, tokenA } = contracts();
    await master.pause();

    await expectRevert(
      pool.swapETHForAsset(tokenA.address, '0', '0'),
      'System is paused',
    );
  });

  it('should revert when swapETHForAsset is not called by swap controller', async function () {

    const { pool, tokenA } = contracts();

    await expectRevert(
      pool.swapETHForAsset(tokenA.address, '0', '0', { from: nobody }),
      'Pool: not swapController',
    );
  });

  it('should revert when swapETHForAsset is called more than once per period', async function () {

    const { oracle, pool, router, tokenA, weth, wethAPair } = contracts();
    const windowStart = await nextWindowStartTime();

    await pool.setAssetDetails(tokenA.address,
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
    await pool.swapETHForAsset(tokenA.address, etherIn, minTokenOut);

    const { lastAssetSwapTime } = await pool.getAssetDetails(tokenA.address);
    assert.strictEqual(lastAssetSwapTime.toString(), period8Start.toString());

    await setNextBlockTime(period8End);

    await expectRevert(
      pool.swapETHForAsset(tokenA.address, etherIn, minTokenOut),
      'SwapAgent: too fast',
    );
  });

  it('should revert when swapETHForAsset amountIn exceeds max tradable amount', async function () {

    const { oracle, pool, router, tokenA, weth, wethAPair } = contracts();
    const windowStart = await nextWindowStartTime();

    await pool.setAssetDetails(tokenA.address,
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
      pool.swapETHForAsset(tokenA.address, maxTradableAmount.addn(1), estimateOut),
      'SwapAgent: exceeds max tradable amount',
    );

    // should work with max
    await pool.swapETHForAsset(tokenA.address, maxTradableAmount, estimateOut);
  });

  it('should revert if ether left in pool is less than minPoolEth', async function () {

    const { oracle, pool, router, tokenA, weth, wethAPair } = contracts();
    const windowStart = await nextWindowStartTime();

    // allow to send max 1 ether out of pool
    const maxPoolTradableEther = ether('1');
    const currentEther = await web3.eth.getBalance(pool.address);
    const minEther = toBN(currentEther).sub(maxPoolTradableEther);

    await pool.updateUintParameters(hex('MIN_ETH'), minEther, { from: governance });
    await pool.setAssetDetails(tokenA.address,
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
      pool.swapETHForAsset(tokenA.address, maxPoolTradableEther.addn(1), estimateOut),
      'SwapAgent: insufficient ether left',
    );

    // should work with max
    await pool.swapETHForAsset(tokenA.address, maxPoolTradableEther, estimateOut);
  });

  it('should revert swapETHForAsset call when amountOutMin < minOutOnMaxSlippage', async function () {

    const { oracle, pool, router, tokenA, weth, wethAPair } = contracts();
    const windowStart = await nextWindowStartTime();
    const maxSlippageRatio = ether('0.01');

    await pool.setAssetDetails(tokenA.address,
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
      pool.swapETHForAsset(tokenA.address, ethIn, minOutOnMaxSlippage.subn(1)),
      'SwapAgent: amountOutMin < minOutOnMaxSlippage',
    );

    // should work with minOut
    await pool.swapETHForAsset(tokenA.address, ethIn, minOutOnMaxSlippage);
  });

  it('should revert swapETHForAsset call when asset balance >= assetData.minAmount', async function () {

    const { oracle, pool, router, tokenA, weth, wethAPair } = contracts();
    const windowStart = await nextWindowStartTime();

    const assetMinAmount = ether('100');
    await tokenA.mint(assetMinAmount);
    await tokenA.transfer(pool.address, assetMinAmount);

    await pool.setAssetDetails(tokenA.address,
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
      pool.swapETHForAsset(tokenA.address, ethIn, estimateTokenOut),
      'SwapAgent: balanceBefore >= min',
    );
  });

  // TODO: Due to the fact that we only have an estimate of the asset amount reveived before a swap happens,
  //       It is possible to end up with a little bit more or less assets than the specified min and max.
  //       this can happen only when min and max values are close enough and the traded amount exceeds their diff.
  //       To be discussed: revert when a better than expected trade is executed but resulting amount is not
  //       within the min/max bounds vs keep the current implementation where the min/max bounds are checked using
  //       the provided minOutAmount.

  it.skip('should revert swapETHForAsset call when asset balance >= assetData.minAmount', async function () {

    const { oracle, pool, router, tokenA, weth, wethAPair } = contracts();
    const windowStart = await nextWindowStartTime();

    const initialAssetAmount = ether('90');
    const assetMinAmount = ether('95');
    const assetMaxAmount = ether('100');

    await tokenA.mint(initialAssetAmount);
    await tokenA.transfer(pool.address, initialAssetAmount);

    await pool.setAssetDetails(tokenA.address,
      assetMinAmount, // asset minimum
      assetMaxAmount, // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    // add liquidity and update twap oracle
    await addLiquidity(router, weth, tokenA, ether('10000'), ether('2000000'));
    await setNextBlockTime(windowStart);
    await oracle.update([wethAPair.address]);

    // missing amount until max: 10 tokens
    const maxNeededTokens = assetMaxAmount.sub(initialAssetAmount);
    // missing amount + 1 wei: 10.000…0001 tokens
    const maxNeededTokensPlus1Wei = maxNeededTokens.addn(1);

    const [ethInForMax] = await router.getAmountsIn(maxNeededTokens, [weth.address, tokenA.address]);
    const [ethInForOverMax] = await router.getAmountsIn(maxNeededTokensPlus1Wei, [weth.address, tokenA.address]);

    await setNextBlockTime(windowStart + periodSize * 7);

    await expectRevert(
      pool.swapETHForAsset(tokenA.address, ethInForOverMax, maxNeededTokensPlus1Wei),
      'SwapAgent: balanceAfter > max',
    );

    // should work with max
    await pool.swapETHForAsset(tokenA.address, ethInForMax, maxNeededTokens);

    const tokenBalance = await tokenA.balanceOf(pool.address);
    assert(
      tokenBalance.lte(assetMaxAmount),
      `Pool balance exceeds assetMaxAmount: ${tokenBalance.toString()}`,
    );
    console.log({ tokenBalance: tokenBalance.toString() });
  });

  it('should swap eth for asset and emit a Swapped event with correct values', async function () {

    const { oracle, pool, router, tokenA, weth, wethAPair } = contracts();
    const windowStart = await nextWindowStartTime();
    const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

    await pool.setAssetDetails(tokenA.address,
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
    const swapTx = await pool.swapETHForAsset(tokenA.address, etherIn, minTokenOut);

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

  /* asset to eth */

  it('should swap asset for eth and emit a Swapped event with correct values', async function () {

    const { oracle, pool, router, tokenA, weth, wethAPair } = contracts();
    const windowStart = await nextWindowStartTime();
    const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

    await pool.setAssetDetails(tokenA.address,
      ether('100'), // asset minimum
      ether('1000'), // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    await tokenA.mint(pool.address, ether('1000'));

    // add liquidity and update twap oracle
    await addLiquidity(router, weth, tokenA, ether('10000'), ether('2000000'));
    await setNextBlockTime(windowStart);
    await oracle.update([wethAPair.address]);

    // should be able to swap only during the last period within the window
    await setNextBlockTime(windowStart + periodSize * 7);

    const etherBefore = toBN(await web3.eth.getBalance(pool.address));
    const tokensBefore = await tokenA.balanceOf(pool.address);

    // amounts in/out of the trade
    const tokenIn = ether('200');
    const minEtherOut = ether('0.99');
    const swapTx = await pool.swapAssetForETH(tokenA.address, tokenIn, minEtherOut);

    const etherAfter = toBN(await web3.eth.getBalance(pool.address));
    const tokensAfter = await tokenA.balanceOf(pool.address);
    const tokensSent = tokensBefore.sub(tokensAfter);
    const etherReceived = etherAfter.sub(etherBefore);

    assert.strictEqual(tokensSent.toString(), tokenIn.toString());
    assert(etherReceived.gte(minEtherOut));

    expectEvent(swapTx, 'Swapped', {
      fromAsset: tokenA.address,
      toAsset: ETH,
      amountIn: tokenIn,
      amountOut: etherReceived,
    });
  });

});

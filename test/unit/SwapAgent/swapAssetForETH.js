const { accounts, web3 } = require('hardhat');
const { ether, expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers');
const { setNextBlockTime } = require('../utils').evm;
const { assert } = require('chai');

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

describe('swapAssetForETH', function () {

  it('should revert when swapAssetForETH is called while the system is paused', async function () {

    const { master, pool, tokenA } = contracts();
    await master.pause();

    await expectRevert(
      pool.swapAssetForETH(tokenA.address, '0', '0'),
      'System is paused',
    );
  });

  it('should revert when swapAssetForETH is not called by swap controller', async function () {

    const { pool, tokenA } = contracts();

    await expectRevert(
      pool.swapAssetForETH(tokenA.address, '0', '0', { from: nobody }),
      'Pool: not swapController',
    );
  });

  it('should revert when swapAssetForETH is called more than once per period', async function () {

    const { oracle, pool, router, tokenA, weth, wethAPair } = contracts();
    const windowStart = await nextWindowStartTime();

    await pool.setAssetDetails(
      tokenA.address,
      ether('100'), // asset minimum
      ether('200'), // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    await tokenA.mint(pool.address, ether('1000'));

    // add liquidity and update twap oracle
    await addLiquidity(router, weth, tokenA, ether('10000'), ether('2000000'));
    await setNextBlockTime(windowStart);
    await oracle.update([wethAPair.address]);

    // should be able to swap only during the last period within the window
    const period8Start = windowStart + periodSize * 7;
    const period8End = windowStart + windowSize - 1;
    await setNextBlockTime(period8Start);

    const tokenIn = ether('200');
    const minEtherOut = ether('0.99');
    await pool.swapAssetForETH(tokenA.address, tokenIn, minEtherOut);

    const { lastAssetSwapTime } = await pool.getAssetDetails(tokenA.address);
    assert.strictEqual(lastAssetSwapTime.toString(), period8Start.toString());

    await setNextBlockTime(period8End);

    await expectRevert(
      pool.swapAssetForETH(tokenA.address, tokenIn, minEtherOut),
      'SwapAgent: too fast',
    );
  });

  it('should revert when swapAssetForETH amountIn exceeds max tradable amount', async function () {

    const { oracle, pool, router, tokenA, weth, wethAPair } = contracts();
    const windowStart = await nextWindowStartTime();

    await pool.setAssetDetails(
      tokenA.address,
      ether('100'), // asset minimum
      ether('200'), // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    await tokenA.mint(pool.address, ether('10000'));

    // add liquidity and update twap oracle
    await addLiquidity(router, weth, tokenA, ether('10000'), ether('2000000'));
    await setNextBlockTime(windowStart);
    await oracle.update([wethAPair.address]);

    const { _reserve0, _reserve1 } = await wethAPair.getReserves();
    const tokenAIsToken0 = tokenA.address.toLowerCase() < weth.address.toLowerCase();
    const tokenAReserve = tokenAIsToken0 ? _reserve0 : _reserve1;

    const maxTradableRatio = ether('3').divn(1000); // 0.003
    const maxTradableAmount = tokenAReserve.mul(maxTradableRatio).div(ether('1'));

    const [, estimateOut] = await router.getAmountsOut(
      maxTradableAmount,
      [tokenA.address, weth.address],
    );

    await setNextBlockTime(windowStart + periodSize * 7);

    // should fail with max + 1
    await expectRevert(
      pool.swapAssetForETH(tokenA.address, maxTradableAmount.addn(1), estimateOut),
      'SwapAgent: exceeds max tradable amount',
    );

    // should work with max
    await pool.swapAssetForETH(tokenA.address, maxTradableAmount, estimateOut);
  });

  it('should revert swapAssetForETH call when amountOutMin < minOutOnMaxSlippage', async function () {

    const { oracle, pool, router, tokenA, weth, wethAPair } = contracts();
    const windowStart = await nextWindowStartTime();
    const maxSlippageRatio = ether('0.01');

    await pool.setAssetDetails(
      tokenA.address,
      ether('100'), // asset minimum
      ether('200'), // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    await tokenA.mint(pool.address, ether('1000'));

    // add liquidity and update twap oracle
    await addLiquidity(router, weth, tokenA, ether('10000'), ether('2000000'));
    await setNextBlockTime(windowStart);
    await oracle.update([wethAPair.address]);

    const tokenIn = ether('1');

    const { _reserve0, _reserve1 } = await wethAPair.getReserves();
    // using uq with 112 bits number format for precision
    const uqPrice0 = _reserve1.shln(112).div(_reserve0);
    const uqPrice1 = _reserve0.shln(112).div(_reserve1);

    const tokenAIsToken0 = tokenA.address.toLowerCase() < weth.address.toLowerCase();
    const uqTokenAPrice = tokenAIsToken0 ? uqPrice0 : uqPrice1;
    const wethOutAtSpotPrice = uqTokenAPrice.mul(tokenIn).shrn(112);

    const maxSlippageAmount = wethOutAtSpotPrice.mul(maxSlippageRatio).div(ether('1'));
    const minOutOnMaxSlippage = wethOutAtSpotPrice.sub(maxSlippageAmount);

    await setNextBlockTime(windowStart + periodSize * 7);

    // should fail with minOut - 1
    await expectRevert(
      pool.swapAssetForETH(tokenA.address, tokenIn, minOutOnMaxSlippage.subn(1)),
      'SwapAgent: amountOutMin < minOutOnMaxSlippage',
    );

    // should work with minOut
    await pool.swapAssetForETH(tokenA.address, tokenIn, minOutOnMaxSlippage);
  });

  it('should revert swapAssetForETH call when asset balanceBefore <= assetData.maxAmount', async function () {

    const { oracle, pool, router, tokenA, weth, wethAPair } = contracts();
    const windowStart = await nextWindowStartTime();

    await pool.setAssetDetails(
      tokenA.address,
      ether('0'), // asset minimum
      ether('200'), // asset maximum
      ether('0.01'), // max slippage
      { from: governance },
    );

    await tokenA.mint(pool.address, ether('200'));

    // add liquidity and update twap oracle
    await addLiquidity(router, weth, tokenA, ether('10000'), ether('2000000'));
    await setNextBlockTime(windowStart);
    await oracle.update([wethAPair.address]);

    const tokenIn = ether('1');
    const [, estimateEthOut] = await router.getAmountsOut(tokenIn, [tokenA.address, weth.address]);

    await setNextBlockTime(windowStart + periodSize * 7);

    await expectRevert(
      pool.swapAssetForETH(tokenA.address, tokenIn, estimateEthOut),
      'SwapAgent: tokenBalanceBefore <= max',
    );

    // mint 1 wei
    await tokenA.mint(pool.address, '1');

    // should work with minOut
    await pool.swapAssetForETH(tokenA.address, tokenIn, estimateEthOut);
  });

  it('should swap asset for eth and emit a Swapped event with correct values', async function () {

    const { oracle, pool, router, tokenA, weth, wethAPair } = contracts();
    const windowStart = await nextWindowStartTime();

    await pool.setAssetDetails(
      tokenA.address,
      ether('100'), // asset minimum
      ether('200'), // asset maximum
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

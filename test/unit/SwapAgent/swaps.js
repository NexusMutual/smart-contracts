const { accounts, web3 } = require('hardhat');
const { ether, expectEvent, time } = require('@openzeppelin/test-helpers');
const { mineNextBlock, setNextBlockTime } = require('../utils').evm;
const { assert } = require('chai');

const [owner, governance] = accounts;
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

const periodsPerWindow = 8;
const periodSize = 1800;
const windowSize = 28800;

describe('swaps', function () {

  /* eth to asset */

  it('should perform a swap', async function () {

    const { oracle, pool, router, tokenA, weth, wethAPair } = contracts();

    const now = bnToNumber(await time.latest());
    const currentWindow = Math.floor(now / windowSize);
    const windowStart = (currentWindow + 1) * windowSize;

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

    await pool.swapETHForAsset(tokenA.address, etherIn, minTokenOut);
    const etherAfter = toBN(await web3.eth.getBalance(pool.address));
    const tokensAfter = await tokenA.balanceOf(pool.address);

    const etherSent = etherBefore.sub(etherAfter);
    const tokensReceived = tokensAfter.sub(tokensBefore);

    assert.strictEqual(etherSent.toString(), etherIn.toString());
    assert(tokensReceived.gte(minTokenOut));
  });

  /* asset to eth */

  it('should perform a swap', async function () {
    // noop
  });

});

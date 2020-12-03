const { accounts, web3 } = require('hardhat');
const { ether, expectEvent, time } = require('@openzeppelin/test-helpers');
const { mineNextBlock, setNextBlockTime } = require('../utils').evm;
const { assert } = require('chai');

const [owner] = accounts;
const contracts = require('./setup').contracts;
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

describe('swaps', function () {

  it.only('should perform a swap', async function () {

    const { oracle, pool, router, tokenA, weth, wethAPair } = contracts();

    const periodsPerWindow = bnToNumber(await oracle.periodsPerWindow());
    const periodSize = bnToNumber(await oracle.periodSize());
    const windowSize = bnToNumber(await oracle.windowSize());

    const now = bnToNumber(await time.latest());
    const currentWindow = Math.floor(now / windowSize);
    const windowStart = (currentWindow + 1) * windowSize;

    // add liquidity and update twap oracle
    await addLiquidity(router, weth, tokenA, ether('10000'), ether('2000000'));

    await setNextBlockTime(windowStart);
    await oracle.update([wethAPair.address]);

    // should be able to swap only during the last period within the window
    await setNextBlockTime(windowStart + periodSize * 7);

    const etherBefore = await web3.eth.getBalance(pool.address);
    const tokensBefore = await tokenA.balanceOf(pool.address);

    await pool.swapETHForAsset(tokenA.address, ether('1'), '0');
    const etherAfter = await web3.eth.getBalance(pool.address);
    const tokensAfter = await tokenA.balanceOf(pool.address);

    const etherSent = etherAfter.sub(etherBefore);
    const tokensReceived = tokensAfter.sub(tokensBefore);
  });

});

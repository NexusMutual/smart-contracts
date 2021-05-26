const { accounts, web3 } = require('hardhat');
const { assert } = require('chai');
const { ether } = require('@openzeppelin/test-helpers');
const { MAX_UINT256 } = require('@openzeppelin/test-helpers').constants;

const { contracts } = require('./setup');

const [owner] = accounts;

describe('getSwapQuote', function () {

  it('reverts when missing historical readings', async function () {
    const { router, tokenA, weth, swapOperator } = contracts();

    await tokenA.mint(owner, ether('100'));
    await tokenA.approve(router.address, MAX_UINT256);

    await weth.deposit({ value: ether('100') });
    await weth.approve(router.address, MAX_UINT256);

    await router.addLiquidity(
      tokenA.address, // tokenA
      weth.address, // tokenB
      ether('100'), // amountADesired
      ether('50'), // amountBDesired
      ether('0'), // amountAMin
      ether('0'), // amountBMin
      owner, // send lp tokens to
      MAX_UINT256, // deadline infinity
    );

    const tokenAmountIn = ether('1');
    const path = [tokenA.address, weth.address];
    const expectedAmounts = await router.getAmountsOut(tokenAmountIn, path);
    const quote = await swapOperator.getSwapQuote(tokenAmountIn, tokenA.address, weth.address);
    assert.equal(quote.toString(), expectedAmounts[1].toString());
  });
});

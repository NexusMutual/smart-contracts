const { accounts, web3 } = require('hardhat');
const { assert } = require('chai');
const { ether, expectRevert } = require('@openzeppelin/test-helpers');

const { contracts } = require('./setup');
const { setNextBlockTime, mineNextBlock } = require('../utils').hardhat;

const { toBN } = web3.utils;
const [owner] = accounts;

const PERIOD_SIZE = 1800;
const PERIODS_PER_WINDOW = 8;
const WINDOW_SIZE = PERIOD_SIZE * PERIODS_PER_WINDOW;

const timestampToBucket = timestamp => toBN(timestamp).divn(PERIOD_SIZE).modn(PERIODS_PER_WINDOW);

describe('consult', function () {

  it('reverts when missing historical readings', async function () {

    const { oracle } = contracts();
    const bogus0 = '0xc0ffeec0ffeec0ffeec0ffeec0ffeec0ffee0000';
    const bogus1 = '0xc0ffeec0ffeec0ffeec0ffeec0ffeec0ffee0001';

    await expectRevert(
      oracle.consult(bogus0, ether('1'), bogus1),
      'TWAP: missing historical reading',
    );
  });

  it('reverts when the bucket reading is too old', async function () {

    const { oracle, router, tokenA, weth, wethAPair } = contracts();

    await tokenA.mint(owner, ether('100'));
    await tokenA.approve(router.address, -1);

    await weth.deposit({ value: ether('100') });
    await weth.approve(router.address, -1);

    await router.addLiquidity(
      tokenA.address, // tokenA
      weth.address, // tokenB
      ether('100'), // amountADesired
      ether('50'), // amountBDesired
      ether('0'), // amountAMin
      ether('0'), // amountBMin
      owner, // send lp tokens to
      -1, // deadline infinity
    );

    // window 0, period 0
    const period0 = toBN(1800000000);
    // window 1, period 7 (8 + 7 = 15)
    const period15 = toBN(1800000000 + WINDOW_SIZE * 2 - PERIOD_SIZE);

    assert.deepEqual(
      [period0, period15].map(p => timestampToBucket(p).toString()),
      ['0', '7'],
      'bucket index assertion failed',
    );

    await setNextBlockTime(period0.toNumber());
    await oracle.update([wethAPair.address]);

    await setNextBlockTime(period15.toNumber());
    await mineNextBlock();

    await expectRevert(
      oracle.consult(tokenA.address, ether('1'), weth.address),
      'TWAP: missing historical reading',
    );
  });

  it('works with a start of period update and an end of period consult', async function () {

    const { oracle, router, tokenA, weth, wethAPair } = contracts();

    await tokenA.mint(owner, ether('100'));
    await tokenA.approve(router.address, -1);

    await weth.deposit({ value: ether('100') });
    await weth.approve(router.address, -1);

    await router.addLiquidity(
      tokenA.address, // tokenA
      weth.address, // tokenB
      ether('100'), // amountADesired
      ether('50'), // amountBDesired
      ether('0'), // amountAMin
      ether('0'), // amountBMin
      owner, // send lp tokens to
      -1, // deadline infinity
    );

    // [period 3, period 2] window
    const period3 = toBN(1800000000 + PERIOD_SIZE * 3); // period start
    const period2 = period3.addn(WINDOW_SIZE - 1); // period end

    assert.deepEqual(
      [period3, period2].map(p => timestampToBucket(p).toString()),
      ['3', '2'],
      'bucket index assertion failed',
    );

    await setNextBlockTime(period3.toNumber());
    await oracle.update([wethAPair.address]);

    const bucket3 = await oracle.buckets(wethAPair.address, '3');
    assert.strictEqual(
      bucket3.timestamp.toString(),
      period3.toString(),
      'oracle update failed',
    );

    await setNextBlockTime(period2.toNumber());
    await mineNextBlock();

    await oracle.consult(tokenA.address, ether('1'), weth.address);
  });

  it("offers the correct price for the pair when the price doesn't change", async function () {

    const { oracle, router, tokenA, weth, wethAPair } = contracts();

    await tokenA.mint(owner, ether('100'));
    await tokenA.approve(router.address, -1);

    await weth.deposit({ value: ether('100') });
    await weth.approve(router.address, -1);

    // 100 tokenA == 50 weth
    await router.addLiquidity(
      tokenA.address, // tokenA
      weth.address, // tokenB
      ether('100'), // amountADesired
      ether('50'), // amountBDesired
      ether('0'), // amountAMin
      ether('0'), // amountBMin
      owner, // send lp tokens to
      -1, // deadline infinity
    );

    // [period 3, period 2] window
    const period3 = toBN(1800000000 + PERIOD_SIZE * 3); // period start
    const period2 = period3.addn(WINDOW_SIZE - 1); // period end

    assert.deepEqual(
      [period3, period2].map(p => timestampToBucket(p).toString()),
      ['3', '2'],
      'bucket index assertion failed',
    );

    await setNextBlockTime(period3.toNumber());
    await oracle.update([wethAPair.address]);

    const bucket3 = await oracle.buckets(wethAPair.address, '3');
    assert.strictEqual(
      bucket3.timestamp.toString(),
      period3.toString(),
      'oracle update failed',
    );

    await setNextBlockTime(period2.toNumber());
    await mineNextBlock();

    // 1 weth => 2 tokenA
    const actualTokenAOut = await oracle.consult(weth.address, ether('1'), tokenA.address);
    const expectedTokenAOut = ether('2');

    assert.strictEqual(
      actualTokenAOut.toString(),
      expectedTokenAOut.toString(),
      `expected tokenAOut = ${expectedTokenAOut} but got ${actualTokenAOut.toString()}`,
    );

    // 1 tokenA => 0.5 weth
    const actualWethOut = await oracle.consult(tokenA.address, ether('1'), weth.address);
    const expectedWethOut = ether('0.5');

    assert.strictEqual(
      actualWethOut.toString(),
      expectedWethOut.toString(),
      `expected wethOut = ${expectedWethOut.toString()} but got ${actualWethOut.toString()}`,
    );
  });

  it('offers the correct price for the pair when the price changes', async function () {

    const { oracle, router, tokenA, weth, wethAPair } = contracts();

    await tokenA.mint(owner, ether('100'));
    await tokenA.approve(router.address, -1);

    await weth.deposit({ value: ether('100') });
    await weth.approve(router.address, -1);

    // 100 tokenA == 50 weth
    await router.addLiquidity(
      tokenA.address, // tokenA
      weth.address, // tokenB
      ether('100'), // amountADesired
      ether('50'), // amountBDesired
      ether('0'), // amountAMin
      ether('0'), // amountBMin
      owner, // send lp tokens to
      -1, // deadline infinity
    );

    // [period 3, period 2] window
    const period3 = toBN(1800000000 + PERIOD_SIZE * 3); // period start
    const period2 = period3.addn(WINDOW_SIZE - 1); // period end
    const swapTime = period2.subn(60); // 60 seconds before the period end

    const weigth0 = swapTime.sub(period3); // amount of time the initial price was the true price
    const weigth1 = period2.sub(swapTime); // amount of time the second price was the true price
    const totalWeightTime = weigth0.add(weigth1);

    const price0Cumulative = toBN('0');
    const price1Cumulative = toBN('0');

    { // update cumulative prices
      const { _reserve0, _reserve1 } = await wethAPair.getReserves();
      // shift left by 112 bits to avoid precision loss - just like uniswap does
      const price0 = _reserve1.shln(112).div(_reserve0);
      const price1 = _reserve0.shln(112).div(_reserve1);
      price0Cumulative.iadd(price0.mul(weigth0));
      price1Cumulative.iadd(price1.mul(weigth0));
    }

    assert.deepEqual(
      [period3, period2].map(p => timestampToBucket(p).toString()),
      ['3', '2'],
      'bucket index assertion failed',
    );

    await setNextBlockTime(period3.toNumber());
    await oracle.update([wethAPair.address]);

    const bucket3 = await oracle.buckets(wethAPair.address, '3');
    assert.strictEqual(
      bucket3.timestamp.toString(),
      period3.toString(),
      'oracle update failed',
    );

    // perform a swap to skew the price
    await setNextBlockTime(swapTime.toNumber());
    await router.swapExactETHForTokens(
      '0', // amountOutMin
      [weth.address, tokenA.address], // route
      owner, // to
      -1, // deadline
      { value: ether('1') },
    );

    { // update cumulative prices
      const { _reserve0, _reserve1 } = await wethAPair.getReserves();
      const price0 = _reserve1.shln(112).div(_reserve0);
      const price1 = _reserve0.shln(112).div(_reserve1);
      price0Cumulative.iadd(price0.mul(weigth1));
      price1Cumulative.iadd(price1.mul(weigth1));
    }

    const wethIsToken0 = weth.address.toLowerCase() < tokenA.address.toLowerCase();
    const [wethPriceCumulative, tokenAPriceCumulative] = wethIsToken0
      ? [price0Cumulative, price1Cumulative]
      : [price1Cumulative, price0Cumulative];

    // consult the oracle
    await setNextBlockTime(period2.toNumber());
    await mineNextBlock();

    const actualTokenAOut = await oracle.consult(weth.address, ether('1'), tokenA.address);
    const expectedTokenAOut = wethPriceCumulative.div(totalWeightTime).mul(ether('1')).shrn(112);

    assert.strictEqual(
      actualTokenAOut.toString(),
      expectedTokenAOut.toString(),
      `expected tokenAOut = ${expectedTokenAOut} but got ${actualTokenAOut.toString()}`,
    );

    const actualWethOut = await oracle.consult(tokenA.address, ether('1'), weth.address);
    const expectedWethOut = tokenAPriceCumulative.div(totalWeightTime).mul(ether('1')).shrn(112);

    assert.strictEqual(
      actualWethOut.toString(),
      expectedWethOut.toString(),
      `expected wethOut = ${expectedWethOut.toString()} but got ${actualWethOut.toString()}`,
    );
  });

});

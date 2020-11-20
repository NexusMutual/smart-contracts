const { accounts, artifacts, web3 } = require('hardhat');
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

});

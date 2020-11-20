const { artifacts, web3 } = require('hardhat');
const { assert } = require('chai');
const { ether } = require('@openzeppelin/test-helpers');

const { setNextBlockTime } = require('../utils').hardhat;
const { contracts } = require('./setup');
const { toBN } = web3.utils;

const PERIOD_SIZE = 1800;
const PERIODS_PER_WINDOW = 8;
const timestampToBucket = timestamp => toBN(timestamp).divn(PERIOD_SIZE).modn(PERIODS_PER_WINDOW);

/** @var {ToMockUniswapPairContract} UniswapPairMock */
const UniswapPairMock = artifacts.require('TOMockUniswapPair');

// Note: When setting the reserves on the mock it's important to the `blockTimestampLast`
// parameter (named targetTime below) to the same block timestamp when the update will occur.
// This allows setting the reserves to 0 while maintaining the same functionality.
// If you get a "FixedPoint: DIV_BY_ZERO" revert reason - make sure you are setting the correct timestamp.
// These reserves are used by UniswapV2OracleLibrary.sol which is Uniswap's code and we do not intend to test it.

describe('update', function () {

  it('should correctly fetch and store cumulative prices', async function () {

    const { oracle } = contracts();
    const targetTime = toBN(1800000000);

    const pair = await UniswapPairMock.new();
    await pair.setCumulativePrices(ether('1'), ether('2'));
    await pair.setReserves('0', '0', targetTime);

    await setNextBlockTime(targetTime.toNumber());
    await oracle.update([pair.address]);

    const bucket = await oracle.buckets(pair.address, timestampToBucket(targetTime));
    assert.strictEqual(bucket.price0Cumulative.toString(), ether('1').toString());
    assert.strictEqual(bucket.price1Cumulative.toString(), ether('2').toString());
    assert.strictEqual(bucket.timestamp.toString(), targetTime.toString());
  });

  it('should not update more than once in the same period', async function () {

    const { oracle } = contracts();

    const period0Start = toBN(1800000000);
    const period0End = toBN(1800000000 + PERIOD_SIZE - 1);
    const period1Start = toBN(1800000000 + PERIOD_SIZE);

    const pair = await UniswapPairMock.new();
    await pair.setCumulativePrices(ether('1'), ether('2'));
    await pair.setReserves('0', '0', period0Start);

    // first update should work
    await setNextBlockTime(period0Start.toNumber());
    await oracle.update([pair.address]);

    // set next prices, these shouldn't be fetched yet
    await pair.setCumulativePrices(ether('2'), ether('4'));
    await pair.setReserves('0', '0', period1Start);

    // second update should be skipped
    await setNextBlockTime(period0End.toNumber());
    await oracle.update([pair.address]);

    // assert initial values
    const bucket0 = await oracle.buckets(pair.address, timestampToBucket(period0Start));
    assert.strictEqual(bucket0.price0Cumulative.toString(), ether('1').toString());
    assert.strictEqual(bucket0.price1Cumulative.toString(), ether('2').toString());
    assert.strictEqual(bucket0.timestamp.toString(), period0Start.toString());

    // this update go into the second period bucket
    await setNextBlockTime(period1Start.toNumber());
    await oracle.update([pair.address]);

    const bucket1 = await oracle.buckets(pair.address, timestampToBucket(period1Start));
    assert.strictEqual(bucket1.price0Cumulative.toString(), ether('2').toString());
    assert.strictEqual(bucket1.price1Cumulative.toString(), ether('4').toString());
    assert.strictEqual(bucket1.timestamp.toString(), period1Start.toString());
  });

  it('should silently skip already updated pairs', async function () {

    const { oracle } = contracts();

    const pair0TargetTime = toBN(1800000000);
    const pair1TargetTime = toBN(1800000060);

    const pair0 = await UniswapPairMock.new();
    const pair1 = await UniswapPairMock.new();

    await pair0.setCumulativePrices(ether('1'), ether('2'));
    await pair0.setReserves('0', '0', pair0TargetTime);

    // update first
    await setNextBlockTime(pair0TargetTime.toNumber());
    await oracle.update([pair0.address]);

    // the crowd goes wild for pair0, ok values for pair1
    await pair0.setCumulativePrices(ether('100'), ether('200'));
    await pair0.setReserves('0', '0', pair1TargetTime);
    await pair1.setCumulativePrices(ether('3'), ether('4'));
    await pair1.setReserves('0', '0', pair1TargetTime);

    // update both pairs, the first one should be skipped
    await setNextBlockTime(pair1TargetTime.toNumber());
    await oracle.update([pair0.address, pair1.address]);

    const bucketIndex = timestampToBucket(pair0TargetTime);
    const pair0bucket = await oracle.buckets(pair0.address, bucketIndex);
    const pair1bucket = await oracle.buckets(pair1.address, bucketIndex);

    // pair0 should have been skipped and contain initial values
    assert.strictEqual(pair0bucket.price0Cumulative.toString(), ether('1').toString());
    assert.strictEqual(pair0bucket.price1Cumulative.toString(), ether('2').toString());
    assert.strictEqual(pair0bucket.timestamp.toString(), pair0TargetTime.toString());

    // pair1 should have been updated
    assert.strictEqual(pair1bucket.price0Cumulative.toString(), ether('3').toString());
    assert.strictEqual(pair1bucket.price1Cumulative.toString(), ether('4').toString());
    assert.strictEqual(pair1bucket.timestamp.toString(), pair1TargetTime.toString());
  });

});

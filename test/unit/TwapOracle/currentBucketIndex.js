const { assert } = require('chai');

const { contracts } = require('./setup');
const { setNextBlockTime, mineNextBlock } = require('../utils').hardhat;

describe('currentBucketIndex', function () {

  it('should return the correct bucket for current timestamp', async function () {

    const { oracle } = contracts();

    const periodSize = 1800;
    const periodsPerWindow = 8;
    const windowSize = 14400; // = 8 * 1800 = 4 hours

    const actualPeriodSize = await oracle.periodSize();
    const actualPeriodsPerWindow = await oracle.periodsPerWindow();
    const actualWindowSize = await oracle.windowSize();

    assert.strictEqual(actualPeriodSize.toNumber(), periodSize, 'period size should be 1800');
    assert.strictEqual(actualPeriodsPerWindow.toNumber(), periodsPerWindow, 'window size should be 4h');
    assert.strictEqual(actualWindowSize.toNumber(), windowSize, 'window size should be 4h');

    let targetTime = 1800000000 - 1; // one second before 15 Jan 2027 08:00:00 AM UTC
    const increments = [1, 1798, 1]; // 3 checks per period: start, middle, end
    assert.strictEqual(increments.reduce((a, b) => a + b, 0), periodSize);

    for (let i = 0; i < periodsPerWindow * 2; i++) {

      for (const increment of increments) {

        targetTime += increment;
        await setNextBlockTime(targetTime);
        await mineNextBlock();

        const expectedIndex = i % 8;
        const actualIndex = await oracle.currentBucketIndex();

        assert.strictEqual(
          actualIndex.toNumber(),
          expectedIndex,
          `expected bucket ${expectedIndex}, got ${actualIndex} at timestamp ${targetTime}`,
        );
      }
    }

  });

});

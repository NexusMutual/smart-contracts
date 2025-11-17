const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, time, mine, setBlockGasLimit } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');
const { setAutomine } = require('../utils');

describe('updateTwap', function () {
  it('should update observations correctly', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const { PERIOD_SIZE } = fixture.constants;

    const currentTimestamp = await time.latest();
    const periodSizeNum = Number(PERIOD_SIZE);
    const nextBlockTimestamp = Number(currentTimestamp) + periodSizeNum * 3;

    const beforeObservations = [];
    for (let i = 0; i < 3; i++) {
      const observation = await ramm.observations(i);
      beforeObservations[i] = {
        priceCumulativeAbove: observation.priceCumulativeAbove,
        priceCumulativeBelow: observation.priceCumulativeBelow,
        timestamp: observation.timestamp,
      };
    }

    await time.setNextBlockTimestamp(nextBlockTimestamp);
    await ramm.updateTwap();

    const afterObservations = [];
    for (let i = 0; i < 3; i++) {
      const observation = await ramm.observations(i);
      afterObservations[i] = {
        priceCumulativeAbove: observation.priceCumulativeAbove,
        priceCumulativeBelow: observation.priceCumulativeBelow,
        timestamp: observation.timestamp,
      };
    }

    // Check that observations were updated
    for (let i = 0; i < 3; i++) {
      expect(afterObservations[i].timestamp).to.be.gte(beforeObservations[i].timestamp);
      // At least one observation should have a newer timestamp
      if (i === 0) {
        expect(afterObservations[i].timestamp).to.be.gt(beforeObservations[i].timestamp);
      }
    }
  });

  it('should emit ObservationUpdated events', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const { PERIOD_SIZE } = fixture.constants;

    const currentTimestamp = await time.latest();
    const nextBlockTimestamp = Number(currentTimestamp) + Number(PERIOD_SIZE);

    await time.setNextBlockTimestamp(nextBlockTimestamp);
    const tx = await ramm.updateTwap();

    const receipt = await tx.wait();
    const events = receipt.logs.filter(log => {
      try {
        const parsed = ramm.interface.parseLog(log);
        return parsed && parsed.name === 'ObservationUpdated';
      } catch {
        return false;
      }
    });

    expect(events.length).to.be.equal(3);
  });

  it('should not update if already updated in the same block', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;

    await time.increase(5 * 60);
    await setBlockGasLimit('0xFFFFFFFF');

    await setAutomine(false);
    const firstUpdate = await ramm.updateTwap();
    const secondUpdate = await ramm.updateTwap();
    await mine();
    await setAutomine(true);

    const traceConfig = { disableMemory: true, disableStack: true, disableStorage: true };
    const firstTrace = await ethers.provider.send('debug_traceTransaction', [firstUpdate.hash, traceConfig]);
    const secondTrace = await ethers.provider.send('debug_traceTransaction', [secondUpdate.hash, traceConfig]);

    expect(firstTrace.structLogs.filter(i => i.op === 'SSTORE').length).to.be.gt(0);
    expect(secondTrace.structLogs.filter(i => i.op === 'SSTORE').length).to.be.eq(0);
  });
});

const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');
const { setNextBlockTime, mineNextBlock, setAutomine } = require('../../utils/evm');
const { calculateEthToExtract, calculateEthToInject, getExpectedObservations, setEthReserveValue } =
  require('../utils').rammCalculations;

describe('updateTwap', function () {
  it('should update observations', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController, mcr } = fixture.contracts;
    const { PERIOD_SIZE } = fixture.constants;

    const { timestamp } = await ethers.provider.getBlock('latest');
    const currentTimestamp = PERIOD_SIZE.mul(3).add(timestamp);

    const state = await ramm.loadState();
    const observationsAfterExpected = await getExpectedObservations(
      state,
      ramm,
      pool,
      tokenController,
      mcr,
      fixture.constants,
      currentTimestamp,
    );

    await setNextBlockTime(currentTimestamp.toNumber());
    await ramm.updateTwap();

    const observations = await Promise.all([0, 1, 2].map(i => ramm.observations(i)));

    for (let i = 0; i < observations.length; i++) {
      expect(observations[i].timestamp).to.be.equal(observationsAfterExpected[i].timestamp);
      expect(observations[i].priceCumulativeBelow).to.be.equal(observationsAfterExpected[i].priceCumulativeBelow);
      expect(observations[i].priceCumulativeAbove).to.be.equal(observationsAfterExpected[i].priceCumulativeAbove);
    }
  });

  it('should emit ObservationUpdated event for each observation update', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController, mcr } = fixture.contracts;
    const { PERIOD_SIZE } = fixture.constants;

    const { timestamp } = await ethers.provider.getBlock('latest');
    const currentTimestamp = PERIOD_SIZE.mul(3).add(timestamp);

    const state = await ramm.loadState();
    const [obsv1, obsv2, obsv3] = await getExpectedObservations(
      state,
      ramm,
      pool,
      tokenController,
      mcr,
      fixture.constants,
      currentTimestamp,
    );

    await setNextBlockTime(currentTimestamp.toNumber());
    await expect(ramm.updateTwap())
      .to.emit(ramm, 'ObservationUpdated')
      .withArgs(obsv1.timestamp, obsv1.priceCumulativeAbove, obsv1.priceCumulativeBelow)
      .to.emit(ramm, 'ObservationUpdated')
      .withArgs(obsv2.timestamp, obsv2.priceCumulativeAbove, obsv2.priceCumulativeBelow)
      .to.emit(ramm, 'ObservationUpdated')
      .withArgs(obsv3.timestamp, obsv3.priceCumulativeAbove, obsv3.priceCumulativeBelow);
  });

  it('should emit EthInjected with the correct ETH injected value', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;

    const { timestamp } = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = timestamp + 5 * 60;

    // Set ETH reserve < TARGET_LIQUIDITY (5000) to force injection
    await setEthReserveValue(ramm.address, 4999);

    const state = await ramm.loadState();
    await setNextBlockTime(nextBlockTimestamp);

    const expectedInjected = calculateEthToInject(state, nextBlockTimestamp, fixture.constants);
    await expect(ramm.updateTwap()).to.emit(ramm, 'EthInjected').withArgs(expectedInjected);
  });

  it('should emit EthExtracted with the correct ETH extracted value', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;

    const { timestamp } = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = timestamp + 5 * 60;

    // Set ETH reserve > TARGET_LIQUIDITY (5000) to force extraction
    await setEthReserveValue(ramm.address, 6000);

    const state = await ramm.loadState();
    await setNextBlockTime(nextBlockTimestamp);

    const expectedExtracted = calculateEthToExtract(state, nextBlockTimestamp, fixture.constants);
    await expect(ramm.updateTwap()).to.emit(ramm, 'EthExtracted').withArgs(expectedExtracted);
  });

  it('should exit early when called a second time in the same block', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;

    const { timestamp } = await ethers.provider.getBlock('latest');
    await setNextBlockTime(timestamp + 5 * 60);

    await setAutomine(false);
    const firstUpdate = await ramm.updateTwap();
    const secondUpdate = await ramm.updateTwap();
    await mineNextBlock();
    await setAutomine(true);

    const traceConfig = { disableMemory: true, disableStack: true, disableStorage: true };
    const firstTrace = await ethers.provider.send('debug_traceTransaction', [firstUpdate.hash, traceConfig]);
    const secondTrace = await ethers.provider.send('debug_traceTransaction', [secondUpdate.hash, traceConfig]);

    expect(firstTrace.structLogs.filter(i => i.op === 'SSTORE').length).to.be.gt(0);
    expect(secondTrace.structLogs.filter(i => i.op === 'SSTORE').length).to.be.eq(0);
  });
});

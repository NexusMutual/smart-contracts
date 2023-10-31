const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');
const { timeTillBv, calculateTwapAboveForPeriod, calculateTwapBelowForPeriod } = require('../../utils/internalPrice');

const { BigNumber } = ethers;

describe('getObservation', function () {
  it('should do underflow/overflow sanity check for get observation', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController, mcr } = fixture.contracts;
    const { PERIOD_SIZE, GRANULARITY } = fixture.constants;

    const previousState = await ramm.loadState();
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const mcrValue = await mcr.getMCR();

    const { maxTimeOnRatchetA, maxTimeOnRatchetB } = timeTillBv(previousState, supply, capital, fixture.constants);

    const timeElapsed = maxTimeOnRatchetA.gt(maxTimeOnRatchetB)
      ? maxTimeOnRatchetA.add(PERIOD_SIZE)
      : maxTimeOnRatchetB.add(PERIOD_SIZE);

    const state = await ramm._getReserves(
      previousState,
      capital,
      supply,
      mcrValue,
      previousState.timestamp.add(timeElapsed.toNumber()),
    );

    const previousObservationIndex = Math.ceil(previousState.timestamp.toNumber() / PERIOD_SIZE) % GRANULARITY;
    const previousObservation = await ramm.observations(previousObservationIndex);

    const priceCumulativeAbove = calculateTwapAboveForPeriod(
      previousState,
      state,
      timeElapsed,
      maxTimeOnRatchetA,
      capital,
      supply,
      fixture.constants,
    );

    const priceCumulativeBelow = calculateTwapBelowForPeriod(
      previousState,
      state,
      timeElapsed,
      maxTimeOnRatchetB,
      capital,
      supply,
      fixture.constants,
    );

    const observation = await ramm.getObservation(previousState, state, previousObservation, capital, supply);

    expect(observation.priceCumulativeBelow).to.equal(
      previousObservation.priceCumulativeBelow.add(priceCumulativeBelow.mod(BigNumber.from(2).pow(64))),
    );
    expect(observation.priceCumulativeAbove).to.equal(
      previousObservation.priceCumulativeAbove.add(priceCumulativeAbove.mod(BigNumber.from(2).pow(64))),
    );
  });
});

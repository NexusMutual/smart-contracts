const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { getState, setup } = require('./setup');
const { setNextBlockTime } = require('../../utils/evm');
const { calculateObservation, divCeil } = require('./helpers');

const { BigNumber } = ethers;

describe('updateTwap', function () {
  it('should update observations', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;
    const { PERIOD_SIZE, GRANULARITY } = fixture.constants;

    let previousState = await getState(ramm);
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();

    const { timestamp } = await ethers.provider.getBlock('latest');
    const currentTimestamp = PERIOD_SIZE.mul(3).add(timestamp);
    const observationsAfterExpected = [];
    const endIdx = divCeil(currentTimestamp, PERIOD_SIZE).toNumber();

    for (let i = endIdx - 2; endIdx >= i; i++) {
      const previousObservationIndex = BigNumber.from(i - 1).mod(GRANULARITY);
      const previousObservation =
        observationsAfterExpected[previousObservationIndex] || (await ramm.observations(previousObservationIndex));

      const observationIndex = BigNumber.from(i).mod(GRANULARITY);
      const timestamp = Math.min(currentTimestamp.toNumber(), PERIOD_SIZE.mul(i).toNumber());

      const state = await ramm._getReserves(previousState, capital, supply, timestamp);

      const observationData = calculateObservation(
        state,
        previousState,
        previousObservation,
        capital,
        supply,
        BigNumber.from(timestamp - previousState.timestamp),
        fixture.constants,
      );

      observationsAfterExpected[observationIndex] = {
        timestamp,
        priceCumulativeBelow: observationData.priceCumulativeBelow,
        priceCumulativeAbove: observationData.priceCumulativeAbove,
      };

      previousState = state;
    }

    await setNextBlockTime(currentTimestamp.toNumber());
    await ramm.updateTwap();

    const observations = await Promise.all([0, 1, 2].map(i => ramm.observations(i)));

    for (let i = 0; i < observations.length; i++) {
      expect(observations[i].timestamp).to.be.equal(observationsAfterExpected[i].timestamp);
      expect(observations[i].priceCumulativeBelow).to.be.equal(observationsAfterExpected[i].priceCumulativeBelow);
      expect(observations[i].priceCumulativeAbove).to.be.equal(observationsAfterExpected[i].priceCumulativeAbove);
    }
  });
});

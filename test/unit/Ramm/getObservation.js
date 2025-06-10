const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');
const { daysToSeconds } = require('../../utils').helpers;
const { setNextBlockTime } = require('../../utils').evm;

const { timeTillBv, calculateTwapAboveForPeriod, calculateTwapBelowForPeriod } = require('../utils').rammCalculations;
const { divCeil } = require('../utils').bnMath;

const { Role } = require('../utils').constants;
const { hex } = require('../utils').helpers;

const { parseEther } = ethers;

describe('getObservation', function () {
  it('should check initial observation', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;
    const { PRICE_BUFFER_DENOMINATOR, PRICE_BUFFER, PERIOD_SIZE } = fixture.constants;

    const { updatedAt } = await ramm.slot1();
    const timestamp = BigInt(updatedAt);
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const bondingCurvePrice = await pool.getTokenPrice();

    const initialPriceA = BigInt(bondingCurvePrice) + 
      BigInt(parseEther('1')) * BigInt(capital) * BigInt(PRICE_BUFFER) / BigInt(PRICE_BUFFER_DENOMINATOR) / BigInt(supply);
    const initialPriceB = BigInt(parseEther('1')) *
      BigInt(capital) *
      (BigInt(PRICE_BUFFER_DENOMINATOR) - BigInt(PRICE_BUFFER)) /
      BigInt(PRICE_BUFFER_DENOMINATOR) /
      BigInt(supply);

    let priceCumulativeAbove = 0n;
    let priceCumulativeBelow = 0n;
    const endIdx = divCeil(timestamp, PERIOD_SIZE);
    let previousTimestamp = (BigInt(endIdx) - 11n) * BigInt(PERIOD_SIZE);
    const expectedObservations = [];

    for (let idx = BigInt(endIdx) - 2n; idx <= BigInt(endIdx); idx = idx + 1n) {
      const observationTimestamp = timestamp <= idx * BigInt(PERIOD_SIZE) ? timestamp : idx * BigInt(PERIOD_SIZE);
      const observationIndex = Number(idx % 3n);
      const timeElapsed = observationTimestamp - previousTimestamp;

      priceCumulativeAbove = priceCumulativeAbove + initialPriceA * timeElapsed;
      priceCumulativeBelow = priceCumulativeBelow + initialPriceB * timeElapsed;

      expectedObservations[observationIndex] = {
        timestamp: observationTimestamp,
        priceCumulativeAbove,
        priceCumulativeBelow,
      };
      previousTimestamp = observationTimestamp;
    }

    const observations = await Promise.all([0, 1, 2].map(index => ramm.observations(index)));

    for (const i in observations) {
      expect(observations[i].timestamp).to.be.equal(expectedObservations[i].timestamp);
      expect(observations[i].priceCumulativeAbove).to.be.equal(expectedObservations[i].priceCumulativeAbove);
      expect(observations[i].priceCumulativeBelow).to.be.equal(expectedObservations[i].priceCumulativeBelow);
    }
  });

  it('should do underflow/overflow sanity check for get observation', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController, mcr } = fixture.contracts;
    const { PERIOD_SIZE, GRANULARITY } = fixture.constants;

    const previousState = await ramm.loadState();
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const context = {
      capital,
      supply,
      mcr: await mcr.getMCR(),
    };

    const { maxTimeOnRatchetA, maxTimeOnRatchetB } = timeTillBv(previousState, supply, capital, fixture.constants);

    const timeElapsed = BigInt(maxTimeOnRatchetA) > BigInt(maxTimeOnRatchetB)
      ? BigInt(maxTimeOnRatchetA) + BigInt(PERIOD_SIZE)
      : BigInt(maxTimeOnRatchetB) + BigInt(PERIOD_SIZE);

    const [state] = await ramm._getReserves(
      previousState,
      context,
      Number(timeElapsed + BigInt(previousState.timestamp)),
    );

    const previousObservationIndex = Math.ceil(Number(previousState.timestamp) / Number(PERIOD_SIZE)) % Number(GRANULARITY);
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
      previousObservation.priceCumulativeBelow + (priceCumulativeBelow % (2n ** 112n)),
    );
    expect(observation.priceCumulativeAbove).to.equal(
      previousObservation.priceCumulativeAbove + (priceCumulativeAbove % (2n ** 112n)),
    );
  });
});

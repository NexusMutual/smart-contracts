const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');
const { timeTillBv, calculateTwapAboveForPeriod, calculateTwapBelowForPeriod } = require('../utils').rammCalculations;
const { divCeil } = require('../utils').bnMath;

const { parseEther } = ethers.utils;
const { BigNumber } = ethers;

describe('getObservation', function () {
  it('should check initial observation', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;
    const { PRICE_BUFFER_DENOMINATOR, PRICE_BUFFER, PERIOD_SIZE } = fixture.constants;

    const { updatedAt } = await ramm.slot1();
    const timestamp = BigNumber.from(updatedAt);
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const bondingCurvePrice = await pool.getTokenPrice();

    const initialPriceA = bondingCurvePrice.add(
      parseEther('1').mul(capital).mul(PRICE_BUFFER).div(PRICE_BUFFER_DENOMINATOR).div(supply),
    );
    const initialPriceB = parseEther('1')
      .mul(capital)
      .mul(PRICE_BUFFER_DENOMINATOR.sub(PRICE_BUFFER))
      .div(PRICE_BUFFER_DENOMINATOR)
      .div(supply);

    let priceCumulativeAbove = BigNumber.from(0);
    let priceCumulativeBelow = BigNumber.from(0);
    const endIdx = divCeil(timestamp, PERIOD_SIZE);
    let previousTimestamp = endIdx.sub(11).mul(PERIOD_SIZE);
    const expectedObservations = [];

    for (let idx = endIdx.sub(2); idx.lte(endIdx); idx = idx.add(1)) {
      const observationTimestamp = timestamp.lte(idx.mul(PERIOD_SIZE)) ? timestamp : idx.mul(PERIOD_SIZE);
      const observationIndex = idx.mod(3).toNumber();
      const timeElapsed = observationTimestamp.sub(previousTimestamp);

      priceCumulativeAbove = priceCumulativeAbove.add(initialPriceA.mul(timeElapsed));
      priceCumulativeBelow = priceCumulativeBelow.add(initialPriceB.mul(timeElapsed));

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

    const timeElapsed = maxTimeOnRatchetA.gt(maxTimeOnRatchetB)
      ? maxTimeOnRatchetA.add(PERIOD_SIZE)
      : maxTimeOnRatchetB.add(PERIOD_SIZE);

    const [state] = await ramm._getReserves(
      previousState,
      context,
      timeElapsed.add(previousState.timestamp).toNumber(),
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
      previousObservation.priceCumulativeBelow.add(priceCumulativeBelow.mod(BigNumber.from(2).pow(112))),
    );
    expect(observation.priceCumulativeAbove).to.equal(
      previousObservation.priceCumulativeAbove.add(priceCumulativeAbove.mod(BigNumber.from(2).pow(112))),
    );
  });
});

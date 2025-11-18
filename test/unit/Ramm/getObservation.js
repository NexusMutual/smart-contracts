const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');
const { timeTillBv, calculateTwapAboveForPeriod, calculateTwapBelowForPeriod } = require('./rammCalculations');

const { parseEther } = ethers;
const { BigIntMath } = nexus.helpers;

function divCeil(a, b) {
  const aBigInt = BigInt(a);
  const bBigInt = BigInt(b);
  let result = aBigInt / bBigInt;
  if (aBigInt % bBigInt !== 0n) {
    result = result + 1n;
  }
  return result;
}

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

    // priceBufferAbove represents the additional buffer added to bonding curve for buy price
    const priceBufferAbove = (parseEther('1') * capital * PRICE_BUFFER) / PRICE_BUFFER_DENOMINATOR / supply;
    // priceBufferBelow represents the full buffered price for sell price
    const bufferedCapitalBelow = (capital * (PRICE_BUFFER_DENOMINATOR - PRICE_BUFFER)) / PRICE_BUFFER_DENOMINATOR;

    const initialPriceA = bondingCurvePrice + priceBufferAbove; // buy price
    const initialPriceB = (parseEther('1') * bufferedCapitalBelow) / supply; // sell price

    let priceCumulativeAbove = 0n;
    let priceCumulativeBelow = 0n;
    const endIdx = divCeil(timestamp, PERIOD_SIZE);
    let previousTimestamp = (endIdx - 11n) * PERIOD_SIZE;
    const expectedObservations = [];

    for (let idx = endIdx - 2n; idx <= endIdx; idx = idx + 1n) {
      const observationTimestamp = timestamp <= idx * PERIOD_SIZE ? timestamp : idx * PERIOD_SIZE;
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
    const { ramm, pool, tokenController } = fixture.contracts;
    const { PERIOD_SIZE, GRANULARITY } = fixture.constants;

    const previousState = await ramm.loadState();
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const mcrValue = await pool.getMCR();
    const context = {
      capital,
      supply,
      mcr: mcrValue,
    };

    const { maxTimeOnRatchetA, maxTimeOnRatchetB } = timeTillBv(
      previousState.toObject(),
      supply,
      capital,
      fixture.constants,
    );

    const timeElapsed =
      maxTimeOnRatchetA > maxTimeOnRatchetB ? maxTimeOnRatchetA + PERIOD_SIZE : maxTimeOnRatchetB + PERIOD_SIZE;

    const [stateResult] = await ramm._getReserves(
      previousState.toObject(),
      context,
      timeElapsed + previousState.timestamp,
    );
    const state = stateResult.toObject ? stateResult.toObject() : stateResult;

    const previousObservationIndex = BigIntMath.divCeil(previousState.timestamp, PERIOD_SIZE) % GRANULARITY;
    const previousObservationResult = await ramm.observations(previousObservationIndex);
    const previousObservation = previousObservationResult.toObject
      ? previousObservationResult.toObject()
      : previousObservationResult;

    const priceCumulativeAbove = calculateTwapAboveForPeriod(
      previousState.toObject(),
      state,
      timeElapsed,
      maxTimeOnRatchetA,
      capital,
      supply,
      fixture.constants,
    );

    const priceCumulativeBelow = calculateTwapBelowForPeriod(
      previousState.toObject(),
      state,
      timeElapsed,
      maxTimeOnRatchetB,
      capital,
      supply,
      fixture.constants,
    );

    const observation = await ramm.getObservation(
      previousState.toObject(),
      state,
      previousObservation,
      capital,
      supply,
    );

    const modValue = 2n ** 112n;
    expect(observation.priceCumulativeBelow).to.equal(
      previousObservation.priceCumulativeBelow + (priceCumulativeBelow % modValue),
    );
    expect(observation.priceCumulativeAbove).to.equal(
      previousObservation.priceCumulativeAbove + (priceCumulativeAbove % modValue),
    );
  });
});

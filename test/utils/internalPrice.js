const { ethers } = require('hardhat');

const { BigNumber } = ethers;
const { parseEther } = ethers.utils;

function divCeil(a, b) {
  a = BigNumber.from(a);
  let result = a.div(b);
  if (!a.mod(b).isZero()) {
    result = result.add(1);
  }
  return result;
}

function getObservationIndex(timestamp, { PERIOD_SIZE, GRANULARITY }) {
  return divCeil(timestamp, PERIOD_SIZE).mod(GRANULARITY);
}

/**
 * Calculates the internal NXM token price in ETH for given states
 */
function calculateInternalPrice(currentState, observations, capital, supply, currentTimestamp, constants) {
  const { GRANULARITY } = constants;
  const currentIdx = getObservationIndex(BigNumber.from(currentTimestamp), constants);
  const previousIdx = currentIdx.add(1).mod(GRANULARITY);

  const firstObservation = observations[previousIdx.toNumber()];
  const currentObservation = observations[currentIdx.toNumber()];

  const elapsed = BigNumber.from(currentTimestamp).sub(firstObservation.timestamp);

  const spotPriceA = parseEther('1').mul(currentState.eth).div(currentState.nxmA);
  const spotPriceB = parseEther('1').mul(currentState.eth).div(currentState.nxmB);

  const averagePriceA = currentObservation.priceCumulativeAbove
    .sub(firstObservation.priceCumulativeAbove)
    .mul(1e9)
    .div(elapsed);

  const averagePriceB = currentObservation.priceCumulativeBelow
    .sub(firstObservation.priceCumulativeBelow)
    .mul(1e9)
    .div(elapsed);

  const priceA = averagePriceA.gt(spotPriceA) ? spotPriceA : averagePriceA;
  const priceB = averagePriceB.gt(spotPriceB) ? averagePriceB : spotPriceB;

  return priceA.add(priceB).sub(parseEther('1').mul(capital).div(supply));
}

function timeTillBv(
  previousState,
  supply,
  capital,
  { PRICE_BUFFER_DENOMINATOR, PRICE_BUFFER, RATCHET_DENOMINATOR, RATCHET_PERIOD },
) {
  // below
  const innerRightB = previousState.eth.mul(supply);
  const innerLeftB = PRICE_BUFFER_DENOMINATOR.sub(PRICE_BUFFER)
    .mul(capital)
    .mul(previousState.nxmB)
    .div(PRICE_BUFFER_DENOMINATOR);
  const innerB = innerLeftB.gt(innerRightB) ? innerLeftB.sub(innerRightB) : BigNumber.from(0);
  const maxTimeOnRatchetB = innerB.eq(0)
    ? BigNumber.from(0)
    : innerB
        .mul(RATCHET_DENOMINATOR)
        .mul(RATCHET_PERIOD)
        .div(capital)
        .div(previousState.nxmB)
        .div(previousState.ratchetSpeed);

  // above
  const innerLeftA = previousState.eth.mul(supply);
  const innerRightA = PRICE_BUFFER_DENOMINATOR.add(PRICE_BUFFER)
    .mul(capital)
    .mul(previousState.nxmA)
    .div(PRICE_BUFFER_DENOMINATOR);
  const innerA = innerLeftA.gt(innerRightA) ? innerLeftA.sub(innerRightA) : BigNumber.from(0);
  const maxTimeOnRatchetA = innerA.eq(0)
    ? BigNumber.from(0)
    : innerA
        .mul(RATCHET_DENOMINATOR)
        .mul(RATCHET_PERIOD)
        .div(capital)
        .div(previousState.nxmA)
        .div(previousState.ratchetSpeed);

  return { maxTimeOnRatchetA, maxTimeOnRatchetB };
}

function calculateTwapAboveForPeriod(
  previousState,
  state,
  timeElapsed,
  timeTillBV,
  capital,
  supply,
  { PRICE_BUFFER_DENOMINATOR, PRICE_BUFFER },
) {
  const timeOnRatchet = timeTillBV.gt(timeElapsed) ? timeElapsed : timeTillBV;
  const timeOnBV = timeElapsed.sub(timeOnRatchet);

  const twapOnRatchet = parseEther('1')
    .mul(previousState.eth.mul(state.nxmA).add(state.eth.mul(previousState.nxmA)))
    .mul(timeOnRatchet)
    .div(previousState.nxmA)
    .div(state.nxmA)
    .div(2)
    .div(1e9);

  const twapOnBV = parseEther('1')
    .mul(timeOnBV)
    .mul(capital)
    .mul(PRICE_BUFFER_DENOMINATOR.add(PRICE_BUFFER))
    .div(supply)
    .div(PRICE_BUFFER_DENOMINATOR)
    .div(1e9);

  return twapOnRatchet.add(twapOnBV);
}

function calculateTwapBelowForPeriod(
  previousState,
  state,
  timeElapsed,
  timeTillBV,
  capital,
  supply,
  { PRICE_BUFFER_DENOMINATOR, PRICE_BUFFER },
) {
  const timeOnRatchet = timeTillBV.gt(timeElapsed) ? timeElapsed : timeTillBV;
  const timeOnBV = timeElapsed.sub(timeOnRatchet);

  const twapOnRatchet = parseEther('1')
    .mul(previousState.eth.mul(state.nxmB).add(state.eth.mul(previousState.nxmB)))
    .mul(timeOnRatchet)
    .div(previousState.nxmB)
    .div(state.nxmB)
    .div(2)
    .div(1e9);

  const twapOnBV = parseEther('1')
    .mul(timeOnBV)
    .mul(capital)
    .mul(PRICE_BUFFER_DENOMINATOR.sub(PRICE_BUFFER))
    .div(supply)
    .div(PRICE_BUFFER_DENOMINATOR)
    .div(1e9);

  return twapOnRatchet.add(twapOnBV);
}

function calculateObservation(state, previousState, previousObservation, capital, supply, timeElapsed, parameters) {
  const { maxTimeOnRatchetA, maxTimeOnRatchetB } = timeTillBv(previousState, supply, capital, parameters);

  const priceCumulativeAbove = calculateTwapAboveForPeriod(
    previousState,
    state,
    timeElapsed,
    maxTimeOnRatchetA,
    capital,
    supply,
    parameters,
  );

  const priceCumulativeBelow = calculateTwapBelowForPeriod(
    previousState,
    state,
    timeElapsed,
    maxTimeOnRatchetB,
    capital,
    supply,
    parameters,
  );

  return {
    timestamp: timeElapsed.add(previousObservation.timestamp),
    priceCumulativeAbove: previousObservation.priceCumulativeAbove
      .add(priceCumulativeAbove)
      .mod(BigNumber.from(2).pow(64)),
    priceCumulativeBelow: previousObservation.priceCumulativeBelow
      .add(priceCumulativeBelow)
      .mod(BigNumber.from(2).pow(64)),
  };
}

function calculateInternalPrice(currentState, observations, capital, supply, currentTimestamp, constants) {
  const { GRANULARITY } = constants;
  const currentIdx = getObservationIndex(BigNumber.from(currentTimestamp), constants);
  const previousIdx = currentIdx.add(1).mod(GRANULARITY);

  const firstObservation = observations[previousIdx.toNumber()];
  const currentObservation = observations[currentIdx.toNumber()];

  const elapsed = BigNumber.from(currentTimestamp).sub(firstObservation.timestamp);

  const spotPriceA = parseEther('1').mul(currentState.eth).div(currentState.nxmA);
  const spotPriceB = parseEther('1').mul(currentState.eth).div(currentState.nxmB);

  const averagePriceA = currentObservation.priceCumulativeAbove
    .sub(firstObservation.priceCumulativeAbove)
    .mul(1e9)
    .div(elapsed);

  const averagePriceB = currentObservation.priceCumulativeBelow
    .sub(firstObservation.priceCumulativeBelow)
    .mul(1e9)
    .div(elapsed);

  const priceA = averagePriceA.gt(spotPriceA) ? spotPriceA : averagePriceA;
  const priceB = averagePriceB.gt(spotPriceB) ? averagePriceB : spotPriceB;
  return priceA.add(priceB).sub(parseEther('1').mul(capital).div(supply));
}

async function getInternalPrice(ramm, pool, tokenController, mcr, timestamp) {
  const capital = await pool.getPoolValueInEth();
  const supply = await tokenController.totalSupply();
  const mcrValue = await mcr.getMCR();
  const context = {
    capital,
    supply,
    mcr: mcrValue,
  };

  const GRANULARITY = await ramm.GRANULARITY();
  const PERIOD_SIZE = await ramm.PERIOD_SIZE();

  const previousState = await ramm.loadState();
  const previousObservations = [];

  for (let i = 0; i < 3; i++) {
    previousObservations[i] = await ramm.observations(i);
  }

  const [currentState] = await ramm._getReserves(previousState, context, timestamp);

  const observations = await ramm._updateTwap(previousState, previousObservations, context, timestamp);

  return calculateInternalPrice(currentState, observations, capital, supply, timestamp, { GRANULARITY, PERIOD_SIZE });
}

async function getRammObservation(ramm, index) {
  const [timestamp, priceCumulativeAbove, priceCumulativeBelow] = await ramm.observations(index);
  return {
    timestamp,
    priceCumulativeAbove,
    priceCumulativeBelow,
  };
}

/**
 * Retrieves the expected observations for the given timestamp
 *
 * @param {Object} previousState - The previous state of the Ramm contract
 * @param {Contract} ramm - The RAMM contract
 * @param {Contract} pool - The pool contract
 * @param {Contract} tokenController - The token controller contract
 * @param {Contract} mcr - The MCR contract
 * @param {Object} fixtureConstants - The fixture constants object
 * @param {number} currentTimestamp - The current timestamp
 * @return {Promise<Array>} Array of observations containing timestamp, priceCumulativeBelow, and priceCumulativeAbove
 */
const getExpectedObservations = async (
  previousState,
  ramm,
  pool,
  tokenController,
  mcr,
  constants,
  currentTimestamp,
) => {
  const {
    PERIOD_SIZE,
    GRANULARITY,
    PRICE_BUFFER,
    PRICE_BUFFER_DENOMINATOR,
    RATCHET_DENOMINATOR,
    RATCHET_PERIOD,
  } = constants;
  const capital = await pool.getPoolValueInEth();
  const supply = await tokenController.totalSupply();
  const mcrValue = await mcr.getMCR();

  const previousObservationIndex = getObservationIndex(previousState.timestamp, { PERIOD_SIZE, GRANULARITY });
  let previousObservation = await getRammObservation(ramm, previousObservationIndex);

  const observationsAfterExpected = [];
  const endIdx = divCeil(currentTimestamp, PERIOD_SIZE).toNumber();

  for (let i = endIdx - 2; endIdx >= i; i++) {
    const observationIndex = BigNumber.from(i).mod(GRANULARITY);
    const observationTimestamp = Math.min(currentTimestamp.toNumber(), PERIOD_SIZE.mul(i).toNumber());
    if (observationTimestamp <= previousState.timestamp.toNumber()) {
      observationsAfterExpected[observationIndex] = await getRammObservation(ramm, observationIndex);
      continue;
    }
    const state = await ramm._getReserves(previousState, capital, supply, mcrValue, observationTimestamp);
    const elapsed = BigNumber.from(observationTimestamp - previousState.timestamp);
    const observationData = calculateObservation(state, previousState, previousObservation, capital, supply, elapsed, constants);

    observationsAfterExpected[observationIndex] = {
      timestamp: observationTimestamp,
      priceCumulativeBelow: observationData.priceCumulativeBelow,
      priceCumulativeAbove: observationData.priceCumulativeAbove,
    };

    previousState = state;
    previousObservation = observationsAfterExpected[observationIndex];
  }

  return observationsAfterExpected;
}

/**
 * Calculates the expected internal NXM price in ETH
 */
async function getInternalPrice(ramm, pool, tc, mcr, timestamp) {
  const capital = await pool.getPoolValueInEth();
  const supply = await tc.totalSupply();
  const mcrValue = await mcr.getMCR();
  const GRANULARITY = await ramm.GRANULARITY();
  const PERIOD_SIZE = await ramm.PERIOD_SIZE();

  const previousState = await ramm.loadState();
  const observations = await getExpectedObservations(previousState, ramm, pool, tc, mcr, BigNumber.from(timestamp));
  const currentState = await ramm._getReserves(previousState, capital, supply, mcrValue, timestamp);

  return calculateInternalPrice(currentState, observations, capital, supply, timestamp, { GRANULARITY, PERIOD_SIZE });
}

module.exports = {
  divCeil,
  getObservationIndex,
  calculateInternalPrice,
  timeTillBv,
  calculateTwapAboveForPeriod,
  calculateTwapBelowForPeriod,
  calculateObservation,
  calculateInternalPrice,
  getObservationIndex,
  divCeil,
  getInternalPrice,
  getExpectedObservations,
  // getInternalPrice,
};


const { ethers, nexus } = require('hardhat');

const { parseEther } = ethers;
const { BigIntMath } = nexus.helpers;

function getObservationIndex(timestamp, { PERIOD_SIZE, GRANULARITY }) {
  return BigIntMath.divCeil(timestamp, PERIOD_SIZE) % GRANULARITY;
}

/**
 * Calculates the internal NXM token price in ETH for given states
 */
function calculateInternalPrice(currentState, observations, capital, supply, currentTimestamp, constants) {
  const { GRANULARITY } = constants;
  const currentIdx = getObservationIndex(BigInt(currentTimestamp), constants);
  const previousIdx = (currentIdx + 1n) % GRANULARITY;

  const firstObservation = observations[Number(previousIdx)];
  const currentObservation = observations[Number(currentIdx)];

  const elapsed = BigInt(currentTimestamp) - firstObservation.timestamp;

  const spotPriceA = (parseEther('1') * currentState.eth) / currentState.nxmA;
  const spotPriceB = (parseEther('1') * currentState.eth) / currentState.nxmB;

  const averagePriceA = (currentObservation.priceCumulativeAbove - firstObservation.priceCumulativeAbove) / elapsed;

  const averagePriceB = (currentObservation.priceCumulativeBelow - firstObservation.priceCumulativeBelow) / elapsed;

  const priceA = BigIntMath.min(averagePriceA, spotPriceA);
  const priceB = BigIntMath.max(averagePriceB, spotPriceB);

  const internalPrice = priceA + priceB - (parseEther('1') * capital) / supply;
  const maxPrice = (parseEther('1') * 3n * capital) / supply; // 300% BV
  const minPrice = (parseEther('1') * 35n * capital) / (supply * 100n); // 35% BV

  return BigIntMath.max(BigIntMath.min(internalPrice, maxPrice), minPrice);
}

function timeTillBv(
  previousState,
  supply,
  capital,
  { PRICE_BUFFER_DENOMINATOR, PRICE_BUFFER, RATCHET_DENOMINATOR, RATCHET_PERIOD, NORMAL_RATCHET_SPEED },
) {
  // below
  const innerRightB = previousState.eth * supply;
  const innerLeftB =
    ((PRICE_BUFFER_DENOMINATOR - PRICE_BUFFER) * capital * previousState.nxmB) / PRICE_BUFFER_DENOMINATOR;
  const innerB = innerLeftB > innerRightB ? innerLeftB - innerRightB : 0n;
  const maxTimeOnRatchetB =
    innerB === 0n
      ? 0n
      : (innerB * RATCHET_DENOMINATOR * RATCHET_PERIOD) / capital / previousState.nxmB / previousState.ratchetSpeedB;

  // above
  const innerLeftA = previousState.eth * supply;
  const innerRightA =
    ((PRICE_BUFFER_DENOMINATOR + PRICE_BUFFER) * capital * previousState.nxmA) / PRICE_BUFFER_DENOMINATOR;
  const innerA = innerLeftA > innerRightA ? innerLeftA - innerRightA : 0n;
  const maxTimeOnRatchetA =
    innerA === 0n
      ? 0n
      : (innerA * RATCHET_DENOMINATOR * RATCHET_PERIOD) / capital / previousState.nxmA / NORMAL_RATCHET_SPEED;

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
  const timeOnRatchet = timeTillBV > timeElapsed ? timeElapsed : timeTillBV;
  const timeOnBV = timeElapsed - timeOnRatchet;

  const twapOnRatchet =
    (parseEther('1') * (previousState.eth * state.nxmA + state.eth * previousState.nxmA) * timeOnRatchet) /
    previousState.nxmA /
    state.nxmA /
    2n;

  const twapOnBV =
    (parseEther('1') * timeOnBV * capital * (PRICE_BUFFER_DENOMINATOR + PRICE_BUFFER)) /
    supply /
    PRICE_BUFFER_DENOMINATOR;

  return twapOnRatchet + twapOnBV;
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
  const timeOnRatchet = timeTillBV > timeElapsed ? timeElapsed : timeTillBV;
  const timeOnBV = timeElapsed - timeOnRatchet;

  const twapOnRatchet =
    (parseEther('1') * (previousState.eth * state.nxmB + state.eth * previousState.nxmB) * timeOnRatchet) /
    previousState.nxmB /
    state.nxmB /
    2n;

  const twapOnBV =
    (parseEther('1') * timeOnBV * capital * (PRICE_BUFFER_DENOMINATOR - PRICE_BUFFER)) /
    supply /
    PRICE_BUFFER_DENOMINATOR;

  return twapOnRatchet + twapOnBV;
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

  const modValue = 2n ** 112n;

  return {
    timestamp: timeElapsed + previousObservation.timestamp,
    priceCumulativeAbove: (previousObservation.priceCumulativeAbove + priceCumulativeAbove) % modValue,
    priceCumulativeBelow: (previousObservation.priceCumulativeBelow + priceCumulativeBelow) % modValue,
  };
}

/**
 * Calculates the expected internal NXM price in ETH
 */
async function getInternalPrice(ramm, pool, tokenController, timestamp) {
  const capital = await pool.getPoolValueInEth();
  const supply = await tokenController.totalSupply();
  const mcrValue = await pool.getMCR();
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
    const observation = await ramm.observations(i);
    previousObservations[i] = observation.toObject();
  }

  const [currentState] = await ramm._getReserves(previousState.toObject(), context, timestamp);

  const observations = await ramm._updateTwap(previousState.toObject(), previousObservations, context, timestamp);

  return calculateInternalPrice(currentState, observations, capital, supply, timestamp, { GRANULARITY, PERIOD_SIZE });
}

/**
 * Retrieves the expected observations for the given timestamp
 *
 * @param {Object} previousState - The previous state of the Ramm contract
 * @param {Contract} ramm - The RAMM contract
 * @param {Contract} pool - The pool contract
 * @param {Contract} tokenController - The token controller contract
 * @param {Object} constants - The fixture constants object
 * @param {number|bigint} currentTimestamp - The current timestamp
 * @return {Promise<Array>} Array of observations containing timestamp, priceCumulativeBelow, and priceCumulativeAbove
 */
async function getExpectedObservations(previousState, ramm, pool, tokenController, constants, currentTimestamp) {
  const { PERIOD_SIZE, GRANULARITY } = constants;
  const context = {
    capital: await pool.getPoolValueInEth(),
    supply: await tokenController.totalSupply(),
    mcr: await pool.getMCR(),
  };

  const observationsAfterExpected = [];
  const currentTimestampBigInt = BigInt(currentTimestamp);
  const endIdx = Number(BigIntMath.divCeil(currentTimestampBigInt, PERIOD_SIZE));

  for (let i = endIdx - 2; endIdx >= i; i++) {
    const previousObservationIndex = Number(BigInt(i - 1) % GRANULARITY);
    let previousObservation = observationsAfterExpected[previousObservationIndex];
    if (!previousObservation) {
      const obs = await ramm.observations(previousObservationIndex);
      previousObservation = obs.toObject ? obs.toObject() : obs;
    }

    const observationIndex = Number(BigInt(i) % GRANULARITY);
    const timestamp = Math.min(Number(currentTimestampBigInt), Number(PERIOD_SIZE * BigInt(i)));

    const [stateResult] = await ramm._getReserves(previousState, context, BigInt(timestamp));
    const state = stateResult.toObject ? stateResult.toObject() : stateResult;

    const observationData = calculateObservation(
      state,
      previousState,
      previousObservation,
      context.capital,
      context.supply,
      BigInt(timestamp) - previousState.timestamp,
      constants,
    );

    observationsAfterExpected[observationIndex] = {
      timestamp: BigInt(timestamp),
      priceCumulativeBelow: observationData.priceCumulativeBelow,
      priceCumulativeAbove: observationData.priceCumulativeAbove,
    };

    previousState = state;
  }

  // Return a dense array (filter out undefined and return in order)
  // Create a new plain array to avoid read-only property issues
  const result = [];
  for (let i = 0; i < observationsAfterExpected.length; i++) {
    if (observationsAfterExpected[i] !== undefined) {
      result.push({
        timestamp: observationsAfterExpected[i].timestamp,
        priceCumulativeBelow: observationsAfterExpected[i].priceCumulativeBelow,
        priceCumulativeAbove: observationsAfterExpected[i].priceCumulativeAbove,
      });
    }
  }
  return result;
}

/**
 * Calculates the expected ETH to be extracted
 *
 * @param {Object} state - The current state object
 * @param {number|bigint} timestamp - The timestamp of the next block
 * @param {Object} constants - The RAMM constants
 * @return {bigint} The expected amount of ETH to be extracted
 */
function calculateEthToExtract(state, timestamp, { LIQ_SPEED_A, LIQ_SPEED_PERIOD, TARGET_LIQUIDITY }) {
  const timestampBigInt = BigInt(timestamp);
  const stateTimestampBigInt = BigInt(state.timestamp);
  const elapsedLiquidity = (LIQ_SPEED_A * (timestampBigInt - stateTimestampBigInt)) / LIQ_SPEED_PERIOD;
  const ethToTargetLiquidity = state.eth - TARGET_LIQUIDITY;

  return elapsedLiquidity < ethToTargetLiquidity ? elapsedLiquidity : ethToTargetLiquidity;
}

/**
 * Calculates the expected ETH to be injected
 *
 * @param {Object} state - The current state object
 * @param {number|bigint} timestamp - The timestamp of the next block
 * @param {Object} constants - The RAMM constants
 * @return {bigint} The amount of Ethereum to inject.
 */
function calculateEthToInject(
  state,
  timestamp,
  { LIQ_SPEED_B, LIQ_SPEED_PERIOD, FAST_LIQUIDITY_SPEED, TARGET_LIQUIDITY },
) {
  const timestampBigInt = BigInt(timestamp);
  const stateTimestampBigInt = BigInt(state.timestamp);
  const elapsed = timestampBigInt - stateTimestampBigInt;
  const timeLeftOnBudget = (state.budget * LIQ_SPEED_PERIOD) / FAST_LIQUIDITY_SPEED;
  const maxToInject = TARGET_LIQUIDITY - state.eth;

  if (elapsed <= timeLeftOnBudget) {
    const injectedFast = (FAST_LIQUIDITY_SPEED * (timestampBigInt - stateTimestampBigInt)) / LIQ_SPEED_PERIOD;
    return injectedFast < maxToInject ? injectedFast : maxToInject;
  } else {
    const injectedFast = (timeLeftOnBudget * FAST_LIQUIDITY_SPEED) / LIQ_SPEED_PERIOD;
    const injectedSlow = (LIQ_SPEED_B * (elapsed - timeLeftOnBudget)) / LIQ_SPEED_PERIOD;
    const injectedTotal = injectedFast + injectedSlow;
    return maxToInject < injectedTotal ? maxToInject : injectedTotal;
  }
}

/**
 * Removes the '0x' prefix from a hexadecimal string if it exists.
 *
 * @param {string} hex - The hexadecimal string from which the prefix needs to be removed
 * @returns {string} - The modified hexadecimal string without the '0x' prefix
 */
const removeHexPrefix = hex => (hex.startsWith('0x') ? hex.slice(2) : hex);

/**
 * Replaces a bit value in a hexadecimal string with a new value at a specific bit position.
 *
 * @param {string} origHex - The original hexadecimal string (must be 256 bits / 64 hex characters)
 * @param {string} newHexValue - The new hexadecimal value to replace with
 * @param {number} bitPosition - The position of the bit in the original string to replace
 * @return {string} The modified hexadecimal string
 */
const replaceHexValueInBitPos = (origHex, newHexValue, bitPosition) => {
  // Convert hex to buffers
  const bufferOrig = Buffer.from(removeHexPrefix(origHex), 'hex');
  const bufferNewVal = Buffer.from(removeHexPrefix(newHexValue), 'hex');

  // Calculate the correct byte start position and copy the new value into the original buffer
  const byteStart = removeHexPrefix(origHex).length / 2 - bitPosition / 8;
  bufferNewVal.copy(bufferOrig, byteStart);

  return '0x' + bufferOrig.toString('hex');
};

/**
 * Sets the value of the Ether reserve in the RAMM contract.
 *
 * @async
 * @param {string} rammAddress - The address of the RAMM contract
 * @param {number} valueInEther - The value of the Ether reserve in Ether
 * @return {Promise<void>}
 */
async function setEthReserveValue(rammAddress, valueInEther) {
  const SLOT_1_POSITION = '0x4';
  // Convert valueInEther to 128 bits wei hex value
  const valueInWei = parseEther(valueInEther.toString());
  const hexValueInWei = '0x' + valueInWei.toString(16).padStart(32, '0');
  const newEtherReserve = '0x' + removeHexPrefix(hexValueInWei).padStart(32, '0'); // 32 hex chars in 128 bits
  // Get current Slot1 value
  const slot1Value = await ethers.provider.send('eth_getStorageAt', [rammAddress, SLOT_1_POSITION]);
  // Update Slot1 to have new ethReserve value
  const newSlot1Value = replaceHexValueInBitPos(slot1Value, newEtherReserve, 128);

  await ethers.provider.send('hardhat_setStorageAt', [rammAddress, SLOT_1_POSITION, newSlot1Value]);
}

module.exports = {
  getInternalPrice,
  getExpectedObservations,
  timeTillBv,
  calculateTwapAboveForPeriod,
  calculateTwapBelowForPeriod,
  calculateInternalPrice,
  getObservationIndex,
  calculateEthToExtract,
  calculateEthToInject,
  setEthReserveValue,
};

// TOOD: move some to lib/protocol?

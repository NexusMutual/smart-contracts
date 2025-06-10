const { ethers } = require('hardhat');
const { divCeil } = require('../utils').bnMath;

const { parseEther } = ethers;

function getObservationIndex(timestamp, { PERIOD_SIZE, GRANULARITY }) {
  return divCeil(timestamp, PERIOD_SIZE).mod(GRANULARITY);
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
    ((PRICE_BUFFER_DENOMINATOR - PRICE_BUFFER) * capital * previousState.nxmB) /
    PRICE_BUFFER_DENOMINATOR;
  const innerB = innerLeftB > innerRightB ? innerLeftB - innerRightB : 0n;

  const maxTimeOnRatchetB = innerB === 0n
    ? 0n
    : (innerB * RATCHET_DENOMINATOR * RATCHET_PERIOD) / capital / previousState.nxmB / previousState.ratchetSpeedB;

  // above
  const innerLeftA = previousState.eth * supply;
  const innerRightA =
    ((PRICE_BUFFER_DENOMINATOR + PRICE_BUFFER) * capital * previousState.nxmA) /
    PRICE_BUFFER_DENOMINATOR;
  const innerA = innerLeftA > innerRightA ? innerLeftA - innerRightA : 0n;

  const maxTimeOnRatchetA = innerA === 0n
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

  return {
    timestamp: timeElapsed + previousObservation.timestamp,
    priceCumulativeAbove: (previousObservation.priceCumulativeAbove +
      priceCumulativeAbove) %
      (2n ** 112n),
    priceCumulativeBelow: (previousObservation.priceCumulativeBelow +
      priceCumulativeBelow) %
      (2n ** 112n),
  };
}

function calculateInternalPrice(currentState, observations, capital, supply, currentTimestamp, constants) {
  const { GRANULARITY } = constants;
  const currentIdx = getObservationIndex(BigInt(currentTimestamp), constants);

  const firstObservation = observations[currentIdx];
  const secondObservation = observations[(currentIdx + 1) % 3];
  const thirdObservation = observations[(currentIdx + 2) % 3];

  const elapsed = BigInt(currentTimestamp) - BigInt(firstObservation.timestamp);

  const spotPriceA = (parseEther('1') * currentState.eth) / currentState.nxmA;
  const spotPriceB = (parseEther('1') * currentState.eth) / currentState.nxmB;

  const averagePriceA = (secondObservation.priceCumulativeAbove - firstObservation.priceCumulativeAbove) / elapsed;

  const averagePriceB = (secondObservation.priceCumulativeBelow - firstObservation.priceCumulativeBelow) / elapsed;

  const priceA = averagePriceA > spotPriceA ? spotPriceA : averagePriceA;
  const priceB = averagePriceB > spotPriceB ? averagePriceB : spotPriceB;
  return priceA + priceB - (parseEther('1') * capital) / supply;
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
async function getExpectedObservations(
  previousState,
  ramm,
  pool,
  tokenController,
  mcr,
  fixtureConstants,
  currentTimestamp,
) {
  const { PERIOD_SIZE, GRANULARITY } = fixtureConstants;
  const context = {
    capital: await pool.getPoolValueInEth(),
    supply: await tokenController.totalSupply(),
    mcr: await mcr.getMCR(),
  };

  const observationsAfterExpected = [];
  const endIdx = Number(divCeil(currentTimestamp, PERIOD_SIZE));

  for (let i = endIdx - 2; endIdx >= i; i++) {
    const previousObservationIndex = BigInt(i - 1) % GRANULARITY;
    const previousObservation =
      observationsAfterExpected[Number(previousObservationIndex)] || (await ramm.observations(Number(previousObservationIndex)));

    const observationIndex = BigInt(i) % GRANULARITY;
    const timestamp = Math.min(currentTimestamp, PERIOD_SIZE.mul(i).toNumber());

    const [state] = await ramm._getReserves(previousState, context, timestamp);

    const observationData = calculateObservation(
      state,
      previousState,
      previousObservation,
      context.capital,
      context.supply,
      BigInt(timestamp - previousState.timestamp),
      fixtureConstants,
    );

    observationsAfterExpected[Number(observationIndex)] = {
      timestamp,
      priceCumulativeBelow: observationData.priceCumulativeBelow,
      priceCumulativeAbove: observationData.priceCumulativeAbove,
    };

    previousState = state;
  }

  return observationsAfterExpected;
}

/**
 * Calculates the expected ETH to be extracted
 *
 * @param {Object} state - The current state object
 * @param {number} timestamp - The timestamp of the next block
 * @param {Object} constants - The RAMM constants
 * @return {number} The expected amount of ETH to be extracted
 */
function calculateEthToExtract(state, timestamp, { LIQ_SPEED_A, LIQ_SPEED_PERIOD, TARGET_LIQUIDITY }) {
  const elapsedLiquidity = LIQ_SPEED_A.mul(timestamp - state.timestamp).div(LIQ_SPEED_PERIOD);
  const ethToTargetLiquidity = state.eth.sub(TARGET_LIQUIDITY);

  return elapsedLiquidity.lt(ethToTargetLiquidity) ? elapsedLiquidity : ethToTargetLiquidity;
}

/**
 * Calculates the expected ETH to be injected
 *
 * @param {Object} state - The current state object
 * @param {number} timestamp - The timestamp of the next block
 * @param {Object} constants - The RAMM constants
 * @return {BigNumber} The amount of Ethereum to inject.
 */
function calculateEthToInject(
  state,
  timestamp,
  { LIQ_SPEED_B, LIQ_SPEED_PERIOD, FAST_LIQUIDITY_SPEED, TARGET_LIQUIDITY },
) {
  const elapsed = timestamp - state.timestamp;
  const timeLeftOnBudget = state.budget.mul(LIQ_SPEED_PERIOD).div(FAST_LIQUIDITY_SPEED);
  const maxToInject = TARGET_LIQUIDITY.sub(state.eth);

  if (elapsed <= timeLeftOnBudget) {
    const injectedFast = FAST_LIQUIDITY_SPEED.mul(timestamp - state.timestamp).div(LIQ_SPEED_PERIOD);
    return injectedFast.lt(maxToInject) ? injectedFast : maxToInject;
  } else {
    const injectedFast = timeLeftOnBudget.mul(FAST_LIQUIDITY_SPEED).div(LIQ_SPEED_PERIOD);
    const injectedSlow = LIQ_SPEED_B.mul(elapsed - timeLeftOnBudget).div(LIQ_SPEED_PERIOD);
    const injectedTotal = injectedFast.add(injectedSlow);
    return maxToInject.lt(injectedTotal) ? maxToInject : injectedTotal;
  }
}

function removeHexPrefix(hex) {
  return hex.startsWith('0x') ? hex.slice(2) : hex;
}

/**
 * Sets the value of the Ether reserve in the RAMM contract.
 *
 * @async
 * @param {string} rammAddress - The address of the RAMM contract
 * @param {number} valueInEther - The value of the Ether reserve in Ether
 * @return {Promise<void>}
 */
async function setEthReserveValue(rammAddress, valueInEther) {
  const SLOT_POSITION = '0x4';
  // Convert valueInEther to 128 bits wei hex value
  const hexValueInWei = parseEther(valueInEther.toString()).toHexString();
  const newEtherReserve = '0x' + removeHexPrefix(hexValueInWei).padStart(32, '0'); // 32 hex chars in 128 bits
  // Get current Slot1 value
  const slot1Value = await ethers.provider.send('eth_getStorageAt', [rammAddress, SLOT_POSITION]);
  // Update Slot1 to have new ethReserve value
  const newSlot1Value = replaceHexValueInBitPos(slot1Value, newEtherReserve, 128);
  return ethers.provider.send('hardhat_setStorageAt', [rammAddress, SLOT_POSITION, newSlot1Value]);
}

/**
 * Replaces a bit value in a hexadecimal string with a new value at a specific bit position.
 *
 * @param {string} origHex - The original hexadecimal string (must be 256 bits / 64 hex characters)
 * @param {string} newHexValue - The new hexadecimal value to replace with
 * @param {number} bitPosition - The position of the bit in the original string to replace
 * @return {string} The modified hexadecimal string
 */
function replaceHexValueInBitPos(origHex, newHexValue, bitPosition) {
  // Convert hex to buffers
  const bufferOrig = Buffer.from(removeHexPrefix(origHex), 'hex');
  const bufferNewVal = Buffer.from(removeHexPrefix(newHexValue), 'hex');
  // 2 hex chars in a byte, 8 bits in a byte
  const byteStart = removeHexPrefix(origHex).length / 2 - bitPosition / 8;
  bufferNewVal.copy(bufferOrig, byteStart);

  return '0x' + bufferOrig.toString('hex');
}

module.exports = {
  timeTillBv,
  calculateTwapAboveForPeriod,
  calculateTwapBelowForPeriod,
  calculateInternalPrice,
  getObservationIndex,
  getExpectedObservations,
  calculateEthToExtract,
  calculateEthToInject,
  setEthReserveValue,
};

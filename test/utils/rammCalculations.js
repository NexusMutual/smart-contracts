const { ethers } = require('hardhat');

function getObservationIndex(currentTimestamp, constants) {
  return Number(currentTimestamp) % constants.GRANULARITY;
}

function getObservationAge(currentTimestamp, firstObservation) {
  return Number(currentTimestamp) - Number(firstObservation.timestamp);
}

function getObservationAgeAdjusted(currentTimestamp, firstObservation, constants) {
  const currentIdx = getObservationIndex(currentTimestamp, constants);
  const firstIdx = getObservationIndex(firstObservation.timestamp, constants);

  if (currentIdx < firstIdx) {
    return getObservationAge(currentTimestamp, firstObservation) - constants.GRANULARITY;
  }

  const elapsed = BigInt(currentTimestamp) - BigInt(firstObservation.timestamp);
  return Number(elapsed);
}

function getObservationTimestamp(currentTimestamp, i, constants) {
  return Number(currentTimestamp) - i * constants.OBSERVATION_FREQUENCY;
}

function getObservationTimestampAdjusted(currentTimestamp, i, constants) {
  return Number(currentTimestamp) - (i % constants.GRANULARITY) * constants.OBSERVATION_FREQUENCY;
}

function calculateRatchetSpeedB(state, currentTimestamp, constants) {
  const { observations } = state;
  const firstObservation = observations[0];

  const age = getObservationAgeAdjusted(currentTimestamp, firstObservation, constants);
  if (age < constants.OBSERVATION_FREQUENCY) {
    return state.ratchetSpeedB;
  }

  const innerLeftB = BigInt(firstObservation.nxmB) * BigInt(constants.RATCHET_SPEED_DENOMINATOR);
  const innerRightB = BigInt(state.nxmB) * BigInt(constants.RATCHET_SPEED_DENOMINATOR);
  const innerB = innerLeftB > innerRightB ? innerLeftB - innerRightB : 0n;

  const ratchetSpeedB = innerB / BigInt(age);
  return ratchetSpeedB > 0n ? Number(ratchetSpeedB) : 0;
}

function calculateRatchetSpeedA(state, currentTimestamp, constants) {
  const { observations } = state;
  const firstObservation = observations[0];

  const age = getObservationAgeAdjusted(currentTimestamp, firstObservation, constants);
  if (age < constants.OBSERVATION_FREQUENCY) {
    return state.ratchetSpeedA;
  }

  const innerLeftA = BigInt(firstObservation.nxmA) * BigInt(constants.RATCHET_SPEED_DENOMINATOR);
  const innerRightA = BigInt(state.nxmA) * BigInt(constants.RATCHET_SPEED_DENOMINATOR);
  const innerA = innerLeftA > innerRightA ? innerLeftA - innerRightA : 0n;

  const ratchetSpeedA = innerA / BigInt(age);
  return ratchetSpeedA > 0n ? Number(ratchetSpeedA) : 0;
}

function calculateRatchetedNxmB(state, currentTimestamp, constants) {
  const { nxmB, ratchetSpeedB } = state;
  const timeSinceLastUpdate = BigInt(currentTimestamp) - BigInt(state.timestamp);
  const ratchetDrop = (timeSinceLastUpdate * BigInt(ratchetSpeedB)) / BigInt(constants.RATCHET_SPEED_DENOMINATOR);
  return BigInt(nxmB) - ratchetDrop;
}

function calculateRatchetedNxmA(state, currentTimestamp, constants) {
  const { nxmA, ratchetSpeedA } = state;
  const timeSinceLastUpdate = BigInt(currentTimestamp) - BigInt(state.timestamp);
  const ratchetDrop = (timeSinceLastUpdate * BigInt(ratchetSpeedA)) / BigInt(constants.RATCHET_SPEED_DENOMINATOR);
  return BigInt(nxmA) - ratchetDrop;
}

function calculateEthToInject(state, currentTimestamp, constants) {
  const { eth } = state;
  const timeSinceLastUpdate = BigInt(currentTimestamp) - BigInt(state.timestamp);
  const ethToInject = (timeSinceLastUpdate * BigInt(constants.INJECTION_RATE)) / BigInt(constants.INJECTION_RATE_DENOMINATOR);
  const ethDiff = BigInt(constants.TARGET_LIQUIDITY) - BigInt(eth);
  return ethDiff > 0n ? (ethToInject > ethDiff ? ethDiff : ethToInject) : 0n;
}

function calculateEthToExtract(state, currentTimestamp, constants) {
  const { eth } = state;
  const timeSinceLastUpdate = BigInt(currentTimestamp) - BigInt(state.timestamp);
  const ethToExtract = (timeSinceLastUpdate * BigInt(constants.EXTRACTION_RATE)) / BigInt(constants.EXTRACTION_RATE_DENOMINATOR);
  const ethDiff = BigInt(eth) - BigInt(constants.TARGET_LIQUIDITY);
  return ethDiff > 0n ? (ethToExtract > ethDiff ? ethDiff : ethToExtract) : 0n;
}

function calculateNewObservation(state, currentTimestamp, constants) {
  const { observations } = state;
  const { GRANULARITY } = constants;

  const newObservation = {
    timestamp: currentTimestamp,
    nxmA: state.nxmA,
    nxmB: state.nxmB,
  };

  const newObservations = [...observations];
  const observationIndex = Number(currentTimestamp) % GRANULARITY;
  newObservations[observationIndex] = newObservation;

  return newObservations;
}

function calculateNewObservations(state, currentTimestamp, constants) {
  const { observations } = state;
  const { GRANULARITY, OBSERVATION_FREQUENCY } = constants;

  const newObservations = [...observations];
  const firstObservation = observations[0];

  const age = getObservationAge(currentTimestamp, firstObservation);
  if (age < OBSERVATION_FREQUENCY) {
    return observations;
  }

  for (let i = 0; i < GRANULARITY; i++) {
    const timestamp = getObservationTimestampAdjusted(currentTimestamp, i, constants);
    const previousObservationIndex = (i - 1 + GRANULARITY) % GRANULARITY;
    const previousObservation = newObservations[previousObservationIndex];

    if (previousObservation && timestamp < previousObservation.timestamp) {
      continue;
    }

    const observationIndex = i % GRANULARITY;
    const observation = newObservations[observationIndex];

    if (!observation || timestamp > observation.timestamp) {
      const timeSinceLastUpdate = BigInt(timestamp - previousObservation.timestamp);
      const ratchetDropB = (timeSinceLastUpdate * BigInt(state.ratchetSpeedB)) / BigInt(constants.RATCHET_SPEED_DENOMINATOR);
      const ratchetDropA = (timeSinceLastUpdate * BigInt(state.ratchetSpeedA)) / BigInt(constants.RATCHET_SPEED_DENOMINATOR);

      newObservations[observationIndex] = {
  timestamp,
        nxmB: Number(BigInt(previousObservation.nxmB) - ratchetDropB),
        nxmA: Number(BigInt(previousObservation.nxmA) - ratchetDropA),
      };
    }
  }

  return newObservations;
}

async function setEthReserveValue(rammAddress, value) {
  const ramm = await ethers.getContractAt('RAMM', rammAddress);
  const state = await ramm.loadState();
  const newState = { ...state, eth: value };
  await ramm.storeState(newState);
}

module.exports = {
  getObservationIndex,
  getObservationAge,
  getObservationAgeAdjusted,
  getObservationTimestamp,
  getObservationTimestampAdjusted,
  calculateRatchetSpeedB,
  calculateRatchetSpeedA,
  calculateRatchetedNxmB,
  calculateRatchetedNxmA,
  calculateEthToInject,
  calculateEthToExtract,
  calculateNewObservation,
  calculateNewObservations,
  setEthReserveValue,
};

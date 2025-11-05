const { ethers } = require('hardhat');

const { parseEther } = ethers;

/**
 * Loads RAMM state and calculates reserves for a given timestamp
 * @param {Object} ramm - RAMM contract instance
 * @param {Object} pool - Pool contract instance
 * @param {Object} tokenController - TokenController contract instance
 * @param {number} timestamp - Target timestamp for state calculation
 * @returns {Object} RAMM state with eth, nxmA, nxmB, budget, ratchetSpeedB, timestamp
 */
async function getRammState(ramm, pool, tokenController, timestamp) {
  const readOnlyInitState = await ramm.loadState();

  const initState = {
    nxmA: readOnlyInitState.nxmA,
    nxmB: readOnlyInitState.nxmB,
    eth: readOnlyInitState.eth,
    budget: readOnlyInitState.budget,
    ratchetSpeedB: readOnlyInitState.ratchetSpeedB,
    timestamp: readOnlyInitState.timestamp,
  };

  const context = {
    capital: await pool.getPoolValueInEth(),
    supply: await tokenController.totalSupply(),
    mcr: await pool.getMCR(),
  };

  const [readOnlyState] = await ramm._getReserves(initState, context, timestamp);

  return {
    eth: readOnlyState.eth,
    nxmA: readOnlyState.nxmA,
    nxmB: readOnlyState.nxmB,
    budget: readOnlyState.budget,
    ratchetSpeedB: readOnlyState.ratchetSpeedB,
    timestamp: readOnlyState.timestamp,
  };
}

/**
 * Calculate internal NXM/ETH price from RAMM reserves
 * @param {Object} ramm - RAMM contract instance
 * @param {Object} pool - Pool contract instance
 * @param {Object} tokenController - TokenController contract instance
 * @param {number} timestamp - Target timestamp for price calculation
 * @returns {BigInt} Internal NXM/ETH price
 */
async function getInternalPrice(ramm, pool, tokenController, timestamp) {
  const state = await getRammState(ramm, pool, tokenController, timestamp);
  return (state.eth * parseEther('1')) / state.nxmA;
}

/**
 * Calculate expected swap output from RAMM
 * @param {Object} ramm - RAMM contract instance
 * @param {Object} pool - Pool contract instance
 * @param {Object} tokenController - TokenController contract instance
 * @param {BigInt} input - Input amount for swap
 * @param {boolean} isEthToNxm - True if swapping ETH->NXM, false for NXM->ETH
 * @param {number} timestamp - Target timestamp for calculation
 * @returns {BigInt} Expected output amount
 */
async function calculateExpectedSwapOutput(ramm, pool, tokenController, input, isEthToNxm, timestamp) {
  const state = await getRammState(ramm, pool, tokenController, timestamp);

  if (isEthToNxm) {
    // ETH -> NXM: k = eth * nxmA
    const k = state.eth * state.nxmA;
    const newEth = state.eth + input;
    const newNxmA = k / newEth;
    return state.nxmA - newNxmA;
  } else {
    // NXM -> ETH: k = eth * nxmB
    const k = state.eth * state.nxmB;
    const newNxmB = state.nxmB + input;
    const newEth = k / newNxmB;
    return state.eth - newEth;
  }
}

module.exports = {
  getRammState,
  getInternalPrice,
  calculateExpectedSwapOutput,
};

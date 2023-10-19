const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup, SPOT_PRICE_A, SPOT_PRICE_B } = require('./setup');

const { parseEther } = ethers.utils;

/**
 * Constants and expected value calculations are copied off Ramm.sol
 */

/* ========== CONSTANTS ========== */

const LIQ_SPEED_PERIOD = 1 * 24 * 60 * 60; // 1 day
const RATCHET_PERIOD = 1 * 24 * 60 * 60; // 1 day
const RATCHET_DENOMINATOR = 10000;
const PRICE_BUFFER = 100;
const PRICE_BUFFER_DENOMINATOR = 10000;

const FAST_LIQUIDITY_SPEED = parseEther('1500');
const TARGET_LIQUIDITY = parseEther('5000');
const LIQ_SPEED_A = parseEther('100');
const LIQ_SPEED_B = parseEther('100');
const FAST_RATCHET_SPEED = 5000;
const INITIAL_LIQUIDITY = parseEther('5000');
const INITIAL_BUDGET = parseEther('43835');

const INITIAL_RAMM_STATE = {
  nxmA: INITIAL_LIQUIDITY.mul(parseEther('1')).div(SPOT_PRICE_A),
  nxmB: INITIAL_LIQUIDITY.mul(parseEther('1')).div(SPOT_PRICE_B),
  eth: INITIAL_LIQUIDITY,
  budget: INITIAL_BUDGET,
  ratchetSpeed: FAST_RATCHET_SPEED,
};

/**
 * Calculates the expected ETH liquidity after extracting ETH
 *
 * @param {Object} state - The current state object
 * @param {number} timestamp - The timestamp of the next block
 * @return {number} The expected amount of ETH to extract from the state
 */
const getExpectedEthExtract = (state, timestamp) => {
  const elapsedLiquidity = LIQ_SPEED_A.mul(timestamp - state.timestamp)
    .mul(parseEther('1'))
    .div(LIQ_SPEED_PERIOD);
  const ethToTargetLiquidity = state.eth.sub(TARGET_LIQUIDITY);
  const ethToExtract = elapsedLiquidity.lt(ethToTargetLiquidity) ? elapsedLiquidity : ethToTargetLiquidity;
  return state.eth.sub(ethToExtract);
};

/**
 * Calculates the expected NxmA ratcheted value
 *
 * @param {Object} state - The current RAMM state
 * @param {BigNumber} eth - The current ETH reserve
 * @param {BigNumber} capital - The current pool capital value in ETH
 * @param {BigNumber} supply - The current total NXM supply
 * @param {number} blockTimestamp - The current block timestamp
 * @return {BigNumber} The expected NxmA ratcheted value
 */
const getExpectedNxmARatchet = (state, eth, capital, supply, blockTimestamp) => {
  const elapsed = blockTimestamp - state.timestamp;
  const nrDenomAddendA = state.nxmA
    .mul(elapsed)
    .mul(state.ratchetSpeed)
    .mul(capital)
    .div(supply)
    .div(RATCHET_PERIOD)
    .div(RATCHET_DENOMINATOR);
  return eth.mul(state.nxmA).div(eth.sub(nrDenomAddendA));
};

/**
 * Calculates the expected NxmB ratcheted value
 *
 * @param {Object} state - The current RAMM state
 * @param {BigNumber} eth - The current ETH reserve
 * @param {BigNumber} capital - The current pool capital value in ETH
 * @param {BigNumber} supply - The current total NXM supply
 * @param {number} blockTimestamp - The current block timestamp
 * @return {BigNumber} The expected NxmB ratcheted value
 */
const getExpectedNxmBRatchet = (state, eth, capital, supply, blockTimestamp) => {
  const elapsed = blockTimestamp - state.timestamp;
  const nrDenomAddendB = state.nxmB
    .mul(elapsed)
    .mul(state.ratchetSpeed)
    .mul(capital)
    .div(supply)
    .div(RATCHET_PERIOD)
    .div(RATCHET_DENOMINATOR);
  return eth.mul(state.nxmB).div(eth.add(nrDenomAddendB));
};

/**
 * Calculates the expected NxmA book value.
 *
 * @param {BigNumber} eth - The current ETH liquidity
 * @param {BigNumber} capital - The current pool capital value in ETH
 * @param {BigNumber} supply - The current total NXM supply
 * @return {BigNumber} The expected NxmA book value
 */
const getExpectedNxmABookValue = (eth, capital, supply) => {
  const bufferedCapitalA = capital.mul(PRICE_BUFFER_DENOMINATOR + PRICE_BUFFER).div(PRICE_BUFFER_DENOMINATOR);
  return eth.mul(supply).div(bufferedCapitalA);
};

/**
 * Calculates the expected NxmB book value.
 *
 * @param {BigNumber} eth - The current ETH liquidity
 * @param {BigNumber} capital - The current pool capital value in ETH
 * @param {BigNumber} supply - The current total NXM supply
 * @return {BigNumber} The expected NxmB book value
 */
const getExpectedNxmBBookValue = (eth, capital, supply) => {
  const bufferedCapitalB = capital.mul(PRICE_BUFFER_DENOMINATOR - PRICE_BUFFER).div(PRICE_BUFFER_DENOMINATOR);
  return eth.mul(supply).div(bufferedCapitalB);
};

describe('getReserves', function () {
  it('should return the current state in the pools correctly - Ratcheted value', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;

    const state = await ramm.loadState();
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const { timestamp } = await ethers.provider.getBlock('latest');

    const { _ethReserve, nxmA, nxmB, _budget } = await ramm.getReserves();

    const expectedEth = getExpectedEthExtract(state, timestamp);
    const expectedNxmA = getExpectedNxmARatchet(state, _ethReserve, capital, supply, timestamp);
    const expectedNxmB = getExpectedNxmBRatchet(state, _ethReserve, capital, supply, timestamp);
    const expectedBudget = state.budget;

    expect(_ethReserve).to.be.equal(expectedEth);
    expect(nxmA).to.be.equal(expectedNxmA);
    expect(nxmB).to.be.equal(expectedNxmB);
    expect(_budget).to.be.equal(expectedBudget);
  });
});

describe('_getReserves', function () {
  it('should return current state in the pools - extract ETH flow where eth > TARGET_LIQUIDITY', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController, mcr } = fixture.contracts;

    const { updatedAt } = await ramm.slot1();
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const mcrValue = await mcr.getMCR();

    // Set eth to 5100 so its > 5000 TARGET_LIQUIDITY (i.e. extract ETH)
    const state = {
      ...INITIAL_RAMM_STATE,
      timestamp: updatedAt,
      eth: TARGET_LIQUIDITY.add(parseEther('100')),
    };
    // Advance next block timestamp by 32 hours to reach book value (i.e. no ratchet)
    const nextBlockTimestamp = state.timestamp + 32 * 60 * 60;

    const { eth, nxmA, nxmB, budget } = await ramm._getReserves(state, capital, supply, mcrValue, nextBlockTimestamp);

    const expectedEth = getExpectedEthExtract(state, nextBlockTimestamp);
    const expectedNxmA = getExpectedNxmABookValue(expectedEth, capital, supply);
    const expectedNxmB = getExpectedNxmBBookValue(expectedEth, capital, supply);
    const expectedBudget = state.budget;

    expect(eth).to.be.equal(expectedEth);
    expect(nxmA).to.be.equal(expectedNxmA);
    expect(nxmB).to.be.equal(expectedNxmB);
    expect(budget).to.be.equal(expectedBudget);
  });

  it('should return current state in the pools - extract ETH flow where eth == TARGET_LIQUIDITY', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController, mcr } = fixture.contracts;

    const { updatedAt } = await ramm.slot1();
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const mcrValue = await mcr.getMCR();

    // Set eth == TARGET_LIQUIDITY (i.e. extract ETH)
    const state = {
      ...INITIAL_RAMM_STATE,
      timestamp: updatedAt,
      eth: TARGET_LIQUIDITY,
    };
    // Advance next block timestamp by 32 hours to reach book value (i.e. no ratchet)
    const nextBlockTimestamp = state.timestamp + 32 * 60 * 60;

    const { eth, nxmA, nxmB, budget } = await ramm._getReserves(state, capital, supply, mcrValue, nextBlockTimestamp);

    const expectedEth = getExpectedEthExtract(state, nextBlockTimestamp);
    const expectedNxmA = getExpectedNxmABookValue(expectedEth, capital, supply);
    const expectedNxmB = getExpectedNxmBBookValue(expectedEth, capital, supply);
    const expectedBudget = state.budget;

    expect(eth).to.be.equal(expectedEth);
    expect(nxmA).to.be.equal(expectedNxmA);
    expect(nxmB).to.be.equal(expectedNxmB);
    expect(budget).to.be.equal(expectedBudget);
  });

  it('should return current state in the pools - inject ETH flow where elapsed <= timeLeftOnBudget', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController, mcr } = fixture.contracts;

    const { updatedAt } = await ramm.slot1();
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const mcrValue = await mcr.getMCR();

    // Set eth be less than TARGET_LIQUIDITY (i.e. inject ETH)
    const state = {
      ...INITIAL_RAMM_STATE,
      timestamp: updatedAt,
      eth: TARGET_LIQUIDITY.sub(parseEther('100')),
    };
    // Advance next block time stamp by > 27 hrs (no ratchet) but < 701 hrs (timeLeftOnBudget)
    const nextBlockTimestamp = state.timestamp + 28 * 60 * 60;

    const { eth, nxmA, nxmB, budget } = await ramm._getReserves(state, capital, supply, mcrValue, nextBlockTimestamp);

    // Expected injected eth
    const maxToInject = TARGET_LIQUIDITY.sub(state.eth);
    const injectedFast = FAST_LIQUIDITY_SPEED.mul(nextBlockTimestamp - state.timestamp).div(LIQ_SPEED_PERIOD);
    const injected = injectedFast.lt(maxToInject) ? injectedFast : maxToInject;

    const expectedEth = state.eth.add(injected);
    const expectedNxmA = getExpectedNxmABookValue(expectedEth, capital, supply);
    const expectedNxmB = getExpectedNxmBBookValue(expectedEth, capital, supply);
    const expectedBudget = state.budget.gt(injected) ? state.budget.sub(injected) : 0;

    expect(eth).to.be.equal(expectedEth);
    expect(nxmA).to.be.equal(expectedNxmA);
    expect(nxmB).to.be.equal(expectedNxmB);
    expect(budget).to.be.equal(expectedBudget);
  });

  it('should return current state - 0 inject ETH when mcrValue + TARGET_LIQUIDITY reaches capital', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;

    const { updatedAt } = await ramm.slot1();
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    // Set MCR so that MRC + TARGET_LIQUIDITY reaches capital and forces 0 injection
    const mcrValue = capital.sub(TARGET_LIQUIDITY);

    // Set eth be less than TARGET_LIQUIDITY (i.e. inject ETH)
    const state = {
      ...INITIAL_RAMM_STATE,
      timestamp: updatedAt,
      eth: TARGET_LIQUIDITY.sub(parseEther('100')),
    };
    // Advance next block time stamp by > 27 hrs (no ratchet)
    const nextBlockTimestamp = state.timestamp + 28 * 60 * 60;

    const { eth, nxmA, nxmB, budget } = await ramm._getReserves(state, capital, supply, mcrValue, nextBlockTimestamp);

    // Zero injection
    const injected = 0;
    const expectedEth = state.eth.add(injected);
    const expectedNxmA = getExpectedNxmABookValue(expectedEth, capital, supply);
    const expectedNxmB = getExpectedNxmBBookValue(expectedEth, capital, supply);
    const expectedBudget = state.budget.gt(injected) ? state.budget.sub(injected) : 0;

    expect(eth).to.be.equal(expectedEth);
    expect(nxmA).to.be.equal(expectedNxmA);
    expect(nxmB).to.be.equal(expectedNxmB);
    expect(budget).to.be.equal(expectedBudget);
  });

  it('should return current state - inject ETH elapsed > timeLeftOnBudget (non zero budget)', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController, mcr } = fixture.contracts;

    const { updatedAt } = await ramm.slot1();
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const mcrValue = await mcr.getMCR();

    // Set eth be less than TARGET_LIQUIDITY (i.e. inject ETH)
    const state = {
      ...INITIAL_RAMM_STATE,
      timestamp: updatedAt,
      eth: TARGET_LIQUIDITY.sub(parseEther('100')),
    };
    // Advance next block time stamp > 27 hrs (no ratchet) and > 701 hrs timeLeftOnBudget (elapsed > timeLeftOnBudget)
    const nextBlockTimestamp = state.timestamp + 702 * 60 * 60;

    const { eth, nxmA, nxmB, budget } = await ramm._getReserves(state, capital, supply, mcrValue, nextBlockTimestamp);

    // Expected injected eth
    const maxToInject = TARGET_LIQUIDITY.sub(state.eth);
    const timeLeftOnBudget = state.budget.mul(LIQ_SPEED_PERIOD).div(FAST_LIQUIDITY_SPEED);
    const injectedFast = timeLeftOnBudget.mul(FAST_LIQUIDITY_SPEED).div(LIQ_SPEED_PERIOD);
    const injectedSlow = LIQ_SPEED_B.mul(nextBlockTimestamp - state.timestamp - timeLeftOnBudget)
      .mul(parseEther('1'))
      .div(LIQ_SPEED_PERIOD);
    const injectedTotal = injectedFast.add(injectedSlow);
    const injectedFinal = maxToInject.lt(injectedTotal) ? maxToInject : injectedTotal;

    const expectedEth = state.eth.add(injectedFinal);
    const expectedNxmA = getExpectedNxmABookValue(expectedEth, capital, supply);
    const expectedNxmB = getExpectedNxmBBookValue(expectedEth, capital, supply);
    const expectedBudget = state.budget.gt(injectedFinal) ? state.budget.sub(injectedFinal) : 0;

    expect(eth).to.be.equal(expectedEth);
    expect(nxmA).to.be.equal(expectedNxmA);
    expect(nxmB).to.be.equal(expectedNxmB);
    expect(budget).to.be.equal(expectedBudget);
  });

  it('should return current state - inject ETH elapsed > timeLeftOnBudget (zero budget)', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController, mcr } = fixture.contracts;

    const { updatedAt } = await ramm.slot1();
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const mcrValue = await mcr.getMCR();

    // Set eth be less than TARGET_LIQUIDITY (i.e. inject ETH) and budget to 0 (i.e. elapsed > timeLeftOnBudget)
    const state = {
      ...INITIAL_RAMM_STATE,
      budget: 0,
      timestamp: updatedAt,
      eth: TARGET_LIQUIDITY.sub(parseEther('100')),
    };
    // Advance next block time stamp by > 27 hrs (no ratchet)
    const nextBlockTimestamp = state.timestamp + 28 * 60 * 60;

    const { eth, nxmA, nxmB, budget } = await ramm._getReserves(state, capital, supply, mcrValue, nextBlockTimestamp);

    // Expected injected eth
    const timeLeftOnBudget = 0; // because budget is 0
    const injectFast = 0; // because timeLeftOnBudget is 0
    const maxToInject = TARGET_LIQUIDITY.sub(state.eth);
    const injectedTotal = LIQ_SPEED_B.mul(nextBlockTimestamp - state.timestamp - timeLeftOnBudget)
      .mul(parseEther('1'))
      .div(LIQ_SPEED_PERIOD)
      .add(injectFast);
    const injectedFinal = maxToInject.lt(injectedTotal) ? maxToInject : injectedTotal;

    const expectedEth = state.eth.add(injectedFinal);
    const expectedNxmA = getExpectedNxmABookValue(expectedEth, capital, supply);
    const expectedNxmB = getExpectedNxmBBookValue(expectedEth, capital, supply);

    expect(eth).to.be.equal(expectedEth);
    expect(nxmA).to.be.equal(expectedNxmA);
    expect(nxmB).to.be.equal(expectedNxmB);
    expect(budget).to.be.equal(0);
  });

  it('should return current state in the pools - ratchet value', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController, mcr } = fixture.contracts;

    const { updatedAt } = await ramm.slot1();
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const mcrValue = await mcr.getMCR();

    // Set budget to 0 and eth == TARGET_LIQUIDITY (i.e. extract ETH)
    const state = {
      ...INITIAL_RAMM_STATE,
      timestamp: updatedAt,
      budget: 0,
      eth: TARGET_LIQUIDITY,
    };
    // Advance next block timestamp < 31 hours to NOT reach book value (i.e. use ratchet)
    const nextBlockTimestamp = state.timestamp + 1 * 60 * 60;

    const { eth, nxmA, nxmB, budget } = await ramm._getReserves(state, capital, supply, mcrValue, nextBlockTimestamp);

    const expectedEth = getExpectedEthExtract(state, nextBlockTimestamp);
    const expectedNxmA = getExpectedNxmARatchet(state, eth, capital, supply, nextBlockTimestamp);
    const expectedNxmB = getExpectedNxmBRatchet(state, eth, capital, supply, nextBlockTimestamp);
    const expectedBudget = state.budget;

    expect(eth).to.be.equal(expectedEth);
    expect(nxmA).to.be.equal(expectedNxmA);
    expect(nxmB).to.be.equal(expectedNxmB);
    expect(budget).to.be.equal(expectedBudget);
  });
});

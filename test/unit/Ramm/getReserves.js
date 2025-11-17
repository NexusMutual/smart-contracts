const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

const { calculateEthToExtract, calculateEthToInject } = require('./rammCalculations');
const { setup, SPOT_PRICE_A, SPOT_PRICE_B } = require('./setup');

const { parseEther } = ethers;

const INITIAL_LIQUIDITY = parseEther('5000');
const FAST_RATCHET_SPEED = 5000n;
const INITIAL_BUDGET = parseEther('43835');

const INITIAL_RAMM_STATE = {
  nxmA: (INITIAL_LIQUIDITY * parseEther('1')) / SPOT_PRICE_A,
  nxmB: (INITIAL_LIQUIDITY * parseEther('1')) / SPOT_PRICE_B,
  eth: INITIAL_LIQUIDITY,
  budget: INITIAL_BUDGET,
  ratchetSpeedB: FAST_RATCHET_SPEED,
};

const getExpectedNxmA = (
  state,
  expectedEth,
  capital,
  supply,
  timestamp,
  { NORMAL_RATCHET_SPEED, PRICE_BUFFER_DENOMINATOR, PRICE_BUFFER, RATCHET_PERIOD, RATCHET_DENOMINATOR },
) => {
  const { nxmA } = state;
  const nxm = (nxmA * expectedEth) / state.eth;
  const elapsed = BigInt(timestamp) - BigInt(state.timestamp);

  // Buffered capital for buy price (above bonding curve)
  const bufferedCapital = (capital * (PRICE_BUFFER_DENOMINATOR + PRICE_BUFFER)) / PRICE_BUFFER_DENOMINATOR;

  // Calculate ratchet adjustment: how much NXM changes over time
  const ratchetAdjustment =
    (bufferedCapital * nxm * elapsed * NORMAL_RATCHET_SPEED) / RATCHET_PERIOD / RATCHET_DENOMINATOR;

  // Calculate book value reserve (Nbv)
  const bookValueReserve = (expectedEth * supply) / bufferedCapital;

  // Check if book value is greater than ratchet value
  // If Nbv > Nr, use book value, otherwise use ratchet calculation
  if (bufferedCapital * nxm + ratchetAdjustment > expectedEth * supply) {
    return bookValueReserve;
  }

  // Ratchet calculation for NXM reserve
  const ratchetDenominator =
    (capital * nxm * elapsed * NORMAL_RATCHET_SPEED) / supply / RATCHET_PERIOD / RATCHET_DENOMINATOR;
  return (expectedEth * nxm) / (expectedEth - ratchetDenominator);
};

const getExpectedNxmB = (
  state,
  expectedEth,
  capital,
  supply,
  timestamp,
  { PRICE_BUFFER_DENOMINATOR, PRICE_BUFFER, RATCHET_PERIOD, RATCHET_DENOMINATOR },
) => {
  const { nxmB } = state;
  const nxm = (nxmB * expectedEth) / state.eth;
  const elapsed = BigInt(timestamp) - BigInt(state.timestamp);

  // Buffered capital for sell price (below bonding curve)
  const bufferedCapital = (capital * (PRICE_BUFFER_DENOMINATOR - PRICE_BUFFER)) / PRICE_BUFFER_DENOMINATOR;

  // Calculate ratchet adjustment: how much NXM changes over time (using state-specific ratchet speed)
  const ratchetAdjustment = (capital * nxm * elapsed * state.ratchetSpeedB) / RATCHET_PERIOD / RATCHET_DENOMINATOR;

  // Calculate book value reserve (Nbv)
  const bookValueReserve = (expectedEth * supply) / bufferedCapital;

  // Check if book value is less than ratchet value
  // If Nbv < Nr, use book value, otherwise use ratchet calculation
  if (bufferedCapital * nxm < expectedEth * supply + ratchetAdjustment) {
    return bookValueReserve;
  }

  // Ratchet calculation for NXM reserve
  const ratchetDenominator =
    (capital * nxm * elapsed * state.ratchetSpeedB) / supply / RATCHET_PERIOD / RATCHET_DENOMINATOR;
  return (expectedEth * nxm) / (expectedEth + ratchetDenominator);
};

const getExpectedNxm = (state, expectedEth, capital, supply, timestamp, constants) => {
  const expectedNxmA = getExpectedNxmA(state, expectedEth, capital, supply, timestamp, constants);
  const expectedNxmB = getExpectedNxmB(state, expectedEth, capital, supply, timestamp, constants);
  return { expectedNxmA, expectedNxmB };
};

describe('getReserves', function () {
  it('should return the current state in the pools correctly - Ratcheted value', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;

    const state = await ramm.loadState();
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const timestamp = await time.latest();

    const { _ethReserve, nxmA, nxmB, _budget } = await ramm.getReserves();

    const expectedEthToExtract = calculateEthToExtract(state.toObject(), timestamp, fixture.constants);
    const expectedEth = state.eth - expectedEthToExtract;
    const { expectedNxmA, expectedNxmB } = getExpectedNxm(
      state.toObject(),
      expectedEth,
      capital,
      supply,
      timestamp,
      fixture.constants,
    );
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
    const { ramm, pool, tokenController } = fixture.contracts;
    const { TARGET_LIQUIDITY } = fixture.constants;

    const { updatedAt } = await ramm.slot1();
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const mcrValue = await pool.getMCR();

    const context = {
      capital,
      supply,
      mcr: mcrValue,
    };

    // Set eth to 5100 so its > 5000 TARGET_LIQUIDITY (i.e. extract ETH)
    const state = {
      ...INITIAL_RAMM_STATE,
      timestamp: updatedAt,
      eth: TARGET_LIQUIDITY + parseEther('100'),
    };
    // Advance next block timestamp by 32 hours to reach book value (i.e. no ratchet)
    const nextBlockTimestamp = state.timestamp + 32n * 60n * 60n;

    const [resultState, injected, extracted] = await ramm._getReserves(state, context, nextBlockTimestamp);
    const { eth, nxmA, nxmB, budget } = resultState.toObject ? resultState.toObject() : resultState;

    const expectedEthToExtract = calculateEthToExtract(state, nextBlockTimestamp, fixture.constants);
    const expectedEth = state.eth - expectedEthToExtract;
    const { expectedNxmA, expectedNxmB } = getExpectedNxm(
      state,
      expectedEth,
      capital,
      supply,
      nextBlockTimestamp,
      fixture.constants,
    );
    const expectedBudget = state.budget;

    expect(injected).to.be.equal(0n);
    expect(extracted).to.be.equal(expectedEthToExtract);

    expect(eth).to.be.equal(expectedEth);
    expect(nxmA).to.be.equal(expectedNxmA);
    expect(nxmB).to.be.equal(expectedNxmB);
    expect(budget).to.be.equal(expectedBudget);
  });

  it('should return current state in the pools - extract ETH flow where eth == TARGET_LIQUIDITY', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;
    const { TARGET_LIQUIDITY } = fixture.constants;

    const { updatedAt } = await ramm.slot1();
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const mcrValue = await pool.getMCR();
    const context = {
      capital,
      supply,
      mcr: mcrValue,
    };

    // Set eth == TARGET_LIQUIDITY (i.e. extract ETH)
    const state = {
      ...INITIAL_RAMM_STATE,
      timestamp: updatedAt,
      eth: TARGET_LIQUIDITY,
    };
    // Advance next block timestamp by 32 hours to reach book value (i.e. no ratchet)
    const nextBlockTimestamp = state.timestamp + 32n * 60n * 60n;

    const [resultState, injected, extracted] = await ramm._getReserves(state, context, nextBlockTimestamp);
    const { eth, nxmA, nxmB, budget } = resultState.toObject ? resultState.toObject() : resultState;

    const expectedEthToExtract = calculateEthToExtract(state, nextBlockTimestamp, fixture.constants);
    const expectedEth = state.eth - expectedEthToExtract;
    const { expectedNxmA, expectedNxmB } = getExpectedNxm(
      state,
      expectedEth,
      capital,
      supply,
      nextBlockTimestamp,
      fixture.constants,
    );
    const expectedBudget = state.budget;

    expect(injected).to.be.equal(0n);
    expect(extracted).to.be.equal(expectedEthToExtract);

    expect(eth).to.be.equal(expectedEth);
    expect(nxmA).to.be.equal(expectedNxmA);
    expect(nxmB).to.be.equal(expectedNxmB);
    expect(budget).to.be.equal(expectedBudget);
  });

  it('should return current state in the pools - inject ETH flow where elapsed <= timeLeftOnBudget', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;
    const { TARGET_LIQUIDITY } = fixture.constants;

    const { updatedAt } = await ramm.slot1();
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const mcrValue = await pool.getMCR();
    const context = {
      capital,
      supply,
      mcr: mcrValue,
    };

    // Set eth be less than TARGET_LIQUIDITY (i.e. inject ETH)
    const state = {
      ...INITIAL_RAMM_STATE,
      timestamp: updatedAt,
      eth: TARGET_LIQUIDITY - parseEther('100'),
    };
    // Advance next block time stamp by > 27 hrs (no ratchet) but < 701 hrs (timeLeftOnBudget)
    const nextBlockTimestamp = state.timestamp + 28n * 60n * 60n;

    const [resultState, injected, extracted] = await ramm._getReserves(state, context, nextBlockTimestamp);
    const { eth, nxmA, nxmB, budget } = resultState.toObject ? resultState.toObject() : resultState;

    const expectedInjected = calculateEthToInject(state, nextBlockTimestamp, fixture.constants);

    expect(injected).to.be.equal(expectedInjected);
    expect(extracted).to.be.equal(0n);

    const expectedEth = state.eth + injected;
    const { expectedNxmA, expectedNxmB } = getExpectedNxm(
      state,
      expectedEth,
      capital,
      supply,
      nextBlockTimestamp,
      fixture.constants,
    );
    const expectedBudget = state.budget > injected ? state.budget - injected : 0n;

    expect(eth).to.be.equal(expectedEth);
    expect(nxmA).to.be.equal(expectedNxmA);
    expect(nxmB).to.be.equal(expectedNxmB);
    expect(budget).to.be.equal(expectedBudget);
  });

  it('should return current state - 0 inject ETH when mcrValue + TARGET_LIQUIDITY reaches capital', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;
    const { TARGET_LIQUIDITY } = fixture.constants;

    const { updatedAt } = await ramm.slot1();
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    // Set MCR so that MRC + TARGET_LIQUIDITY reaches capital and forces 0 injection
    const mcrValue = capital - TARGET_LIQUIDITY;
    const context = {
      capital,
      supply,
      mcr: mcrValue,
    };

    // Set eth be less than TARGET_LIQUIDITY (i.e. inject ETH)
    const state = {
      ...INITIAL_RAMM_STATE,
      timestamp: updatedAt,
      eth: TARGET_LIQUIDITY - parseEther('100'),
    };
    // Advance next block time stamp by > 27 hrs (no ratchet)
    const nextBlockTimestamp = state.timestamp + 28n * 60n * 60n;

    const [resultState, injected, extracted] = await ramm._getReserves(state, context, nextBlockTimestamp);
    const { eth, nxmA, nxmB, budget } = resultState.toObject ? resultState.toObject() : resultState;

    // Zero injection
    const expectedInjected = 0n;

    expect(injected).to.be.equal(expectedInjected);
    expect(extracted).to.be.equal(0n);

    const expectedEth = state.eth + expectedInjected;
    const { expectedNxmA, expectedNxmB } = getExpectedNxm(
      state,
      expectedEth,
      capital,
      supply,
      nextBlockTimestamp,
      fixture.constants,
    );
    const expectedBudget = state.budget > expectedInjected ? state.budget - expectedInjected : 0n;

    expect(eth).to.be.equal(expectedEth);
    expect(nxmA).to.be.equal(expectedNxmA);
    expect(nxmB).to.be.equal(expectedNxmB);
    expect(budget).to.be.equal(expectedBudget);
  });

  it('should return current state - inject ETH elapsed > timeLeftOnBudget (non zero budget)', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;
    const { TARGET_LIQUIDITY } = fixture.constants;

    const { updatedAt } = await ramm.slot1();
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const mcrValue = await pool.getMCR();
    const context = {
      capital,
      supply,
      mcr: mcrValue,
    };

    // Set eth be less than TARGET_LIQUIDITY (i.e. inject ETH)
    const state = {
      ...INITIAL_RAMM_STATE,
      timestamp: updatedAt,
      eth: TARGET_LIQUIDITY - parseEther('100'),
    };
    // Advance next block time stamp > 27 hrs (no ratchet) and > 701 hrs timeLeftOnBudget (elapsed > timeLeftOnBudget)
    const nextBlockTimestamp = state.timestamp + 702n * 60n * 60n;

    const [resultState, injected, extracted] = await ramm._getReserves(state, context, nextBlockTimestamp);
    const { eth, nxmA, nxmB, budget } = resultState.toObject ? resultState.toObject() : resultState;

    const expectedInjected = calculateEthToInject(state, nextBlockTimestamp, fixture.constants);

    expect(injected).to.be.equal(expectedInjected);
    expect(extracted).to.be.equal(0n);

    const expectedEth = state.eth + expectedInjected;
    const { expectedNxmA, expectedNxmB } = getExpectedNxm(
      state,
      expectedEth,
      capital,
      supply,
      nextBlockTimestamp,
      fixture.constants,
    );
    const expectedBudget = state.budget > expectedInjected ? state.budget - expectedInjected : 0n;

    expect(eth).to.be.equal(expectedEth);
    expect(nxmA).to.be.equal(expectedNxmA);
    expect(nxmB).to.be.equal(expectedNxmB);
    expect(budget).to.be.equal(expectedBudget);
  });

  it('should return current state - inject ETH elapsed > timeLeftOnBudget (zero budget)', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;
    const { TARGET_LIQUIDITY } = fixture.constants;

    const { updatedAt } = await ramm.slot1();
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const mcrValue = await pool.getMCR();
    const context = {
      capital,
      supply,
      mcr: mcrValue,
    };

    // Set eth be less than TARGET_LIQUIDITY (i.e. inject ETH) and budget to 0 (i.e. elapsed > timeLeftOnBudget)
    const state = {
      ...INITIAL_RAMM_STATE,
      budget: 0n,
      timestamp: updatedAt,
      eth: TARGET_LIQUIDITY - parseEther('100'),
    };
    // Advance next block time stamp by > 27 hrs (no ratchet)
    const nextBlockTimestamp = state.timestamp + 28n * 60n * 60n;

    const [resultState, injected, extracted] = await ramm._getReserves(state, context, nextBlockTimestamp);
    const { eth, nxmA, nxmB, budget } = resultState.toObject ? resultState.toObject() : resultState;

    const expectedInjected = calculateEthToInject(state, nextBlockTimestamp, fixture.constants);

    expect(injected).to.be.equal(expectedInjected);
    expect(extracted).to.be.equal(0n);

    const expectedEth = state.eth + expectedInjected;
    const { expectedNxmA, expectedNxmB } = getExpectedNxm(
      state,
      expectedEth,
      capital,
      supply,
      nextBlockTimestamp,
      fixture.constants,
    );

    expect(eth).to.be.equal(expectedEth);
    expect(nxmA).to.be.equal(expectedNxmA);
    expect(nxmB).to.be.equal(expectedNxmB);
    expect(budget).to.be.equal(0n);
  });

  it('should return current state in the pools - ratchet value', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;
    const { TARGET_LIQUIDITY } = fixture.constants;

    const { updatedAt } = await ramm.slot1();
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const mcrValue = await pool.getMCR();
    const context = {
      capital,
      supply,
      mcr: mcrValue,
    };

    // Set budget to 0 and eth == TARGET_LIQUIDITY (i.e. extract ETH)
    const state = {
      ...INITIAL_RAMM_STATE,
      timestamp: updatedAt,
      budget: 0n,
      eth: TARGET_LIQUIDITY,
    };
    // Advance next block timestamp < 31 hours to NOT reach book value (i.e. use ratchet)
    const nextBlockTimestamp = state.timestamp + 1n * 60n * 60n;

    const [resultState, injected, extracted] = await ramm._getReserves(state, context, nextBlockTimestamp);
    const { eth, nxmA, nxmB, budget } = resultState.toObject ? resultState.toObject() : resultState;

    const expectedEthToExtract = calculateEthToExtract(state, nextBlockTimestamp, fixture.constants);

    expect(injected).to.be.equal(0n);
    expect(extracted).to.be.equal(expectedEthToExtract);

    const expectedEth = state.eth - expectedEthToExtract;
    const { expectedNxmA, expectedNxmB } = getExpectedNxm(
      state,
      expectedEth,
      capital,
      supply,
      nextBlockTimestamp,
      fixture.constants,
    );
    const expectedBudget = state.budget;

    expect(eth).to.be.equal(expectedEth);
    expect(nxmA).to.be.equal(expectedNxmA);
    expect(nxmB).to.be.equal(expectedNxmB);
    expect(budget).to.be.equal(expectedBudget);
  });
});

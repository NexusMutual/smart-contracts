const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup, SPOT_PRICE_A, SPOT_PRICE_B } = require('./setup');
const { calculateEthToExtract, calculateEthToInject } = require('../utils').rammCalculations;

const { BigNumber } = ethers;
const { parseEther } = ethers.utils;

const INITIAL_LIQUIDITY = parseEther('5000');
const FAST_RATCHET_SPEED = 5000;
const INITIAL_BUDGET = parseEther('43835');

const INITIAL_RAMM_STATE = {
  nxmA: INITIAL_LIQUIDITY.mul(parseEther('1')).div(SPOT_PRICE_A),
  nxmB: INITIAL_LIQUIDITY.mul(parseEther('1')).div(SPOT_PRICE_B),
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
  const nxm = nxmA.mul(expectedEth).div(state.eth);
  const elapsed = timestamp - state.timestamp;

  const bufferedCapital = capital.mul(PRICE_BUFFER_DENOMINATOR.add(PRICE_BUFFER)).div(PRICE_BUFFER_DENOMINATOR);

  if (
    bufferedCapital
      .mul(nxm)
      .add(bufferedCapital.mul(nxm).mul(elapsed).mul(NORMAL_RATCHET_SPEED).div(RATCHET_PERIOD).div(RATCHET_DENOMINATOR))
      .gt(expectedEth.mul(supply))
  ) {
    return expectedEth.mul(supply).div(bufferedCapital);
  }
  return expectedEth
    .mul(nxm)
    .div(
      expectedEth.sub(
        capital
          .mul(nxm)
          .mul(elapsed)
          .mul(NORMAL_RATCHET_SPEED)
          .div(supply)
          .div(RATCHET_PERIOD)
          .div(RATCHET_DENOMINATOR),
      ),
    );
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
  const nxm = nxmB.mul(expectedEth).div(state.eth);
  const elapsed = timestamp - state.timestamp;

  const bufferedCapital = capital.mul(PRICE_BUFFER_DENOMINATOR.sub(PRICE_BUFFER)).div(PRICE_BUFFER_DENOMINATOR);

  if (
    bufferedCapital
      .mul(nxm)
      .lt(
        expectedEth
          .mul(supply)
          .add(capital.mul(nxm).mul(elapsed).mul(state.ratchetSpeedB).div(RATCHET_PERIOD).div(RATCHET_DENOMINATOR)),
      )
  ) {
    return expectedEth.mul(supply).div(bufferedCapital);
  }
  return expectedEth
    .mul(nxm)
    .div(
      expectedEth.add(
        capital.mul(nxm).mul(elapsed).mul(state.ratchetSpeedB).div(supply).div(RATCHET_PERIOD).div(RATCHET_DENOMINATOR),
      ),
    );
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
    const { timestamp } = await ethers.provider.getBlock('latest');

    const { _ethReserve, nxmA, nxmB, _budget } = await ramm.getReserves();

    const expectedEthToExtract = calculateEthToExtract(state, timestamp, fixture.constants);
    const expectedEth = state.eth.sub(expectedEthToExtract);
    const { expectedNxmA, expectedNxmB } = getExpectedNxm(
      state,
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
    const { ramm, pool, tokenController, mcr } = fixture.contracts;
    const { TARGET_LIQUIDITY } = fixture.constants;

    const { updatedAt } = await ramm.slot1();
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const mcrValue = await mcr.getMCR();

    const context = {
      capital,
      supply,
      mcr: mcrValue,
    };

    // Set eth to 5100 so its > 5000 TARGET_LIQUIDITY (i.e. extract ETH)
    const state = {
      ...INITIAL_RAMM_STATE,
      timestamp: updatedAt,
      eth: TARGET_LIQUIDITY.add(parseEther('100')),
    };
    // Advance next block timestamp by 32 hours to reach book value (i.e. no ratchet)
    const nextBlockTimestamp = state.timestamp + 32 * 60 * 60;

    const [{ eth, nxmA, nxmB, budget }, injected, extracted] = await ramm._getReserves(
      state,
      context,
      nextBlockTimestamp,
    );

    const expectedEthToExtract = calculateEthToExtract(state, nextBlockTimestamp, fixture.constants);
    const expectedEth = state.eth.sub(expectedEthToExtract);
    const { expectedNxmA, expectedNxmB } = getExpectedNxm(
      state,
      expectedEth,
      capital,
      supply,
      nextBlockTimestamp,
      fixture.constants,
    );
    const expectedBudget = state.budget;

    expect(injected).to.be.equal(0);
    expect(extracted).to.be.equal(expectedEthToExtract);

    expect(eth).to.be.equal(expectedEth);
    expect(nxmA).to.be.equal(expectedNxmA);
    expect(nxmB).to.be.equal(expectedNxmB);
    expect(budget).to.be.equal(expectedBudget);
  });

  it('should return current state in the pools - extract ETH flow where eth == TARGET_LIQUIDITY', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController, mcr } = fixture.contracts;
    const { TARGET_LIQUIDITY } = fixture.constants;

    const { updatedAt } = await ramm.slot1();
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const mcrValue = await mcr.getMCR();
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
    const nextBlockTimestamp = state.timestamp + 32 * 60 * 60;

    const [{ eth, nxmA, nxmB, budget }, injected, extracted] = await ramm._getReserves(
      state,
      context,
      nextBlockTimestamp,
    );

    const expectedEthToExtract = calculateEthToExtract(state, nextBlockTimestamp, fixture.constants);
    const expectedEth = state.eth.sub(expectedEthToExtract);
    const { expectedNxmA, expectedNxmB } = getExpectedNxm(
      state,
      expectedEth,
      capital,
      supply,
      nextBlockTimestamp,
      fixture.constants,
    );
    const expectedBudget = state.budget;

    expect(injected).to.be.equal(0);
    expect(extracted).to.be.equal(expectedEthToExtract);

    expect(eth).to.be.equal(expectedEth);
    expect(nxmA).to.be.equal(expectedNxmA);
    expect(nxmB).to.be.equal(expectedNxmB);
    expect(budget).to.be.equal(expectedBudget);
  });

  it('should return current state in the pools - inject ETH flow where elapsed <= timeLeftOnBudget', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController, mcr } = fixture.contracts;
    const { TARGET_LIQUIDITY } = fixture.constants;

    const { updatedAt } = await ramm.slot1();
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const mcrValue = await mcr.getMCR();
    const context = {
      capital,
      supply,
      mcr: mcrValue,
    };

    // Set eth be less than TARGET_LIQUIDITY (i.e. inject ETH)
    const state = {
      ...INITIAL_RAMM_STATE,
      timestamp: updatedAt,
      eth: TARGET_LIQUIDITY.sub(parseEther('100')),
    };
    // Advance next block time stamp by > 27 hrs (no ratchet) but < 701 hrs (timeLeftOnBudget)
    const nextBlockTimestamp = state.timestamp + 28 * 60 * 60;

    const [{ eth, nxmA, nxmB, budget }, injected, extracted] = await ramm._getReserves(
      state,
      context,
      nextBlockTimestamp,
    );

    const expectedInjected = calculateEthToInject(state, nextBlockTimestamp, fixture.constants);

    expect(injected).to.be.equal(expectedInjected);
    expect(extracted).to.be.equal(0);

    const expectedEth = state.eth.add(injected);
    const { expectedNxmA, expectedNxmB } = getExpectedNxm(
      state,
      expectedEth,
      capital,
      supply,
      nextBlockTimestamp,
      fixture.constants,
    );
    const expectedBudget = state.budget.gt(injected) ? state.budget.sub(injected) : 0;

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
    const mcrValue = capital.sub(TARGET_LIQUIDITY);
    const context = {
      capital,
      supply,
      mcr: mcrValue,
    };

    // Set eth be less than TARGET_LIQUIDITY (i.e. inject ETH)
    const state = {
      ...INITIAL_RAMM_STATE,
      timestamp: updatedAt,
      eth: TARGET_LIQUIDITY.sub(parseEther('100')),
    };
    // Advance next block time stamp by > 27 hrs (no ratchet)
    const nextBlockTimestamp = state.timestamp + 28 * 60 * 60;

    const [{ eth, nxmA, nxmB, budget }, injected, extracted] = await ramm._getReserves(
      state,
      context,
      nextBlockTimestamp,
    );

    // Zero injection
    const expectedInjected = 0;

    expect(injected).to.be.equal(expectedInjected);
    expect(extracted).to.be.equal(0);

    const expectedEth = state.eth.add(expectedInjected);
    const { expectedNxmA, expectedNxmB } = getExpectedNxm(
      state,
      expectedEth,
      capital,
      supply,
      nextBlockTimestamp,
      fixture.constants,
    );
    const expectedBudget = state.budget.gt(expectedInjected) ? state.budget.sub(expectedInjected) : 0;

    expect(eth).to.be.equal(expectedEth);
    expect(nxmA).to.be.equal(expectedNxmA);
    expect(nxmB).to.be.equal(expectedNxmB);
    expect(budget).to.be.equal(expectedBudget);
  });

  it('should return current state - inject ETH elapsed > timeLeftOnBudget (non zero budget)', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController, mcr } = fixture.contracts;
    const { TARGET_LIQUIDITY } = fixture.constants;

    const { updatedAt } = await ramm.slot1();
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const mcrValue = await mcr.getMCR();
    const context = {
      capital,
      supply,
      mcr: mcrValue,
    };

    // Set eth be less than TARGET_LIQUIDITY (i.e. inject ETH)
    const state = {
      ...INITIAL_RAMM_STATE,
      timestamp: updatedAt,
      eth: TARGET_LIQUIDITY.sub(parseEther('100')),
    };
    // Advance next block time stamp > 27 hrs (no ratchet) and > 701 hrs timeLeftOnBudget (elapsed > timeLeftOnBudget)
    const nextBlockTimestamp = state.timestamp + 702 * 60 * 60;

    const [{ eth, nxmA, nxmB, budget }, injected, extracted] = await ramm._getReserves(
      state,
      context,
      nextBlockTimestamp,
    );

    const expectedInjected = calculateEthToInject(state, nextBlockTimestamp, fixture.constants);

    expect(injected).to.be.equal(expectedInjected);
    expect(extracted).to.be.equal(0);

    const expectedEth = state.eth.add(expectedInjected);
    const { expectedNxmA, expectedNxmB } = getExpectedNxm(
      state,
      expectedEth,
      capital,
      supply,
      nextBlockTimestamp,
      fixture.constants,
    );
    const expectedBudget = state.budget.gt(expectedInjected) ? state.budget.sub(expectedInjected) : 0;

    expect(eth).to.be.equal(expectedEth);
    expect(nxmA).to.be.equal(expectedNxmA);
    expect(nxmB).to.be.equal(expectedNxmB);
    expect(budget).to.be.equal(expectedBudget);
  });

  it('should return current state - inject ETH elapsed > timeLeftOnBudget (zero budget)', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController, mcr } = fixture.contracts;
    const { TARGET_LIQUIDITY } = fixture.constants;

    const { updatedAt } = await ramm.slot1();
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const mcrValue = await mcr.getMCR();
    const context = {
      capital,
      supply,
      mcr: mcrValue,
    };

    // Set eth be less than TARGET_LIQUIDITY (i.e. inject ETH) and budget to 0 (i.e. elapsed > timeLeftOnBudget)
    const state = {
      ...INITIAL_RAMM_STATE,
      budget: BigNumber.from('0'),
      timestamp: updatedAt,
      eth: TARGET_LIQUIDITY.sub(parseEther('100')),
    };
    // Advance next block time stamp by > 27 hrs (no ratchet)
    const nextBlockTimestamp = state.timestamp + 28 * 60 * 60;

    const [{ eth, nxmA, nxmB, budget }, injected, extracted] = await ramm._getReserves(
      state,
      context,
      nextBlockTimestamp,
    );

    const expectedInjected = calculateEthToInject(state, nextBlockTimestamp, fixture.constants);

    expect(injected).to.be.equal(expectedInjected);
    expect(extracted).to.be.equal(0);

    const expectedEth = state.eth.add(expectedInjected);
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
    expect(budget).to.be.equal(0);
  });

  it('should return current state in the pools - ratchet value', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController, mcr } = fixture.contracts;
    const { TARGET_LIQUIDITY } = fixture.constants;

    const { updatedAt } = await ramm.slot1();
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const mcrValue = await mcr.getMCR();
    const context = {
      capital,
      supply,
      mcr: mcrValue,
    };

    // Set budget to 0 and eth == TARGET_LIQUIDITY (i.e. extract ETH)
    const state = {
      ...INITIAL_RAMM_STATE,
      timestamp: updatedAt,
      budget: 0,
      eth: TARGET_LIQUIDITY,
    };
    // Advance next block timestamp < 31 hours to NOT reach book value (i.e. use ratchet)
    const nextBlockTimestamp = state.timestamp + 1 * 60 * 60;

    const [{ eth, nxmA, nxmB, budget }, injected, extracted] = await ramm._getReserves(
      state,
      context,
      nextBlockTimestamp,
    );

    const expectedEthToExtract = calculateEthToExtract(state, nextBlockTimestamp, fixture.constants);

    expect(injected).to.be.equal(0);
    expect(extracted).to.be.equal(expectedEthToExtract);

    const expectedEth = state.eth.sub(expectedEthToExtract);
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

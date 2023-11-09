const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { getState, setup } = require('./setup');
const { setNextBlockTime, mineNextBlock } = require('../../utils/evm');
const { calculateInternalPrice, getObservationIndex, divCeil } = require('./helpers');
const { parseEther } = ethers.utils;

describe('getInternalPrice', function () {
  it('should return the internal price', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController, mcr } = fixture.contracts;
    const { PERIOD_SIZE } = fixture.constants;

    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const mcrValue = await mcr.getMCR();

    const previousState = await getState(ramm);
    const previousObservations = [];
    for (let i = 0; i < 3; i++) {
      previousObservations[i] = await ramm.observations(i);
    }
    const { timestamp } = await ethers.provider.getBlock('latest');
    const currentTimestamp = PERIOD_SIZE.mul(10).add(timestamp);
    const [currentState] = await ramm._getReserves(previousState, capital, supply, mcrValue, currentTimestamp);

    const observations = await ramm._updateTwap(
      previousState,
      previousObservations,
      currentTimestamp,
      capital,
      supply,
      mcrValue,
    );

    const expectedInternalPrice = calculateInternalPrice(
      currentState,
      observations,
      capital,
      supply,
      currentTimestamp,
      fixture.constants,
    );

    await setNextBlockTime(currentTimestamp.toNumber());
    await mineNextBlock();
    const internalPrice = await ramm.getInternalPrice();

    expect(expectedInternalPrice).to.be.equal(internalPrice);
  });

  it('should return the max internal price (300% BV)', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;
    const { PERIOD_SIZE, GRANULARITY } = fixture.constants;

    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();

    const { timestamp: latestTimestamp } = await ethers.provider.getBlock('latest');
    const timestamp = PERIOD_SIZE.mul(10).add(latestTimestamp);
    const endIdx = divCeil(timestamp, PERIOD_SIZE);
    const currentIdx = getObservationIndex(timestamp, fixture.constants);
    const previousIdx = (currentIdx + 1) % GRANULARITY;
    const previousTimestamp = endIdx.sub(2).mul(PERIOD_SIZE);

    const state = {
      nxmA: capital,
      nxmB: supply,
      eth: capital,
      budget: 0,
      ratchetSpeed: parseEther('1500'),
      timestamp,
    };

    const observations = Array(3).fill({
      timestamp: 0,
      priceCumulativeAbove: 0,
      priceCumulativeBelow: 0,
    });
    observations[previousIdx] = {
      timestamp: previousTimestamp,
      priceCumulativeAbove: parseEther('1').mul(state.eth).mul(PERIOD_SIZE).div(state.nxmA).div(1e9),
      priceCumulativeBelow: 0,
    };
    observations[currentIdx] = {
      timestamp,
      priceCumulativeAbove: observations[previousIdx].priceCumulativeAbove
        .add(parseEther('1').mul(state.eth).mul(timestamp.sub(previousTimestamp)).div(state.nxmA))
        .div(1e9),
      priceCumulativeBelow: 0,
    };

    await setNextBlockTime(timestamp.toNumber());

    const expectedInternalPrice = capital.mul(3).mul(parseEther('1')).div(supply);

    const internalPrice = await ramm._getInternalPrice(state, observations, capital, supply, timestamp);

    expect(expectedInternalPrice).to.be.equal(internalPrice);
  });

  it('should return the min internal price (35% BV)', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;
    const { PERIOD_SIZE, GRANULARITY } = fixture.constants;

    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();

    const { timestamp: latestTimestamp } = await ethers.provider.getBlock('latest');
    const timestamp = PERIOD_SIZE.mul(10).add(latestTimestamp);
    const endIdx = divCeil(timestamp, PERIOD_SIZE);
    const currentIdx = getObservationIndex(timestamp, fixture.constants);
    const previousIdx = (currentIdx + 1) % GRANULARITY;
    const previousTimestamp = endIdx.sub(2).mul(PERIOD_SIZE);

    const state = {
      nxmA: capital,
      nxmB: supply,
      eth: capital,
      budget: 0,
      ratchetSpeed: parseEther('1500'),
      timestamp,
    };

    const observations = Array(3).fill({
      timestamp: 0,
      priceCumulativeAbove: 0,
      priceCumulativeBelow: 0,
    });
    observations[previousIdx] = {
      timestamp: previousTimestamp,
      priceCumulativeAbove: 0,
      priceCumulativeBelow: 0,
    };
    observations[currentIdx] = {
      timestamp,
      priceCumulativeAbove: 0,
      priceCumulativeBelow: 0,
    };

    await setNextBlockTime(timestamp.toNumber());

    const expectedInternalPrice = capital.mul(35).mul(parseEther('1')).div(supply).div(100);

    const internalPrice = await ramm._getInternalPrice(state, observations, capital, supply, timestamp);

    expect(expectedInternalPrice).to.be.equal(internalPrice);
  });
});

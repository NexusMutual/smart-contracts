const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup, SPOT_PRICE_A, SPOT_PRICE_B } = require('./setup');
const { calculateInternalPrice, getObservationIndex } = require('../utils').rammCalculations;
const { getAccounts } = require('../utils').accounts;
const { setEtherBalance, setNextBlockTime, mineNextBlock } = require('../utils').evm;
const { divCeil } = require('../utils').bnMath;
const { hex } = require('../../../lib/helpers');

const { parseEther } = ethers.utils;

describe('getInternalPrice', function () {
  it('should return the internal price', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController, mcr } = fixture.contracts;
    const { PERIOD_SIZE } = fixture.constants;

    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const context = {
      capital,
      supply,
      mcr: await mcr.getMCR(),
    };

    const previousState = await ramm.loadState();
    const previousObservations = [];

    for (let i = 0; i < 3; i++) {
      previousObservations[i] = await ramm.observations(i);
    }

    const { timestamp } = await ethers.provider.getBlock('latest');
    const currentTimestamp = PERIOD_SIZE.mul(10).add(timestamp);
    const [currentState] = await ramm._getReserves(previousState, context, currentTimestamp);

    const observations = await ramm._updateTwap(previousState, previousObservations, context, currentTimestamp);

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

  it('should return the bonding curve as internal price right after deployment', async function () {
    const accounts = await getAccounts();
    const master = await ethers.deployContract('MasterMock');
    const nxm = await ethers.deployContract('NXMTokenMock');
    const tokenController = await ethers.deployContract('RAMockTokenController', [nxm.address]);
    const mcr = await ethers.deployContract('RAMockMCR', [master.address]);
    const pool = await ethers.deployContract('PoolMock');
    const ramm = await ethers.deployContract('Ramm', [SPOT_PRICE_B]);

    await setEtherBalance(pool.address, parseEther('145000'));

    // turn on automine so we batch all following txes in one block
    await ethers.provider.send('evm_setAutomine', [false]);

    await mcr.setPool(pool.address);
    await pool.setTokenPrice(0, SPOT_PRICE_A);
    await nxm.mint(accounts.defaultSender.address, parseEther('6700000'));

    await Promise.all([
      master.setLatestAddress(hex('P1'), pool.address),
      master.setLatestAddress(hex('TC'), tokenController.address),
      master.setLatestAddress(hex('MC'), mcr.address),
      master.setLatestAddress(hex('RA'), ramm.address),
      master.setTokenAddress(nxm.address),
      master.enrollInternal(ramm.address),
      master.enrollGovernance(accounts.governanceContracts[0].address),
      master.setEmergencyAdmin(accounts.emergencyAdmin.address),
    ]);

    await ramm.changeMasterAddress(master.address);
    await ramm.changeDependentContractAddress();

    await mineNextBlock();
    await ethers.provider.send('evm_setAutomine', [true]);

    // make sure it starts paused
    const isPaused = await ramm.swapPaused();
    expect(isPaused).to.be.equal(true);

    const bondingCurve = await pool.getTokenPrice();
    const internalPrice = await ramm.getInternalPrice();

    expect(internalPrice).to.be.equal(bondingCurve);
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
      ratchetSpeedB: parseEther('1500'),
      timestamp,
    };

    const observations = Array(3).fill({
      timestamp: 0,
      priceCumulativeAbove: 0,
      priceCumulativeBelow: 0,
    });
    observations[previousIdx] = {
      timestamp: previousTimestamp,
      priceCumulativeAbove: parseEther('1').mul(state.eth).mul(PERIOD_SIZE).div(state.nxmA),
      priceCumulativeBelow: 0,
    };
    observations[currentIdx] = {
      timestamp,
      priceCumulativeAbove: observations[previousIdx].priceCumulativeAbove.add(
        parseEther('1').mul(state.eth).mul(timestamp.sub(previousTimestamp)).div(state.nxmA),
      ),
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
      ratchetSpeedB: parseEther('1500'),
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

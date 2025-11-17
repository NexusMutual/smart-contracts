const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, time, mine, setBalance } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');
const { getAccounts, setAutomine } = require('../utils');

const { parseEther } = ethers;
const { ContractIndexes, PauseTypes } = nexus.constants;
const { calculateInternalPrice } = nexus.protocol;

describe('getInternalPrice', function () {
  it('should return the internal price', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;
    const { PERIOD_SIZE } = fixture.constants;

    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const mcrValue = await pool.getMCR();
    const context = {
      capital,
      supply,
      mcr: mcrValue,
    };

    const previousState = await ramm.loadState();
    const previousObservations = [];

    for (let i = 0; i < 3; i++) {
      const observation = await ramm.observations(i);
      previousObservations[i] = observation.toObject();
    }

    const currentTimestamp = await time.latest();
    const targetTimestamp = BigInt(currentTimestamp) + PERIOD_SIZE * 10n;

    const [currentState] = await ramm._getReserves(previousState.toObject(), context, targetTimestamp);
    const observations = await ramm._updateTwap(
      previousState.toObject(),
      previousObservations,
      context,
      targetTimestamp,
    );

    const expectedInternalPrice = calculateInternalPrice(
      currentState,
      observations,
      capital,
      supply,
      targetTimestamp,
      fixture.constants,
    );

    await time.setNextBlockTimestamp(Number(targetTimestamp));
    await mine();
    const internalPrice = await ramm.getInternalPrice();

    expect(internalPrice).to.be.equal(expectedInternalPrice);
  });

  it('should return the bonding curve as internal price right after deployment', async function () {
    const accounts = await getAccounts();
    const token = await ethers.deployContract('NXMTokenMock');
    const tokenController = await ethers.deployContract('RAMockTokenController', [token.target]);
    const pool = await ethers.deployContract('PoolMock');
    const registry = await ethers.deployContract('RegistryMock');

    const SPOT_PRICE_A = parseEther('0.0347');
    const SPOT_PRICE_B = parseEther('0.0152');

    await setBalance(pool.target, parseEther('145000'));

    // batch all following txs in one block
    await setAutomine(false);

    const [governor] = accounts.governanceContracts;
    await registry.addContract(ContractIndexes.C_GOVERNOR, governor.address, false);
    await registry.addContract(ContractIndexes.C_POOL, pool.target, false);
    await registry.addContract(ContractIndexes.C_TOKEN_CONTROLLER, tokenController.target, false);
    await registry.confirmPauseConfig(PauseTypes.PAUSE_RAMM);

    await pool.setTokenPrice(0, SPOT_PRICE_A);
    await pool.setMCR(parseEther('100000'));

    await token.mint(accounts.defaultSender.address, parseEther('6700000'));

    const ramm = await ethers.deployContract('Ramm', [registry.target, SPOT_PRICE_B]);

    await mine();
    await setAutomine(true);

    await ramm.connect(governor).initialize();

    // make sure it starts paused
    const pauseConfig = await registry.getPauseConfig();
    expect(pauseConfig).to.be.equal(PauseTypes.PAUSE_RAMM);

    // internal price should be equal to the bonding curve right after initialization
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

    const currentTimestamp = await time.latest();
    const periodSizeNum = Number(PERIOD_SIZE);
    const targetTimestamp = Number(currentTimestamp) + periodSizeNum * 10;

    const endIdx = Math.ceil(targetTimestamp / periodSizeNum);
    const currentIdx = Number((BigInt(targetTimestamp) / BigInt(periodSizeNum) + 1n) % BigInt(GRANULARITY));
    const previousIdx = (currentIdx + 1) % Number(GRANULARITY);
    const previousTimestamp = (endIdx - 2) * periodSizeNum;

    const state = {
      nxmA: capital,
      nxmB: supply,
      eth: capital,
      budget: 0n,
      ratchetSpeedB: parseEther('1500'),
      timestamp: BigInt(targetTimestamp),
    };

    const observations = Array(3).fill({
      timestamp: 0n,
      priceCumulativeAbove: 0n,
      priceCumulativeBelow: 0n,
    });
    observations[previousIdx] = {
      timestamp: BigInt(previousTimestamp),
      priceCumulativeAbove: (parseEther('1') * state.eth * BigInt(periodSizeNum)) / state.nxmA,
      priceCumulativeBelow: 0n,
    };
    observations[currentIdx] = {
      timestamp: BigInt(targetTimestamp),
      priceCumulativeAbove:
        observations[previousIdx].priceCumulativeAbove +
        (parseEther('1') * state.eth * BigInt(targetTimestamp - previousTimestamp)) / state.nxmA,
      priceCumulativeBelow: 0n,
    };

    await time.setNextBlockTimestamp(targetTimestamp);
    await mine();

    const expectedInternalPrice = (parseEther('1') * 3n * capital) / supply;

    const internalPrice = await ramm._getInternalPrice(state, observations, capital, supply, BigInt(targetTimestamp));

    expect(internalPrice).to.be.equal(expectedInternalPrice);
  });

  it('should return the min internal price (35% BV)', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;
    const { PERIOD_SIZE, GRANULARITY } = fixture.constants;

    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();

    const currentTimestamp = await time.latest();
    const periodSizeNum = Number(PERIOD_SIZE);
    const targetTimestamp = Number(currentTimestamp) + periodSizeNum * 10;

    const endIdx = Math.ceil(targetTimestamp / periodSizeNum);
    const currentIdx = Number((BigInt(targetTimestamp) / BigInt(periodSizeNum) + 1n) % BigInt(GRANULARITY));
    const previousIdx = (currentIdx + 1) % Number(GRANULARITY);
    const previousTimestamp = (endIdx - 2) * periodSizeNum;

    const state = {
      nxmA: capital,
      nxmB: supply,
      eth: capital,
      budget: 0n,
      ratchetSpeedB: parseEther('1500'),
      timestamp: BigInt(targetTimestamp),
    };

    const observations = Array(3).fill({
      timestamp: 0n,
      priceCumulativeAbove: 0n,
      priceCumulativeBelow: 0n,
    });
    observations[previousIdx] = {
      timestamp: BigInt(previousTimestamp),
      priceCumulativeAbove: 0n,
      priceCumulativeBelow: 0n,
    };
    observations[currentIdx] = {
      timestamp: BigInt(targetTimestamp),
      priceCumulativeAbove: 0n,
      priceCumulativeBelow: 0n,
    };

    await time.setNextBlockTimestamp(targetTimestamp);
    await mine();

    const expectedInternalPrice = (parseEther('1') * 35n * capital) / (supply * 100n);

    const internalPrice = await ramm._getInternalPrice(state, observations, capital, supply, BigInt(targetTimestamp));

    expect(internalPrice).to.be.equal(expectedInternalPrice);
  });
});

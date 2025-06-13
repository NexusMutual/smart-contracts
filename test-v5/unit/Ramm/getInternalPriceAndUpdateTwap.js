const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');
const { setNextBlockTime } = require('../../utils/evm');
const {
  calculateEthToExtract,
  calculateEthToInject,
  calculateInternalPrice,
  getExpectedObservations,
  setEthReserveValue,
} = require('../utils').rammCalculations;

describe('getInternalPriceAndUpdateTwap', function () {
  it('should return the internal price and update the twap', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController, mcr } = fixture.contracts;
    const { PERIOD_SIZE } = fixture.constants;

    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const mcrValue = await mcr.getMCR();
    const context = {
      capital,
      supply,
      mcr: mcrValue,
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

    await setNextBlockTime(currentTimestamp.toNumber());
    const tx = await ramm.getInternalPriceAndUpdateTwap();
    await tx.wait();

    for (let i = 0; i < 3; i++) {
      const updatedObservations = await ramm.observations(i);
      expect(updatedObservations.timestamp).to.be.equal(observations[i].timestamp);
      expect(updatedObservations.priceCumulativeAbove).to.be.equal(observations[i].priceCumulativeAbove);
      expect(updatedObservations.priceCumulativeBelow).to.be.equal(observations[i].priceCumulativeBelow);
    }

    const expectedInternalPrice = calculateInternalPrice(
      currentState,
      observations,
      capital,
      supply,
      currentTimestamp,
      fixture.constants,
    );

    const actualInternalPrice = await ramm.callStatic.getInternalPriceAndUpdateTwap();
    expect(expectedInternalPrice).to.be.equal(actualInternalPrice); // 0.021481481185185185
  });

  it('should emit ObservationUpdated event for each observation update', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController, mcr } = fixture.contracts;
    const { PERIOD_SIZE } = fixture.constants;

    const { timestamp } = await ethers.provider.getBlock('latest');
    const currentTimestamp = PERIOD_SIZE.mul(3).add(timestamp);

    const state = await ramm.loadState();
    const [obsv1, obsv2, obsv3] = await getExpectedObservations(
      state,
      ramm,
      pool,
      tokenController,
      mcr,
      fixture.constants,
      currentTimestamp,
    );

    await setNextBlockTime(currentTimestamp.toNumber());
    await expect(ramm.getInternalPriceAndUpdateTwap())
      .to.emit(ramm, 'ObservationUpdated')
      .withArgs(obsv1.timestamp, obsv1.priceCumulativeAbove, obsv1.priceCumulativeBelow)
      .to.emit(ramm, 'ObservationUpdated')
      .withArgs(obsv2.timestamp, obsv2.priceCumulativeAbove, obsv2.priceCumulativeBelow)
      .to.emit(ramm, 'ObservationUpdated')
      .withArgs(obsv3.timestamp, obsv3.priceCumulativeAbove, obsv3.priceCumulativeBelow);
  });

  it('should emit EthInjected with the correct ETH injected value', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;

    const { timestamp } = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = timestamp + 5 * 60;

    // Set ETH reserve < TARGET_LIQUIDITY (5000) to force injection
    await setEthReserveValue(ramm.address, 4999);

    const state = await ramm.loadState();
    await setNextBlockTime(nextBlockTimestamp);

    const expectedInjected = calculateEthToInject(state, nextBlockTimestamp, fixture.constants);
    await expect(ramm.getInternalPriceAndUpdateTwap()).to.emit(ramm, 'EthInjected').withArgs(expectedInjected);
  });

  it('should emit EthExtracted with the correct ETH extracted value', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;

    const { timestamp } = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = timestamp + 5 * 60;

    // Set ETH reserve > TARGET_LIQUIDITY (5000) to force extraction
    await setEthReserveValue(ramm.address, 5001);

    const state = await ramm.loadState();
    await setNextBlockTime(nextBlockTimestamp);

    const expectedExtracted = calculateEthToExtract(state, nextBlockTimestamp, fixture.constants);
    await expect(ramm.getInternalPriceAndUpdateTwap()).to.emit(ramm, 'EthExtracted').withArgs(expectedExtracted);
  });
});

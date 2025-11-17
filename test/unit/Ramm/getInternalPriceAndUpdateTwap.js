const { nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');
const {
  calculateEthToExtract,
  calculateEthToInject,
  getExpectedObservations,
  setEthReserveValue,
} = require('./rammCalculations');

const { calculateInternalPrice } = nexus.protocol;

describe('getInternalPriceAndUpdateTwap', function () {
  it('should return the internal price and update the twap', async function () {
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

    await time.setNextBlockTimestamp(targetTimestamp);
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
      targetTimestamp,
      fixture.constants,
    );

    const actualInternalPrice = await ramm.getInternalPriceAndUpdateTwap.staticCall();
    expect(expectedInternalPrice).to.be.equal(actualInternalPrice);
  });

  it('should emit ObservationUpdated event for each observation update', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;
    const { PERIOD_SIZE } = fixture.constants;

    const currentTimestamp = await time.latest();
    const targetTimestamp = BigInt(currentTimestamp) + PERIOD_SIZE * 3n;

    const state = await ramm.loadState();
    const observations = await getExpectedObservations(
      state.toObject(),
      ramm,
      pool,
      tokenController,
      fixture.constants,
      targetTimestamp,
    );

    const [obsv1, obsv2, obsv3] = observations;

    await time.setNextBlockTimestamp(targetTimestamp);

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

    const currentTimestamp = await time.latest();
    const nextBlockTimestamp = currentTimestamp + 5 * 60;

    // Set ETH reserve < TARGET_LIQUIDITY (5000) to force injection
    await setEthReserveValue(ramm.target, 4999);

    const state = await ramm.loadState();
    await time.setNextBlockTimestamp(nextBlockTimestamp);

    const expectedInjected = calculateEthToInject(state.toObject(), nextBlockTimestamp, fixture.constants);
    await expect(ramm.getInternalPriceAndUpdateTwap()).to.emit(ramm, 'EthInjected').withArgs(expectedInjected);
  });

  it('should emit EthExtracted with the correct ETH extracted value', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;

    const currentTimestamp = await time.latest();
    const nextBlockTimestamp = currentTimestamp + 5 * 60;

    // Set ETH reserve > TARGET_LIQUIDITY (5000) to force extraction
    await setEthReserveValue(ramm.target, 5001);

    const state = await ramm.loadState();
    await time.setNextBlockTimestamp(nextBlockTimestamp);

    const expectedExtracted = calculateEthToExtract(state.toObject(), nextBlockTimestamp, fixture.constants);
    await expect(ramm.getInternalPriceAndUpdateTwap()).to.emit(ramm, 'EthExtracted').withArgs(expectedExtracted);
  });
});

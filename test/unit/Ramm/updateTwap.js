const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');
const { setNextBlockTime } = require('../../utils/evm');
const { getExpectedObservations } = require('../../utils/internalPrice');

describe('updateTwap', function () {
  it('should update observations', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController, mcr } = fixture.contracts;
    const { PERIOD_SIZE } = fixture.constants;

    const { timestamp } = await ethers.provider.getBlock('latest');
    const currentTimestamp = PERIOD_SIZE.mul(3).add(timestamp);

    const state = await ramm.loadState();
    const observationsAfterExpected = await getExpectedObservations(
      state,
      ramm,
      pool,
      tokenController,
      mcr,
      currentTimestamp,
    );

    await setNextBlockTime(currentTimestamp.toNumber());
    await ramm.updateTwap();

    const observations = await Promise.all([0, 1, 2].map(i => ramm.observations(i)));

    for (let i = 0; i < observations.length; i++) {
      expect(observations[i].timestamp).to.be.equal(observationsAfterExpected[i].timestamp);
      expect(observations[i].priceCumulativeBelow).to.be.equal(observationsAfterExpected[i].priceCumulativeBelow);
      expect(observations[i].priceCumulativeAbove).to.be.equal(observationsAfterExpected[i].priceCumulativeAbove);
    }
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
      currentTimestamp,
    );

    await setNextBlockTime(currentTimestamp.toNumber());
    await expect(ramm.updateTwap())
      .to.emit(ramm, 'ObservationUpdated')
      .withArgs(obsv1.timestamp, obsv1.priceCumulativeAbove, obsv1.priceCumulativeBelow)
      .to.emit(ramm, 'ObservationUpdated')
      .withArgs(obsv2.timestamp, obsv2.priceCumulativeAbove, obsv2.priceCumulativeBelow)
      .to.emit(ramm, 'ObservationUpdated')
      .withArgs(obsv3.timestamp, obsv3.priceCumulativeAbove, obsv3.priceCumulativeBelow);
  });
});

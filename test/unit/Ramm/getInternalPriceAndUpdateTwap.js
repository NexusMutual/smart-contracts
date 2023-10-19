const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { getState, setup } = require('./setup');
const { setNextBlockTime } = require('../../utils/evm');
const { calculateInternalPrice } = require('./helpers');

describe('getInternalPriceAndUpdateTwap', function () {
  it('should return the internal price and update the twap', async function () {
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
    const currentState = await ramm._getReserves(previousState, capital, supply, mcrValue, currentTimestamp);

    const observations = await ramm._updateTwap(
      previousState,
      previousObservations,
      currentTimestamp,
      capital,
      supply,
      mcrValue,
    );

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
});

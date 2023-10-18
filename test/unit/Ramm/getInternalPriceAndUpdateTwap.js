const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { getState, setup } = require('./setup');
const { setNextBlockTime } = require('../../utils/evm');
const { getObservationIndex } = require('./helpers');

const { parseEther } = ethers.utils;
const { BigNumber } = ethers;

describe('getInternalPriceAndUpdateTwap', function () {
  it('should return the internal price and update the twap', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController, mcr } = fixture.contracts;
    const { PERIOD_SIZE, GRANULARITY } = fixture.constants;

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

    const currentIdx = getObservationIndex(BigNumber.from(currentTimestamp), fixture.constants);
    const previousIdx = currentIdx.add(1).mod(GRANULARITY);

    const firstObservation = observations[previousIdx.toNumber()];
    const currentObservation = observations[currentIdx.toNumber()];

    const elapsed = currentTimestamp.sub(firstObservation.timestamp);

    const spotPriceA = parseEther('1').mul(currentState.eth).div(currentState.nxmA);
    const spotPriceB = parseEther('1').mul(currentState.eth).div(currentState.nxmB);

    const averagePriceA = currentObservation.priceCumulativeAbove
      .sub(firstObservation.priceCumulativeAbove)
      .div(elapsed)
      .mul(1e9);

    const averagePriceB = currentObservation.priceCumulativeBelow
      .sub(firstObservation.priceCumulativeBelow)
      .div(elapsed)
      .mul(1e9);

    const priceA = averagePriceA.gt(spotPriceA) ? spotPriceA : averagePriceA;
    const priceB = averagePriceB.gt(spotPriceB) ? averagePriceB : spotPriceB;

    await setNextBlockTime(currentTimestamp.toNumber());
    const tx = await ramm.getInternalPriceAndUpdateTwap();
    await tx.wait();

    for (let i = 0; i < 3; i++) {
      const updatedObservations = await ramm.observations(i);
      expect(updatedObservations.timestamp).to.be.equal(observations[i].timestamp);
      expect(updatedObservations.priceCumulativeAbove).to.be.equal(observations[i].priceCumulativeAbove);
      expect(updatedObservations.priceCumulativeBelow).to.be.equal(observations[i].priceCumulativeBelow);
    }
    // TODO: find a way to check the internal price
    const internalPriceExpected = priceA.add(priceB).sub(parseEther('1').mul(capital).div(supply));
    expect(internalPriceExpected).to.be.equal('21481481185185185'); // 0.021481481185185185
  });
});

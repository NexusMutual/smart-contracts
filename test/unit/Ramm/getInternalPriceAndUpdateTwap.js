const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { getState, setup } = require('./setup');
const { increaseTime, mineNextBlock, setNextBlockTime } = require('../../utils/evm');
const { getObservationIndex } = require('./helpers');

const { parseEther } = ethers.utils;
const { BigNumber } = ethers;

describe('getInternalPriceAndUpdateTwap', function () {
  it('should return the internal price and update the twap', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;
    const { PERIOD_SIZE, GRANULARITY } = fixture.constants;

    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const previousState = await getState(ramm);
    const previousObservations = [];
    for (let i = 0; i < 3; i++) {
      previousObservations[i] = await ramm.observations(i);
    }
    const { timestamp } = await ethers.provider.getBlock('latest');
    const currentTimestamp = PERIOD_SIZE.mul(10).add(timestamp);
    const currentState = await ramm._getReserves(previousState, capital, supply, currentTimestamp);

    const observations = await ramm._updateTwap(previousState, previousObservations, currentTimestamp, capital, supply);

    const currentIdx = getObservationIndex(BigNumber.from(currentTimestamp), fixture.constants);
    const previousIdx = currentIdx.add(1).mod(GRANULARITY);

    const firstObservation = observations[previousIdx.toNumber()];
    const currentObservation = observations[currentIdx.toNumber()];

    const elapsed = currentTimestamp.sub(firstObservation.timestamp);

    const spotPriceA = parseEther('1').mul(currentState.eth).div(currentState.nxmA);
    const spotPriceB = parseEther('1').mul(currentState.eth).div(currentState.nxmB);

    let averagePriceA = 0;
    let averagePriceB = 0;
    const averageDiffA = currentObservation.priceCumulativeAbove.sub(firstObservation.priceCumulativeAbove);

    if (averageDiffA.lt(0)) {
      averagePriceA = BigNumber.from(2).pow(256).add(averageDiffA).div(elapsed);
    } else {
      averagePriceA = averageDiffA.div(elapsed);
    }

    const averageDiffB = currentObservation.priceCumulativeBelow.sub(firstObservation.priceCumulativeBelow);

    if (averageDiffB.lt(0)) {
      averagePriceB = BigNumber.from(2).pow(256).add(averageDiffB).div(elapsed);
    } else {
      averagePriceB = averageDiffB.div(elapsed);
    }

    const priceA = averagePriceA.gt(spotPriceA) ? spotPriceA : averagePriceA;
    const priceB = averagePriceB.gt(spotPriceB) ? averagePriceB : spotPriceB;

    const internalPriceExpected = priceA.add(priceB).sub(parseEther('1').mul(capital).div(supply));

    await setNextBlockTime(currentTimestamp.toNumber());
    const tx = await ramm.getInternalPriceAndUpdateTwap();
    await tx.wait();
  });
});

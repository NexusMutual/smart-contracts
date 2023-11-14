const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { getState, setup } = require('./setup');
const { setNextBlockTime, mineNextBlock } = require('../../utils/evm');
const { calculateInternalPrice } = require('./helpers');

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

    const previousState = await getState(ramm);
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
});

const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

const { parseEther } = ethers;

describe('getSpotPrices', function () {
  it('should return current buy / sell spot prices', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;

    const elapsed = 1 * 60 * 60; // 1 hour elapsed
    await time.increase(elapsed);

    const { spotPriceA, spotPriceB } = await ramm.getSpotPrices();

    const context = {
      capital: await pool.getPoolValueInEth(),
      supply: await tokenController.totalSupply(),
      mcr: await pool.getMCR(),
    };

    const currentTimestamp = await time.latest();
    const initialState = await ramm.loadState();
    const [{ eth, nxmA, nxmB }] = await ramm._getReserves(initialState.toObject(), context, currentTimestamp);

    // buy price
    const expectedSpotPriceA = (parseEther('1') * eth) / nxmA;
    expect(spotPriceA).to.be.equal(expectedSpotPriceA);

    // sell price
    const expectedSpotPriceB = (parseEther('1') * eth) / nxmB;
    expect(spotPriceB).to.be.equal(expectedSpotPriceB);
  });
});

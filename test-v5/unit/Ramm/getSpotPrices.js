const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');
const { setNextBlockTime, mineNextBlock } = require('../../utils/evm');

const { provider } = ethers;
const { parseEther } = ethers.utils;

describe('getSpotPrices', function () {
  it('should return current buy / sell spot prices', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController, mcr } = fixture.contracts;

    const { timestamp } = await provider.getBlock('latest');
    const elapsed = 1 * 60 * 60; // 1 hour elapsed
    const nextBlockTimestamp = timestamp + elapsed;
    await setNextBlockTime(nextBlockTimestamp);
    await mineNextBlock();

    const { spotPriceA, spotPriceB } = await ramm.getSpotPrices();

    const initialState = await ramm.loadState();
    const context = {
      capital: await pool.getPoolValueInEth(),
      supply: await tokenController.totalSupply(),
      mcr: await mcr.getMCR(),
    };

    const [{ eth, nxmA, nxmB }] = await ramm._getReserves(initialState, context, nextBlockTimestamp);

    // buy price
    const expectedSpotPriceA = parseEther('1').mul(eth).div(nxmA);
    expect(spotPriceA).to.be.equal(expectedSpotPriceA);
    // sell price
    const expectedSpotPriceB = parseEther('1').mul(eth).div(nxmB);
    expect(spotPriceB).to.be.equal(expectedSpotPriceB);
  });
});

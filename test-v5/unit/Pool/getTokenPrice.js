const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');

describe('getTokenPrice', function () {
  it('should return the current token price (NXM sell price)', async function () {
    const fixture = await loadFixture(setup);
    const { pool, ramm } = fixture;

    const tokenPrice = await pool.getTokenPrice();
    const spotPrices = await ramm.getSpotPrices();

    expect(tokenPrice).to.be.equal(spotPrices[1]);
  });
});

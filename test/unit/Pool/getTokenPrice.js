const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { parseEther } = require('ethers');

describe('getTokenPrice', function () {
  it('return token price from ramm', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture;

    const expectedValue = parseEther('0.02444');
    const tokenPrice = await pool.getTokenPrice();
    expect(tokenPrice).to.equal(expectedValue);
  });
});

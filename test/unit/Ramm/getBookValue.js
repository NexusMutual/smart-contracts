const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

const { parseEther } = ethers;

describe('getBookValue', function () {
  it('should return the correct book value', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;

    const bookValue = await ramm.getBookValue();
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();

    expect(bookValue).to.be.equal((parseEther('1') * capital) / supply);
  });
});

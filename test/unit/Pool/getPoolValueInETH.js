const { expect } = require('chai');
const { parseEther } = require('ethers');
const { loadFixture, setBalance } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');

describe('getPoolValueInETH', function () {
  it('return pool value in ETH', async function () {
    const fixture = await loadFixture(setup);
    const { pool, usdc } = fixture;

    await usdc.mint(pool.target, 1000000n);
    await setBalance(await pool.target, parseEther('10000'));
    const ethValue = await pool.getPoolValueInEth();
    expect(ethValue).to.equal(10000000000000000000000n);
  });
});

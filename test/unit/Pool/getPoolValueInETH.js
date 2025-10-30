const { expect } = require('chai');
const { parseEther } = require('ethers');
const { loadFixture, setBalance } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');

// TODO: missing test cases
// - accounts for ETH in swap operator
// - accounts for other assets in swap operator
// - accounts for abandoned assets
// - [less important]: try catch - catch path not tested
// - [less important]: skip asset.balanceOf call when code length is zero
// - [less important / not in this file]: missing constructor test

describe('getPoolValueInETH', function () {
  it('return pool value in ETH', async function () {
    const fixture = await loadFixture(setup);
    const { pool, usdc } = fixture;

    await usdc.mint(pool.target, 1000000n);
    await setBalance(await pool.target, parseEther('10000'));
    const ethValue = await pool.getPoolValueInEth();
    expect(ethValue).to.equal(10001000000000000000000n);
  });
});

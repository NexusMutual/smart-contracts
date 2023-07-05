const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { BigNumber } = ethers;
const { toBytes8 } = require('../utils').helpers;

describe('setSwapValue', function () {
  it('is only callabe by swap operator', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture;
    const {
      governanceContracts: [governance],
      nonMembers: [swapOperator],
    } = fixture.accounts;

    // Not calling from swap operator reverts
    await expect(pool.setSwapValue(BigNumber.from('123'))).to.be.revertedWith('Pool: Not swapOperator');

    // Set swap operator
    await pool.connect(governance).updateAddressParameters(toBytes8('SWP_OP'), swapOperator.address);

    // Call should succeed
    await pool.connect(swapOperator).setSwapValue(BigNumber.from('123'));
  });

  it('sets the swapValue value', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture;
    const {
      governanceContracts: [governance],
      nonMembers: [swapOperator],
    } = fixture.accounts;

    expect(await pool.swapValue()).to.eq(0);
    // Set swap operator and set swap value
    await pool.connect(governance).updateAddressParameters(toBytes8('SWP_OP'), swapOperator.address);
    await pool.connect(swapOperator).setSwapValue(123);

    expect(await pool.swapValue()).to.eq(123);
  });
});

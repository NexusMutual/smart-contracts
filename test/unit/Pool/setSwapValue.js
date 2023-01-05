const { ethers } = require('hardhat');
const { expect } = require('chai');
const { BigNumber } = ethers;
const { hex } = require('../utils').helpers;

describe('setSwapValue', function () {
  it('is only callabe by swap operator', async function () {
    const { pool } = this;
    const {
      governanceContracts: [governance],
      nonMembers: [swapOperator],
    } = this.accounts;

    // Not calling from swap operator reverts
    await expect(pool.setSwapValue(BigNumber.from('123'))).to.be.revertedWith('Pool: Not swapOperator');

    // Set swap operator
    await pool.connect(governance).updateAddressParameters(hex('SWP_OP'.padEnd(8, '\0')), swapOperator.address);

    // Call should succeed
    await pool.connect(swapOperator).setSwapValue(BigNumber.from('123'));
  });

  it('sets the swapValue value', async function () {
    const { pool } = this;
    const {
      governanceContracts: [governance],
      nonMembers: [swapOperator],
    } = this.accounts;

    expect(await pool.swapValue()).to.eq(0);
    // Set swap operator and set swap value
    await pool.connect(governance).updateAddressParameters(hex('SWP_OP'.padEnd(8, '\0')), swapOperator.address);
    await pool.connect(swapOperator).setSwapValue(123);

    expect(await pool.swapValue()).to.eq(123);
  });
});

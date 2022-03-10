const { web3 } = require('hardhat');
const { expect } = require('chai');
const { BN } = web3.utils;
const { hex } = require('../utils').helpers;

const {
  governanceContracts: [governance],
  defaultSender,
} = require('../utils').accounts;

describe.only('setSwapValue', function () {
  it('is only callabe by swap operator', async function () {
    const { pool } = this;

    // Not calling from swap operator reverts
    await expect(pool.setSwapValue(new BN('123'))).to.be.revertedWith('Pool: Not swapOperator');

    // Set current signer as swap operator
    await pool.updateAddressParameters(hex('SWP_OP'), defaultSender, { from: governance });

    // Call should succeed
    await pool.setSwapValue(new BN('123'));
  });

  it('sets the swapValue value', async function () {
    const { pool } = this;
    expect((await pool.swapValue()).toString()).to.eq('0');

    // Set current signer as swap operator and set swap value
    await pool.updateAddressParameters(hex('SWP_OP'), defaultSender, { from: governance });
    await pool.setSwapValue(new BN('123'));

    expect((await pool.swapValue()).toString()).to.eq('123');
  });
});

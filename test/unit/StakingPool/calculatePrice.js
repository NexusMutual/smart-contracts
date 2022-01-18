const { assert } = require('chai');
const { web3, ethers: { utils: { parseEther } } } = require('hardhat');
const { ether, time, expectRevert } = require('@openzeppelin/test-helpers');
const { hex } = require('../utils').helpers;

const accounts = require('../utils').accounts;
const { calculatePrice } = require('./helpers');

const { toBN } = web3.utils;

describe.only('calculatePrice', function () {

  it('should calculate price correctly for high active cover', async function () {
    const { stakingPool } = this;

    const amount = parseEther('1000');

    const basePrice = parseEther('2.6');

    // exceeds surge treshold
    const activeCover = parseEther('9000');
    const capacity = parseEther('10000');

    const price = await stakingPool.calculatePrice(
      amount,
      basePrice,
      activeCover,
      capacity,
    );

    const expectedPrice = calculatePrice(
      amount, basePrice, activeCover, capacity,
    );

    assert.equal(price.toString(), expectedPrice.toString());
  });

  it('should calculate price correctly for medium-range active cover', async function () {
    const { stakingPool } = this;

    const amount = parseEther('1000');

    const basePrice = parseEther('2.6');
    const activeCover = parseEther('5000');
    const capacity = parseEther('10000');

    const price = await stakingPool.calculatePrice(
      amount,
      basePrice,
      activeCover,
      capacity,
    );

    const expectedPrice = calculatePrice(
      amount, basePrice, activeCover, capacity,
    );

    assert.equal(price.toString(), expectedPrice.toString());
  });

  it('should calculate price correctly for low-range active cover', async function () {
    const { stakingPool } = this;

    const amount = parseEther('1000');

    const basePrice = parseEther('2.6');
    const activeCover = parseEther('1000');
    const capacity = parseEther('10000');

    const price = await stakingPool.calculatePrice(
      amount,
      basePrice,
      activeCover,
      capacity,
    );

    const expectedPrice = calculatePrice(
      amount, basePrice, activeCover, capacity,
    );

    assert.equal(price.toString(), expectedPrice.toString());
  });
});

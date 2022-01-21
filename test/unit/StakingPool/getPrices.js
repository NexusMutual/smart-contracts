const { assert } = require('chai');
const { web3, ethers: { utils: { parseEther } } } = require('hardhat');
const { ether, time, expectRevert } = require('@openzeppelin/test-helpers');
const { hex } = require('../utils').helpers;

const accounts = require('../utils').accounts;
const { calculatePrice, getPrices } = require('./helpers');

const { toBN } = web3.utils;

describe('getPrices', function () {

  it('should calculate prices correctly for ', async function () {
    const { stakingPool } = this;

    const amount = parseEther('1000');

    const basePrice = parseEther('2.6');
    const activeCover = parseEther('8000');
    const capacity = parseEther('10000');
    const initialPrice = parseEther('10');
    const lastBasePrice = parseEther('1');
    const targetPrice = parseEther('1.5');
    const blockTimestamp = '1642699988';

    const { actualPrice, newBasePrice } = await stakingPool.getPrices(
      amount,
      activeCover,
      capacity,
      initialPrice,
      lastBasePrice,
      targetPrice,
      blockTimestamp,
    );

    const expectedPrice = getPrices(
      amount,
      activeCover,
      capacity,
      initialPrice,
      lastBasePrice,
      targetPrice,
      blockTimestamp,
    );

    assert.equal(newBasePrice.toString(), expectedPrice.toString());
  });

  // it('should calculate price correctly for medium-range active cover', async function () {
  //   const { stakingPool } = this;
  //
  //   const amount = parseEther('1000');
  //
  //   const basePrice = parseEther('2.6');
  //   const activeCover = parseEther('5000');
  //   const capacity = parseEther('10000');
  //
  //   const price = await stakingPool.calculatePrice(
  //     amount,
  //     basePrice,
  //     activeCover,
  //     capacity,
  //   );
  //
  //   const expectedPrice = calculatePrice(
  //     amount, basePrice, activeCover, capacity,
  //   );
  //
  //   assert.equal(price.toString(), expectedPrice.toString());
  // });
  //
  // it('should calculate price correctly for low-range active cover', async function () {
  //   const { stakingPool } = this;
  //
  //   const amount = parseEther('1000');
  //
  //   const basePrice = parseEther('2.6');
  //   const activeCover = parseEther('1000');
  //   const capacity = parseEther('10000');
  //
  //   const price = await stakingPool.calculatePrice(
  //     amount,
  //     basePrice,
  //     activeCover,
  //     capacity,
  //   );
  //
  //   const expectedPrice = calculatePrice(
  //     amount, basePrice, activeCover, capacity,
  //   );
  //
  //   assert.equal(price.toString(), expectedPrice.toString());
  // });
});

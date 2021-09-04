const { assert } = require('chai');
const { web3 } = require('hardhat');
const { ether, time, expectRevert } = require('@openzeppelin/test-helpers');
const { hex } = require('../utils').helpers;

const accounts = require('../utils').accounts;
const { calculatePrice } = require('./helpers');

const { toBN } = web3.utils;

describe('calculatePrice', function () {

  it.only('should calculate price correctly for high active cover', async function () {
    const { cover } = this;

    const amount = ether('1000');

    const basePrice = ether('2.6');
    const activeCover = ether('8000');
    const capacity = ether('10000');

    const price = await cover.calculatePrice(
      amount,
      basePrice,
      activeCover,
      capacity,
    );

    const expectedPrice = calculatePrice(
      amount, basePrice, activeCover, capacity,
    );

    console.log({
      expectedPrice: expectedPrice.toString(),
    });

    assert.equal(price.toString(), expectedPrice.toString());
  });

  it('should calculate price correctly for medium-range active cover', async function () {
    const { cover } = this;

    const amount = ether('1000');

    const basePrice = ether('2.6');
    const activeCover = ether('5000');
    const capacity = ether('10000');

    const price = await cover.calculatePrice(
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
    const { cover } = this;

    const amount = ether('1000');

    const basePrice = ether('2.6');
    const activeCover = ether('1000');
    const capacity = ether('10000');

    const price = await cover.calculatePrice(
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

const { assert } = require('chai');
const { ether, time, expectRevert } = require('@openzeppelin/test-helpers');
const { hex } = require('../utils').helpers;

const accounts = require('../utils').accounts;

describe('calculatePrice', function () {

  it.only('should return gearedMCR = 0 if there are no active covers', async function () {
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

    console.log({
      price: price.toString(),
    });
  });
});

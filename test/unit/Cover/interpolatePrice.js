const { assert } = require('chai');
const { web3 } = require('hardhat');
const { ether, time, expectRevert } = require('@openzeppelin/test-helpers');
const { hex } = require('../utils').helpers;

const accounts = require('../utils').accounts;
const { calculatePrice } = require('./helpers');

const { toBN } = web3.utils;

describe('interpolatePrice', function () {

  it('should interpolate price correctly based on time elapsed', async function () {
    const { cover } = this;

    const stakedNXM = ether('100000');
    const lastPrice = ether('10');
    const targetPrice = ether('5');
    const lastPriceUpdate = toBN('0');
    const now = toBN(24 * 3600);

    const price = await cover.interpolatePrice(
      lastPrice,
      targetPrice,
      lastPriceUpdate,
      now,
    );

    const expectedPrice = lastPrice.sub(lastPrice.sub(targetPrice).divn(100));

    assert.equal(price.toString(), expectedPrice.toString());
  });

});

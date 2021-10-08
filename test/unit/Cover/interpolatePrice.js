const { assert } = require('chai');
const { web3, ethers } = require('hardhat');
const { ether, time, expectRevert } = require('@openzeppelin/test-helpers');
const { hex } = require('../utils').helpers;

const accounts = require('../utils').accounts;
const { calculatePrice } = require('./helpers');

const { toBN } = web3.utils;

describe('interpolatePrice', function () {

  it('should interpolate price correctly based on time elapsed when price is decreasing', async function () {
    const { cover } = this;

    const lastPrice = ethers.utils.parseEther('10');
    const targetPrice = ethers.utils.parseEther('5');
    const lastPriceUpdate = '0';
    const now = (24 * 3600).toString();

    const price = await cover.interpolatePrice(
      lastPrice,
      targetPrice,
      lastPriceUpdate,
      now,
    );

    const expectedPrice = lastPrice.sub(lastPrice.sub(targetPrice).div(100));

    assert.equal(price.toString(), expectedPrice.toString());
  });

  it('should set price to target price when price is increasing', async function () {
    const { cover } = this;

    const lastPrice = ethers.utils.parseEther('5');
    const targetPrice = ethers.utils.parseEther('10');
    const lastPriceUpdate = '0';
    const now = (24 * 3600).toString();

    const price = await cover.interpolatePrice(
      lastPrice,
      targetPrice,
      lastPriceUpdate,
      now,
    );

    assert.equal(price.toString(), targetPrice.toString());
  });

});

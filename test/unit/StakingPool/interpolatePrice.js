const { assert } = require('chai');
const { toDecimal, PRICE_RATIO_CHANGE_PER_DAY } = require('./helpers');
const { ethers: { BigNumber, utils: { parseEther } } } = require('hardhat');

describe('interpolatePrice', function () {

  it('should interpolate price correctly based on time elapsed when price is decreasing', async function () {
    const { stakingPool } = this;

    const lastPrice = parseEther('0.1');
    const targetPrice = parseEther('0.05');
    const lastPriceUpdate = '0';
    const now = (24 * 3600).toString();

    const price = await stakingPool.interpolatePrice(
      lastPrice,
      targetPrice,
      lastPriceUpdate,
      now,
    );

    const expectedPrice = BigNumber.from(lastPrice).sub(PRICE_RATIO_CHANGE_PER_DAY);

    assert.equal(price.toString(), expectedPrice.toString());
  });

  it('should set price to target price when price is increasing', async function () {
    const { stakingPool } = this;

    const lastPrice = parseEther('0.05');
    const targetPrice = parseEther('0.1');
    const lastPriceUpdate = '0';
    const now = (24 * 3600).toString();

    const price = await stakingPool.interpolatePrice(
      lastPrice,
      targetPrice,
      lastPriceUpdate,
      now,
    );

    assert.equal(price.toString(), targetPrice.toString());
  });

});

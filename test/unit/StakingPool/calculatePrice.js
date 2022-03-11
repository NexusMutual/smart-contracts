const { assert } = require('chai');
const { ethers: { utils: { parseEther } } } = require('hardhat');

const { calculatePrice } = require('./helpers');

describe('calculatePrice', function () {

  it('should calculate price correctly for current active cover exceeding surge treshold', async function () {
    const { stakingPool } = this;

    const amount = parseEther('1000');

    const basePrice = '260';

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

  it('should calculate price correctly for current active cover below surge treshold and new active cover above surge treshold', async function () {
    const { stakingPool } = this;

    const amount = parseEther('700');

    const basePrice = '260';
    const activeCover = parseEther('7800');
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

    // allow for precision error
    assert.equal(price.div(100).toString(), expectedPrice.div(100).toString());
  });

  it('should calculate price correctly for new active cover below surge treshold', async function () {
    const { stakingPool } = this;

    const amount = parseEther('1000');

    const basePrice = '260';
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

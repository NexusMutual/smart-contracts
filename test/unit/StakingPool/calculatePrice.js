const { assert } = require('chai');
const { ethers: { utils: { parseUnits } } } = require('hardhat');

describe('calculatePrice', function () {

  it('should calculate price correctly for current active cover exceeding surge treshold', async function () {
    const { stakingPool } = this;

    const amount = parseUnits('1000');
    const basePrice = parseUnits('0.026');

    // exceeds surge treshold
    const activeCover = parseUnits('9000');
    const capacity = parseUnits('10000');

    const price = await stakingPool.calculatePrice(
      amount,
      basePrice,
      activeCover,
      capacity,
    );

    const expectedPrice = parseUnits('0.065');

    assert.equal(price.toString(), expectedPrice.toString());
  });

  it('should calculate price correctly for current active cover below surge treshold and new active cover above surge treshold', async function () {
    const { stakingPool } = this;

    const amount = parseUnits('700');

    const basePrice = parseUnits('0.026');
    const activeCover = parseUnits('7800');
    const capacity = parseUnits('10000');

    const price = await stakingPool.calculatePrice(
      amount,
      basePrice,
      activeCover,
      capacity,
    );


    const expectedPrice = parseUnits('0.0306');

    // allow for precision error
    assert.equal(price.div(1e14).toString(), expectedPrice.div(1e14).toString());
  });

  it('should calculate price correctly for new active cover below surge treshold', async function () {
    const { stakingPool } = this;

    const amount = parseUnits('1000');

    const basePrice = parseUnits('0.026');
    const activeCover = parseUnits('1000');
    const capacity = parseUnits('10000');

    const price = await stakingPool.calculatePrice(
      amount,
      basePrice,
      activeCover,
      capacity,
    );

    assert.equal(price.toString(), basePrice.toString());
  });
});

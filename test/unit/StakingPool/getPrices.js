const { ethers } = require('hardhat');
const { bnEqual } = require('../utils').helpers;
const { parseEther, parseUnits } = ethers.utils;

describe('getPrices', function () {
  it('should calculate price correctly for active cover starting at 0 without surge', async function () {
    const { stakingPool } = this;

    const amount = parseEther('2400');
    const activeCover = parseEther('0');
    const capacity = parseEther('50000');
    const initialPrice = parseUnits('0.2');
    const lastBasePrice = { value: parseUnits('0.02'), lastUpdateTime: 0 };
    const targetPrice = parseUnits('0.02');
    const blockTimestamp = 24 * 3600 * 183;

    const { actualPrice, basePrice: newBasePrice } = await stakingPool.getPrices(
      amount,
      activeCover,
      capacity,
      initialPrice,
      lastBasePrice,
      targetPrice,
      blockTimestamp,
    );

    const expectedNewBasePrice = parseUnits('0.0296');
    const expectedActualPrice = parseUnits('0.02');

    bnEqual(newBasePrice, expectedNewBasePrice);
    bnEqual(actualPrice, expectedActualPrice);
  });

  it('should calculate price correctly for active cover without surge at base price = target price', async function () {
    const { stakingPool } = this;

    const amount = parseEther('12000');
    const activeCover = parseEther('2400');
    const capacity = parseEther('50000');
    const initialPrice = parseUnits('0.2');
    const lastBasePrice = { value: parseUnits('0.0296'), lastUpdateTime: 0 };
    const targetPrice = parseUnits('0.02');
    const blockTimestamp = 24 * 3600 * 3;

    const { actualPrice, basePrice: newBasePrice } = await stakingPool.getPrices(
      amount,
      activeCover,
      capacity,
      initialPrice,
      lastBasePrice,
      targetPrice,
      blockTimestamp,
    );

    const expectedNewBasePrice = parseUnits('0.068');
    const expectedActualPrice = parseUnits('0.02');

    bnEqual(newBasePrice, expectedNewBasePrice);
    bnEqual(actualPrice, expectedActualPrice);
  });

  it('should calculate price correctly for active cover without surge at base price > target price', async function () {
    const { stakingPool } = this;

    const amount = parseEther('12000');
    const activeCover = parseEther('14400');
    const capacity = parseEther('50000');
    const initialPrice = parseUnits('0.2');
    const lastBasePrice = { value: parseUnits('0.068'), lastUpdateTime: 0 };
    const targetPrice = parseUnits('0.02');
    const blockTimestamp = 24 * 3600 * 5;

    const { actualPrice, basePrice: newBasePrice } = await stakingPool.getPrices(
      amount,
      activeCover,
      capacity,
      initialPrice,
      lastBasePrice,
      targetPrice,
      blockTimestamp,
    );

    const expectedNewBasePrice = parseUnits('0.091');
    const expectedActualPrice = parseUnits('0.043');

    bnEqual(newBasePrice, expectedNewBasePrice);
    bnEqual(actualPrice, expectedActualPrice);
  });

  it('should calculate price correctly for active cover without surge which increases base price', async function () {
    const { stakingPool } = this;

    const amount = parseEther('12000');
    const activeCover = parseEther('26400');
    const capacity = parseEther('50000');
    const initialPrice = parseUnits('0.2');
    const lastBasePrice = { value: parseUnits('0.091'), lastUpdateTime: 0 };
    const targetPrice = parseUnits('0.02');
    const blockTimestamp = 24 * 3600 * 5;

    const { actualPrice, basePrice: newBasePrice } = await stakingPool.getPrices(
      amount,
      activeCover,
      capacity,
      initialPrice,
      lastBasePrice,
      targetPrice,
      blockTimestamp,
    );

    const expectedNewBasePrice = parseUnits('0.114');
    const expectedActualPrice = parseUnits('0.066');

    bnEqual(newBasePrice, expectedNewBasePrice);
    bnEqual(actualPrice, expectedActualPrice);
  });

  it('should calculate price correctly for active cover with both flat and surge pricing', async function () {
    const { stakingPool } = this;

    const amount = parseEther('8000');
    const activeCover = parseEther('38400');
    const capacity = parseEther('50000');
    const initialPrice = parseUnits('0.2');
    const lastBasePrice = { value: parseUnits('0.114'), lastUpdateTime: 0 };
    const targetPrice = parseUnits('0.02');
    const blockTimestamp = 24 * 3600 * 15;

    const { actualPrice, basePrice: newBasePrice } = await stakingPool.getPrices(
      amount,
      activeCover,
      capacity,
      initialPrice,
      lastBasePrice,
      targetPrice,
      blockTimestamp,
    );

    const expectedNewBasePrice = parseUnits('0.071');
    const expectedActualPrice = parseUnits('0.058968');

    bnEqual(newBasePrice, expectedNewBasePrice);
    bnEqual(actualPrice, expectedActualPrice);
  });

  it('should calculate price correctly for active cover with surge pricing only', async function () {
    const { stakingPool } = this;

    const amount = parseEther('2400');
    const activeCover = parseEther('46400');
    const capacity = parseEther('50000');
    const initialPrice = parseUnits('0.2');
    const lastBasePrice = { value: parseUnits('0.071'), lastUpdateTime: 0 };
    const targetPrice = parseUnits('0.02');
    const blockTimestamp = 24 * 3600 * 10;

    const { actualPrice, basePrice: newBasePrice } = await stakingPool.getPrices(
      amount,
      activeCover,
      capacity,
      initialPrice,
      lastBasePrice,
      targetPrice,
      blockTimestamp,
    );

    const expectedNewBasePrice = parseUnits('0.0306');
    const expectedActualPrice = parseUnits('0.05292');

    bnEqual(newBasePrice, expectedNewBasePrice);
    bnEqual(actualPrice, expectedActualPrice);
  });
});

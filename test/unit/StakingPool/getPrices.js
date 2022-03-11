const { ethers: { utils: { parseEther, parseUnits } } } = require('hardhat');
const { bnEqual } = require('../utils').helpers;

const { getPrices } = require('./helpers');

describe.only('getPrices', function () {

  it('should calculate prices correctly for current active cover exceeding surge treshold', async function () {
    const { stakingPool } = this;

    const amount = parseEther('1000');

    const activeCover = parseUnits('8000');
    const capacity = parseUnits('10000');
    const initialPrice = parseUnits('0.1');
    const lastBasePrice = { value: parseUnits('0.03'), lastUpdateTime: 0 };
    const targetPrice = parseUnits('0.015');
    const blockTimestamp = 24 * 3600;

    const { actualPrice, basePrice: newBasePrice } = await stakingPool.getPrices(
      amount,
      activeCover,
      capacity,
      initialPrice,
      lastBasePrice,
      targetPrice,
      blockTimestamp,
    );

    const { actualPrice: expectedActualPrice, basePrice: expectedNewBasePrice } = getPrices(
      amount,
      activeCover,
      capacity,
      initialPrice,
      lastBasePrice,
      targetPrice,
      blockTimestamp,
    );

    bnEqual(newBasePrice, expectedNewBasePrice);
    bnEqual(actualPrice, expectedActualPrice);
  });

  it('should calculate price correctly for medium-range active cover that partially surges', async function () {
    const { stakingPool } = this;

    const amount = parseEther('700');

    const activeCover = parseEther('7800');
    const capacity = parseEther('10000');
    const initialPrice = parseUnits('0.1');
    const lastBasePrice = { value: parseUnits('0.03'), lastUpdateTime: 0 };
    const targetPrice = parseUnits('0.015');
    const blockTimestamp = 24 * 3600;

    const { actualPrice, basePrice: newBasePrice } = await stakingPool.getPrices(
      amount,
      activeCover,
      capacity,
      initialPrice,
      lastBasePrice,
      targetPrice,
      blockTimestamp,
    );

    const { actualPrice: expectedActualPrice, basePrice: expectedNewBasePrice } = getPrices(
      amount,
      activeCover,
      capacity,
      initialPrice,
      lastBasePrice,
      targetPrice,
      blockTimestamp,
    );

    bnEqual(newBasePrice, expectedNewBasePrice);
    bnEqual(actualPrice, expectedActualPrice);
  });

  it('should calculate price correctly for low-range active cover', async function () {
    const { stakingPool } = this;

    const amount = parseEther('1000');
    const activeCover = parseEther('1000');
    const capacity = parseEther('10000');
    const initialPrice = parseUnits('0.1');
    const lastBasePrice = { value: parseUnits('0.03'), lastUpdateTime: 0 };
    const targetPrice = parseUnits('0.015');
    const blockTimestamp = 24 * 3600;

    const { actualPrice, basePrice: newBasePrice } = await stakingPool.getPrices(
      amount,
      activeCover,
      capacity,
      initialPrice,
      lastBasePrice,
      targetPrice,
      blockTimestamp,
    );

    const { actualPrice: expectedActualPrice, basePrice: expectedNewBasePrice } = getPrices(
      amount,
      activeCover,
      capacity,
      initialPrice,
      lastBasePrice,
      targetPrice,
      blockTimestamp,
    );

    bnEqual(newBasePrice, expectedNewBasePrice);
    bnEqual(actualPrice, expectedActualPrice);
  });
});

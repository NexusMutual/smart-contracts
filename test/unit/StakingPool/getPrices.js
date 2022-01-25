const { assert } = require('chai');
const { web3, ethers: { utils: { parseEther } } } = require('hardhat');
const { time, expectRevert } = require('@openzeppelin/test-helpers');
const { hex, bnEqual } = require('../utils').helpers;

const accounts = require('../utils').accounts;
const { calculatePrice, getPrices } = require('./helpers');

const { toBN } = web3.utils;

describe('getPrices', function () {

  it('should calculate prices correctly for current active cover exceeding surge treshold', async function () {
    const { stakingPool } = this;

    const amount = parseEther('1000');

    const activeCover = parseEther('8000');
    const capacity = parseEther('10000');
    const initialPrice = '1000';
    const lastBasePrice = { value: '300', lastUpdateTime: 0 };
    const targetPrice = '150';
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
    const initialPrice = '1000';
    const lastBasePrice = { value: '300', lastUpdateTime: 0 };
    const targetPrice = '150';
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
    const initialPrice = '1000';
    const lastBasePrice = { value: '300', lastUpdateTime: 0 };
    const targetPrice = '150';
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

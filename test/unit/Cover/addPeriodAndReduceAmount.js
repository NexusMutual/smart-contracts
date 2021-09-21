const { assert } = require('chai');
const { web3 } = require('hardhat');
const { ether, time, expectRevert } = require('@openzeppelin/test-helpers');
const { hex } = require('../utils').helpers;
const accounts = require('../utils').accounts;
const { calculatePrice } = require('./helpers');

const { members: [coverBuyer1], advisoryBoardMembers: [ab1] } = require('../utils').accounts;

const CoverMockStakingPool = artifacts.require('CoverMockStakingPool');

const { toBN } = web3.utils;

describe.only('addPeriodAndReduceAmount', function () {

  it('should purchase new cover', async function () {
    const { cover } = this;

    const productId = 1;
    const payoutAsset = 0; // ETH
    const period = 3600 * 365; // 30 days

    const amount = ether('1000');

    const initialPrice = ether('2.6');
    const targetPrice = ether('2.6');
    const activeCover = ether('8000');
    const capacity = ether('10000');
    const resultingBasePrice = ether('2.6');

    const stakingPool = await CoverMockStakingPool.new();
    const capacityFactor = '1';

    await cover.setCapacityFactor(productId, capacityFactor, {
      from: ab1,
    });
    await cover.setInitialPrice(productId, initialPrice, {
      from: ab1,
    });

    await stakingPool.setStake(productId, capacity);
    await stakingPool.setTargetPrice(productId, targetPrice);
    await stakingPool.setUsedCapacity(productId, activeCover);

    const expectedPricePercentage = await cover.calculatePrice(
      amount,
      resultingBasePrice,
      activeCover,
      capacity,
    );
    const expectedPrice = expectedPricePercentage.mul(amount).div(ether('100'));

    console.log({
      expectedPrice: expectedPrice.toString(),
    });

    await cover.buyCover(
      coverBuyer1,
      productId,
      payoutAsset,
      amount,
      period,
      expectedPrice,
      [{ poolAddress: stakingPool.address, coverAmount: '0', premiumInNXM: '0' }],
      {
        value: expectedPrice,
      },
    );

    const coverId = '0';
    const extraPeriod = toBN(30 * 24 * 3600); // 30 days
    const amountReduction = ether('10');
    const maxPrice = ether('100000');

    await cover.addPeriodAndReduceAmount(
      coverId,
      extraPeriod,
      amountReduction,
      maxPrice,
      {
        from: coverBuyer1,
        value: maxPrice,
      },
    );
  });
});

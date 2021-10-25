const { assert } = require('chai');
const { web3, ethers: { utils: { parseEther } } } = require('hardhat');
const { ethers } = require('hardhat');
const { ether, time, expectRevert } = require('@openzeppelin/test-helpers');
const { hex } = require('../utils').helpers;
const accounts = require('../utils').accounts;
const { calculatePrice } = require('./helpers');

const { governanceContracts: [gv1], members: [member1] } = require('../utils').accounts;

const { members: [coverBuyer1], advisoryBoardMembers: [ab1] } = require('../utils').accounts;

const { toBN } = web3.utils;

describe('increaseAmount', function () {

  it('should edit cover by increasing amount', async function () {
    const { cover } = this;

    const CoverMockStakingPool = await ethers.getContractFactory('CoverMockStakingPool');

    const {
      advisoryBoardMembers: [ab1],
      governanceContracts: [gv1],
      members: [member1],
      members: [coverBuyer1],
    } = this.accounts;

    const productId = 0;
    const payoutAsset = 0; // ETH
    const period = 3600 * 24 * 60; // 60 days

    const amount = parseEther('1000');

    const initialPrice = parseEther('2.6');
    const targetPrice = parseEther('2.6');
    const activeCover = parseEther('8000');
    const capacity = parseEther('10000');
    const resultingBasePrice = parseEther('2.6');

    const stakingPool = await CoverMockStakingPool.deploy();
    await stakingPool.deployed();
    const capacityFactor = '1';

    await cover.connect(gv1).setCapacityFactor(capacityFactor);
    await cover.connect(ab1).setInitialPrice(productId, initialPrice);

    await stakingPool.setStake(productId, capacity);
    await stakingPool.setTargetPrice(productId, targetPrice);
    await stakingPool.setUsedCapacity(productId, activeCover);

    const expectedPricePercentage = await cover.calculatePrice(
      amount,
      resultingBasePrice,
      activeCover,
      capacity,
    );
    const expectedPrice = expectedPricePercentage.mul(amount).div(parseEther('100'));

    console.log({
      expectedPrice: expectedPrice.toString(),
    });

    const tx1 = await cover.connect(coverBuyer1).buyCover(
      {
        owner: coverBuyer1.address,
        productId,
        payoutAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPrice,
        paymentAsset: payoutAsset,
        payWitNXM: false,
      },
      [{ poolAddress: stakingPool.address, coverAmountInAsset: amount.toString() }],
      {
        value: expectedPrice,
      },
    );

    // console.log({
    //   gasUsed: tx1.receipt.gasUsed,
    // });

    // increase time so cover can be edited
    await time.increase(time.duration.hours(25));

    const coverId = '0';
    const amountIncrease = parseEther('10');
    const maxPrice = parseEther('100000');

    const tx2 = await cover.connect(coverBuyer1).increaseAmount(
      coverId,
      amountIncrease,
      payoutAsset,
      maxPrice,
      [{ poolAddress: stakingPool.address, coverAmountInAsset: amountIncrease.toString() }],
      {
        value: maxPrice,
      },
    );

    // console.log({
    //   gasUsed: tx2.receipt.gasUsed,
    // });
  });
});

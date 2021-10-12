const { assert } = require('chai');
const { web3, ethers: { utils: { parseEther } } } = require('hardhat');
const { time, expectRevert } = require('@openzeppelin/test-helpers');
const { hex } = require('../utils').helpers;
const { calculatePrice } = require('./helpers');

const CoverMockStakingPool = artifacts.require('CoverMockStakingPool');

describe('buyCover', function () {

  it.only('should purchase new cover', async function () {
    const { cover } = this;

    const {
      advisoryBoardMembers: [ab1],
      governanceContracts: [gv1],
      members: [member1],
      members: [coverBuyer1],
    } = this.accounts;

    const productId = 0;
    const payoutAsset = 0; // ETH
    const period = 3600 * 365; // 30 days

    const amount = parseEther('1000');

    const initialPrice = parseEther('2.6');
    const targetPrice = parseEther('2.6');
    const activeCover = parseEther('8000');
    const capacity = parseEther('10000');
    const resultingBasePrice = parseEther('2.6');

    const stakingPool = await CoverMockStakingPool.new();
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

    await cover.connect(member1).buyCover(
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
  });
});

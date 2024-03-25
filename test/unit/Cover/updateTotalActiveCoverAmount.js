const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { createStakingPool } = require('./helpers');
const setup = require('./setup');
const { increaseTime } = require('../utils').evm;
const { daysToSeconds } = require('../utils').helpers;

const { BigNumber } = ethers;
const { parseEther } = ethers.utils;
const { AddressZero } = ethers.constants;

const buyCoverFixture = {
  productId: 0,
  coverAsset: 0, // ETH
  poolId: 1,
  segmentId: 0,
  period: 3600 * 24 * 30, // 30 days
  amount: parseEther('1000'),
  targetPriceRatio: 260,
  priceDenominator: BigNumber.from(10000),
  activeCover: parseEther('8000'),
  capacity: parseEther('10000'),
  expectedPremium: parseEther('1000').mul(260).div(10000), // amount * targetPriceRatio / priceDenominator
};

const poolAllocationRequest = [{ poolId: 1, coverAmountInAsset: buyCoverFixture.amount }];

async function updateTotalActiveCoverAmountSetup() {
  const fixture = await loadFixture(setup);
  const { cover, stakingProducts } = fixture;
  const [stakingPoolManager] = fixture.accounts.members;
  const [coverBuyer] = fixture.accounts.members;

  await createStakingPool(
    stakingProducts,
    buyCoverFixture.productId,
    buyCoverFixture.capacity,
    buyCoverFixture.targetPriceRatio,
    buyCoverFixture.activeCover,
    stakingPoolManager,
    buyCoverFixture.targetPriceRatio,
  );

  const { amount, productId, coverAsset, period, expectedPremium } = buyCoverFixture;
  await cover.connect(coverBuyer).buyCover(
    {
      coverId: 0,
      owner: coverBuyer.address,
      productId,
      coverAsset,
      amount,
      period,
      maxPremiumInAsset: expectedPremium,
      paymentAsset: coverAsset,
      commissionRatio: parseEther('0'),
      commissionDestination: AddressZero,
      ipfsData: '',
    },
    poolAllocationRequest,
    { value: expectedPremium },
  );
  const coverId = await cover.coverDataCount();

  await increaseTime(daysToSeconds(31));

  await expect(cover.connect(coverBuyer).expireCover(coverId));

  return fixture;
}

describe('updateTotalActiveCoverAmount', function () {
  it('should recalculate totalCoverAmount', async function () {
    const fixture = await loadFixture(updateTotalActiveCoverAmountSetup);
    const { cover } = fixture;
    const { coverAsset } = buyCoverFixture;

    await increaseTime(daysToSeconds(7)); // fastforward to next bucket
    await cover.updateTotalActiveCoverAmount(coverAsset);
    const totalCoverAmount = await cover.totalActiveCoverInAsset(coverAsset);

    expect(totalCoverAmount).to.be.equal(0);
  });
});

const { ethers } = require('hardhat');
const { expect } = require('chai');
const { daysToSeconds } = require('../../../lib/helpers');
const { calculateFirstTrancheId } = require('../utils/staking');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('../setup');

const { parseEther } = ethers.utils;
const { AddressZero, MaxUint256 } = ethers.constants;

const PRICE_DENOMINATOR = 10000;
const REWARD_DENOMINATOR = 10000;

const stakedProductParamTemplate = {
  productId: 1,
  recalculateEffectiveWeight: true,
  setTargetWeight: true,
  targetWeight: 100,
  setTargetPrice: true,
  targetPrice: 100,
};

const buyCoverFixture = {
  coverId: 0,
  owner: AddressZero,
  productId: stakedProductParamTemplate.productId,
  coverAsset: 0b0,
  amount: parseEther('1'),
  period: daysToSeconds(30),
  maxPremiumInAsset: MaxUint256,
  paymentAsset: 0b0,
  commissionRatio: 0,
  commissionDestination: AddressZero,
  ipfsData: 'ipfs data',
};

async function buyCoverSetup() {
  const fixture = await setup();
  const { tk: nxm, stakingProducts, stakingPool1, stakingPool2, stakingPool3, tc: tokenController } = fixture.contracts;
  const staker = fixture.accounts.defaultSender;
  const [manager1, manager2, manager3] = fixture.accounts.stakingPoolManagers;
  const stakeAmount = parseEther('9000000');

  await stakingProducts.connect(manager1).setProducts(1, [stakedProductParamTemplate]);
  await stakingProducts.connect(manager2).setProducts(2, [stakedProductParamTemplate]);
  await stakingProducts.connect(manager3).setProducts(3, [stakedProductParamTemplate]);

  // stake
  const firstActiveTrancheId = await calculateFirstTrancheId(
    await ethers.provider.getBlock('latest'),
    buyCoverFixture.period,
    0,
  );
  await nxm.approve(tokenController.address, MaxUint256);
  await stakingPool1.connect(staker).depositTo(stakeAmount, firstActiveTrancheId + 5, 0, staker.address);
  await stakingPool2.connect(staker).depositTo(stakeAmount, firstActiveTrancheId + 5, 0, staker.address);
  await stakingPool3.connect(staker).depositTo(stakeAmount, firstActiveTrancheId + 5, 0, staker.address);
  return {
    ...fixture,
  };
}

describe('buyCover', function () {
  it.skip('allows to buy against multiple staking pool', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, tc: tokenController, stakingProducts } = fixture.contracts;
    const {
      members: [coverBuyer, coverReceiver],
    } = fixture.accounts;
    const { GLOBAL_REWARDS_RATIO } = fixture.config;
    const { productId, period, amount, segmentId } = buyCoverFixture;

    const product = await stakingProducts.getProduct(1, productId);
    const coverAmountAllocationPerPool = amount.div(3);

    const expectedPremiumPerPool = coverAmountAllocationPerPool
      .mul(product.targetPrice)
      .div(PRICE_DENOMINATOR)
      .mul(period)
      .div(daysToSeconds(365));

    const expectedRewardPerPool = expectedPremiumPerPool.mul(GLOBAL_REWARDS_RATIO).div(REWARD_DENOMINATOR);
    const expectedPremium = expectedPremiumPerPool.mul(3);

    const stakingPool1Before = await tokenController.stakingPoolNXMBalances(1);
    const stakingPool2Before = await tokenController.stakingPoolNXMBalances(2);
    const stakingPool3Before = await tokenController.stakingPoolNXMBalances(3);

    await cover.connect(coverBuyer).buyCover(
      { ...buyCoverFixture, owner: coverReceiver.address, maxPremiumInAsset: expectedPremium.mul(2) },
      [
        { poolId: 1, coverAmountInAsset: coverAmountAllocationPerPool },
        { poolId: 2, coverAmountInAsset: coverAmountAllocationPerPool },
        { poolId: 3, coverAmountInAsset: coverAmountAllocationPerPool },
      ],
      { value: expectedPremium.mul(2) },
    );

    const stakingPool1After = await tokenController.stakingPoolNXMBalances(1);
    const stakingPool2After = await tokenController.stakingPoolNXMBalances(2);
    const stakingPool3After = await tokenController.stakingPoolNXMBalances(3);

    // validate that rewards increased
    // TODO: actual rewards are ~5x larger
    expect(stakingPool1After.rewards).to.be.equal(stakingPool1Before.rewards.add(expectedRewardPerPool));
    expect(stakingPool2After.rewards).to.be.equal(stakingPool2Before.rewards.add(expectedRewardPerPool));
    expect(stakingPool3After.rewards).to.be.equal(stakingPool3Before.rewards.add(expectedRewardPerPool));

    const coverId = await cover.coverDataCount();

    for (let i = 0; i < 3; i++) {
      const segmentAllocation = await cover.coverSegmentAllocations(coverId, segmentId, i);
      expect(segmentAllocation.poolId).to.be.equal(i + 1);
      expect(segmentAllocation.coverAmountInNXM).to.be.equal(coverAmountAllocationPerPool);
    }
  });
});

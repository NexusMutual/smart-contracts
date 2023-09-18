const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');
const { calculateFirstTrancheId } = require('../utils/staking');
const {
  evm: { setNextBlockTime },
} = require('../utils');
const { daysToSeconds } = require('../../../lib/helpers');
const { BUCKET_DURATION } = require('../../unit/StakingPool/helpers');
const { BigNumber } = require('ethers');
const { increaseTime, mineNextBlock } = require('../utils').evm;

const { parseEther } = ethers.utils;
const { AddressZero, MaxUint256 } = ethers.constants;

const PRICE_DENOMINATOR = 10000;
const REWARD_DENOMINATOR = 10000;
const PRICE_CHANGE_PER_DAY = 50;

function assetAmountToNXMAmount(amount, rate, allocationUnit) {
  const nxmAmount = amount.mul(parseEther('1')).div(rate);

  const coverNXMAmount = nxmAmount.mod(allocationUnit).eq(0)
    ? nxmAmount
    : nxmAmount.div(allocationUnit).add(1).mul(allocationUnit);

  return coverNXMAmount;
}

function calculatePremium(amount, rate, period, price, allocationUnit) {
  const nxmAmount = amount.mul(parseEther('1')).div(rate);

  const coverNXMAmount = nxmAmount.mod(allocationUnit).eq(0)
    ? nxmAmount
    : nxmAmount.div(allocationUnit).add(1).mul(allocationUnit);

  const premiumInNxm = coverNXMAmount.mul(price).div(PRICE_DENOMINATOR).mul(period).div(daysToSeconds(365));

  const premiumInAsset = premiumInNxm.mul(rate).div(parseEther('1'));

  return { premiumInNxm, premiumInAsset };
}

async function calculateEditPremium({
  amount,
  period,
  extraPeriod,
  timestampAtEditTime,
  startOfPreviousSegment,
  increasedAmount,
  ethRate,
  productBumpedPrice,
  NXM_PER_ALLOCATION_UNIT,
  coverAmountInNXM = BigNumber.from(1),
  totalCoverAmountInNXM = BigNumber.from(1),
}) {
  // adding 1 to account for block.timestamp = timestampAtEditTime + 1 at transaction time
  const remainingPeriod = BigNumber.from(period).sub(
    BigNumber.from(timestampAtEditTime).add(1).sub(startOfPreviousSegment),
  );

  const newPeriod = remainingPeriod.add(extraPeriod);

  const oldSegmentAmountInNXMRepriced = assetAmountToNXMAmount(amount, ethRate, NXM_PER_ALLOCATION_UNIT)
    .mul(coverAmountInNXM)
    .div(totalCoverAmountInNXM);

  const increasedAmountInNXM = assetAmountToNXMAmount(increasedAmount, ethRate, NXM_PER_ALLOCATION_UNIT);

  const extraAmount = increasedAmountInNXM.sub(oldSegmentAmountInNXMRepriced);

  const { premiumInNxm, premiumInAsset } = calculatePremium(
    increasedAmount,
    ethRate,
    newPeriod,
    productBumpedPrice,
    NXM_PER_ALLOCATION_UNIT,
  );

  function calculateExtraPremium(fullPremium) {
    return fullPremium
      .mul(extraAmount.gt(0) ? extraAmount : BigNumber.from(0))
      .mul(remainingPeriod)
      .div(increasedAmountInNXM)
      .div(newPeriod)
      .add(fullPremium.mul(extraPeriod).div(newPeriod));
  }

  const extraPremium = calculateExtraPremium(premiumInAsset);
  const extraPremiumInNXM = calculateExtraPremium(premiumInNxm);

  return { extraPremium, extraPremiumInNXM, newPeriod };
}

function calculateRewards(premium, timestamp, period, rewardRation) {
  const expirationBucket = Math.ceil((timestamp + period) / BUCKET_DURATION);
  const rewardStreamPeriod = expirationBucket * BUCKET_DURATION - timestamp;
  const rewardPerSecond = premium.mul(rewardRation).div(REWARD_DENOMINATOR).div(rewardStreamPeriod);

  return rewardPerSecond.mul(rewardStreamPeriod);
}

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
  const fixture = await loadFixture(setup);
  const {
    tk: nxm,
    stakingProducts,
    stakingPool1,
    stakingPool2,
    stakingPool3,
    tc: tokenController,
    p1: pool,
  } = fixture.contracts;
  const staker = fixture.accounts.defaultSender;
  const [manager1, manager2, manager3] = fixture.accounts.stakingPoolManagers;
  const { productList } = fixture;
  const { targetPrice } = stakedProductParamTemplate;

  const stakeAmount = parseEther('9000000');
  const ethRate = await pool.getTokenPriceInAsset(0);
  const daiRate = await pool.getTokenPriceInAsset(1);

  const productIdWithBumpedPrice = productList.findIndex(
    ({ product: { initialPriceRatio, useFixedPrice } }) => targetPrice !== initialPriceRatio && !useFixedPrice,
  );
  const productIdWithFixedPrice = productList.findIndex(
    ({ product: { initialPriceRatio, useFixedPrice } }) => targetPrice !== initialPriceRatio && useFixedPrice,
  );
  const productIdIsDeprecated = productList.findIndex(({ product: { isDeprecated } }) => isDeprecated);

  await stakingProducts.connect(manager1).setProducts(1, [
    stakedProductParamTemplate,
    { ...stakedProductParamTemplate, productId: productIdWithBumpedPrice }, // with bumped price !== target price
    { ...stakedProductParamTemplate, productId: productIdWithFixedPrice }, // with fixed price
    { ...stakedProductParamTemplate, productId: productIdIsDeprecated }, // with isDeprecated ture
  ]);
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
    ethRate,
    daiRate,
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

  it('should purchase new cover with bumped price price after initialization', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, tc: tokenController, stakingProducts, p1: pool } = fixture.contracts;
    const {
      members: [coverBuyer, coverReceiver],
    } = fixture.accounts;
    const {
      config: { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO },
      ethRate,
    } = fixture;
    const { period, amount } = buyCoverFixture;

    const product = await stakingProducts.getProduct(1, 1);
    const { premiumInNxm, premiumInAsset: premium } = calculatePremium(
      amount,
      ethRate,
      period,
      product.bumpedPrice,
      NXM_PER_ALLOCATION_UNIT,
    );

    const stakingPoolBefore = await tokenController.stakingPoolNXMBalances(1);
    const poolBeforeETH = await ethers.provider.getBalance(pool.address);

    await cover
      .connect(coverBuyer)
      .buyCover(
        { ...buyCoverFixture, productId: 1, owner: coverReceiver.address, maxPremiumInAsset: premium },
        [{ poolId: 1, coverAmountInAsset: amount }],
        { value: premium },
      );

    const { timestamp } = await ethers.provider.getBlock('latest');

    const rewards = calculateRewards(premiumInNxm, timestamp, period, GLOBAL_REWARDS_RATIO);

    const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
    const poolAfterETH = await ethers.provider.getBalance(pool.address);
    expect(stakingPoolAfter.rewards).to.be.equal(stakingPoolBefore.rewards.add(rewards));
    expect(poolAfterETH).to.be.equal(poolBeforeETH.add(premium));
  });

  it('should purchase new cover with calculated price after the drop', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, tc: tokenController, stakingProducts, p1: pool } = fixture.contracts;
    const {
      members: [coverBuyer, coverReceiver],
    } = fixture.accounts;
    const {
      config: { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO },
      ethRate,
      productList,
    } = fixture;
    const { period, amount } = buyCoverFixture;
    const { targetPrice } = stakedProductParamTemplate;
    const daysElapsed = 1;

    const productId = productList.findIndex(
      ({ product: { initialPriceRatio, useFixedPrice } }) => targetPrice !== initialPriceRatio && !useFixedPrice,
    );

    const product = await stakingProducts.getProduct(1, productId);
    const { bumpedPriceUpdateTime, bumpedPrice } = product;
    const price = bumpedPrice.sub(BigNumber.from(daysElapsed).mul(PRICE_CHANGE_PER_DAY));

    const { premiumInNxm, premiumInAsset: premium } = calculatePremium(
      amount,
      ethRate,
      period,
      price,
      NXM_PER_ALLOCATION_UNIT,
    );

    await setNextBlockTime(bumpedPriceUpdateTime.add(daysToSeconds(daysElapsed)).toNumber());

    const stakingPoolBefore = await tokenController.stakingPoolNXMBalances(1);
    const poolBeforeETH = await ethers.provider.getBalance(pool.address);

    await cover
      .connect(coverBuyer)
      .buyCover(
        { ...buyCoverFixture, productId, owner: coverReceiver.address, maxPremiumInAsset: premium },
        [{ poolId: 1, coverAmountInAsset: amount }],
        { value: premium },
      );

    const { timestamp } = await ethers.provider.getBlock('latest');

    const rewards = calculateRewards(premiumInNxm, timestamp, period, GLOBAL_REWARDS_RATIO);

    const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
    const poolAfterETH = await ethers.provider.getBalance(pool.address);
    expect(stakingPoolAfter.rewards).to.be.equal(stakingPoolBefore.rewards.add(rewards));
    expect(poolAfterETH).to.be.equal(poolBeforeETH.add(premium));
  });

  it('should purchase new cover with fixed price', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, tc: tokenController, stakingProducts, p1: pool } = fixture.contracts;
    const {
      members: [coverBuyer, coverReceiver],
    } = fixture.accounts;
    const {
      config: { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO },
      ethRate,
      productList,
    } = fixture;
    const { period, amount } = buyCoverFixture;
    const { targetPrice } = stakedProductParamTemplate;

    const productId = productList.findIndex(
      ({ product: { initialPriceRatio, useFixedPrice } }) => targetPrice !== initialPriceRatio && useFixedPrice,
    );

    const product = await stakingProducts.getProduct(1, productId);
    const { premiumInNxm, premiumInAsset: premium } = calculatePremium(
      amount,
      ethRate,
      period,
      product.targetPrice,
      NXM_PER_ALLOCATION_UNIT,
    );

    const stakingPoolBefore = await tokenController.stakingPoolNXMBalances(1);
    const poolBeforeETH = await ethers.provider.getBalance(pool.address);

    await cover
      .connect(coverBuyer)
      .buyCover(
        { ...buyCoverFixture, productId, owner: coverReceiver.address, maxPremiumInAsset: premium },
        [{ poolId: 1, coverAmountInAsset: amount }],
        { value: premium },
      );

    const { timestamp } = await ethers.provider.getBlock('latest');

    const rewards = calculateRewards(premiumInNxm, timestamp, period, GLOBAL_REWARDS_RATIO);

    const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
    const poolAfterETH = await ethers.provider.getBalance(pool.address);
    expect(stakingPoolAfter.rewards).to.be.equal(stakingPoolBefore.rewards.add(rewards));
    expect(poolAfterETH).to.be.equal(poolBeforeETH.add(premium));
  });

  it('should revert the purchase of deprecated product', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { productList } = fixture;
    const { cover } = fixture.contracts;
    const {
      members: [coverBuyer, coverReceiver],
    } = fixture.accounts;
    const { amount } = buyCoverFixture;

    const productId = productList.findIndex(({ product: { isDeprecated } }) => isDeprecated);

    await expect(
      cover
        .connect(coverBuyer)
        .buyCover(
          { ...buyCoverFixture, productId, owner: coverReceiver.address, maxPremiumInAsset: amount },
          [{ poolId: 1, coverAmountInAsset: amount }],
          { value: amount },
        ),
    ).to.revertedWithCustomError(cover, 'ProductDoesntExistOrIsDeprecated');
  });

  it('should edit cover to increase amount', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, tc: tokenController, stakingProducts, p1: pool } = fixture.contracts;
    const {
      members: [coverBuyer, coverReceiver],
    } = fixture.accounts;
    const {
      config: { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO },
      ethRate,
    } = fixture;
    const { period, amount } = buyCoverFixture;

    const product = await stakingProducts.getProduct(1, 1);
    const { premiumInNxm, premiumInAsset: premium } = calculatePremium(
      amount,
      ethRate,
      period,
      product.bumpedPrice,
      NXM_PER_ALLOCATION_UNIT,
    );

    const stakingPoolBefore = await tokenController.stakingPoolNXMBalances(1);
    const poolBeforeETH = await ethers.provider.getBalance(pool.address);

    {
      await cover
        .connect(coverBuyer)
        .buyCover(
          { ...buyCoverFixture, productId: 1, owner: coverBuyer.address, maxPremiumInAsset: premium },
          [{ poolId: 1, coverAmountInAsset: amount }],
          { value: premium },
        );

      const { timestamp } = await ethers.provider.getBlock('latest');

      const rewards = calculateRewards(premiumInNxm, timestamp, period, GLOBAL_REWARDS_RATIO);

      const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
      const poolAfterETH = await ethers.provider.getBalance(pool.address);
      expect(stakingPoolAfter.rewards).to.be.equal(stakingPoolBefore.rewards.add(rewards));
      expect(poolAfterETH).to.be.equal(poolBeforeETH.add(premium));
    }

    {
      const coverId = 1;

      const increasedAmount = buyCoverFixture.amount.mul(2);

      const segments = await cover.coverSegments(coverId);

      const startOfPreviousSegment = segments[0].start;

      const { timestamp: timestampAtEditTime } = await ethers.provider.getBlock('latest');

      const { extraPremium, extraPremiumInNXM, newPeriod } = await calculateEditPremium({
        amount,
        period,
        extraPeriod: BigNumber.from('0'),
        timestampAtEditTime,
        startOfPreviousSegment,
        increasedAmount,
        ethRate,
        productBumpedPrice: product.bumpedPrice,
        NXM_PER_ALLOCATION_UNIT,
      });

      const editCoverFixture = { ...buyCoverFixture, amount: increasedAmount, coverId };

      const stakingPoolBeforeEdit = await tokenController.stakingPoolNXMBalances(1);
      const poolBeforeETH = await ethers.provider.getBalance(pool.address);

      await cover.connect(coverBuyer).buyCover(
        {
          ...editCoverFixture,
          productId: 1,
          owner: coverReceiver.address,
          maxPremiumInAsset: extraPremium,
          period: 0,
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount }],
        { value: extraPremium },
      );

      const { timestamp } = await ethers.provider.getBlock('latest');

      const rewards = calculateRewards(extraPremiumInNXM, timestamp, newPeriod.toNumber(), GLOBAL_REWARDS_RATIO);

      const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
      const poolAfterETH = await ethers.provider.getBalance(pool.address);

      expect(poolAfterETH).to.be.equal(poolBeforeETH.add(extraPremium));
      expect(stakingPoolAfter.rewards).to.be.equal(stakingPoolBeforeEdit.rewards.add(rewards));
    }
  });

  it('should edit cover to increase amount across 2 pools starting with 1', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, tc: tokenController, stakingProducts, p1: pool } = fixture.contracts;
    const {
      members: [coverBuyer, coverReceiver],
    } = fixture.accounts;
    const {
      config: { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO },
      ethRate,
    } = fixture;
    const { period, amount } = buyCoverFixture;

    const product = await stakingProducts.getProduct(1, 1);
    const { premiumInNxm, premiumInAsset: premium } = calculatePremium(
      amount,
      ethRate,
      period,
      product.bumpedPrice,
      NXM_PER_ALLOCATION_UNIT,
    );

    const stakingPoolBefore = await tokenController.stakingPoolNXMBalances(1);

    {
      const poolBeforeETH = await ethers.provider.getBalance(pool.address);
      await cover
        .connect(coverBuyer)
        .buyCover(
          { ...buyCoverFixture, productId: 1, owner: coverBuyer.address, maxPremiumInAsset: premium },
          [{ poolId: 1, coverAmountInAsset: amount }],
          { value: premium },
        );

      const { timestamp } = await ethers.provider.getBlock('latest');

      const rewards = calculateRewards(premiumInNxm, timestamp, period, GLOBAL_REWARDS_RATIO);

      const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
      const poolAfterETH = await ethers.provider.getBalance(pool.address);
      expect(stakingPoolAfter.rewards).to.be.equal(stakingPoolBefore.rewards.add(rewards));
      expect(poolAfterETH).to.be.equal(poolBeforeETH.add(premium));
    }

    {
      const coverId = 1;

      const increasedAmount = buyCoverFixture.amount.mul(2);

      let extraPremiumForPool1, premiumForPool2;
      let extraPremiumInNXMForPool1, premiumInNXMForPool2;
      let newPeriod;
      {
        const segments = await cover.coverSegments(coverId);
        const startOfPreviousSegment = segments[0].start;

        const { timestamp: timestampAtEditTime } = await ethers.provider.getBlock('latest');

        const {
          extraPremium,
          extraPremiumInNXM,
          newPeriod: newPeriodAfterEdit,
        } = await calculateEditPremium({
          amount,
          period,
          extraPeriod: BigNumber.from('0'),
          timestampAtEditTime,
          startOfPreviousSegment,
          increasedAmount,
          ethRate,
          productBumpedPrice: product.bumpedPrice,
          NXM_PER_ALLOCATION_UNIT,
        });

        newPeriod = newPeriodAfterEdit;

        extraPremiumForPool1 = extraPremium;
        extraPremiumInNXMForPool1 = extraPremiumInNXM;
      }

      {
        const product = await stakingProducts.getProduct(2, 1);
        const { premiumInNxm, premiumInAsset: premium } = calculatePremium(
          amount,
          ethRate,
          newPeriod,
          product.bumpedPrice,
          NXM_PER_ALLOCATION_UNIT,
        );

        premiumInNXMForPool2 = premiumInNxm;
        premiumForPool2 = premium;
      }

      const totalPremium = extraPremiumForPool1.add(premiumForPool2).add(1);
      const editCoverFixture = { ...buyCoverFixture, amount: increasedAmount, coverId, period: 0 };

      const stakingPool1Before = await tokenController.stakingPoolNXMBalances(1);
      const stakingPool2Before = await tokenController.stakingPoolNXMBalances(2);
      const poolBeforeETH = await ethers.provider.getBalance(pool.address);

      await cover.connect(coverBuyer).buyCover(
        { ...editCoverFixture, productId: 1, owner: coverReceiver.address, maxPremiumInAsset: totalPremium },
        [
          { poolId: 1, coverAmountInAsset: increasedAmount },
          { poolId: 2, coverAmountInAsset: amount },
        ],
        { value: totalPremium },
      );

      const { timestamp } = await ethers.provider.getBlock('latest');

      {
        const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
        const rewardsForPool1 = calculateRewards(
          extraPremiumInNXMForPool1,
          timestamp,
          newPeriod.toNumber(),
          GLOBAL_REWARDS_RATIO,
        );
        expect(stakingPoolAfter.rewards).to.be.equal(stakingPool1Before.rewards.add(rewardsForPool1));
      }

      {
        const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(2);
        const rewardsForPool2 = calculateRewards(
          premiumInNXMForPool2,
          timestamp,
          newPeriod.toNumber(),
          GLOBAL_REWARDS_RATIO,
        );
        expect(stakingPoolAfter.rewards).to.be.equal(stakingPool2Before.rewards.add(rewardsForPool2));
      }

      const poolAfterETH = await ethers.provider.getBalance(pool.address);
      expect(poolAfterETH).to.be.equal(poolBeforeETH.add(totalPremium));
    }
  });

  it('should edit cover to increase period', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, tc: tokenController, stakingProducts, p1: pool } = fixture.contracts;
    const {
      members: [coverBuyer, coverReceiver],
    } = fixture.accounts;
    const {
      config: { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO },
      ethRate,
    } = fixture;
    const { period, amount } = buyCoverFixture;

    const product = await stakingProducts.getProduct(1, 1);
    const { premiumInNxm, premiumInAsset: premium } = calculatePremium(
      amount,
      ethRate,
      period,
      product.bumpedPrice,
      NXM_PER_ALLOCATION_UNIT,
    );

    const stakingPoolBefore = await tokenController.stakingPoolNXMBalances(1);
    const poolBeforeETH = await ethers.provider.getBalance(pool.address);

    {
      await cover
        .connect(coverBuyer)
        .buyCover(
          { ...buyCoverFixture, productId: 1, owner: coverBuyer.address, maxPremiumInAsset: premium },
          [{ poolId: 1, coverAmountInAsset: amount }],
          { value: premium },
        );

      const { timestamp } = await ethers.provider.getBlock('latest');

      const rewards = calculateRewards(premiumInNxm, timestamp, period, GLOBAL_REWARDS_RATIO);

      const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
      const poolAfterETH = await ethers.provider.getBalance(pool.address);
      expect(stakingPoolAfter.rewards).to.be.equal(stakingPoolBefore.rewards.add(rewards));
      expect(poolAfterETH).to.be.equal(poolBeforeETH.add(premium));
    }

    {
      const coverId = 1;

      const amount = buyCoverFixture.amount;
      const segments = await cover.coverSegments(coverId);

      const startOfPreviousSegment = segments[0].start;
      // advance time by 15 days
      await increaseTime(daysToSeconds(15));

      const { timestamp: timestampAtEditTime } = await ethers.provider.getBlock('latest');

      const extraPeriod = daysToSeconds(20);

      const product = await stakingProducts.getProduct(1, 1);

      const { extraPremium, extraPremiumInNXM, newPeriod } = await calculateEditPremium({
        amount,
        period,
        extraPeriod,
        timestampAtEditTime,
        startOfPreviousSegment,
        increasedAmount: amount,
        ethRate,
        productBumpedPrice: product.bumpedPrice,
        NXM_PER_ALLOCATION_UNIT,
      });

      const editCoverFixture = { ...buyCoverFixture, amount, coverId };

      const poolBeforeETH = await ethers.provider.getBalance(pool.address);
      const stakingPoolBeforeEdit = await tokenController.stakingPoolNXMBalances(1);

      await cover.connect(coverBuyer).buyCover(
        {
          ...editCoverFixture,
          productId: 1,
          owner: coverReceiver.address,
          maxPremiumInAsset: extraPremium,
          period: extraPeriod,
        },
        [{ poolId: 1, coverAmountInAsset: amount }],
        { value: extraPremium },
      );

      const { timestamp } = await ethers.provider.getBlock('latest');

      const rewards = calculateRewards(extraPremiumInNXM, timestamp, newPeriod.toNumber(), GLOBAL_REWARDS_RATIO);

      const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
      const poolAfterETH = await ethers.provider.getBalance(pool.address);

      expect(poolAfterETH).to.be.equal(poolBeforeETH.add(extraPremium));
      expect(stakingPoolAfter.rewards).to.be.equal(stakingPoolBeforeEdit.rewards.add(rewards));
    }
  });

  it('should edit cover to increase period across 2 pools', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, tc: tokenController, stakingProducts, p1: pool } = fixture.contracts;
    const {
      members: [coverBuyer, coverReceiver],
    } = fixture.accounts;
    const {
      config: { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO },
      ethRate,
    } = fixture;

    const buyCoverFixtureFor2Pools = { ...buyCoverFixture, amount: buyCoverFixture.amount.mul(2) };

    const { period, amount } = buyCoverFixtureFor2Pools;

    const amountPerPool = amount.div(2);

    const poolAllocations = [
      { poolId: 1, coverAmountInAsset: amountPerPool },
      { poolId: 2, coverAmountInAsset: amountPerPool },
    ];

    const product1 = await stakingProducts.getProduct(1, 1);
    const { premiumInNxm: premiumInNxmForPool1, premiumInAsset: premiumForPool1 } = calculatePremium(
      amountPerPool,
      ethRate,
      period,
      product1.bumpedPrice,
      NXM_PER_ALLOCATION_UNIT,
    );

    const product2 = await stakingProducts.getProduct(2, 1);
    const { premiumInNxm: premiumInNxmForPool2, premiumInAsset: premiumForPool2 } = calculatePremium(
      amountPerPool,
      ethRate,
      period,
      product2.bumpedPrice,
      NXM_PER_ALLOCATION_UNIT,
    );

    const premium = premiumForPool1.add(premiumForPool2);

    const stakingPool1Before = await tokenController.stakingPoolNXMBalances(1);
    const stakingPool2Before = await tokenController.stakingPoolNXMBalances(2);

    {
      const poolBeforeETH = await ethers.provider.getBalance(pool.address);

      await cover
        .connect(coverBuyer)
        .buyCover(
          { ...buyCoverFixtureFor2Pools, productId: 1, owner: coverBuyer.address, maxPremiumInAsset: premium },
          poolAllocations,
          { value: premium },
        );

      const { timestamp } = await ethers.provider.getBlock('latest');

      {
        const rewards = calculateRewards(premiumInNxmForPool1, timestamp, period, GLOBAL_REWARDS_RATIO);

        const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
        const poolAfterETH = await ethers.provider.getBalance(pool.address);
        expect(stakingPoolAfter.rewards).to.be.equal(stakingPool1Before.rewards.add(rewards));
        expect(poolAfterETH).to.be.equal(poolBeforeETH.add(premium));
      }

      {
        const rewards = calculateRewards(premiumInNxmForPool2, timestamp, period, GLOBAL_REWARDS_RATIO);

        const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(2);
        const poolAfterETH = await ethers.provider.getBalance(pool.address);
        expect(stakingPoolAfter.rewards).to.be.equal(stakingPool2Before.rewards.add(rewards));
        expect(poolAfterETH).to.be.equal(poolBeforeETH.add(premium));
      }
    }

    {
      const coverId = 1;

      const amount = buyCoverFixture.amount;

      const segments = await cover.coverSegments(coverId);

      const startOfPreviousSegment = segments[0].start;

      // advance time by 15 days
      await increaseTime(daysToSeconds(15));

      const { timestamp: timestampAtEditTime } = await ethers.provider.getBlock('latest');

      const extraPeriod = daysToSeconds(20);

      const product1 = await stakingProducts.getProduct(1, 1);

      const { extraPremium: extraPremiumForPool1, extraPremiumInNXM: extraPremiumInNxmForPool2 } =
        await calculateEditPremium({
          amount,
          period,
          extraPeriod,
          timestampAtEditTime,
          startOfPreviousSegment,
          increasedAmount: amount,
          ethRate,
          productBumpedPrice: product1.bumpedPrice,
          NXM_PER_ALLOCATION_UNIT,
        });

      const product2 = await stakingProducts.getProduct(2, 1);

      const {
        extraPremium: extraPremiumForPool2,
        extraPremiumInNXM: extraPremiumInNxmForPool1,
        newPeriod,
      } = await calculateEditPremium({
        amount,
        period,
        extraPeriod,
        timestampAtEditTime,
        startOfPreviousSegment,
        increasedAmount: amount,
        ethRate,
        productBumpedPrice: product2.bumpedPrice,
        NXM_PER_ALLOCATION_UNIT,
      });

      const extraPremium = extraPremiumForPool1.add(extraPremiumForPool2).add(1);

      const editCoverFixture = { ...buyCoverFixtureFor2Pools, amount, coverId };

      const stakingPool1BeforeEdit = await tokenController.stakingPoolNXMBalances(1);
      const stakingPool2BeforeEdit = await tokenController.stakingPoolNXMBalances(2);

      const poolBeforeETH = await ethers.provider.getBalance(pool.address);

      await cover.connect(coverBuyer).buyCover(
        {
          ...editCoverFixture,
          productId: 1,
          owner: coverReceiver.address,
          maxPremiumInAsset: extraPremium,
          period: extraPeriod,
        },
        poolAllocations,
        { value: extraPremium },
      );

      const poolAfterETH = await ethers.provider.getBalance(pool.address);
      expect(poolAfterETH).to.be.equal(poolBeforeETH.add(extraPremium));

      const { timestamp } = await ethers.provider.getBlock('latest');

      {
        const rewards = calculateRewards(
          extraPremiumInNxmForPool1,
          timestamp,
          newPeriod.toNumber(),
          GLOBAL_REWARDS_RATIO,
        );
        const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
        expect(stakingPoolAfter.rewards).to.be.equal(stakingPool1BeforeEdit.rewards.add(rewards));
      }

      {
        const rewards = calculateRewards(
          extraPremiumInNxmForPool2,
          timestamp,
          newPeriod.toNumber(),
          GLOBAL_REWARDS_RATIO,
        );
        const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(2);
        expect(stakingPoolAfter.rewards).to.be.equal(stakingPool2BeforeEdit.rewards.add(rewards));
      }
    }
  });

  it('should edit cover to increase period by moving 1 allocation from 1 pool to another', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, tc: tokenController, stakingProducts, p1: pool, stakingPool1 } = fixture.contracts;
    const {
      members: [coverBuyer, coverReceiver],
    } = fixture.accounts;
    const {
      config: { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO },
      ethRate,
    } = fixture;
    const { period, amount } = buyCoverFixture;

    const product = await stakingProducts.getProduct(1, 1);
    const { premiumInNxm, premiumInAsset: premium } = calculatePremium(
      amount,
      ethRate,
      period,
      product.bumpedPrice,
      NXM_PER_ALLOCATION_UNIT,
    );

    const stakingPoolBefore = await tokenController.stakingPoolNXMBalances(1);
    const poolBeforeETH = await ethers.provider.getBalance(pool.address);

    {
      await cover
        .connect(coverBuyer)
        .buyCover(
          { ...buyCoverFixture, productId: 1, owner: coverBuyer.address, maxPremiumInAsset: premium },
          [{ poolId: 1, coverAmountInAsset: amount }],
          { value: premium },
        );

      const { timestamp } = await ethers.provider.getBlock('latest');

      const rewards = calculateRewards(premiumInNxm, timestamp, period, GLOBAL_REWARDS_RATIO);

      const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
      const poolAfterETH = await ethers.provider.getBalance(pool.address);
      expect(stakingPoolAfter.rewards).to.be.equal(stakingPoolBefore.rewards.add(rewards));
      expect(poolAfterETH).to.be.equal(poolBeforeETH.add(premium));
    }

    {
      const coverId = 1;

      const amount = buyCoverFixture.amount;
      const segments = await cover.coverSegments(coverId);

      const editPoolAllocations = [
        { poolId: 1, coverAmountInAsset: '0' },
        { poolId: 2, coverAmountInAsset: amount },
      ];

      const startOfPreviousSegment = segments[0].start;
      // advance time by 15 days
      await increaseTime(daysToSeconds(15));
      await mineNextBlock();

      const { timestamp: timestampAtEditTime } = await ethers.provider.getBlock('latest');

      const extraPeriod = daysToSeconds(20);

      const remainingPeriod = BigNumber.from(period).sub(
        BigNumber.from(timestampAtEditTime).add(1).sub(startOfPreviousSegment),
      );

      const newPeriod = remainingPeriod.add(extraPeriod);

      const product = await stakingProducts.getProduct(editPoolAllocations[1].poolId, 1);
      const { premiumInNxm, premiumInAsset: premium } = calculatePremium(
        amount,
        ethRate,
        newPeriod,
        product.bumpedPrice,
        NXM_PER_ALLOCATION_UNIT,
      );

      const editCoverFixture = { ...buyCoverFixture, amount, coverId, period: extraPeriod };

      const poolBeforeETH = await ethers.provider.getBalance(pool.address);
      const stakingPoolBeforeEdit = await tokenController.stakingPoolNXMBalances(editPoolAllocations[1].poolId);

      await cover.connect(coverBuyer).buyCover(
        {
          ...editCoverFixture,
          productId: 1,
          owner: coverReceiver.address,
          maxPremiumInAsset: premium,
        },
        editPoolAllocations,
        { value: premium },
      );

      const { timestamp } = await ethers.provider.getBlock('latest');

      const rewards = calculateRewards(premiumInNxm, timestamp, newPeriod.toNumber(), GLOBAL_REWARDS_RATIO);

      const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(editPoolAllocations[1].poolId);
      const poolAfterETH = await ethers.provider.getBalance(pool.address);

      expect(poolAfterETH).to.be.equal(poolBeforeETH.add(premium));
      expect(stakingPoolAfter.rewards).to.be.equal(stakingPoolBeforeEdit.rewards.add(rewards));

      const segmentId = 1;

      // first segment is gone since its amount is reduced to 0, only one allocation is left
      const allocationsCount = await cover.coverSegmentAllocationsCount(coverId, segmentId);
      expect(allocationsCount).to.be.equal(1);

      const firstSegmentAllocation = await cover.coverSegmentAllocations(coverId, segmentId, 0);
      expect(firstSegmentAllocation.poolId).to.be.equal(editPoolAllocations[1].poolId);
      expect(firstSegmentAllocation.allocationId).to.be.equal(1);

      // tranche allocations in the first pool are deleted
      const coverTrancheAllocation0 = await stakingPool1.coverTrancheAllocations(1);
      expect(coverTrancheAllocation0).to.be.equal(0);
    }
  });

  it('should edit cover to increase amount and period', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, tc: tokenController, stakingProducts, p1: pool } = fixture.contracts;
    const {
      members: [coverBuyer, coverReceiver],
    } = fixture.accounts;
    const {
      config: { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO },
      ethRate,
    } = fixture;

    const buyCoverParams = { ...buyCoverFixture, amount: parseEther('100') };
    const { period, amount } = buyCoverParams;

    const product = await stakingProducts.getProduct(1, 1);
    const { premiumInNxm, premiumInAsset: premium } = calculatePremium(
      amount,
      ethRate,
      period,
      product.bumpedPrice,
      NXM_PER_ALLOCATION_UNIT,
    );

    {
      const stakingPoolBefore = await tokenController.stakingPoolNXMBalances(1);

      const poolBeforeETH = await ethers.provider.getBalance(pool.address);

      await cover
        .connect(coverBuyer)
        .buyCover(
          { ...buyCoverParams, productId: 1, owner: coverBuyer.address, maxPremiumInAsset: premium },
          [{ poolId: 1, coverAmountInAsset: amount }],
          { value: premium },
        );

      const { timestamp } = await ethers.provider.getBlock('latest');

      const rewards = calculateRewards(premiumInNxm, timestamp, period, GLOBAL_REWARDS_RATIO);

      const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
      const poolAfterETH = await ethers.provider.getBalance(pool.address);
      expect(stakingPoolAfter.rewards).to.be.equal(stakingPoolBefore.rewards.add(rewards));
      expect(poolAfterETH).to.be.equal(poolBeforeETH.add(premium));
    }

    {
      const coverId = 1;

      const amount = buyCoverParams.amount;

      const increasedAmount = buyCoverParams.amount.add(parseEther('50'));

      const segments = await cover.coverSegments(coverId);

      const startOfPreviousSegment = segments[0].start;

      // advance time by 15 days
      await increaseTime(daysToSeconds(20));
      await mineNextBlock();

      const { timestamp: timestampAtEditTime } = await ethers.provider.getBlock('latest');

      const extraPeriod = daysToSeconds(20);

      const product = await stakingProducts.getProduct(1, 1);

      const { extraPremium, extraPremiumInNXM, newPeriod } = await calculateEditPremium({
        amount,
        period,
        extraPeriod,
        timestampAtEditTime,
        startOfPreviousSegment,
        increasedAmount,
        ethRate,
        productBumpedPrice: product.bumpedPrice,
        NXM_PER_ALLOCATION_UNIT,
      });

      const stakingPoolBefore = await tokenController.stakingPoolNXMBalances(1);

      const poolBeforeETH = await ethers.provider.getBalance(pool.address);

      const editCoverFixture = { ...buyCoverParams, amount: increasedAmount, coverId };

      await cover.connect(coverBuyer).buyCover(
        {
          ...editCoverFixture,
          productId: 1,
          owner: coverReceiver.address,
          maxPremiumInAsset: extraPremium,
          period: extraPeriod,
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount }],
        { value: extraPremium },
      );

      const { timestamp } = await ethers.provider.getBlock('latest');

      const rewards = calculateRewards(extraPremiumInNXM, timestamp, newPeriod.toNumber(), GLOBAL_REWARDS_RATIO);

      const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
      const poolAfterETH = await ethers.provider.getBalance(pool.address);

      expect(poolAfterETH).to.be.equal(poolBeforeETH.add(extraPremium));
      expect(stakingPoolAfter.rewards).to.be.equal(stakingPoolBefore.rewards.add(rewards));
    }
  });

  it('should edit cover to increase amount and period across 2 pools', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, tc: tokenController, stakingProducts, p1: pool } = fixture.contracts;
    const {
      members: [coverBuyer, coverReceiver],
    } = fixture.accounts;
    const {
      config: { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO },
      ethRate,
    } = fixture;

    const buyCoverFixtureFor2Pools = { ...buyCoverFixture, amount: buyCoverFixture.amount.mul(2) };

    const { period, amount } = buyCoverFixtureFor2Pools;

    const amountPerPool = amount.div(2);

    const poolAllocations = [
      { poolId: 1, coverAmountInAsset: amountPerPool },
      { poolId: 2, coverAmountInAsset: amountPerPool },
    ];

    const product1 = await stakingProducts.getProduct(1, 1);
    const { premiumInNxm: premiumInNxmForPool1, premiumInAsset: premiumForPool1 } = calculatePremium(
      amountPerPool,
      ethRate,
      period,
      product1.bumpedPrice,
      NXM_PER_ALLOCATION_UNIT,
    );

    const product2 = await stakingProducts.getProduct(2, 1);
    const { premiumInNxm: premiumInNxmForPool2, premiumInAsset: premiumForPool2 } = calculatePremium(
      amountPerPool,
      ethRate,
      period,
      product2.bumpedPrice,
      NXM_PER_ALLOCATION_UNIT,
    );

    const premium = premiumForPool1.add(premiumForPool2);

    const stakingPool1Before = await tokenController.stakingPoolNXMBalances(1);
    const stakingPool2Before = await tokenController.stakingPoolNXMBalances(2);
    const poolBeforeETH = await ethers.provider.getBalance(pool.address);

    {
      await cover
        .connect(coverBuyer)
        .buyCover(
          { ...buyCoverFixtureFor2Pools, productId: 1, owner: coverBuyer.address, maxPremiumInAsset: premium },
          poolAllocations,
          { value: premium },
        );

      const { timestamp } = await ethers.provider.getBlock('latest');

      {
        const rewards = calculateRewards(premiumInNxmForPool1, timestamp, period, GLOBAL_REWARDS_RATIO);

        const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
        const poolAfterETH = await ethers.provider.getBalance(pool.address);
        expect(stakingPoolAfter.rewards).to.be.equal(stakingPool1Before.rewards.add(rewards));
        expect(poolAfterETH).to.be.equal(poolBeforeETH.add(premium));
      }

      {
        const rewards = calculateRewards(premiumInNxmForPool2, timestamp, period, GLOBAL_REWARDS_RATIO);

        const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(2);
        const poolAfterETH = await ethers.provider.getBalance(pool.address);
        expect(stakingPoolAfter.rewards).to.be.equal(stakingPool2Before.rewards.add(rewards));
        expect(poolAfterETH).to.be.equal(poolBeforeETH.add(premium));
      }
    }

    {
      const coverId = 1;

      const increasedAmount = amountPerPool.mul(4);

      const editedPoolAllocations = [
        { poolId: 1, coverAmountInAsset: amountPerPool.div(2) },
        { poolId: 2, coverAmountInAsset: amountPerPool.mul(3).add(amountPerPool.div(2)) },
      ];

      const segments = await cover.coverSegments(coverId);

      const startOfPreviousSegment = segments[0].start;

      // advance time by 15 days
      await increaseTime(daysToSeconds(15));
      await mineNextBlock();

      const { timestamp: timestampAtEditTime } = await ethers.provider.getBlock('latest');

      const extraPeriod = daysToSeconds(20);

      const product1 = await stakingProducts.getProduct(1, 1);

      const { extraPremium: extraPremiumForPool1, extraPremiumInNXM: extraPremiumInNxmForPool1 } =
        await calculateEditPremium({
          amount: amountPerPool,
          period,
          extraPeriod,
          timestampAtEditTime,
          startOfPreviousSegment,
          increasedAmount: editedPoolAllocations[0].coverAmountInAsset,
          ethRate,
          productBumpedPrice: product1.bumpedPrice,
          NXM_PER_ALLOCATION_UNIT,
        });

      /* Pool 2 premium */
      const product2 = await stakingProducts.getProduct(2, 1);

      const {
        extraPremium: extraPremiumForPool2,
        extraPremiumInNXM: extraPremiumInNxmForPool2,
        newPeriod,
      } = await calculateEditPremium({
        amount: amountPerPool,
        period,
        extraPeriod,
        timestampAtEditTime,
        startOfPreviousSegment,
        increasedAmount: editedPoolAllocations[1].coverAmountInAsset,
        ethRate,
        productBumpedPrice: product2.bumpedPrice,
        NXM_PER_ALLOCATION_UNIT,
      });

      const editCoverFixture = { ...buyCoverFixtureFor2Pools, amount: increasedAmount, coverId };

      const stakingPool1BeforeEdit = await tokenController.stakingPoolNXMBalances(1);
      const stakingPool2BeforeEdit = await tokenController.stakingPoolNXMBalances(2);

      // TODO: figure out why off by 1 here
      const totalExtraPremium = extraPremiumForPool1.add(extraPremiumForPool2).add(2);

      const poolBeforeETH = await ethers.provider.getBalance(pool.address);

      await cover.connect(coverBuyer).buyCover(
        {
          ...editCoverFixture,
          productId: 1,
          owner: coverReceiver.address,
          maxPremiumInAsset: totalExtraPremium,
          period: extraPeriod,
        },
        editedPoolAllocations,
        { value: totalExtraPremium },
      );

      const { timestamp } = await ethers.provider.getBlock('latest');

      const poolAfterETH = await ethers.provider.getBalance(pool.address);
      expect(poolAfterETH).to.be.equal(poolBeforeETH.add(totalExtraPremium));

      {
        const rewards = calculateRewards(
          extraPremiumInNxmForPool1,
          timestamp,
          newPeriod.toNumber(),
          GLOBAL_REWARDS_RATIO,
        );
        const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
        expect(stakingPoolAfter.rewards).to.be.equal(stakingPool1BeforeEdit.rewards.add(rewards));
      }

      {
        const rewards = calculateRewards(
          extraPremiumInNxmForPool2,
          timestamp,
          newPeriod.toNumber(),
          GLOBAL_REWARDS_RATIO,
        );

        const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(2);
        expect(stakingPoolAfter.rewards).to.be.equal(stakingPool2BeforeEdit.rewards.add(rewards));
      }
    }
  });

  it('should edit cover to increase amount across 2 pools and 3 pools sequentially', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, tc: tokenController, stakingProducts, p1: pool } = fixture.contracts;
    const {
      members: [coverBuyer, coverReceiver],
    } = fixture.accounts;
    const {
      config: { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO },
      ethRate,
    } = fixture;
    const { period, amount } = buyCoverFixture;

    const product = await stakingProducts.getProduct(1, 1);
    const { premiumInNxm, premiumInAsset: premium } = calculatePremium(
      amount,
      ethRate,
      period,
      product.bumpedPrice,
      NXM_PER_ALLOCATION_UNIT,
    );

    const stakingPoolBefore = await tokenController.stakingPoolNXMBalances(1);
    const poolBeforeETH = await ethers.provider.getBalance(pool.address);

    {
      await cover
        .connect(coverBuyer)
        .buyCover(
          { ...buyCoverFixture, productId: 1, owner: coverBuyer.address, maxPremiumInAsset: premium },
          [{ poolId: 1, coverAmountInAsset: amount }],
          { value: premium },
        );

      const { timestamp } = await ethers.provider.getBlock('latest');

      const rewards = calculateRewards(premiumInNxm, timestamp, period, GLOBAL_REWARDS_RATIO);

      const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
      const poolAfterETH = await ethers.provider.getBalance(pool.address);
      expect(stakingPoolAfter.rewards).to.be.equal(stakingPoolBefore.rewards.add(rewards));
      expect(poolAfterETH).to.be.equal(poolBeforeETH.add(premium));
    }

    const coverId = 1;

    // first edit
    const firstEditPool1IncreasedAmount = buyCoverFixture.amount.mul(2);
    {
      const increasedAmount = firstEditPool1IncreasedAmount;

      let extraPremiumForPool1, premiumForPool2;
      let extraPremiumInNXMForPool1, premiumInNXMForPool2;
      let newPeriod;
      {
        const segments = await cover.coverSegments(coverId);

        const startOfPreviousSegment = segments[0].start;

        const { timestamp: timestampAtEditTime } = await ethers.provider.getBlock('latest');

        const {
          extraPremium,
          extraPremiumInNXM,
          newPeriod: newPeriodAfterEdit,
        } = await calculateEditPremium({
          amount,
          period,
          extraPeriod: BigNumber.from('0'),
          timestampAtEditTime,
          startOfPreviousSegment,
          increasedAmount,
          ethRate,
          productBumpedPrice: product.bumpedPrice,
          NXM_PER_ALLOCATION_UNIT,
        });
        extraPremiumForPool1 = extraPremium;
        extraPremiumInNXMForPool1 = extraPremiumInNXM;
        newPeriod = newPeriodAfterEdit;
      }

      {
        const product = await stakingProducts.getProduct(2, 1);
        const { premiumInNxm, premiumInAsset: premium } = calculatePremium(
          amount,
          ethRate,
          newPeriod,
          product.bumpedPrice,
          NXM_PER_ALLOCATION_UNIT,
        );

        premiumInNXMForPool2 = premiumInNxm;
        premiumForPool2 = premium;
      }

      const totalPremium = extraPremiumForPool1.add(premiumForPool2).add(1);
      const editCoverFixture = { ...buyCoverFixture, amount: increasedAmount, coverId };

      const stakingPool1Before = await tokenController.stakingPoolNXMBalances(1);
      const stakingPool2Before = await tokenController.stakingPoolNXMBalances(2);
      const poolBeforeETH = await ethers.provider.getBalance(pool.address);

      await cover.connect(coverBuyer).buyCover(
        { ...editCoverFixture, productId: 1, owner: coverReceiver.address, maxPremiumInAsset: totalPremium, period: 0 },
        [
          { poolId: 1, coverAmountInAsset: increasedAmount },
          { poolId: 2, coverAmountInAsset: amount },
        ],
        { value: totalPremium },
      );

      const { timestamp } = await ethers.provider.getBlock('latest');

      {
        const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
        const rewardsForPool1 = calculateRewards(extraPremiumInNXMForPool1, timestamp, period, GLOBAL_REWARDS_RATIO);
        expect(stakingPoolAfter.rewards).to.be.equal(stakingPool1Before.rewards.add(rewardsForPool1));
      }

      {
        const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(2);
        const rewardsForPool2 = calculateRewards(premiumInNXMForPool2, timestamp, period, GLOBAL_REWARDS_RATIO);
        expect(stakingPoolAfter.rewards).to.be.equal(stakingPool2Before.rewards.add(rewardsForPool2));
      }

      const poolAfterETH = await ethers.provider.getBalance(pool.address);
      expect(poolAfterETH).to.be.equal(poolBeforeETH.add(totalPremium));
    }

    // advance time by 1 day
    await increaseTime(daysToSeconds(1));
    await mineNextBlock();

    // second edit
    {
      const segmentId = 1;

      let totalCoverAmountInNXM = BigNumber.from(0);

      const coverSegmentAllocations = [];
      for (let i = 0; i < 2; i++) {
        const segmentAllocation = await cover.coverSegmentAllocations(coverId, segmentId, i);
        coverSegmentAllocations.push(segmentAllocation);
        totalCoverAmountInNXM = totalCoverAmountInNXM.add(segmentAllocation.coverAmountInNXM);
      }

      const coverSegments = await cover.coverSegments(coverId);

      const previousSegmentAmount = coverSegments[segmentId].amount;

      const increasedAmountForPool1 = buyCoverFixture.amount.mul(3);
      const increasedAmountForPool2 = buyCoverFixture.amount.mul(2);

      let extraPremiumForPool1, extraPremiumForPool2, premiumForPool3;
      let extraPremiumInNXMForPool1, extraPremiumInNXMForPool2, premiumInNXMForPool3;
      let remainingPeriod;

      const segments = await cover.coverSegments(coverId);
      const startOfPreviousSegment = segments[1].start;
      const { timestamp: timestampAtEditTime } = await ethers.provider.getBlock('latest');

      const period = segments[1].period;

      {
        const { extraPremium, extraPremiumInNXM, newPeriod } = await calculateEditPremium({
          amount: previousSegmentAmount,
          period,
          extraPeriod: BigNumber.from('0'),
          timestampAtEditTime,
          startOfPreviousSegment,
          increasedAmount: increasedAmountForPool1,
          ethRate,
          productBumpedPrice: product.bumpedPrice,
          NXM_PER_ALLOCATION_UNIT,
          coverAmountInNXM: coverSegmentAllocations[0].coverAmountInNXM,
          totalCoverAmountInNXM,
        });
        extraPremiumForPool1 = extraPremium;
        extraPremiumInNXMForPool1 = extraPremiumInNXM;

        // since only amount is added and extraPeriod = 0, remainingPeriod = newPeriod
        remainingPeriod = newPeriod;
      }

      {
        const { extraPremium, extraPremiumInNXM } = await calculateEditPremium({
          amount: previousSegmentAmount,
          period,
          extraPeriod: BigNumber.from('0'),
          timestampAtEditTime,
          startOfPreviousSegment,
          increasedAmount: increasedAmountForPool2,
          ethRate,
          productBumpedPrice: product.bumpedPrice,
          NXM_PER_ALLOCATION_UNIT,
          coverAmountInNXM: coverSegmentAllocations[1].coverAmountInNXM,
          totalCoverAmountInNXM,
        });
        extraPremiumForPool2 = extraPremium;
        extraPremiumInNXMForPool2 = extraPremiumInNXM;
      }

      {
        const product = await stakingProducts.getProduct(3, 1);
        const { premiumInNxm, premiumInAsset: premium } = calculatePremium(
          amount,
          ethRate,
          remainingPeriod,
          product.bumpedPrice,
          NXM_PER_ALLOCATION_UNIT,
        );

        premiumInNXMForPool3 = premiumInNxm;
        premiumForPool3 = premium;
      }

      const totalAmount = increasedAmountForPool1.add(increasedAmountForPool2).add(amount);

      // TODO: figure out why there's an off by 1 precision error here
      const totalPremium = extraPremiumForPool1.add(extraPremiumForPool2).add(premiumForPool3).add(1);
      const editCoverFixture = { ...buyCoverFixture, amount: totalAmount, coverId };

      const stakingPool1Before = await tokenController.stakingPoolNXMBalances(1);
      const stakingPool2Before = await tokenController.stakingPoolNXMBalances(2);
      const stakingPool3Before = await tokenController.stakingPoolNXMBalances(3);
      const poolBeforeETH = await ethers.provider.getBalance(pool.address);

      await cover.connect(coverBuyer).buyCover(
        { ...editCoverFixture, productId: 1, owner: coverReceiver.address, maxPremiumInAsset: totalPremium, period: 0 },
        [
          { poolId: 1, coverAmountInAsset: increasedAmountForPool1 },
          { poolId: 2, coverAmountInAsset: increasedAmountForPool2 },
          { poolId: 3, coverAmountInAsset: amount },
        ],
        { value: totalPremium },
      );

      const { timestamp } = await ethers.provider.getBlock('latest');

      {
        const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
        const rewardsForPool1 = calculateRewards(extraPremiumInNXMForPool1, timestamp, period, GLOBAL_REWARDS_RATIO);
        expect(stakingPoolAfter.rewards).to.be.equal(stakingPool1Before.rewards.add(rewardsForPool1));
      }

      {
        const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(2);
        const rewardsForPool2 = calculateRewards(extraPremiumInNXMForPool2, timestamp, period, GLOBAL_REWARDS_RATIO);
        expect(stakingPoolAfter.rewards).to.be.equal(stakingPool2Before.rewards.add(rewardsForPool2));
      }

      {
        const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(3);
        const rewardsForPool3 = calculateRewards(premiumInNXMForPool3, timestamp, period, GLOBAL_REWARDS_RATIO);
        expect(stakingPoolAfter.rewards).to.be.equal(stakingPool3Before.rewards.add(rewardsForPool3));
      }

      const poolAfterETH = await ethers.provider.getBalance(pool.address);
      expect(poolAfterETH).to.be.equal(poolBeforeETH.add(totalPremium));
    }
  });
});

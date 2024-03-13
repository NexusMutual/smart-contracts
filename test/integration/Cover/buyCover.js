const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { BigNumber } = require('ethers');

const setup = require('../setup');
const { calculateFirstTrancheId } = require('../utils/staking');
const { setNextBlockTime } = require('../utils').evm;
const { daysToSeconds } = require('../../../lib/helpers');
const { BUCKET_DURATION } = require('../../unit/StakingPool/helpers');
const { getInternalPrice } = require('../../utils/rammCalculations');

const { parseEther } = ethers.utils;
const { AddressZero, MaxUint256 } = ethers.constants;

const PRICE_DENOMINATOR = 10000;
const REWARD_DENOMINATOR = 10000;
const PRICE_CHANGE_PER_DAY = 200;

function calculatePremium(amount, rate, period, price, allocationUnit) {
  const nxmAmount = amount.mul(parseEther('1')).div(rate);

  const coverNXMAmount = nxmAmount.mod(allocationUnit).eq(0)
    ? nxmAmount
    : nxmAmount.div(allocationUnit).add(1).mul(allocationUnit);

  const premiumInNxm = coverNXMAmount.mul(price).div(PRICE_DENOMINATOR).mul(period).div(daysToSeconds(365));

  const premiumInAsset = premiumInNxm.mul(rate).div(parseEther('1'));

  return { premiumInNxm, premiumInAsset, coverNXMAmount };
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

  const stakeAmount = parseEther('900000');
  const ethRate = await pool.getInternalTokenPriceInAsset(0);
  const daiRate = await pool.getInternalTokenPriceInAsset(1);

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
  const firstActiveTrancheId = calculateFirstTrancheId(
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
  it.skip('allows to buy against multiple staking pools', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, tc: tokenController, stakingProducts, ra: ramm, p1: pool, mcr } = fixture.contracts;
    const {
      members: [coverBuyer, coverReceiver],
    } = fixture.accounts;
    const { GLOBAL_REWARDS_RATIO, NXM_PER_ALLOCATION_UNIT } = fixture.config;
    const { productId, period, amount } = buyCoverFixture;

    const product = await stakingProducts.getProduct(1, productId);

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = currentTimestamp + 10;
    const ethRate = await getInternalPrice(ramm, pool, tokenController, mcr, nextBlockTimestamp);

    const {
      premiumInNxm,
      premiumInAsset: premium,
      coverNXMAmount,
    } = calculatePremium(amount, ethRate, period, product.bumpedPrice, NXM_PER_ALLOCATION_UNIT);
    const rewards = calculateRewards(premiumInNxm.div(3), nextBlockTimestamp, period, GLOBAL_REWARDS_RATIO);
    const coverAmountAllocationPerPool = amount.div(3);

    const stakingPool1Before = await tokenController.stakingPoolNXMBalances(1);
    const stakingPool2Before = await tokenController.stakingPoolNXMBalances(2);
    const stakingPool3Before = await tokenController.stakingPoolNXMBalances(3);

    await setNextBlockTime(nextBlockTimestamp);
    await cover.connect(coverBuyer).buyCover(
      { ...buyCoverFixture, owner: coverReceiver.address, maxPremiumInAsset: premium },
      [
        { poolId: 1, coverAmountInAsset: coverAmountAllocationPerPool },
        { poolId: 2, coverAmountInAsset: coverAmountAllocationPerPool },
        { poolId: 3, coverAmountInAsset: coverAmountAllocationPerPool },
      ],
      { value: premium },
    );

    const stakingPool1After = await tokenController.stakingPoolNXMBalances(1);
    const stakingPool2After = await tokenController.stakingPoolNXMBalances(2);
    const stakingPool3After = await tokenController.stakingPoolNXMBalances(3);

    // validate that rewards increased
    expect(stakingPool1After.rewards).to.be.equal(stakingPool1Before.rewards.add(rewards));
    expect(stakingPool2After.rewards).to.be.equal(stakingPool2Before.rewards.add(rewards));
    expect(stakingPool3After.rewards).to.be.equal(stakingPool3Before.rewards.add(rewards));

    const coverId = await cover.coverDataCount();
    const segments = await cover.coverSegments(coverId);

    for (let i = 0; i < 3; i++) {
      const segmentAllocation = await cover.coverSegmentAllocations(coverId, segments.length - 1, i);
      expect(segmentAllocation.poolId).to.be.equal(i + 1);
      expect(segmentAllocation.coverAmountInNXM).to.be.equal(coverNXMAmount.div(3));
      expect(segmentAllocation.premiumInNXM).to.be.equal(premiumInNxm.div(3));
    }
  });

  it('should purchase new cover with bumped price price after initialization', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, tc: tokenController, stakingProducts, p1: pool, ra: ramm, mcr } = fixture.contracts;
    const {
      members: [coverBuyer, coverReceiver],
    } = fixture.accounts;
    const {
      config: { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO },
    } = fixture;
    const { period, amount } = buyCoverFixture;

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = currentTimestamp + 1;
    const ethRate = await getInternalPrice(ramm, pool, tokenController, mcr, nextBlockTimestamp);

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

    await setNextBlockTime(nextBlockTimestamp);

    await cover
      .connect(coverBuyer)
      .buyCover(
        { ...buyCoverFixture, productId: 1, owner: coverReceiver.address, maxPremiumInAsset: premium },
        [{ poolId: 1, coverAmountInAsset: amount }],
        { value: premium },
      );

    const rewards = calculateRewards(premiumInNxm, nextBlockTimestamp, period, GLOBAL_REWARDS_RATIO);

    const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
    const poolAfterETH = await ethers.provider.getBalance(pool.address);
    expect(stakingPoolAfter.rewards).to.be.equal(stakingPoolBefore.rewards.add(rewards));
    expect(poolAfterETH).to.be.equal(poolBeforeETH.add(premium));
  });

  it('should purchase new cover with calculated price after the drop', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { cover, tc: tokenController, stakingProducts, p1: pool, mcr, ra: ramm } = fixture.contracts;
    const {
      members: [coverBuyer, coverReceiver],
    } = fixture.accounts;
    const {
      config: { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO },
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

    const nextTimestamp = bumpedPriceUpdateTime.add(daysToSeconds(daysElapsed)).toNumber();
    const ethRate = await getInternalPrice(ramm, pool, tokenController, mcr, nextTimestamp);

    const { premiumInNxm, premiumInAsset: premium } = calculatePremium(
      amount,
      ethRate,
      period,
      price,
      NXM_PER_ALLOCATION_UNIT,
    );

    await setNextBlockTime(nextTimestamp);

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
    const { cover, tc: tokenController, stakingProducts, p1: pool, ra: ramm, mcr } = fixture.contracts;
    const {
      members: [coverBuyer, coverReceiver],
    } = fixture.accounts;
    const {
      config: { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO },
      productList,
    } = fixture;
    const { period, amount } = buyCoverFixture;

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = currentTimestamp + 1;
    const ethRate = await getInternalPrice(ramm, pool, tokenController, mcr, nextBlockTimestamp);

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

    await setNextBlockTime(nextBlockTimestamp);

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
});

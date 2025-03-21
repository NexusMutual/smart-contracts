const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { BigNumber } = require('ethers');

const setup = require('../setup');
const { calculateFirstTrancheId } = require('../utils/staking');
const { calculatePremium } = require('../utils/cover');
const { setNextBlockTime } = require('../utils').evm;
const { daysToSeconds } = require('../../../lib/helpers');
const { BUCKET_DURATION } = require('../../unit/StakingPool/helpers');
const { getInternalPrice } = require('../../utils/rammCalculations');
const { max } = require('../../utils/bnMath');

const { parseEther } = ethers.utils;
const { AddressZero, MaxUint256, Zero } = ethers.constants;

const REWARD_DENOMINATOR = 10000;
const PRICE_CHANGE_PER_DAY = 200;

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
  it('allows to buy against multiple staking pools', async function () {
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
    const nxmPrice = await getInternalPrice(ramm, pool, tokenController, mcr, nextBlockTimestamp);

    const coverAmountAllocationsPerPool = [
      amount.div(3), // a third
      amount.div(3), // second third
      amount.sub(amount.div(3).mul(2)), // whatever's left
    ];

    const premiums = coverAmountAllocationsPerPool.map(amount =>
      calculatePremium(amount, nxmPrice, period, product.bumpedPrice, NXM_PER_ALLOCATION_UNIT),
    );

    const premiumInNxm = premiums.reduce((total, premium) => total.add(premium.premiumInNxm), Zero);
    const premiumInAsset = premiumInNxm.mul(nxmPrice).div(parseEther('1'));

    const rewards = premiums.map(premium =>
      calculateRewards(premium.premiumInNxm, nextBlockTimestamp, period, GLOBAL_REWARDS_RATIO),
    );

    const stakingPool1Before = await tokenController.stakingPoolNXMBalances(1);
    const stakingPool2Before = await tokenController.stakingPoolNXMBalances(2);
    const stakingPool3Before = await tokenController.stakingPoolNXMBalances(3);

    await setNextBlockTime(nextBlockTimestamp);
    await cover.connect(coverBuyer).buyCover(
      { ...buyCoverFixture, owner: coverReceiver.address, maxPremiumInAsset: premiumInAsset },
      [
        { poolId: 1, coverAmountInAsset: coverAmountAllocationsPerPool[0] },
        { poolId: 2, coverAmountInAsset: coverAmountAllocationsPerPool[1] },
        { poolId: 3, coverAmountInAsset: coverAmountAllocationsPerPool[2] },
      ],
      { value: premiumInAsset },
    );

    const stakingPool1After = await tokenController.stakingPoolNXMBalances(1);
    const stakingPool2After = await tokenController.stakingPoolNXMBalances(2);
    const stakingPool3After = await tokenController.stakingPoolNXMBalances(3);

    // validate that rewards increased
    expect(stakingPool1After.rewards).to.be.equal(stakingPool1Before.rewards.add(rewards[0]));
    expect(stakingPool2After.rewards).to.be.equal(stakingPool2Before.rewards.add(rewards[1]));
    expect(stakingPool3After.rewards).to.be.equal(stakingPool3Before.rewards.add(rewards[2]));

    const coverId = await cover.getCoverDataCount();
    const poolAllocations = await cover.getPoolAllocations(coverId);

    for (let i = 0; i < 3; i++) {
      expect(poolAllocations[i].poolId).to.be.equal(i + 1);
      expect(poolAllocations[i].coverAmountInNXM).to.be.equal(premiums[i].coverNXMAmount);
      expect(poolAllocations[i].premiumInNXM).to.be.equal(premiums[i].premiumInNxm);
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

    const price = max(bumpedPrice.sub(BigNumber.from(daysElapsed).mul(PRICE_CHANGE_PER_DAY)), targetPrice);

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
    ).to.revertedWithCustomError(cover, 'ProductDeprecated');
  });
});

describe('CoverBroker - buyCover', function () {
  it('should revert with InvalidOwnerAddress if params.owner is zero address', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { coverBroker } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.nonMembers;

    const buyCoverParams = { ...buyCoverFixture, paymentAsset: 1, owner: AddressZero };
    const buyCover = coverBroker
      .connect(coverBuyer)
      .buyCover(buyCoverParams, [{ poolId: 1, coverAmountInAsset: parseEther('1') }], { value: parseEther('1') });

    await expect(buyCover).to.revertedWithCustomError(coverBroker, 'InvalidOwnerAddress');
  });

  it('should revert with InvalidOwnerAddress if params.owner is CoverBroker address', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { coverBroker } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.nonMembers;

    const buyCoverParams = { ...buyCoverFixture, paymentAsset: 1, owner: coverBroker.address };
    const buyCover = coverBroker
      .connect(coverBuyer)
      .buyCover(buyCoverParams, [{ poolId: 1, coverAmountInAsset: parseEther('1') }], { value: parseEther('1') });

    await expect(buyCover).to.revertedWithCustomError(coverBroker, 'InvalidOwnerAddress');
  });

  it('should revert with InvalidPaymentAsset if paymentAsset is NXM asset ID (255)', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { coverBroker } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.nonMembers;

    const buyCoverParams = { ...buyCoverFixture, paymentAsset: 255, owner: coverBuyer.address }; // NXM (invalid)
    const buyCover = coverBroker
      .connect(coverBuyer)
      .buyCover(buyCoverParams, [{ poolId: 1, coverAmountInAsset: parseEther('1') }], { value: parseEther('1') });

    await expect(buyCover).to.revertedWithCustomError(coverBroker, 'InvalidPaymentAsset');
  });

  it('should revert with InvalidPayment if paymentAsset is not ETH and msg.value > 0', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { coverBroker } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.nonMembers;

    const buyCoverParams = { ...buyCoverFixture, paymentAsset: 2, owner: coverBuyer.address }; // DAI
    const buyCover = coverBroker
      .connect(coverBuyer)
      .buyCover(buyCoverParams, [{ poolId: 1, coverAmountInAsset: parseEther('1') }], { value: parseEther('1') });

    await expect(buyCover).to.revertedWithCustomError(coverBroker, 'InvalidPayment');
  });

  it('should enable non-members to buy cover through the broker with ETH', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { tc: tokenController, stakingProducts, p1: pool, ra: ramm, mcr, coverBroker, coverNFT } = fixture.contracts;
    const {
      nonMembers: [coverBuyer],
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

    const amountOver = parseEther('1');
    const balanceBefore = await ethers.provider.getBalance(coverBuyer.address);
    const nftBalanceBefore = await coverNFT.balanceOf(coverBuyer.address);
    await setNextBlockTime(nextBlockTimestamp);

    const tx = await coverBroker.connect(coverBuyer).buyCover(
      {
        ...buyCoverFixture,
        paymentAsset: 0, // ETH
        productId,
        owner: coverBuyer.address,
        maxPremiumInAsset: premium,
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      { value: premium.add(amountOver) },
    );

    const receipt = await tx.wait();

    const { timestamp } = await ethers.provider.getBlock('latest');
    const balanceAfter = await ethers.provider.getBalance(coverBuyer.address);
    const nftBalanceAfter = await coverNFT.balanceOf(coverBuyer.address);

    expect(nftBalanceAfter).to.be.equal(nftBalanceBefore.add(1));
    // amountOver should have been refunded
    expect(balanceAfter).to.be.equal(balanceBefore.sub(premium).sub(receipt.effectiveGasPrice.mul(receipt.gasUsed)));
    const rewards = calculateRewards(premiumInNxm, timestamp, period, GLOBAL_REWARDS_RATIO);

    const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
    const poolAfterETH = await ethers.provider.getBalance(pool.address);
    expect(stakingPoolAfter.rewards).to.be.equal(stakingPoolBefore.rewards.add(rewards));
    expect(poolAfterETH).to.be.equal(poolBeforeETH.add(premium));
  });

  it('should enable non-members to buy cover through the broker with DAI', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const {
      tc: tokenController,
      stakingProducts,
      p1: pool,
      ra: ramm,
      mcr,
      coverBroker,
      dai,
      priceFeedOracle,
      coverNFT,
    } = fixture.contracts;
    const {
      nonMembers: [coverBuyer],
    } = fixture.accounts;
    const {
      config: { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO },
      productList,
    } = fixture;
    const { period, amount } = buyCoverFixture;

    await dai.mint(coverBuyer.address, parseEther('1000'));
    await dai.connect(coverBuyer).approve(coverBroker.address, parseEther('1000'));
    await coverBroker.maxApproveCoverContract(dai.address);

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = currentTimestamp + 1;
    const ethRate = await getInternalPrice(ramm, pool, tokenController, mcr, nextBlockTimestamp);
    const daiRate = await priceFeedOracle.getAssetForEth(dai.address, parseEther('1'));
    const nxmDaiRate = ethRate.mul(daiRate).div(parseEther('1'));

    const { targetPrice } = stakedProductParamTemplate;

    const productId = productList.findIndex(
      ({ product: { initialPriceRatio, useFixedPrice } }) => targetPrice !== initialPriceRatio && useFixedPrice,
    );

    const product = await stakingProducts.getProduct(1, productId);
    const { premiumInNxm, premiumInAsset: premium } = calculatePremium(
      amount,
      nxmDaiRate,
      period,
      product.targetPrice,
      NXM_PER_ALLOCATION_UNIT,
    );

    const stakingPoolBefore = await tokenController.stakingPoolNXMBalances(1);
    const poolBeforeETH = await ethers.provider.getBalance(pool.address);

    const amountOver = parseEther('1');
    const balanceBefore = await dai.balanceOf(coverBuyer.address);
    const nftBalanceBefore = await coverNFT.balanceOf(coverBuyer.address);
    await setNextBlockTime(nextBlockTimestamp);

    await coverBroker.connect(coverBuyer).buyCover(
      {
        ...buyCoverFixture,
        productId,
        owner: coverBuyer.address,
        maxPremiumInAsset: premium.add(amountOver),
        coverAsset: 1,
        paymentAsset: 1, // DAI
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      { value: '0' },
    );

    const { timestamp } = await ethers.provider.getBlock('latest');
    const balanceAfter = await dai.balanceOf(coverBuyer.address);
    const nftBalanceAfter = await coverNFT.balanceOf(coverBuyer.address);

    // amountOver should have been refunded
    expect(balanceAfter).to.be.equal(balanceBefore.sub(premium));
    expect(nftBalanceAfter).to.be.equal(nftBalanceBefore.add(1));
    const rewards = calculateRewards(premiumInNxm, timestamp, period, GLOBAL_REWARDS_RATIO);

    const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
    const poolAfterETH = await ethers.provider.getBalance(pool.address);
    const premiumInEth = premium.mul(parseEther('1').div(daiRate));
    expect(stakingPoolAfter.rewards).to.be.equal(stakingPoolBefore.rewards.add(rewards));
    expect(poolAfterETH).to.be.equal(poolBeforeETH.add(premiumInEth));
  });
});

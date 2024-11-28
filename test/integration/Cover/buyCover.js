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
const { setNextBlockBaseFee } = require('../../utils/evm');

const { parseEther } = ethers.utils;
const { AddressZero, MaxUint256 } = ethers.constants;

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

async function signCoverOrder(contractAddress, params, signer) {
  const { chainId } = await ethers.provider.getNetwork();

  const domain = {
    name: 'NexusMutualCoverOrder',
    version: '1',
    chainId, // Replace with the actual chain ID
    verifyingContract: contractAddress,
  };

  const types = {
    ExecuteOrder: [
      { name: 'productId', type: 'uint24' },
      { name: 'amount', type: 'uint96' },
      { name: 'period', type: 'uint32' },
      { name: 'paymentAsset', type: 'uint8' },
      { name: 'coverAsset', type: 'uint8' },
      { name: 'owner', type: 'address' },
      { name: 'limitOrderId', type: 'uint256' },
    ],
  };

  return signer._signTypedData(domain, types, params);
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

describe('CoverOrder - buyCover', function () {
  it('should purchase new cover for a order creator with DAI', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const {
      tc: tokenController,
      stakingProducts,
      p1: pool,
      ra: ramm,
      mcr,
      coverOrder,
      dai,
      priceFeedOracle,
      coverNFT,
    } = fixture.contracts;
    const {
      nonMembers: [coverBuyer],
      members: [coverOrderSettler],
    } = fixture.accounts;
    const {
      config: { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO },
      productList,
    } = fixture;
    const { period, amount } = buyCoverFixture;

    await dai.mint(coverBuyer.address, parseEther('1000'));
    await dai.connect(coverBuyer).approve(coverOrder.address, parseEther('1000'));
    await coverOrder.maxApproveCoverContract(dai.address);

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

    const limitOrderId = 1;
    const signature = await signCoverOrder(
      coverOrder.address,
      {
        productId,
        amount,
        period,
        limitOrderId,
        paymentAsset: 1,
        coverAsset: 1,
        owner: coverBuyer.address,
      },
      coverBuyer,
    );

    await coverOrder.connect(coverOrderSettler).executeOrder(
      {
        ...buyCoverFixture,
        productId,
        owner: coverBuyer.address,
        maxPremiumInAsset: premium.add(amountOver),
        coverAsset: 1,
        paymentAsset: 1,
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      limitOrderId,
      signature,
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

  it('should purchase new cover for a order creator with WETH', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const {
      tc: tokenController,
      stakingProducts,
      p1: pool,
      ra: ramm,
      mcr,
      coverOrder,
      weth,
      coverNFT,
    } = fixture.contracts;
    const {
      nonMembers: [coverBuyer],
      members: [orderSettler],
    } = fixture.accounts;
    const {
      config: { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO },
      productList,
    } = fixture;
    const { period, amount } = buyCoverFixture;

    await weth.connect(coverBuyer).deposit({ value: parseEther('100') });
    await weth.connect(coverBuyer).approve(coverOrder.address, parseEther('100'));

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

    const balanceBeforeWETH = await weth.balanceOf(coverBuyer.address);
    const nftBalanceBefore = await coverNFT.balanceOf(coverBuyer.address);

    const limitOrderId = 1;
    const signature = await signCoverOrder(
      coverOrder.address,
      {
        productId,
        amount,
        period,
        limitOrderId,
        paymentAsset: 0,
        coverAsset: 0,
        owner: coverBuyer.address,
      },
      coverBuyer,
    );

    await setNextBlockTime(nextBlockTimestamp);
    await setNextBlockBaseFee(0);

    await coverOrder.connect(orderSettler).executeOrder(
      {
        ...buyCoverFixture,
        paymentAsset: 0, // ETH
        productId,
        owner: coverBuyer.address,
        maxPremiumInAsset: premium,
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      limitOrderId,
      signature,
    );

    const { timestamp } = await ethers.provider.getBlock('latest');
    const balanceAfterWETH = await weth.balanceOf(coverBuyer.address);
    const nftBalanceAfter = await coverNFT.balanceOf(coverBuyer.address);

    expect(nftBalanceAfter).to.be.equal(nftBalanceBefore.add(1));
    // amountOver should have been refunded
    expect(balanceAfterWETH).to.be.equal(balanceBeforeWETH.sub(premium));
    const rewards = calculateRewards(premiumInNxm, timestamp, period, GLOBAL_REWARDS_RATIO);

    const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
    const poolAfterETH = await ethers.provider.getBalance(pool.address);
    expect(stakingPoolAfter.rewards).to.be.equal(stakingPoolBefore.rewards.add(rewards));
    expect(poolAfterETH).to.be.equal(poolBeforeETH.add(premium));
  });

  it("should revert if the solver isn't a member", async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { coverOrder } = fixture.contracts;
    const {
      nonMembers: [coverBuyer],
    } = fixture.accounts;

    const buyCoverParams = { ...buyCoverFixture, paymentAsset: 1, owner: coverBuyer.address };
    const buyCover = coverOrder
      .connect(coverBuyer)
      .executeOrder(buyCoverParams, [{ poolId: 1, coverAmountInAsset: parseEther('1') }], 1, '0x');

    await expect(buyCover).to.revertedWithCustomError(coverOrder, 'NotAMember');
  });

  it('should revert with InvalidOwnerAddress if params.owner is zero address', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { coverOrder } = fixture.contracts;
    const [coverSettler] = fixture.accounts.members;

    const buyCoverParams = { ...buyCoverFixture, paymentAsset: 1, owner: AddressZero };
    const buyCover = coverOrder
      .connect(coverSettler)
      .executeOrder(buyCoverParams, [{ poolId: 1, coverAmountInAsset: parseEther('1') }], 1, '0x');

    await expect(buyCover).to.revertedWithCustomError(coverOrder, 'InvalidOwnerAddress');
  });

  it('should revert if the order is already executed', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const {
      tc: tokenController,
      stakingProducts,
      p1: pool,
      ra: ramm,
      mcr,
      coverOrder,
      dai,
      priceFeedOracle,
    } = fixture.contracts;
    const {
      nonMembers: [coverBuyer],
      members: [coverOrderSettler],
    } = fixture.accounts;
    const {
      config: { NXM_PER_ALLOCATION_UNIT },
      productList,
    } = fixture;
    const { period, amount } = buyCoverFixture;

    await dai.mint(coverBuyer.address, parseEther('1000'));
    await dai.connect(coverBuyer).approve(coverOrder.address, parseEther('1000'));
    await coverOrder.maxApproveCoverContract(dai.address);

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
    const { premiumInAsset: premium } = calculatePremium(
      amount,
      nxmDaiRate,
      period,
      product.targetPrice,
      NXM_PER_ALLOCATION_UNIT,
    );

    const amountOver = parseEther('1');
    await setNextBlockTime(nextBlockTimestamp);

    const limitOrderId = 1;
    const signature = await signCoverOrder(
      coverOrder.address,
      {
        productId,
        amount,
        period,
        limitOrderId,
        paymentAsset: 1,
        coverAsset: 1,
        owner: coverBuyer.address,
      },
      coverBuyer,
    );

    await coverOrder.connect(coverOrderSettler).executeOrder(
      {
        ...buyCoverFixture,
        productId,
        owner: coverBuyer.address,
        maxPremiumInAsset: premium.add(amountOver),
        coverAsset: 1,
        paymentAsset: 1,
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      limitOrderId,
      signature,
    );

    const buyCover = coverOrder.connect(coverOrderSettler).executeOrder(
      {
        ...buyCoverFixture,
        productId,
        owner: coverBuyer.address,
        maxPremiumInAsset: premium.add(amountOver),
        coverAsset: 1,
        paymentAsset: 1,
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      limitOrderId,
      signature,
    );

    await expect(buyCover).to.revertedWithCustomError(coverOrder, 'OrderAlreadyExecuted');
  });

  it("should revert if the signature doesn't match the owner", async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { coverOrder } = fixture.contracts;
    const [coverSettler, coverBuyer, orderSigner] = fixture.accounts.members;

    const buyCoverParams = { ...buyCoverFixture, paymentAsset: 6, owner: coverSettler.address };
    const limitOrderId = 1;
    const orderHash = ethers.utils.solidityKeccak256(
      ['uint24', 'uint96', 'uint32', 'uint8', 'uint8', 'address', 'uint256'],
      [buyCoverParams.productId, buyCoverParams.amount, buyCoverParams.period, 6, 6, coverBuyer.address, limitOrderId],
    );

    const ethSignedOrderHash = ethers.utils.hashMessage(orderHash);
    const signature = await orderSigner.signMessage(ethers.utils.arrayify(ethSignedOrderHash));

    const buyCover = coverOrder
      .connect(coverSettler)
      .executeOrder(buyCoverParams, [{ poolId: 1, coverAmountInAsset: parseEther('1') }], 1, signature);

    await expect(buyCover).to.revertedWithCustomError(coverOrder, 'InvalidSignature');
  });
});

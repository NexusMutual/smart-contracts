const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');
const { calculateFirstTrancheId } = require('../utils/staking');
const { calculatePremium } = require('../utils/cover');
const { setNextBlockTime } = require('../utils').evm;
const { BUCKET_DURATION } = require('../../unit/StakingPool/helpers');
const { getInternalPrice } = require('../../utils/rammCalculations');
const { setNextBlockBaseFee } = require('../../utils/evm');
const { signLimitOrder } = require('../../utils/buyCover');

const { parseEther } = ethers.utils;
const { AddressZero, MaxUint256 } = ethers.constants;

const REWARD_DENOMINATOR = 10000;

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

const orderDetailsFixture = {
  coverId: 0,
  productId: stakedProductParamTemplate.productId,
  amount: parseEther('1'),
  period: 30 * 24 * 60 * 60,
  paymentAsset: 0,
  coverAsset: 0,
  owner: AddressZero,
  ipfsData: 'ipfs data',
  commissionRatio: 0,
  commissionDestination: AddressZero,
};

const executionDetailsFixture = {
  renewableUntil: 0,
  renewablePeriodBeforeExpiration: 3 * 24 * 60 * 60,
  maxPremiumInAsset: MaxUint256,
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
    orderDetailsFixture.period,
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

describe('LimitOrders - executeOrder', function () {
  it('should purchase new cover for a order creator with DAI', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const {
      tc: tokenController,
      stakingProducts,
      p1: pool,
      ra: ramm,
      mcr,
      limitOrders,
      dai,
      priceFeedOracle,
      coverNFT,
    } = fixture.contracts;
    const {
      nonMembers: [coverBuyer],
      defaultSender: orderSettler,
    } = fixture.accounts;
    const {
      config: { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO },
      productList,
    } = fixture;
    const { period, amount } = orderDetailsFixture;

    await dai.mint(coverBuyer.address, parseEther('1000'));
    await dai.connect(coverBuyer).approve(limitOrders.address, parseEther('1000'));
    await limitOrders.maxApproveCoverContract(dai.address);

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

    const amountOver = parseEther('0.1');
    const solverFee = parseEther('0.1');
    const maxPremiumInAsset = premium.add(solverFee).add(amountOver);

    const buyerBalanceBefore = await dai.balanceOf(coverBuyer.address);
    const solverBalanceBefore = await dai.balanceOf(orderSettler.address);
    const nftBalanceBefore = await coverNFT.balanceOf(coverBuyer.address);

    const executionDetails = {
      ...executionDetailsFixture,
      notExecutableBefore: currentTimestamp,
      executableUntil: currentTimestamp + 3600,
      maxPremiumInAsset,
    };
    const orderDetails = {
      ...orderDetailsFixture,
      productId,
      paymentAsset: 1,
      coverAsset: 1,
      owner: coverBuyer.address,
    };

    const settlementDetails = {
      feeDestination: orderSettler.address,
      fee: solverFee,
    };

    await setNextBlockTime(nextBlockTimestamp);

    const { signature, digest } = await signLimitOrder(
      limitOrders.address,
      {
        orderDetails,
        executionDetails,
      },
      coverBuyer,
    );

    const tx = await limitOrders.executeOrder(
      {
        ...orderDetails,
        maxPremiumInAsset: premium.add(amountOver),
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      executionDetails,
      signature,
      settlementDetails,
    );

    const coverId = await coverNFT.totalSupply();

    await expect(tx).to.emit(limitOrders, 'OrderExecuted').withArgs(coverBuyer.address, coverId, digest);

    const { timestamp } = await ethers.provider.getBlock('latest');
    const buyerBalanceAfter = await dai.balanceOf(coverBuyer.address);
    const solverBalanceAfter = await dai.balanceOf(orderSettler.address);
    const nftBalanceAfter = await coverNFT.balanceOf(coverBuyer.address);

    // amountOver should have been refunded
    expect(buyerBalanceAfter).to.be.equal(buyerBalanceBefore.sub(premium).sub(solverFee));
    expect(solverBalanceBefore).to.be.equal(solverBalanceAfter.sub(solverFee));
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
      limitOrders,
      weth,
      coverNFT,
    } = fixture.contracts;
    const {
      nonMembers: [coverBuyer],
      defaultSender: orderSettler,
    } = fixture.accounts;
    const {
      config: { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO },
      productList,
    } = fixture;
    const { period, amount } = orderDetailsFixture;

    await weth.connect(coverBuyer).deposit({ value: parseEther('100') });
    await weth.connect(coverBuyer).approve(limitOrders.address, parseEther('100'));

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

    const executionDetails = {
      ...executionDetailsFixture,
      notExecutableBefore: currentTimestamp,
      executableUntil: currentTimestamp + 3600,
      maxPremiumInAsset: premium,
    };

    const orderDetails = {
      ...orderDetailsFixture,
      productId,
      owner: coverBuyer.address,
    };

    const { signature, digest } = await signLimitOrder(
      limitOrders.address,
      {
        orderDetails,
        executionDetails,
      },
      coverBuyer,
    );

    await setNextBlockTime(nextBlockTimestamp);
    await setNextBlockBaseFee(0);

    const tx = await limitOrders.connect(orderSettler).executeOrder(
      {
        ...orderDetails,
        maxPremiumInAsset: premium,
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      executionDetails,
      signature,
      {
        fee: 0,
        feeDestination: orderSettler.address,
      },
    );

    const coverId = await coverNFT.totalSupply();

    await expect(tx).to.emit(limitOrders, 'OrderExecuted').withArgs(coverBuyer.address, coverId, digest);

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

  it('should purchase new cover and renew it', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const {
      tc: tokenController,
      stakingProducts,
      p1: pool,
      ra: ramm,
      mcr,
      limitOrders,
      weth,
      coverNFT,
    } = fixture.contracts;
    const {
      nonMembers: [coverBuyer],
      defaultSender: orderSettler,
    } = fixture.accounts;
    const {
      config: { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO },
      productList,
    } = fixture;
    const { period, amount } = orderDetailsFixture;

    await weth.connect(coverBuyer).deposit({ value: parseEther('100') });
    await weth.connect(coverBuyer).approve(limitOrders.address, parseEther('100'));

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

    const executionDetails = {
      ...executionDetailsFixture,
      notExecutableBefore: currentTimestamp,
      executableUntil: currentTimestamp + 3600,
      maxPremiumInAsset: premium,
      renewableUntil: currentTimestamp + 180 * 24 * 60 * 60,
    };
    const orderDetails = {
      ...orderDetailsFixture,
      productId,
      owner: coverBuyer.address,
    };

    const { signature, digest } = await signLimitOrder(
      limitOrders.address,
      {
        orderDetails,
        executionDetails,
      },
      coverBuyer,
    );

    await setNextBlockTime(nextBlockTimestamp);
    await setNextBlockBaseFee(0);

    const tx = await limitOrders.connect(orderSettler).executeOrder(
      {
        ...orderDetailsFixture,
        productId,
        owner: coverBuyer.address,
        maxPremiumInAsset: premium,
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      executionDetails,
      signature,
      { fee: 0, feeDestination: orderSettler.address },
    );

    const coverId = await coverNFT.totalSupply();

    await expect(tx).to.emit(limitOrders, 'OrderExecuted').withArgs(coverBuyer.address, coverId, digest);

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

    await setNextBlockTime(nextBlockTimestamp + orderDetailsFixture.period);
    await setNextBlockBaseFee(0);

    const renewalTx = await limitOrders.connect(orderSettler).executeOrder(
      {
        ...orderDetailsFixture,
        productId,
        owner: coverBuyer.address,
        maxPremiumInAsset: premium,
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      executionDetails,
      signature,
      { fee: 0, feeDestination: orderSettler.address },
    );
    const renewalCoverId = await coverNFT.totalSupply();

    await expect(renewalTx).to.emit(limitOrders, 'OrderExecuted').withArgs(coverBuyer.address, renewalCoverId, digest);
    const balanceAfterRenewalWETH = await weth.balanceOf(coverBuyer.address);
    const nftBalanceAfterRenewal = await coverNFT.balanceOf(coverBuyer.address);

    expect(nftBalanceAfterRenewal).to.be.equal(nftBalanceAfter.add(1));
    expect(balanceAfterRenewalWETH).to.be.gt(balanceAfterWETH.sub(premium));
  });

  it('should purchase new cover and not renew it if the counter is over renewal limit', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const {
      tc: tokenController,
      stakingProducts,
      p1: pool,
      ra: ramm,
      mcr,
      limitOrders,
      priceFeedOracle,
      dai,
      coverNFT,
    } = fixture.contracts;
    const {
      nonMembers: [coverBuyer],
      defaultSender: orderSettler,
    } = fixture.accounts;
    const {
      config: { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO },
      productList,
    } = fixture;
    const { period, amount } = orderDetailsFixture;

    await dai.mint(coverBuyer.address, parseEther('1000'));
    await dai.connect(coverBuyer).approve(limitOrders.address, parseEther('1000'));
    await limitOrders.maxApproveCoverContract(dai.address);

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
    const poolBeforeDAI = await dai.balanceOf(pool.address);

    const balanceBeforeWETH = await dai.balanceOf(coverBuyer.address);
    const nftBalanceBefore = await coverNFT.balanceOf(coverBuyer.address);

    const executionDetails = {
      ...executionDetailsFixture,
      notExecutableBefore: currentTimestamp,
      executableUntil: currentTimestamp + 3600,
      maxPremiumInAsset: premium,
      renewableUntil: nextBlockTimestamp + orderDetailsFixture.period - 1,
      renewablePeriodBeforeExpiration: 0,
    };
    const orderDetails = {
      ...orderDetailsFixture,
      productId,
      owner: coverBuyer.address,
      paymentAsset: 1,
      coverAsset: 1,
    };
    const { signature, digest } = await signLimitOrder(
      limitOrders.address,
      {
        orderDetails,
        executionDetails,
      },
      coverBuyer,
    );

    await setNextBlockTime(nextBlockTimestamp);
    await setNextBlockBaseFee(0);

    const tx = await limitOrders.connect(orderSettler).executeOrder(
      {
        ...orderDetails,
        maxPremiumInAsset: premium,
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      executionDetails,
      signature,
      { fee: 0, feeDestination: orderSettler.address },
    );

    const coverId = await coverNFT.totalSupply();

    await expect(tx).to.emit(limitOrders, 'OrderExecuted').withArgs(coverBuyer.address, coverId, digest);

    const { timestamp } = await ethers.provider.getBlock('latest');
    const balanceAfterWETH = await dai.balanceOf(coverBuyer.address);
    const nftBalanceAfter = await coverNFT.balanceOf(coverBuyer.address);

    expect(nftBalanceAfter).to.be.equal(nftBalanceBefore.add(1));
    // amountOver should have been refunded
    expect(balanceAfterWETH).to.be.equal(balanceBeforeWETH.sub(premium));
    const rewards = calculateRewards(premiumInNxm, timestamp, period, GLOBAL_REWARDS_RATIO);

    const stakingPoolAfter = await tokenController.stakingPoolNXMBalances(1);
    const poolAfterDAI = await dai.balanceOf(pool.address);
    expect(stakingPoolAfter.rewards).to.be.equal(stakingPoolBefore.rewards.add(rewards));
    expect(poolAfterDAI).to.be.equal(poolBeforeDAI.add(premium));

    await setNextBlockTime(nextBlockTimestamp + orderDetailsFixture.period);
    await setNextBlockBaseFee(0);

    const renewal = limitOrders.connect(orderSettler).executeOrder(
      {
        ...orderDetails,
        maxPremiumInAsset: premium,
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      executionDetails,
      signature,
      { fee: 0, feeDestination: orderSettler.address },
    );

    await expect(renewal).to.revertedWithCustomError(limitOrders, 'RenewalExpired');
  });

  it('should purchase new cover and not renew it if not in renewal time window', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { tc: tokenController, stakingProducts, p1: pool, ra: ramm, mcr, limitOrders, weth } = fixture.contracts;
    const {
      nonMembers: [coverBuyer],
      defaultSender: orderSettler,
    } = fixture.accounts;
    const {
      config: { NXM_PER_ALLOCATION_UNIT },
      productList,
    } = fixture;
    const { period, amount } = orderDetailsFixture;

    await weth.connect(coverBuyer).deposit({ value: parseEther('100') });
    await weth.connect(coverBuyer).approve(limitOrders.address, parseEther('100'));

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = currentTimestamp + 1;
    const ethRate = await getInternalPrice(ramm, pool, tokenController, mcr, nextBlockTimestamp);

    const { targetPrice } = stakedProductParamTemplate;

    const productId = productList.findIndex(
      ({ product: { initialPriceRatio, useFixedPrice } }) => targetPrice !== initialPriceRatio && useFixedPrice,
    );

    const product = await stakingProducts.getProduct(1, productId);
    const { premiumInAsset: premium } = calculatePremium(
      amount,
      ethRate,
      period,
      product.targetPrice,
      NXM_PER_ALLOCATION_UNIT,
    );

    const executionDetails = {
      ...executionDetailsFixture,
      notExecutableBefore: currentTimestamp,
      executableUntil: currentTimestamp + 3600,
      maxPremiumInAsset: premium,
      renewableUntil: nextBlockTimestamp + 180 * 24 * 60 * 60,
    };

    const orderDetails = {
      ...orderDetailsFixture,
      productId,
      owner: coverBuyer.address,
    };

    const { signature } = await signLimitOrder(
      limitOrders.address,
      {
        orderDetails,
        executionDetails,
      },
      coverBuyer,
    );

    await setNextBlockTime(nextBlockTimestamp);
    await setNextBlockBaseFee(0);

    await limitOrders.executeOrder(
      {
        ...orderDetailsFixture,
        productId,
        owner: coverBuyer.address,
        maxPremiumInAsset: premium,
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      executionDetails,
      signature,
      { fee: 0, feeDestination: orderSettler.address },
    );

    await setNextBlockTime(
      nextBlockTimestamp + orderDetailsFixture.period - executionDetails.renewablePeriodBeforeExpiration - 1,
    );
    await setNextBlockBaseFee(0);

    const renewal = limitOrders.connect(orderSettler).executeOrder(
      {
        ...orderDetailsFixture,
        productId,
        owner: coverBuyer.address,
        maxPremiumInAsset: premium,
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      executionDetails,
      signature,
      { fee: 0, feeDestination: orderSettler.address },
    );

    await expect(renewal).to.revertedWithCustomError(limitOrders, 'OrderCannotBeRenewedYet');
  });

  it('should revert if the price is not met', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { tc: tokenController, stakingProducts, p1: pool, ra: ramm, mcr, limitOrders, weth } = fixture.contracts;
    const {
      nonMembers: [coverBuyer],
      defaultSender: orderSettler,
    } = fixture.accounts;
    const {
      config: { NXM_PER_ALLOCATION_UNIT },
      productList,
    } = fixture;
    const { period, amount, ipfsData } = orderDetailsFixture;

    await weth.connect(coverBuyer).deposit({ value: parseEther('100') });
    await weth.connect(coverBuyer).approve(limitOrders.address, parseEther('100'));

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = currentTimestamp + 1;
    const ethRate = await getInternalPrice(ramm, pool, tokenController, mcr, nextBlockTimestamp);

    const { targetPrice } = stakedProductParamTemplate;

    const productId = productList.findIndex(
      ({ product: { initialPriceRatio, useFixedPrice } }) => targetPrice !== initialPriceRatio && useFixedPrice,
    );

    const product = await stakingProducts.getProduct(1, productId);
    const { premiumInAsset: premium } = calculatePremium(
      amount,
      ethRate,
      period,
      product.targetPrice,
      NXM_PER_ALLOCATION_UNIT,
    );

    const executionDetails = {
      ...executionDetailsFixture,
      notExecutableBefore: currentTimestamp,
      executableUntil: currentTimestamp + 3600,
      maxPremiumInAsset: premium,
    };

    const { signature } = await signLimitOrder(
      limitOrders.address,
      {
        orderDetails: {
          ...orderDetailsFixture,
          productId,
          paymentAsset: 0,
          coverAsset: 0,
          owner: coverBuyer.address,
        },
        executionDetails,
      },
      coverBuyer,
    );

    await setNextBlockTime(nextBlockTimestamp);
    await setNextBlockBaseFee(0);

    const tx = limitOrders.executeOrder(
      {
        ...orderDetailsFixture,
        paymentAsset: 0, // ETH
        productId,
        ipfsData,
        owner: coverBuyer.address,
        maxPremiumInAsset: executionDetails.maxPremiumInAsset + 1,
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      executionDetails,
      signature,
      {
        fee: 0,
        feeDestination: orderSettler.address,
      },
    );

    await expect(tx).to.revertedWithCustomError(limitOrders, 'OrderPriceNotMet');
  });

  it("should revert if the solver isn't a member", async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { limitOrders } = fixture.contracts;
    const {
      nonMembers: [coverBuyer],
    } = fixture.accounts;

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const executionDetails = {
      ...executionDetailsFixture,
      notExecutableBefore: currentTimestamp,
      executableUntil: currentTimestamp + 3600,
    };
    const buyCoverParams = {
      ...orderDetailsFixture,
      owner: coverBuyer.address,
      maxPremiumInAsset: parseEther('1'),
    };

    const buyCover = limitOrders
      .connect(coverBuyer)
      .executeOrder(buyCoverParams, [{ poolId: 1, coverAmountInAsset: parseEther('1') }], executionDetails, '0x', {
        fee: 0,
        feeDestination: coverBuyer.address,
      });

    await expect(buyCover).to.revertedWith('Caller is not a member');
  });

  it("should revert if the solver isn't a internal solver", async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { limitOrders } = fixture.contracts;
    const {
      members: [coverBuyer],
    } = fixture.accounts;

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const executionDetails = {
      ...executionDetailsFixture,
      notExecutableBefore: currentTimestamp,
      executableUntil: currentTimestamp + 3600,
    };
    const buyCoverParams = {
      ...orderDetailsFixture,
      owner: coverBuyer.address,
      maxPremiumInAsset: parseEther('1'),
    };

    const buyCover = limitOrders
      .connect(coverBuyer)
      .executeOrder(buyCoverParams, [{ poolId: 1, coverAmountInAsset: parseEther('1') }], executionDetails, '0x', {
        fee: 0,
        feeDestination: coverBuyer.address,
      });

    await expect(buyCover).to.revertedWithCustomError(limitOrders, 'OnlyInternalSolver');
  });

  it('should revert with InvalidOwnerAddress if params.owner is zero address', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { limitOrders } = fixture.contracts;

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const executionDetails = {
      ...executionDetailsFixture,
      notExecutableBefore: currentTimestamp,
      executableUntil: currentTimestamp + 3600,
    };
    const buyCoverParams = {
      ...orderDetailsFixture,
      owner: AddressZero,
      maxPremiumInAsset: parseEther('1'),
    };

    const buyCover = limitOrders.executeOrder(
      buyCoverParams,
      [{ poolId: 1, coverAmountInAsset: parseEther('1') }],
      executionDetails,
      '0x',
      {
        fee: 0,
        feeDestination: AddressZero,
      },
    );

    await expect(buyCover).to.revertedWithCustomError(limitOrders, 'InvalidOwnerAddress');
  });

  it('should revert with InvalidOwnerAddress if params.owner is LimitOrders address', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { limitOrders } = fixture.contracts;

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const executionDetails = {
      ...executionDetailsFixture,
      notExecutableBefore: currentTimestamp,
      executableUntil: currentTimestamp + 3600,
    };
    const buyCoverParams = {
      ...orderDetailsFixture,
      owner: limitOrders.address,
      maxPremiumInAsset: parseEther('1'),
    };

    const buyCover = limitOrders.executeOrder(
      buyCoverParams,
      [{ poolId: 1, coverAmountInAsset: parseEther('1') }],
      executionDetails,
      '0x',
      {
        fee: 0,
        feeDestination: AddressZero,
      },
    );

    await expect(buyCover).to.revertedWithCustomError(limitOrders, 'InvalidOwnerAddress');
  });

  it('should revert if the order execution expired', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { limitOrders } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');

    const executionDetails = {
      ...executionDetailsFixture,
      notExecutableBefore: currentTimestamp - 3600,
      executableUntil: currentTimestamp - 1,
    };

    const orderDetails = {
      ...orderDetailsFixture,
      productId: 1,
      owner: coverBuyer.address,
    };

    const buyCoverParams = {
      ...orderDetails,
      maxPremiumInAsset: parseEther('1'),
    };

    const { signature } = await signLimitOrder(
      limitOrders.address,
      {
        orderDetails,
        executionDetails,
      },
      coverBuyer,
    );

    const buyCover = limitOrders.executeOrder(
      buyCoverParams,
      [{ poolId: 1, coverAmountInAsset: parseEther('1') }],
      executionDetails,
      signature,
      {
        fee: 0,
        feeDestination: AddressZero,
      },
    );

    await expect(buyCover).to.revertedWithCustomError(limitOrders, 'OrderExpired');
  });

  it('should revert if the order not ready for execution', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { limitOrders } = fixture.contracts;
    const [coverBuyer, orderSigner] = fixture.accounts.members;

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const executionDetails = {
      ...executionDetailsFixture,
      notExecutableBefore: currentTimestamp + 3600,
      executableUntil: currentTimestamp + 7200,
    };

    const orderDetails = {
      ...orderDetailsFixture,
      productId: 1,
      owner: coverBuyer.address,
    };

    const buyCoverParams = {
      ...orderDetails,
      maxPremiumInAsset: parseEther('1'),
    };

    const { signature } = await signLimitOrder(
      limitOrders.address,
      {
        orderDetails,
        executionDetails,
      },
      orderSigner,
    );

    const buyCover = limitOrders.executeOrder(
      buyCoverParams,
      [{ poolId: 1, coverAmountInAsset: parseEther('1') }],
      executionDetails,
      signature,
      {
        fee: 0,
        feeDestination: AddressZero,
      },
    );

    await expect(buyCover).to.revertedWithCustomError(limitOrders, 'OrderCannotBeExecutedYet');
  });

  it('should revert if the order is canceled', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { limitOrders } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;
    const { amount } = orderDetailsFixture;

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');

    const executionDetails = {
      ...executionDetailsFixture,
      notExecutableBefore: currentTimestamp,
      executableUntil: currentTimestamp + 3600,
    };

    const orderDetails = {
      ...orderDetailsFixture,
      productId: 1,
      owner: coverBuyer.address,
    };

    const buyCoverParams = {
      ...orderDetails,
      maxPremiumInAsset: 0,
    };

    const { signature } = await signLimitOrder(
      limitOrders.address,
      {
        orderDetails,
        executionDetails,
      },
      coverBuyer,
    );

    await limitOrders.connect(coverBuyer).cancelOrder(buyCoverParams, executionDetails, signature);

    const tx = limitOrders.executeOrder(
      buyCoverParams,
      [{ poolId: 1, coverAmountInAsset: amount }],
      executionDetails,
      signature,
      {
        fee: 0,
        feeDestination: AddressZero,
      },
    );

    await expect(tx).to.revertedWithCustomError(limitOrders, 'OrderAlreadyCancelled');
  });
});

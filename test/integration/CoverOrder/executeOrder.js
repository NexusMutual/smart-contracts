const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');
const { calculateFirstTrancheId } = require('../utils/staking');
const { calculatePremium } = require('../utils/cover');
const { setNextBlockTime } = require('../utils').evm;
const { daysToSeconds } = require('../../../lib/helpers');
const { BUCKET_DURATION } = require('../../unit/StakingPool/helpers');
const { getInternalPrice } = require('../../utils/rammCalculations');
const { setNextBlockBaseFee } = require('../../utils/evm');
const { signCoverOrder } = require('../../utils/buyCover');

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

describe('CoverOrder - executeOrder', function () {
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
      cover,
    } = fixture.contracts;
    const {
      nonMembers: [coverBuyer],
      members: [limitOrdersSettler],
    } = fixture.accounts;
    const {
      config: { NXM_PER_ALLOCATION_UNIT, GLOBAL_REWARDS_RATIO },
      productList,
    } = fixture;
    const { period, amount, ipfsData, commissionDestination, commissionRatio } = buyCoverFixture;

    await dai.mint(coverBuyer.address, parseEther('1000'));
    await dai.connect(coverBuyer).approve(cover.address, parseEther('1000'));

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
    const maxPremiumInAsset = premium.add(amountOver);

    const balanceBefore = await dai.balanceOf(coverBuyer.address);
    const nftBalanceBefore = await coverNFT.balanceOf(coverBuyer.address);

    const executionDetails = {
      notBefore: currentTimestamp,
      deadline: currentTimestamp + 3600,
      maxPremiumInAsset,
    };

    await setNextBlockTime(nextBlockTimestamp);

    const { signature, digest } = await signCoverOrder(
      limitOrders.address,
      {
        productId,
        amount,
        period,
        ipfsData,
        paymentAsset: 1,
        coverAsset: 1,
        owner: coverBuyer.address,
        commissionRatio,
        commissionDestination,
        executionDetails,
      },
      coverBuyer,
    );

    const tx = await limitOrders.connect(limitOrdersSettler).executeOrder(
      {
        ...buyCoverFixture,
        productId,
        ipfsData,
        owner: coverBuyer.address,
        maxPremiumInAsset,
        coverAsset: 1,
        paymentAsset: 1,
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      executionDetails,
      signature,
    );

    const coverId = await coverNFT.totalSupply();

    await expect(tx).to.emit(limitOrders, 'OrderExecuted').withArgs(coverBuyer.address, coverId, digest);

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
      limitOrders,
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
    const { period, amount, ipfsData, commissionRatio, commissionDestination } = buyCoverFixture;

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
      notBefore: currentTimestamp,
      deadline: currentTimestamp + 3600,
      maxPremiumInAsset: premium,
    };
    const { signature, digest } = await signCoverOrder(
      limitOrders.address,
      {
        productId,
        amount,
        period,
        ipfsData,
        paymentAsset: 0,
        coverAsset: 0,
        owner: coverBuyer.address,
        commissionRatio,
        commissionDestination,
        executionDetails,
      },
      coverBuyer,
    );

    await setNextBlockTime(nextBlockTimestamp);
    await setNextBlockBaseFee(0);

    const tx = await limitOrders.connect(orderSettler).executeOrder(
      {
        ...buyCoverFixture,
        paymentAsset: 0, // ETH
        productId,
        ipfsData,
        owner: coverBuyer.address,
        maxPremiumInAsset: premium,
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      executionDetails,
      signature,
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

  it("should revert if the solver isn't a member", async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { limitOrders } = fixture.contracts;
    const {
      nonMembers: [coverBuyer],
    } = fixture.accounts;

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const executionDetails = {
      notBefore: currentTimestamp,
      deadline: currentTimestamp + 3600,
      maxPremiumInAsset: MaxUint256,
    };
    const buyCoverParams = { ...buyCoverFixture, paymentAsset: 1, owner: coverBuyer.address };

    const buyCover = limitOrders
      .connect(coverBuyer)
      .executeOrder(buyCoverParams, [{ poolId: 1, coverAmountInAsset: parseEther('1') }], executionDetails, '0x');

    await expect(buyCover).to.revertedWith('Caller is not a member');
  });

  it('should revert with InvalidOwnerAddress if params.owner is zero address', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { limitOrders } = fixture.contracts;
    const [coverSettler] = fixture.accounts.members;

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const executionDetails = {
      notBefore: currentTimestamp,
      deadline: currentTimestamp + 3600,
      maxPremiumInAsset: MaxUint256,
    };
    const buyCoverParams = { ...buyCoverFixture, paymentAsset: 1, owner: AddressZero };

    const buyCover = limitOrders
      .connect(coverSettler)
      .executeOrder(buyCoverParams, [{ poolId: 1, coverAmountInAsset: parseEther('1') }], executionDetails, '0x');

    await expect(buyCover).to.revertedWithCustomError(limitOrders, 'InvalidOwnerAddress');
  });

  it('should revert if the order is already executed', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const {
      tc: tokenController,
      stakingProducts,
      p1: pool,
      ra: ramm,
      mcr,
      limitOrders,
      cover,
      dai,
      priceFeedOracle,
    } = fixture.contracts;
    const {
      nonMembers: [coverBuyer],
      members: [limitOrdersSettler],
    } = fixture.accounts;
    const {
      config: { NXM_PER_ALLOCATION_UNIT },
      productList,
    } = fixture;
    const { period, amount, ipfsData, commissionRatio, commissionDestination } = buyCoverFixture;

    await dai.mint(coverBuyer.address, parseEther('1000'));
    await dai.connect(coverBuyer).approve(cover.address, parseEther('1000'));

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
    const executionDetails = {
      notBefore: currentTimestamp,
      deadline: currentTimestamp + 3600,
      maxPremiumInAsset: MaxUint256,
    };

    await setNextBlockTime(nextBlockTimestamp);

    const { signature } = await signCoverOrder(
      limitOrders.address,
      {
        productId,
        amount,
        period,
        ipfsData,
        executionDetails,
        paymentAsset: 1,
        coverAsset: 1,
        owner: coverBuyer.address,
        commissionRatio,
        commissionDestination,
      },
      coverBuyer,
    );

    await limitOrders.connect(limitOrdersSettler).executeOrder(
      {
        ...buyCoverFixture,
        productId,
        owner: coverBuyer.address,
        maxPremiumInAsset: premium.add(amountOver),
        coverAsset: 1,
        paymentAsset: 1,
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      executionDetails,
      signature,
    );

    const buyCover = limitOrders.connect(limitOrdersSettler).executeOrder(
      {
        ...buyCoverFixture,
        productId,
        owner: coverBuyer.address,
        maxPremiumInAsset: premium.add(amountOver),
        coverAsset: 1,
        paymentAsset: 1,
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      executionDetails,
      signature,
    );

    await expect(buyCover).to.revertedWithCustomError(limitOrders, 'OrderAlreadyExecuted');
  });

  it('should revert if the order execution expired', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { limitOrders } = fixture.contracts;
    const [coverSettler, coverBuyer, orderSigner] = fixture.accounts.members;

    const buyCoverParams = { ...buyCoverFixture, paymentAsset: 6, owner: coverSettler.address };

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const executionDetails = {
      notBefore: currentTimestamp - 3600,
      deadline: currentTimestamp - 1,
      maxPremiumInAsset: MaxUint256,
    };

    const { signature } = await signCoverOrder(
      limitOrders.address,
      {
        productId: buyCoverParams.productId,
        amount: buyCoverParams.amount,
        period: buyCoverParams.period,
        ipfsData: buyCoverParams.ipfsData,
        paymentAsset: 1,
        coverAsset: 1,
        owner: coverBuyer.address,
        commissionRatio: buyCoverParams.commissionRatio,
        commissionDestination: buyCoverParams.commissionDestination,
        executionDetails,
      },
      orderSigner,
    );

    const buyCover = limitOrders
      .connect(coverSettler)
      .executeOrder(buyCoverParams, [{ poolId: 1, coverAmountInAsset: parseEther('1') }], executionDetails, signature);

    await expect(buyCover).to.revertedWithCustomError(limitOrders, 'OrderExpired');
  });

  it('should revert if the order not ready for execution', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { limitOrders } = fixture.contracts;
    const [coverSettler, coverBuyer, orderSigner] = fixture.accounts.members;

    const buyCoverParams = { ...buyCoverFixture, paymentAsset: 6, owner: coverSettler.address };

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const executionDetails = {
      notBefore: currentTimestamp + 3600,
      deadline: currentTimestamp + 7200,
      maxPremiumInAsset: MaxUint256,
    };

    const { signature } = await signCoverOrder(
      limitOrders.address,
      {
        productId: buyCoverParams.productId,
        amount: buyCoverParams.amount,
        period: buyCoverParams.period,
        ipfsData: buyCoverParams.ipfsData,
        paymentAsset: 1,
        coverAsset: 1,
        owner: coverBuyer.address,
        commissionRatio: buyCoverParams.commissionRatio,
        commissionDestination: buyCoverParams.commissionDestination,
        executionDetails,
      },
      orderSigner,
    );

    const buyCover = limitOrders
      .connect(coverSettler)
      .executeOrder(buyCoverParams, [{ poolId: 1, coverAmountInAsset: parseEther('1') }], executionDetails, signature);

    await expect(buyCover).to.revertedWithCustomError(limitOrders, 'OrderCannotBeExecutedYet');
  });

  it('should revert if the order is canceled', async function () {
    const fixture = await loadFixture(buyCoverSetup);
    const { limitOrders } = fixture.contracts;
    const [orderSettler, coverBuyer] = fixture.accounts.members;
    const { period, amount, productId, ipfsData, commissionRatio, commissionDestination } = buyCoverFixture;

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');

    const executionDetails = {
      notBefore: currentTimestamp,
      deadline: currentTimestamp + 3600,
      maxPremiumInAsset: MaxUint256,
    };
    const { signature } = await signCoverOrder(
      limitOrders.address,
      {
        productId,
        amount,
        period,
        ipfsData,
        paymentAsset: 0,
        coverAsset: 0,
        owner: coverBuyer.address,
        commissionRatio,
        commissionDestination,
        executionDetails,
      },
      coverBuyer,
    );

    await limitOrders.connect(coverBuyer).cancelOrder(
      {
        ...buyCoverFixture,
        paymentAsset: 0, // ETH
        productId,
        owner: coverBuyer.address,
        maxPremiumInAsset: MaxUint256,
      },
      executionDetails,
      signature,
    );

    const tx = limitOrders.connect(orderSettler).executeOrder(
      {
        ...buyCoverFixture,
        paymentAsset: 0, // ETH
        productId,
        owner: coverBuyer.address,
        maxPremiumInAsset: MaxUint256,
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      executionDetails,
      signature,
    );

    await expect(tx).to.revertedWithCustomError(limitOrders, 'OrderAlreadyCancelled');
  });
});

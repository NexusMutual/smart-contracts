const { expect } = require('chai');
const { ethers } = require('hardhat');
const { parseEther } = ethers.utils;
const { BigNumber } = ethers;
const { calculateSurgePremiums, calculateBasePrice, divCeil } = require('./helpers');
const { daysToSeconds } = require('../../../lib/helpers');

describe('calculatePremium', function () {
  const stakedProductTemplate = {
    lastEffectiveWeight: BigNumber.from(50),
    targetWeight: BigNumber.from(70), // 70%
    targetPrice: BigNumber.from(500), // 5%
    nextPrice: BigNumber.from(100), // 10%
    nextPriceUpdateTime: BigNumber.from(0),
  };

  it('should return 0 premium when period is 0', async function () {
    const { stakingPool } = this;
    const { timestamp } = await ethers.provider.getBlock('latest');
    const { NXM_PER_ALLOCATION_UNIT } = this.config;
    const stakedProduct = { ...stakedProductTemplate, nextPriceUpdateTime: timestamp };
    const period = 0;
    const coverAmountRaw = parseEther('100');
    const coverAmount = divCeil(coverAmountRaw, NXM_PER_ALLOCATION_UNIT);

    const totalCapacity = parseEther('100');
    const initialCapacityUsed = BigNumber.from(0);

    const { premium } = await stakingPool.calculatePremium(
      stakedProduct,
      period,
      coverAmount,
      initialCapacityUsed,
      totalCapacity,
      stakedProduct.targetPrice,
      timestamp,
    );
    expect(premium).to.be.equal(0);
  });

  it('should overflow when calculating premium for very large capacity', async function () {
    const { stakingPool } = this;
    const { timestamp } = await ethers.provider.getBlock('latest');
    const { NXM_PER_ALLOCATION_UNIT } = this.config;
    const stakedProduct = { ...stakedProductTemplate, nextPriceUpdateTime: timestamp };
    const period = daysToSeconds(365);
    const coverAmountRaw = parseEther('100');
    const coverAmount = divCeil(coverAmountRaw, NXM_PER_ALLOCATION_UNIT);

    const totalCapacity = BigNumber.from(2).pow(255);
    const initialCapacityUsed = BigNumber.from(0);
    const basePrice = calculateBasePrice(timestamp, stakedProduct, this.config.PRICE_CHANGE_PER_DAY);

    await expect(
      stakingPool.calculatePremium(
        stakedProduct,
        period,
        coverAmount,
        initialCapacityUsed,
        totalCapacity,
        stakedProduct.targetPrice,
        timestamp,
      ),
    ).to.be.revertedWithPanic(17); // divide-by-zero (0x11)
    await expect(
      stakingPool.calculatePremiumPerYear(basePrice, coverAmount, initialCapacityUsed, totalCapacity),
    ).to.be.revertedWithPanic(17); // divide-by-zero (0x11)
  });

  it('should calculate the premium correctly when cover amount is equal to total capacity', async function () {
    const { stakingPool } = this;
    const { timestamp } = await ethers.provider.getBlock('latest');
    const { INITIAL_PRICE_DENOMINATOR, NXM_PER_ALLOCATION_UNIT } = this.config;
    // call staking pool and calculate premium
    const stakedProduct = { ...stakedProductTemplate, nextPriceUpdateTime: timestamp };
    const period = daysToSeconds(365);
    const coverAmountRaw = BigNumber.from(2).pow(96);
    const coverAmount = divCeil(coverAmountRaw, NXM_PER_ALLOCATION_UNIT);
    const initialCapacityUsed = 0;
    const totalCapacity = coverAmount;
    const basePrice = calculateBasePrice(timestamp, stakedProduct, this.config.PRICE_CHANGE_PER_DAY);
    const { premium: expectedPremium } = await stakingPool.calculatePremium(
      stakedProduct,
      period,
      coverAmount,
      initialCapacityUsed,
      totalCapacity,
      stakedProduct.targetPrice,
      timestamp,
    );
    const premiumPerYear = await stakingPool.calculatePremiumPerYear(
      basePrice,
      coverAmount,
      initialCapacityUsed,
      totalCapacity,
    );
    const { surgePremium, surgePremiumSkipped } = calculateSurgePremiums(
      coverAmountRaw,
      initialCapacityUsed,
      totalCapacity,
      this.config,
    );
    // Note must use rounded down value to match precision loss in contracts
    const basePremium = BigNumber.from(coverAmount.mul(NXM_PER_ALLOCATION_UNIT))
      .mul(basePrice)
      .div(INITIAL_PRICE_DENOMINATOR);
    const actualPremium = basePremium.add(surgePremium);
    expect(premiumPerYear).to.be.equal(expectedPremium);
    expect(surgePremiumSkipped).to.be.eq(0);
    expect(actualPremium).to.be.equal(expectedPremium);
  });

  it('should calculate the premium when the initialCapacityUsed == surgeStartPoint', async function () {
    const { stakingPool } = this;
    const { timestamp } = await ethers.provider.getBlock('latest');
    const { INITIAL_PRICE_DENOMINATOR, NXM_PER_ALLOCATION_UNIT } = this.config;
    const stakedProduct = { ...stakedProductTemplate, nextPriceUpdateTime: timestamp };
    const period = daysToSeconds(365);
    const coverAmountRaw = parseEther('1234');
    const coverAmount = divCeil(coverAmountRaw, NXM_PER_ALLOCATION_UNIT);

    const totalCapacity = coverAmount;
    const surgeStartPoint = totalCapacity
      .mul(this.config.SURGE_THRESHOLD_RATIO)
      .div(this.config.SURGE_THRESHOLD_DENOMINATOR);
    const initialCapacityUsed = surgeStartPoint;
    const basePrice = calculateBasePrice(timestamp, stakedProduct, this.config.PRICE_CHANGE_PER_DAY);
    const { premium: expectedPremium } = await stakingPool.calculatePremium(
      stakedProduct,
      period,
      coverAmount,
      initialCapacityUsed,
      totalCapacity,
      stakedProduct.targetPrice,
      timestamp,
    );
    const premiumPerYear = await stakingPool.calculatePremiumPerYear(
      basePrice,
      coverAmount,
      initialCapacityUsed,
      totalCapacity,
    );
    const { surgePremium, surgePremiumSkipped } = calculateSurgePremiums(
      coverAmountRaw,
      initialCapacityUsed,
      totalCapacity,
      this.config,
    );
    // Note must use rounded down value to match precision loss in contracts
    const basePremium = BigNumber.from(coverAmount.mul(NXM_PER_ALLOCATION_UNIT))
      .mul(basePrice)
      .div(INITIAL_PRICE_DENOMINATOR);
    const actualPremium = basePremium.add(surgePremium);
    expect(premiumPerYear).to.be.equal(expectedPremium);
    expect(surgePremiumSkipped).to.be.eq(0);
    expect(actualPremium).to.be.equal(expectedPremium);
  });

  it('should calculate premium when initialCapacityUsed > surgeStartPoint', async function () {
    const { stakingPool } = this;
    const { timestamp } = await ethers.provider.getBlock('latest');
    const { INITIAL_PRICE_DENOMINATOR, NXM_PER_ALLOCATION_UNIT } = this.config;
    const stakedProduct = { ...stakedProductTemplate, nextPriceUpdateTime: timestamp };
    const period = daysToSeconds(365);
    const coverAmountRaw = parseEther('1234');
    const coverAmount = divCeil(coverAmountRaw, NXM_PER_ALLOCATION_UNIT);

    const totalCapacity = coverAmount;
    const surgeStartPoint = totalCapacity
      .mul(this.config.SURGE_THRESHOLD_RATIO)
      .div(this.config.SURGE_THRESHOLD_DENOMINATOR);
    const initialCapacityUsed = surgeStartPoint.add(10);
    const basePrice = calculateBasePrice(timestamp, stakedProduct, this.config.PRICE_CHANGE_PER_DAY);
    const { premium: expectedPremium } = await stakingPool.calculatePremium(
      stakedProduct,
      period,
      coverAmount,
      initialCapacityUsed,
      totalCapacity,
      stakedProduct.targetPrice,
      timestamp,
    );
    const premiumPerYear = await stakingPool.calculatePremiumPerYear(
      basePrice,
      coverAmount,
      initialCapacityUsed,
      totalCapacity,
    );
    const { surgePremium, surgePremiumSkipped } = calculateSurgePremiums(
      coverAmountRaw,
      initialCapacityUsed,
      totalCapacity,
      this.config,
    );
    // Note must use rounded down value to match precision loss in contracts
    const basePremium = BigNumber.from(coverAmount.mul(NXM_PER_ALLOCATION_UNIT))
      .mul(basePrice)
      .div(INITIAL_PRICE_DENOMINATOR);
    const actualPremium = basePremium.add(surgePremium).sub(surgePremiumSkipped);
    expect(premiumPerYear).to.be.equal(expectedPremium);
    expect(actualPremium).to.be.equal(expectedPremium);
  });

  // Test case showing it reverts when cover amount is 0
  it('should calculate 0 premium for 0 cover amount', async function () {
    const { stakingPool } = this;
    const { timestamp } = await ethers.provider.getBlock('latest');
    const stakedProduct = { ...stakedProductTemplate, nextPriceUpdateTime: timestamp };
    const period = daysToSeconds(365);
    const coverAmount = 0;

    const totalCapacity = BigNumber.from(100);
    const initialCapacityUsed = BigNumber.from(0);
    const basePrice = calculateBasePrice(timestamp, stakedProduct, this.config.PRICE_CHANGE_PER_DAY);
    const { premium } = await stakingPool.calculatePremium(
      stakedProduct,
      period,
      coverAmount,
      initialCapacityUsed,
      totalCapacity,
      stakedProduct.targetPrice,
      timestamp,
    );
    expect(premium).to.be.equal(0);
    const premiumPerYear = await stakingPool.calculatePremiumPerYear(
      basePrice,
      coverAmount,
      initialCapacityUsed,
      totalCapacity,
    );
    expect(premiumPerYear).to.be.equal(0);
  });

  it('should calculate the correct premium when the coverAmount is 1 wei', async function () {
    const { stakingPool } = this;
    const { timestamp } = await ethers.provider.getBlock('latest');
    const { INITIAL_PRICE_DENOMINATOR, NXM_PER_ALLOCATION_UNIT } = this.config;
    const stakedProduct = { ...stakedProductTemplate, nextPriceUpdateTime: timestamp };
    const period = daysToSeconds(365);
    const coverAmountRaw = 1;
    const coverAmount = divCeil(coverAmountRaw, NXM_PER_ALLOCATION_UNIT);

    const totalCapacity = coverAmount.mul(100);
    const initialCapacityUsed = 0;
    const basePrice = calculateBasePrice(timestamp, stakedProduct, this.config.PRICE_CHANGE_PER_DAY);
    const { premium: expectedPremium } = await stakingPool.calculatePremium(
      stakedProduct,
      period,
      coverAmount,
      initialCapacityUsed,
      totalCapacity,
      stakedProduct.targetPrice,
      timestamp,
    );
    const premiumPerYear = await stakingPool.calculatePremiumPerYear(
      basePrice,
      coverAmount,
      initialCapacityUsed,
      totalCapacity,
    );
    const { surgePremium, surgePremiumSkipped } = calculateSurgePremiums(
      coverAmountRaw,
      initialCapacityUsed,
      totalCapacity,
      this.config,
    );
    // Note must use rounded down value to match precision loss in contracts
    const basePremium = BigNumber.from(coverAmount.mul(NXM_PER_ALLOCATION_UNIT))
      .mul(basePrice)
      .div(INITIAL_PRICE_DENOMINATOR);
    const actualPremium = basePremium.add(surgePremium);
    expect(surgePremium).to.be.eq(0);
    expect(premiumPerYear).to.be.equal(expectedPremium);
    expect(surgePremiumSkipped).to.be.eq(0);
    expect(actualPremium).to.be.equal(expectedPremium);
  });

  it('initialCapacityUsed < surgeStartPoint & finalCapacityUsed > surgeStartPoint', async function () {
    const { stakingPool } = this;
    const { timestamp } = await ethers.provider.getBlock('latest');
    const { INITIAL_PRICE_DENOMINATOR, NXM_PER_ALLOCATION_UNIT } = this.config;
    const stakedProduct = { ...stakedProductTemplate, nextPriceUpdateTime: timestamp };
    const period = daysToSeconds(365);
    const coverAmountRaw = parseEther('4321');
    const coverAmount = divCeil(coverAmountRaw, NXM_PER_ALLOCATION_UNIT);

    const totalCapacity = coverAmount.mul(10);
    const surgeStartPoint = totalCapacity
      .mul(this.config.SURGE_THRESHOLD_RATIO)
      .div(this.config.SURGE_THRESHOLD_DENOMINATOR);
    const initialCapacityUsed = surgeStartPoint.sub(100);
    const basePrice = calculateBasePrice(timestamp, stakedProduct, this.config.PRICE_CHANGE_PER_DAY);
    const { premium: expectedPremium } = await stakingPool.calculatePremium(
      stakedProduct,
      period,
      coverAmount,
      initialCapacityUsed,
      totalCapacity,
      stakedProduct.targetPrice,
      timestamp,
    );
    const premiumPerYear = await stakingPool.calculatePremiumPerYear(
      basePrice,
      coverAmount,
      initialCapacityUsed,
      totalCapacity,
    );
    const { surgePremium, surgePremiumSkipped } = calculateSurgePremiums(
      coverAmountRaw,
      initialCapacityUsed,
      totalCapacity,
      this.config,
    );
    // Note must use rounded down value to match precision loss in contracts
    const basePremium = BigNumber.from(coverAmount.mul(NXM_PER_ALLOCATION_UNIT))
      .mul(basePrice)
      .div(INITIAL_PRICE_DENOMINATOR);
    const actualPremium = basePremium.add(surgePremium);
    expect(surgePremium).to.be.lt(coverAmountRaw.mul(20).div(100));
    expect(premiumPerYear).to.be.equal(expectedPremium);
    expect(surgePremiumSkipped).to.be.eq(0);
    expect(actualPremium).to.be.equal(expectedPremium);
  });

  it('should revert with divide by 0 panic, when totalCapacity is zero', async function () {
    const { stakingPool } = this;
    const { timestamp } = await ethers.provider.getBlock('latest');
    const { NXM_PER_ALLOCATION_UNIT } = this.config;
    const stakedProduct = { ...stakedProductTemplate, nextPriceUpdateTime: timestamp };
    const period = daysToSeconds(365);
    const coverAmountRaw = parseEther('4321');
    const coverAmount = divCeil(coverAmountRaw, NXM_PER_ALLOCATION_UNIT);

    const totalCapacity = BigNumber.from(0);
    const initialCapacityUsed = BigNumber.from(0);
    const basePrice = calculateBasePrice(timestamp, stakedProduct, this.config.PRICE_CHANGE_PER_DAY);
    await expect(
      stakingPool.calculatePremium(
        stakedProduct,
        period,
        coverAmount,
        initialCapacityUsed,
        totalCapacity,
        stakedProduct.targetPrice,
        timestamp,
      ),
    ).to.be.revertedWithPanic(18); // divide-by-zero (0x11)
    await expect(
      stakingPool.calculatePremiumPerYear(basePrice, coverAmount, initialCapacityUsed, totalCapacity),
    ).to.be.revertedWithPanic(18); // divide-by-zero (0x11)
  });
});

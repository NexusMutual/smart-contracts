const { expect } = require('chai');
const { ethers } = require('hardhat');
const {
  calculateBasePrice,
  calculateBasePremium,
  calculateSurgePremium,
  calculatePriceBump,
  divCeil,
} = require('./helpers');

const { daysToSeconds } = require('../utils').helpers;
const { UNDER_OR_OVERFLOW, DIVIDE_BY_ZERO } = require('../utils').errors;

const { BigNumber } = ethers;
const { parseEther } = ethers.utils;

const stakedProductTemplate = {
  lastEffectiveWeight: BigNumber.from(50),
  targetWeight: BigNumber.from(70), // 70%
  targetPrice: BigNumber.from(200), // 2%
  bumpedPrice: BigNumber.from(200), // 2%
  bumpedPriceUpdateTime: BigNumber.from(0),
};

const spreadsheet = [
  {
    timeSinceLastBuy: BigNumber.from(daysToSeconds(183)),
    basePrice: BigNumber.from('200'),
    bumpedPrice: BigNumber.from('296'),
    coverAmountInNXM: parseEther('2400'),
    poolCapacityBeforePercentage: BigNumber.from('0'),
    premium: parseEther('48'),
    basePremium: parseEther('48'),
    surgePremium: parseEther('0'),
    surgePremiumSkipped: BigNumber.from(0),
  },
  {
    timeSinceLastBuy: BigNumber.from(daysToSeconds(1)),
    basePrice: BigNumber.from('246'),
    bumpedPrice: BigNumber.from('726'),
    coverAmountInNXM: parseEther('12000'),
    poolCapacityBeforePercentage: BigNumber.from('480'), // 4.80%
    premium: parseEther('295.20'),
    basePremium: parseEther('295.20'),
    surgePremium: parseEther('0'),
    surgePremiumSkipped: BigNumber.from(0),
  },
  {
    timeSinceLastBuy: BigNumber.from(daysToSeconds(2)),
    basePrice: BigNumber.from('626'),
    bumpedPrice: BigNumber.from('1106'),
    coverAmountInNXM: parseEther('12000'),
    poolCapacityBeforePercentage: BigNumber.from('2880'), // 28.80%
    premium: parseEther('751.20'),
    basePremium: parseEther('751.20'),
    surgePremium: parseEther('0'),
    surgePremiumSkipped: BigNumber.from(0),
  },
  {
    timeSinceLastBuy: BigNumber.from(daysToSeconds(5)),
    basePrice: BigNumber.from('856'),
    bumpedPrice: BigNumber.from('1336'),
    coverAmountInNXM: parseEther('12000'),
    poolCapacityBeforePercentage: BigNumber.from('5280'), // 52.80%
    premium: parseEther('1027.20'),
    basePremium: parseEther('1027.20'),
    surgePremium: parseEther('0'),
    surgePremiumSkipped: BigNumber.from(0),
  },
  {
    timeSinceLastBuy: BigNumber.from(daysToSeconds(2)),
    basePrice: BigNumber.from('1236'),
    bumpedPrice: BigNumber.from('1556'),
    coverAmountInNXM: parseEther('8000'),
    poolCapacityBeforePercentage: BigNumber.from('7680'), // 76.80%
    premium: parseEther('1028.00'),
    basePremium: parseEther('988.80'),
    surgePremium: parseEther('39.20'),
    surgePremiumSkipped: BigNumber.from(0),
  },
  {
    timeSinceLastBuy: BigNumber.from(daysToSeconds(4)),
    basePrice: BigNumber.from('1356'),
    bumpedPrice: BigNumber.from('1452'),
    coverAmountInNXM: parseEther('2400'),
    poolCapacityBeforePercentage: BigNumber.from('9280'), // 92.80%
    premium: parseEther('575.04'),
    basePremium: parseEther('325.44'),
    surgePremium: parseEther('249.60'),
    surgePremiumSkipped: parseEther('39.20'),
  },
];

const spreadsheetStartTime = new Date('2020-04-10 00:00:00').getTime() / 1000;
const totalCapacityInNxm = parseEther('50000');

describe('calculatePremium', function () {
  it('should calculate premium on multiple cover buys over time, based on pre-defined numbers', async function () {
    const { stakingPool } = this;
    const { NXM_PER_ALLOCATION_UNIT, PRICE_BUMP_RATIO, PRICE_CHANGE_PER_DAY } = this.config;

    const period = daysToSeconds(365);
    const totalCapacity = divCeil(totalCapacityInNxm, NXM_PER_ALLOCATION_UNIT);

    let initialCapacityUsed = BigNumber.from(0);
    let currentTime = BigNumber.from(spreadsheetStartTime);
    let product = { ...stakedProductTemplate, bumpedPriceUpdateTime: currentTime };

    for (const spreadsheetItem of spreadsheet) {
      // advance time
      currentTime = currentTime.add(spreadsheetItem.timeSinceLastBuy);

      const amount = spreadsheetItem.coverAmountInNXM;
      const allocationAmount = divCeil(amount, NXM_PER_ALLOCATION_UNIT);

      // js calculated values
      const expectedBasePrice = calculateBasePrice(currentTime, product, PRICE_CHANGE_PER_DAY);
      const expectedBasePremium = calculateBasePremium(amount, expectedBasePrice, period, this.config);
      const expectedPriceBump = calculatePriceBump(amount, PRICE_BUMP_RATIO, totalCapacity, NXM_PER_ALLOCATION_UNIT);
      const expectedBumpedPrice = expectedBasePrice.add(expectedPriceBump);
      const expectedSurge = calculateSurgePremium(amount, initialCapacityUsed, totalCapacity, period, this.config);
      const expectedPremium = expectedBasePremium.add(expectedSurge.surgePremium);
      const expectedPoolCapacityBeforePercentage = initialCapacityUsed.mul(10000).div(totalCapacity);

      // cross-check spreadsheet vs js
      expect(expectedBasePrice).to.be.equal(spreadsheetItem.basePrice);
      expect(expectedBumpedPrice).to.be.equal(spreadsheetItem.bumpedPrice);
      expect(expectedBasePremium).to.be.equal(spreadsheetItem.basePremium);
      expect(expectedSurge.surgePremium).to.be.equal(spreadsheetItem.surgePremium);
      expect(expectedSurge.surgePremiumSkipped).to.be.equal(spreadsheetItem.surgePremiumSkipped);
      expect(expectedPremium).to.be.equal(spreadsheetItem.premium);
      expect(expectedPoolCapacityBeforePercentage).to.be.equal(spreadsheetItem.poolCapacityBeforePercentage);

      // calculate premium using the contract function
      const [actualPremium, updatedProduct] = await stakingPool.calculatePremium(
        product,
        period,
        allocationAmount,
        initialCapacityUsed,
        totalCapacity,
        product.targetPrice,
        currentTime,
      );

      // check contract vs js
      expect(actualPremium).to.be.equal(expectedPremium);
      expect(updatedProduct.bumpedPrice).to.be.equal(expectedBumpedPrice);
      expect(updatedProduct.bumpedPriceUpdateTime).to.be.equal(currentTime);

      // persist state
      product = updatedProduct;
      initialCapacityUsed = initialCapacityUsed.add(allocationAmount);
    }
  });

  it('should return 0 premium when period is 0', async function () {
    const { stakingPool } = this;
    let { timestamp } = await ethers.provider.getBlock('latest');
    timestamp = BigNumber.from(timestamp);
    const { NXM_PER_ALLOCATION_UNIT } = this.config;
    const stakedProduct = { ...stakedProductTemplate, bumpedPriceUpdateTime: timestamp };
    const period = BigNumber.from(0);
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

  it('should calculate the premium correctly when cover amount is equal to total capacity', async function () {
    const { stakingPool } = this;
    const { NXM_PER_ALLOCATION_UNIT } = this.config;

    const timestamp = 0;
    const stakedProduct = { ...stakedProductTemplate, bumpedPriceUpdateTime: timestamp };
    const period = daysToSeconds(365);

    const coverAmount = BigNumber.from(2).pow(64);
    const allocationAmount = divCeil(coverAmount, NXM_PER_ALLOCATION_UNIT);
    
    const initialCapacity = BigNumber.from(0);
    const totalCapacity = allocationAmount;

    const { premium: actualPremium } = await stakingPool.calculatePremium(
      stakedProduct,
      period,
      allocationAmount,
      initialCapacity,
      totalCapacity,
      stakedProduct.targetPrice,
      timestamp,
    );

    const expectedBasePrice = calculateBasePrice(timestamp, stakedProduct, this.config.PRICE_CHANGE_PER_DAY);
    const expectedBasePremium = calculateBasePremium(coverAmount, expectedBasePrice, period, this.config);
    const surgeData = calculateSurgePremium(coverAmount, initialCapacity, totalCapacity, period, this.config);
    const { surgePremium, surgePremiumSkipped } = surgeData;

    expect(surgePremiumSkipped).to.be.equal(0);
    expect(actualPremium).to.be.equal(expectedBasePremium.add(surgePremium));
  });

  it('should calculate the premium when the initialCapacityUsed == surgeStartPoint', async function () {
    const { stakingPool } = this;
    const { SURGE_THRESHOLD_RATIO, SURGE_THRESHOLD_DENOMINATOR, NXM_PER_ALLOCATION_UNIT } = this.config;

    const timestamp = 0;
    const stakedProduct = { ...stakedProductTemplate, bumpedPriceUpdateTime: timestamp };

    const period = daysToSeconds(365);
    const coverAmount = parseEther('1234');
    const allocationAmount = divCeil(coverAmount, NXM_PER_ALLOCATION_UNIT);

    const totalCapacity = allocationAmount.mul(10);
    const surgeStartPoint = totalCapacity.mul(SURGE_THRESHOLD_RATIO).div(SURGE_THRESHOLD_DENOMINATOR);
    const initialCapacityUsed = surgeStartPoint;

    const expectedBasePrice = calculateBasePrice(timestamp, stakedProduct, this.config.PRICE_CHANGE_PER_DAY);
    const expectedBasePremium = calculateBasePremium(coverAmount, expectedBasePrice, period, this.config);
    const {
      surgePremium: expectedSurgePremium,
      surgePremiumSkipped: expectedSurgePremiumSkipped, // 0
    } = calculateSurgePremium(coverAmount, initialCapacityUsed, totalCapacity, period, this.config);

    const expectedPremium = expectedBasePremium.add(expectedSurgePremium);

    const { premium: actualPremium } = await stakingPool.calculatePremium(
      stakedProduct,
      period,
      allocationAmount,
      initialCapacityUsed,
      totalCapacity,
      stakedProduct.targetPrice,
      timestamp,
    );

    expect(expectedSurgePremiumSkipped).to.be.equal(0);
    expect(actualPremium).to.be.equal(expectedPremium);
  });

  it('should calculate premium when initialCapacityUsed > surgeStartPoint', async function () {
    const { stakingPool } = this;
    const { SURGE_THRESHOLD_RATIO, SURGE_THRESHOLD_DENOMINATOR, NXM_PER_ALLOCATION_UNIT } = this.config;

    const timestamp = 0;
    const stakedProduct = { ...stakedProductTemplate, bumpedPriceUpdateTime: timestamp };

    const period = daysToSeconds(365);
    const coverAmount = parseEther('1234');
    const allocationAmount = divCeil(coverAmount, NXM_PER_ALLOCATION_UNIT);

    const totalCapacity = allocationAmount.mul(11);
    const surgeStartPoint = totalCapacity.mul(SURGE_THRESHOLD_RATIO).div(SURGE_THRESHOLD_DENOMINATOR);
    const initialCapacityUsed = surgeStartPoint.add(10);

    const expectedBasePrice = calculateBasePrice(timestamp, stakedProduct, this.config.PRICE_CHANGE_PER_DAY);
    const expectedBasePremium = calculateBasePremium(coverAmount, expectedBasePrice, period, this.config);
    const { surgePremium: expectedSurgePremium } = calculateSurgePremium(
      coverAmount,
      initialCapacityUsed,
      totalCapacity,
      period,
      this.config,
    );
    const expectedPremium = expectedBasePremium.add(expectedSurgePremium);

    const { premium: actualPremium } = await stakingPool.calculatePremium(
      stakedProduct,
      period,
      allocationAmount,
      initialCapacityUsed,
      totalCapacity,
      stakedProduct.targetPrice,
      timestamp,
    );

    expect(actualPremium).to.be.equal(expectedPremium);
  });

  it('should calculate 0 premium for 0 cover amount', async function () {
    const { stakingPool } = this;

    const timestamp = 0;
    const stakedProduct = { ...stakedProductTemplate, bumpedPriceUpdateTime: timestamp };
    const period = daysToSeconds(365);
    const coverAmount = 0;

    const initialCapacityUsed = BigNumber.from(0);
    const totalCapacity = BigNumber.from(100);

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

  it('should calculate the correct premium when the coverAmount is 1 wei', async function () {
    const { stakingPool } = this;
    const { NXM_PER_ALLOCATION_UNIT } = this.config;

    const timestamp = 0;
    const stakedProduct = { ...stakedProductTemplate, bumpedPriceUpdateTime: timestamp };

    const period = daysToSeconds(365);
    const coverAmount = BigNumber.from(1);
    const allocationAmount = divCeil(coverAmount, NXM_PER_ALLOCATION_UNIT);

    const initialCapacityUsed = BigNumber.from(0);
    const totalCapacity = allocationAmount.mul(100);

    const expectedBasePrice = calculateBasePrice(timestamp, stakedProduct, this.config.PRICE_CHANGE_PER_DAY);
    const expectedBasePremium = calculateBasePremium(coverAmount, expectedBasePrice, period, this.config);

    const {
      surgePremium: expectedSurgePremium, // should be 0
      surgePremiumSkipped: expectedSurgePremiumSkipped,
    } = calculateSurgePremium(coverAmount, initialCapacityUsed, totalCapacity, period, this.config);

    const { premium: actualPremium } = await stakingPool.calculatePremium(
      stakedProduct,
      period,
      allocationAmount,
      initialCapacityUsed,
      totalCapacity,
      stakedProduct.targetPrice,
      timestamp,
    );

    expect(expectedSurgePremium).to.be.eq(0);
    expect(expectedSurgePremiumSkipped).to.be.eq(0);
    expect(actualPremium).to.be.equal(expectedBasePremium);
  });

  it('initialCapacityUsed < surgeStartPoint & finalCapacityUsed < surgeStartPoint', async function () {
    const { stakingPool } = this;
    const { NXM_PER_ALLOCATION_UNIT } = this.config;

    const timestamp = 0;
    const stakedProduct = { ...stakedProductTemplate, bumpedPriceUpdateTime: timestamp };

    const period = daysToSeconds(365);
    const coverAmount = parseEther('1');
    const allocationAmount = divCeil(coverAmount, NXM_PER_ALLOCATION_UNIT);

    const initialCapacityUsed = BigNumber.from(0);
    const totalCapacity = coverAmount.mul(100);

    const expectedBasePrice = calculateBasePrice(timestamp, stakedProduct, this.config.PRICE_CHANGE_PER_DAY);
    const expectedBasePremium = calculateBasePremium(coverAmount, expectedBasePrice, period, this.config);

    const { premium: actualPremium } = await stakingPool.calculatePremium(
      stakedProduct,
      period,
      allocationAmount,
      initialCapacityUsed,
      totalCapacity,
      stakedProduct.targetPrice,
      timestamp,
    );

    const {
      surgePremium: expectedSurgePremium, // should be 0
      surgePremiumSkipped: expectedSurgePremiumSkipped,
    } = calculateSurgePremium(coverAmount, initialCapacityUsed, totalCapacity, period, this.config);

    expect(expectedSurgePremium).to.be.eq(0);
    expect(expectedSurgePremiumSkipped).to.be.eq(0);
    expect(actualPremium).to.be.equal(expectedBasePremium);
  });

  it('initialCapacityUsed < surgeStartPoint & finalCapacityUsed > surgeStartPoint', async function () {
    const { stakingPool } = this;
    const { SURGE_THRESHOLD_RATIO, SURGE_THRESHOLD_DENOMINATOR, NXM_PER_ALLOCATION_UNIT } = this.config;

    const timestamp = 0;
    const stakedProduct = { ...stakedProductTemplate, bumpedPriceUpdateTime: timestamp };

    const period = daysToSeconds(365);
    const coverAmount = parseEther('4321');
    const allocationAmount = divCeil(coverAmount, NXM_PER_ALLOCATION_UNIT);

    const totalCapacity = coverAmount.mul(10);
    const surgeStartPoint = totalCapacity.mul(SURGE_THRESHOLD_RATIO).div(SURGE_THRESHOLD_DENOMINATOR);
    const initialCapacityUsed = surgeStartPoint.sub(100);

    const expectedBasePrice = calculateBasePrice(timestamp, stakedProduct, this.config.PRICE_CHANGE_PER_DAY);
    const expectedBasePremium = calculateBasePremium(coverAmount, expectedBasePrice, period, this.config);

    const {
      surgePremium: expectedSurgePremium, // should be non zero
      surgePremiumSkipped: expectedSurgePremiumSkipped,
      amountOnSurge: expectedAmountOnSurge,
    } = calculateSurgePremium(coverAmount, initialCapacityUsed, totalCapacity, period, this.config);

    const expectedPremium = expectedBasePremium.add(expectedSurgePremium);

    const { premium: actualPremium } = await stakingPool.calculatePremium(
      stakedProduct,
      period,
      allocationAmount,
      initialCapacityUsed,
      totalCapacity,
      stakedProduct.targetPrice,
      timestamp,
    );

    // noinspection ES6RedundantAwait
    const actualSurgePremium = await stakingPool.calculateSurgePremium(expectedAmountOnSurge, totalCapacity);

    expect(expectedSurgePremium).to.be.equal(actualSurgePremium);
    expect(expectedSurgePremiumSkipped).to.be.eq(0);
    expect(actualPremium).to.be.equal(expectedPremium);
  });

  it('should revert with divide by 0 panic, when totalCapacity is zero', async function () {
    const { stakingPool } = this;
    const { NXM_PER_ALLOCATION_UNIT } = this.config;

    const timestamp = 0;
    const stakedProduct = { ...stakedProductTemplate, bumpedPriceUpdateTime: timestamp };

    const period = daysToSeconds(365);
    const coverAmount = parseEther('4321');
    const allocationAmount = divCeil(coverAmount, NXM_PER_ALLOCATION_UNIT);

    const totalCapacity = BigNumber.from(0);
    const initialCapacityUsed = BigNumber.from(0);
    const basePrice = calculateBasePrice(timestamp, stakedProduct, this.config.PRICE_CHANGE_PER_DAY);

    await expect(
      stakingPool.calculatePremium(
        stakedProduct,
        period,
        allocationAmount,
        initialCapacityUsed,
        totalCapacity,
        stakedProduct.targetPrice,
        timestamp,
      ),
    ).to.be.revertedWithPanic(DIVIDE_BY_ZERO);

    await expect(
      stakingPool.calculatePremiumPerYear(basePrice, allocationAmount, initialCapacityUsed, totalCapacity),
    ).to.be.revertedWithPanic(DIVIDE_BY_ZERO);
  });

  it('should correctly calculate fixed price premium', async function () {
    const { stakingPool } = this;
    const { NXM_PER_ALLOCATION_UNIT } = this.config;

    const period = daysToSeconds(182.5);
    const coverAmount = parseEther('4321');
    const allocationAmount = divCeil(coverAmount, NXM_PER_ALLOCATION_UNIT);

    const expectedBasePrice = BigNumber.from('500'); // 5%
    const expectedFixedPricePremium = calculateBasePremium(coverAmount, expectedBasePrice, period, this.config);

    const actualFixedPricePremium = await stakingPool.calculateFixedPricePremium(
      allocationAmount,
      period,
      expectedBasePrice,
    );

    expect(actualFixedPricePremium).to.be.equal(expectedFixedPricePremium);
  });
});

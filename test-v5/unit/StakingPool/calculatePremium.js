const { expect } = require('chai');
const { ethers } = require('hardhat');
const { calculateBasePrice, calculateBasePremium, calculatePriceBump } = require('./helpers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

const { daysToSeconds } = require('../utils').helpers;
const { divCeil } = require('../utils').bnMath;
const { DIVIDE_BY_ZERO } = require('../utils').errors;

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
    bumpedPrice: BigNumber.from('224'),
    coverAmountInNXM: parseEther('2400'),
    poolCapacityBeforePercentage: BigNumber.from('0'),
    premium: parseEther('48'),
  },
  {
    timeSinceLastBuy: BigNumber.from(daysToSeconds(1)),
    basePrice: BigNumber.from('200'),
    bumpedPrice: BigNumber.from('320'),
    coverAmountInNXM: parseEther('12000'),
    poolCapacityBeforePercentage: BigNumber.from('480'), // 4.80%
    premium: parseEther('240.00'),
  },
  {
    timeSinceLastBuy: BigNumber.from(daysToSeconds(2)),
    basePrice: BigNumber.from('220'),
    bumpedPrice: BigNumber.from('340'),
    coverAmountInNXM: parseEther('12000'),
    poolCapacityBeforePercentage: BigNumber.from('2880'), // 28.80%
    premium: parseEther('264.00'),
  },
  {
    timeSinceLastBuy: BigNumber.from(daysToSeconds(5)),
    basePrice: BigNumber.from('200'),
    bumpedPrice: BigNumber.from('320'),
    coverAmountInNXM: parseEther('12000'),
    poolCapacityBeforePercentage: BigNumber.from('5280'), // 52.80%
    premium: parseEther('240.00'),
  },
  {
    timeSinceLastBuy: BigNumber.from(daysToSeconds(2)),
    basePrice: BigNumber.from('220'),
    bumpedPrice: BigNumber.from('300'),
    coverAmountInNXM: parseEther('8000'),
    poolCapacityBeforePercentage: BigNumber.from('7680'), // 76.80%
    premium: parseEther('176.00'),
  },
  {
    timeSinceLastBuy: BigNumber.from(daysToSeconds(4)),
    basePrice: BigNumber.from('200'),
    bumpedPrice: BigNumber.from('224'),
    coverAmountInNXM: parseEther('2400'),
    poolCapacityBeforePercentage: BigNumber.from('9280'), // 92.80%
    premium: parseEther('48.00'),
  },
];

const spreadsheetStartTime = new Date('2020-04-10 00:00:00').getTime() / 1000;
const totalCapacityInNxm = parseEther('50000');

describe('calculatePremium', function () {
  it('should calculate premium on multiple cover buys over time, based on pre-defined numbers', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts } = fixture;
    const { NXM_PER_ALLOCATION_UNIT, PRICE_BUMP_RATIO, PRICE_CHANGE_PER_DAY, TARGET_PRICE_DENOMINATOR } =
      fixture.config;

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
      const expectedBasePremium = calculateBasePremium(amount, expectedBasePrice, period, fixture.config);
      const expectedPriceBump = calculatePriceBump(amount, PRICE_BUMP_RATIO, totalCapacity, NXM_PER_ALLOCATION_UNIT);
      const expectedBumpedPrice = expectedBasePrice.add(expectedPriceBump);
      const expectedPremium = expectedBasePremium;
      const expectedPoolCapacityBeforePercentage = initialCapacityUsed.mul(10000).div(totalCapacity);

      // cross-check spreadsheet vs js
      expect(expectedBasePrice).to.be.equal(spreadsheetItem.basePrice);
      expect(expectedBumpedPrice).to.be.equal(spreadsheetItem.bumpedPrice);
      expect(expectedPremium).to.be.equal(spreadsheetItem.premium);
      expect(expectedPoolCapacityBeforePercentage).to.be.equal(spreadsheetItem.poolCapacityBeforePercentage);

      // calculate premium using the contract function
      const [actualPremium, updatedProduct] = await stakingProducts.calculatePremium(
        product,
        period,
        allocationAmount,
        totalCapacity,
        product.targetPrice,
        currentTime,
        NXM_PER_ALLOCATION_UNIT,
        TARGET_PRICE_DENOMINATOR,
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
    const fixture = await loadFixture(setup);
    const { stakingProducts } = fixture;
    let { timestamp } = await ethers.provider.getBlock('latest');
    timestamp = BigNumber.from(timestamp);
    const { NXM_PER_ALLOCATION_UNIT, TARGET_PRICE_DENOMINATOR } = fixture.config;
    const stakedProduct = { ...stakedProductTemplate, bumpedPriceUpdateTime: timestamp };
    const period = BigNumber.from(0);
    const coverAmountRaw = parseEther('100');
    const coverAmount = divCeil(coverAmountRaw, NXM_PER_ALLOCATION_UNIT);

    const totalCapacity = parseEther('100');

    const { premium } = await stakingProducts.calculatePremium(
      stakedProduct,
      period,
      coverAmount,
      totalCapacity,
      stakedProduct.targetPrice,
      timestamp,
      NXM_PER_ALLOCATION_UNIT,
      TARGET_PRICE_DENOMINATOR,
    );

    expect(premium).to.be.equal(0);
  });

  it('should calculate the premium correctly when cover amount is equal to total capacity', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts } = fixture;
    const { NXM_PER_ALLOCATION_UNIT, TARGET_PRICE_DENOMINATOR } = fixture.config;

    const timestamp = 0;
    const stakedProduct = { ...stakedProductTemplate, bumpedPriceUpdateTime: timestamp };
    const period = daysToSeconds(365);

    const coverAmount = BigNumber.from(2).pow(64);
    const allocationAmount = divCeil(coverAmount, NXM_PER_ALLOCATION_UNIT);

    const totalCapacity = allocationAmount;

    const { premium: actualPremium } = await stakingProducts.calculatePremium(
      stakedProduct,
      period,
      allocationAmount,
      totalCapacity,
      stakedProduct.targetPrice,
      timestamp,
      NXM_PER_ALLOCATION_UNIT,
      TARGET_PRICE_DENOMINATOR,
    );

    const expectedBasePrice = calculateBasePrice(timestamp, stakedProduct, fixture.config.PRICE_CHANGE_PER_DAY);
    const expectedBasePremium = calculateBasePremium(coverAmount, expectedBasePrice, period, fixture.config);

    expect(actualPremium).to.be.equal(expectedBasePremium);
  });

  it('should calculate 0 premium for 0 cover amount', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts } = fixture;
    const { NXM_PER_ALLOCATION_UNIT, TARGET_PRICE_DENOMINATOR } = fixture.config;
    const timestamp = 0;
    const stakedProduct = { ...stakedProductTemplate, bumpedPriceUpdateTime: timestamp };
    const period = daysToSeconds(365);
    const coverAmount = 0;
    const totalCapacity = BigNumber.from(100);

    const { premium } = await stakingProducts.calculatePremium(
      stakedProduct,
      period,
      coverAmount,
      totalCapacity,
      stakedProduct.targetPrice,
      timestamp,
      NXM_PER_ALLOCATION_UNIT,
      TARGET_PRICE_DENOMINATOR,
    );

    expect(premium).to.be.equal(0);
  });

  it('should calculate the correct premium when the coverAmount is 1 wei', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts } = fixture;
    const { NXM_PER_ALLOCATION_UNIT, TARGET_PRICE_DENOMINATOR } = fixture.config;
    const timestamp = 0;
    const stakedProduct = { ...stakedProductTemplate, bumpedPriceUpdateTime: timestamp };

    const period = daysToSeconds(365);
    const coverAmount = BigNumber.from(1);
    const allocationAmount = divCeil(coverAmount, NXM_PER_ALLOCATION_UNIT);

    const totalCapacity = allocationAmount.mul(100);

    const expectedBasePrice = calculateBasePrice(timestamp, stakedProduct, fixture.config.PRICE_CHANGE_PER_DAY);
    const expectedBasePremium = calculateBasePremium(coverAmount, expectedBasePrice, period, fixture.config);

    const { premium: actualPremium } = await stakingProducts.calculatePremium(
      stakedProduct,
      period,
      allocationAmount,
      totalCapacity,
      stakedProduct.targetPrice,
      timestamp,
      NXM_PER_ALLOCATION_UNIT,
      TARGET_PRICE_DENOMINATOR,
    );

    expect(actualPremium).to.be.equal(expectedBasePremium);
  });

  it('should correctly calculate premium', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts } = fixture;
    const { NXM_PER_ALLOCATION_UNIT, TARGET_PRICE_DENOMINATOR } = fixture.config;

    const timestamp = 0;
    const stakedProduct = { ...stakedProductTemplate, bumpedPriceUpdateTime: timestamp };

    const period = daysToSeconds(365);
    const coverAmount = parseEther('1');
    const allocationAmount = divCeil(coverAmount, NXM_PER_ALLOCATION_UNIT);

    const totalCapacity = coverAmount.mul(100);

    const expectedBasePrice = calculateBasePrice(timestamp, stakedProduct, fixture.config.PRICE_CHANGE_PER_DAY);
    const expectedBasePremium = calculateBasePremium(coverAmount, expectedBasePrice, period, fixture.config);

    const { premium: actualPremium } = await stakingProducts.calculatePremium(
      stakedProduct,
      period,
      allocationAmount,
      totalCapacity,
      stakedProduct.targetPrice,
      timestamp,
      NXM_PER_ALLOCATION_UNIT,
      TARGET_PRICE_DENOMINATOR,
    );

    expect(actualPremium).to.be.equal(expectedBasePremium);
  });

  it('should revert with divide by 0 panic, when totalCapacity is zero', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts } = fixture;
    const { NXM_PER_ALLOCATION_UNIT, TARGET_PRICE_DENOMINATOR } = fixture.config;

    const timestamp = 0;
    const stakedProduct = { ...stakedProductTemplate, bumpedPriceUpdateTime: timestamp };

    const period = daysToSeconds(365);
    const coverAmount = parseEther('4321');
    const allocationAmount = divCeil(coverAmount, NXM_PER_ALLOCATION_UNIT);

    const totalCapacity = BigNumber.from(0);

    await expect(
      stakingProducts.calculatePremium(
        stakedProduct,
        period,
        allocationAmount,
        totalCapacity,
        stakedProduct.targetPrice,
        timestamp,
        NXM_PER_ALLOCATION_UNIT,
        TARGET_PRICE_DENOMINATOR,
      ),
    ).to.be.revertedWithPanic(DIVIDE_BY_ZERO);
  });

  it('should correctly calculate fixed price premium', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts } = fixture;
    const { NXM_PER_ALLOCATION_UNIT, TARGET_PRICE_DENOMINATOR } = fixture.config;

    const period = daysToSeconds(182.5);
    const coverAmount = parseEther('4321');
    const allocationAmount = divCeil(coverAmount, NXM_PER_ALLOCATION_UNIT);

    const expectedBasePrice = BigNumber.from('500'); // 5%
    const expectedFixedPricePremium = calculateBasePremium(coverAmount, expectedBasePrice, period, fixture.config);

    const actualFixedPricePremium = await stakingProducts.calculateFixedPricePremium(
      allocationAmount,
      period,
      expectedBasePrice,
      NXM_PER_ALLOCATION_UNIT,
      TARGET_PRICE_DENOMINATOR,
    );

    expect(actualFixedPricePremium).to.be.equal(expectedFixedPricePremium);
  });
});

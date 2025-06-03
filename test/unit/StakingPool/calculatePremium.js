const { expect } = require('chai');
const { ethers } = require('hardhat');
const { calculateBasePrice, calculateBasePremium, calculatePriceBump } = require('./helpers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

const { daysToSeconds } = require('../utils').helpers;
const { divCeil } = require('../utils').bnMath;
const { DIVIDE_BY_ZERO } = require('../utils').errors;

const { parseEther } = ethers;

const stakedProductTemplate = {
  lastEffectiveWeight: 50n,
  targetWeight: 70n, // 70%
  targetPrice: 200n, // 2%
  bumpedPrice: 200n, // 2%
  bumpedPriceUpdateTime: 0n,
};

const spreadsheet = [
  {
    timeSinceLastBuy: BigInt(daysToSeconds(183)),
    basePrice: 200n,
    bumpedPrice: 224n,
    coverAmountInNXM: parseEther('2400'),
    poolCapacityBeforePercentage: 0n,
    premium: parseEther('48'),
  },
  {
    timeSinceLastBuy: BigInt(daysToSeconds(1)),
    basePrice: 200n,
    bumpedPrice: 320n,
    coverAmountInNXM: parseEther('12000'),
    poolCapacityBeforePercentage: 480n, // 4.80%
    premium: parseEther('240.00'),
  },
  {
    timeSinceLastBuy: BigInt(daysToSeconds(2)),
    basePrice: 220n,
    bumpedPrice: 340n,
    coverAmountInNXM: parseEther('12000'),
    poolCapacityBeforePercentage: 2880n, // 28.80%
    premium: parseEther('264.00'),
  },
  {
    timeSinceLastBuy: BigInt(daysToSeconds(5)),
    basePrice: 200n,
    bumpedPrice: 320n,
    coverAmountInNXM: parseEther('12000'),
    poolCapacityBeforePercentage: 5280n, // 52.80%
    premium: parseEther('240.00'),
  },
  {
    timeSinceLastBuy: BigInt(daysToSeconds(2)),
    basePrice: 220n,
    bumpedPrice: 300n,
    coverAmountInNXM: parseEther('8000'),
    poolCapacityBeforePercentage: 7680n, // 76.80%
    premium: parseEther('176.00'),
  },
  {
    timeSinceLastBuy: BigInt(daysToSeconds(4)),
    basePrice: 200n,
    bumpedPrice: 224n,
    coverAmountInNXM: parseEther('2400'),
    poolCapacityBeforePercentage: 9280n, // 92.80%
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

    let initialCapacityUsed = 0n;
    let currentTime = BigInt(spreadsheetStartTime);
    let product = { ...stakedProductTemplate, bumpedPriceUpdateTime: currentTime };

    for (const spreadsheetItem of spreadsheet) {
      // advance time
      currentTime = currentTime + spreadsheetItem.timeSinceLastBuy;

      const amount = spreadsheetItem.coverAmountInNXM;
      const allocationAmount = divCeil(amount, NXM_PER_ALLOCATION_UNIT);

      // js calculated values
      const expectedBasePrice = calculateBasePrice(currentTime, product, PRICE_CHANGE_PER_DAY);
      const expectedBasePremium = calculateBasePremium(amount, expectedBasePrice, period, fixture.config);
      const expectedPriceBump = calculatePriceBump(amount, PRICE_BUMP_RATIO, totalCapacity, NXM_PER_ALLOCATION_UNIT);
      const expectedBumpedPrice = expectedBasePrice + expectedPriceBump;
      const expectedPremium = expectedBasePremium;
      const expectedPoolCapacityBeforePercentage = (initialCapacityUsed * 10000n) / totalCapacity;

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
      initialCapacityUsed = initialCapacityUsed + allocationAmount;
    }
  });

  it('should return 0 premium when period is 0', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts } = fixture;
    let { timestamp } = await ethers.provider.getBlock('latest');
    timestamp = BigInt(timestamp);
    const { NXM_PER_ALLOCATION_UNIT, TARGET_PRICE_DENOMINATOR } = fixture.config;
    const stakedProduct = { ...stakedProductTemplate, bumpedPriceUpdateTime: timestamp };
    const period = BigInt(0);
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

    const timestamp = 0n;
    const stakedProduct = { ...stakedProductTemplate, bumpedPriceUpdateTime: timestamp };
    const period = daysToSeconds(365);

    const coverAmount = 2n ** 64n;
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
    const timestamp = 0n;
    const stakedProduct = { ...stakedProductTemplate, bumpedPriceUpdateTime: timestamp };
    const period = daysToSeconds(365);
    const coverAmount = 0n;
    const totalCapacity = BigInt(100);

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
    const timestamp = 0n;
    const stakedProduct = { ...stakedProductTemplate, bumpedPriceUpdateTime: timestamp };

    const period = daysToSeconds(365);
    const coverAmount = BigInt(1);
    const allocationAmount = divCeil(coverAmount, NXM_PER_ALLOCATION_UNIT);

    const totalCapacity = allocationAmount * BigInt(100);

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

    const timestamp = 0n;
    const stakedProduct = { ...stakedProductTemplate, bumpedPriceUpdateTime: timestamp };

    const period = daysToSeconds(365);
    const coverAmount = parseEther('1');
    const allocationAmount = divCeil(coverAmount, NXM_PER_ALLOCATION_UNIT);

    const totalCapacity = coverAmount * BigInt(100);

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

    const timestamp = 0n;
    const stakedProduct = { ...stakedProductTemplate, bumpedPriceUpdateTime: timestamp };

    const period = daysToSeconds(365);
    const coverAmount = parseEther('4321');
    const allocationAmount = divCeil(coverAmount, NXM_PER_ALLOCATION_UNIT);

    const totalCapacity = 0n;

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

    const expectedBasePrice = 500n; // 5%
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

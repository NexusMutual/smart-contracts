const { expect } = require('chai');
const { ethers } = require('hardhat');
const { parseEther } = ethers.utils;
const { BigNumber } = ethers;
const {
  calculateSurgePremiums,
  calculateBasePrice,
  divCeil,
  calculateFixedPricePremium,
  calculatePriceBump,
} = require('./helpers');
const { daysToSeconds } = require('../../../lib/helpers');

describe('calculatePremium', function () {
  // If an arithmetic operation results in underflow or overflow outside of an unchecked { ... } block.
  const UNDER_OR_OVERFLOW = 0x11;
  // If you divide or modulo by zero (e.g. 5 / 0 or 23 % 0).
  const DIVIDE_BY_ZERO = 0x12;

  const stakedProductTemplate = {
    lastEffectiveWeight: BigNumber.from(50),
    targetWeight: BigNumber.from(70), // 70%
    targetPrice: BigNumber.from(200), // 2%
    nextPrice: BigNumber.from(200), // 2%
    nextPriceUpdateTime: BigNumber.from(0),
  };

  it('should calculate premium on multiple cover buys over time, based on pre-defined numbers', async function () {
    const { stakingPool } = this;
    let { timestamp } = await ethers.provider.getBlock('latest');
    timestamp = BigNumber.from(timestamp);
    const { NXM_PER_ALLOCATION_UNIT, PRICE_BUMP_RATIO, PRICE_CHANGE_PER_DAY, INITIAL_PRICE_DENOMINATOR } = this.config;
    let stakedProduct = { ...stakedProductTemplate, nextPriceUpdateTime: timestamp };
    const period = daysToSeconds(1);
    const totalCapacity = divCeil(parseEther('50000'), NXM_PER_ALLOCATION_UNIT);

    // 1st cover buy
    {
      const coverAmountRaw = parseEther('2400');
      const coverAmount = divCeil(coverAmountRaw, NXM_PER_ALLOCATION_UNIT);
      const initialCapacityUsed = BigNumber.from(0);
      const basePrice = calculateBasePrice(timestamp, stakedProduct, PRICE_CHANGE_PER_DAY);
      expect(basePrice).to.be.equal(200);
      const priceBump = calculatePriceBump(coverAmount, PRICE_BUMP_RATIO, totalCapacity);

      const expectedPremiun = calculateFixedPricePremium(
        coverAmount,
        period,
        basePrice,
        NXM_PER_ALLOCATION_UNIT,
        INITIAL_PRICE_DENOMINATOR,
      );
      const [premium, product] = await stakingPool.calculatePremium(
        stakedProduct,
        period,
        coverAmount,
        initialCapacityUsed,
        totalCapacity,
        stakedProduct.targetPrice,
        timestamp,
      );
      expect(premium).to.be.equal(coverAmountRaw.mul(basePrice).div(INITIAL_PRICE_DENOMINATOR).div(365));
      expect(premium).to.be.equal(expectedPremiun);
      expect(premium).to.be.equal(parseEther('48').div(365));
      expect(product.nextPrice).to.be.equal(basePrice.add(priceBump));
      expect(product.nextPriceUpdateTime).to.be.equal(timestamp);
      stakedProduct = product;
    }
    // 2nd cover buy
    {
      timestamp = timestamp.add(daysToSeconds(3));
      const coverAmountRaw = parseEther('12000');
      const coverAmount = divCeil(coverAmountRaw, NXM_PER_ALLOCATION_UNIT);
      const initialCapacityUsed = BigNumber.from(totalCapacity.mul(48).div(1000)); // 4.8% used
      const basePrice = calculateBasePrice(timestamp, stakedProduct, PRICE_CHANGE_PER_DAY);
      expect(basePrice).to.be.equal(200);
      const priceBump = calculatePriceBump(coverAmount, PRICE_BUMP_RATIO, totalCapacity);

      const expectedPremiun = calculateFixedPricePremium(
        coverAmount,
        period,
        basePrice,
        NXM_PER_ALLOCATION_UNIT,
        INITIAL_PRICE_DENOMINATOR,
      );
      const [premium, product] = await stakingPool.calculatePremium(
        stakedProduct,
        period,
        coverAmount,
        initialCapacityUsed,
        totalCapacity,
        stakedProduct.targetPrice,
        timestamp,
      );
      expect(premium).to.be.equal(coverAmountRaw.mul(basePrice).div(INITIAL_PRICE_DENOMINATOR).div(365));
      expect(premium).to.be.equal(expectedPremiun);
      expect(product.nextPrice).to.be.equal(basePrice.add(priceBump));
      expect(premium).to.be.equal(parseEther('240').div(365));
      expect(product.nextPriceUpdateTime).to.be.equal(timestamp);
      stakedProduct = product;
    }
    // 3rd cover buy
    {
      timestamp = timestamp.add(daysToSeconds(5));
      const coverAmountRaw = parseEther('12000');
      const coverAmount = divCeil(coverAmountRaw, NXM_PER_ALLOCATION_UNIT);
      const initialCapacityUsed = BigNumber.from(totalCapacity.mul(288).div(1000)); // 28.8% used
      const basePrice = calculateBasePrice(timestamp, stakedProduct, PRICE_CHANGE_PER_DAY);
      expect(basePrice).to.be.equal(430);
      const priceBump = calculatePriceBump(coverAmount, PRICE_BUMP_RATIO, totalCapacity);

      const expectedPremiun = calculateFixedPricePremium(
        coverAmount,
        period,
        basePrice,
        NXM_PER_ALLOCATION_UNIT,
        INITIAL_PRICE_DENOMINATOR,
      );
      const [premium, product] = await stakingPool.calculatePremium(
        stakedProduct,
        period,
        coverAmount,
        initialCapacityUsed,
        totalCapacity,
        stakedProduct.targetPrice,
        timestamp,
      );
      expect(premium).to.be.equal(coverAmountRaw.mul(basePrice).div(INITIAL_PRICE_DENOMINATOR).div(365));
      expect(premium).to.be.equal(expectedPremiun);
      expect(premium).to.be.equal(parseEther('516').div(365));
      expect(product.nextPrice).to.be.equal(basePrice.add(priceBump));
      expect(product.nextPriceUpdateTime).to.be.equal(timestamp);
      stakedProduct = product;
    }
    // 4th cover buy
    {
      timestamp = timestamp.add(daysToSeconds(5));
      const coverAmountRaw = parseEther('12000');
      const coverAmount = divCeil(coverAmountRaw, NXM_PER_ALLOCATION_UNIT);
      const initialCapacityUsed = BigNumber.from(totalCapacity.mul(528).div(1000)); // 52.8% used
      const basePrice = calculateBasePrice(timestamp, stakedProduct, PRICE_CHANGE_PER_DAY);
      expect(basePrice).to.be.equal(660);
      const priceBump = calculatePriceBump(coverAmount, PRICE_BUMP_RATIO, totalCapacity);
      expect(priceBump.add(basePrice)).to.be.equal(1140);

      const expectedPremiun = calculateFixedPricePremium(
        coverAmount,
        period,
        basePrice,
        NXM_PER_ALLOCATION_UNIT,
        INITIAL_PRICE_DENOMINATOR,
      );
      const [premium, product] = await stakingPool.calculatePremium(
        stakedProduct,
        period,
        coverAmount,
        initialCapacityUsed,
        totalCapacity,
        stakedProduct.targetPrice,
        timestamp,
      );
      expect(premium).to.be.equal(coverAmountRaw.mul(basePrice).div(INITIAL_PRICE_DENOMINATOR).div(365));
      expect(premium).to.be.equal(expectedPremiun);
      expect(premium).to.be.equal(parseEther('792').div(365));
      expect(product.nextPrice).to.be.equal(basePrice.add(priceBump));
      expect(product.nextPriceUpdateTime).to.be.equal(timestamp);
      stakedProduct = product;
    }
    // 5th cover buy
    {
      timestamp = timestamp.add(daysToSeconds(15));
      const coverAmountRaw = parseEther('8000');
      const coverAmount = divCeil(coverAmountRaw, NXM_PER_ALLOCATION_UNIT);
      const initialCapacityUsed = BigNumber.from(totalCapacity.mul(768).div(1000)); // 76.8% used
      const basePrice = calculateBasePrice(timestamp, stakedProduct, PRICE_CHANGE_PER_DAY);
      expect(basePrice).to.be.equal(390);
      const priceBump = calculatePriceBump(coverAmount, PRICE_BUMP_RATIO, totalCapacity);
      expect(priceBump.add(basePrice)).to.be.equal(710);

      // calculate surge premium
      const { surgePremiumPerYear, surgePremiumSkipped } = calculateSurgePremiums(
        coverAmountRaw,
        initialCapacityUsed,
        totalCapacity,
        this.config,
      );
      const [premium, product] = await stakingPool.calculatePremium(
        stakedProduct,
        period,
        coverAmount,
        initialCapacityUsed,
        totalCapacity,
        stakedProduct.targetPrice,
        timestamp,
      );
      const expectedPremium = coverAmountRaw.mul(basePrice).div(INITIAL_PRICE_DENOMINATOR).div(365);
      expect(surgePremiumSkipped).to.be.equal(0);
      expect(premium).to.be.equal(expectedPremium.add(divCeil(surgePremiumPerYear, 365)));
      expect(expectedPremium).to.be.equal(parseEther('312').div(365));
      expect(surgePremiumPerYear).to.be.equal(parseEther('392').div(10));
      expect(product.nextPrice).to.be.equal(basePrice.add(priceBump));
      expect(product.nextPriceUpdateTime).to.be.equal(timestamp);
      stakedProduct = product;
    }
    // 6th cover buy
    {
      timestamp = timestamp.add(daysToSeconds(10));
      const coverAmountRaw = parseEther('2400');
      const coverAmount = divCeil(coverAmountRaw, NXM_PER_ALLOCATION_UNIT);
      const initialCapacityUsed = BigNumber.from(totalCapacity.mul(928).div(1000)); // 92.8% used
      const basePrice = calculateBasePrice(timestamp, stakedProduct, PRICE_CHANGE_PER_DAY);
      expect(basePrice).to.be.equal(210);
      const priceBump = calculatePriceBump(coverAmount, PRICE_BUMP_RATIO, totalCapacity);
      expect(priceBump.add(basePrice)).to.be.equal(306);

      // calculate surge premium
      const { surgePremiumPerYear, surgePremiumSkipped } = calculateSurgePremiums(
        coverAmountRaw,
        initialCapacityUsed,
        totalCapacity,
        this.config,
      );
      const [premium, product] = await stakingPool.calculatePremium(
        stakedProduct,
        period,
        coverAmount,
        initialCapacityUsed,
        totalCapacity,
        stakedProduct.targetPrice,
        timestamp,
      );
      const expectedPremium = coverAmountRaw.mul(basePrice).div(INITIAL_PRICE_DENOMINATOR).div(365);
      expect(surgePremiumSkipped).to.be.eq(parseEther('3920').div(100)); // 39.2 NXM
      expect(surgePremiumPerYear).to.be.equal(parseEther('2888').div(10)); // 288.8 NXM
      expect(expectedPremium).to.be.equal(parseEther('5040').div(100).div(365)); // 50.4 NXM
      expect(premium).to.be.equal(parseEther('300').div(365));
      expect(premium).to.be.equal(
        expectedPremium.add(divCeil(surgePremiumPerYear, 365).sub(divCeil(surgePremiumSkipped, 365))),
      );
      expect(product.nextPrice).to.be.equal(basePrice.add(priceBump));
      expect(product.nextPriceUpdateTime).to.be.equal(timestamp);
    }
  });

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
    ).to.be.revertedWithPanic(UNDER_OR_OVERFLOW);
  });

  it('should calculate the premium correctly when cover amount is equal to total capacity', async function () {
    const { stakingPool } = this;
    const { timestamp } = await ethers.provider.getBlock('latest');
    const { INITIAL_PRICE_DENOMINATOR, NXM_PER_ALLOCATION_UNIT } = this.config;
    const stakedProduct = { ...stakedProductTemplate, nextPriceUpdateTime: timestamp };
    const period = daysToSeconds(365);
    const coverAmountRaw = BigNumber.from(2).pow(96);
    const coverAmount = divCeil(coverAmountRaw, NXM_PER_ALLOCATION_UNIT);
    const initialCapacityUsed = 0;
    const totalCapacity = coverAmount;

    const { premium: actualPremium } = await stakingPool.calculatePremium(
      stakedProduct,
      period,
      coverAmount,
      initialCapacityUsed,
      totalCapacity,
      stakedProduct.targetPrice,
      timestamp,
    );
    const { surgePremiumPerYear, surgePremiumSkipped } = calculateSurgePremiums(
      coverAmountRaw,
      initialCapacityUsed,
      totalCapacity,
      this.config,
    );

    const basePrice = calculateBasePrice(timestamp, stakedProduct, this.config.PRICE_CHANGE_PER_DAY);
    const basePremium = BigNumber.from(coverAmount.mul(NXM_PER_ALLOCATION_UNIT))
      .mul(basePrice)
      .div(INITIAL_PRICE_DENOMINATOR);
    const expectedPremium = basePremium.add(surgePremiumPerYear);
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

    const totalCapacity = coverAmount.mul(10);
    const surgeStartPoint = totalCapacity
      .mul(this.config.SURGE_THRESHOLD_RATIO)
      .div(this.config.SURGE_THRESHOLD_DENOMINATOR);
    const initialCapacityUsed = surgeStartPoint;

    const { premium: actualPremium } = await stakingPool.calculatePremium(
      stakedProduct,
      period,
      coverAmount,
      initialCapacityUsed,
      totalCapacity,
      stakedProduct.targetPrice,
      timestamp,
    );
    const { surgePremiumPerYear, surgePremiumSkipped } = calculateSurgePremiums(
      coverAmountRaw,
      initialCapacityUsed,
      totalCapacity,
      this.config,
    );

    const basePrice = calculateBasePrice(timestamp, stakedProduct, this.config.PRICE_CHANGE_PER_DAY);
    const basePremium = BigNumber.from(coverAmount.mul(NXM_PER_ALLOCATION_UNIT))
      .mul(basePrice)
      .div(INITIAL_PRICE_DENOMINATOR);
    const expectedPremium = basePremium.add(surgePremiumPerYear);
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

    const totalCapacity = coverAmount.mul(11);
    const surgeStartPoint = totalCapacity
      .mul(this.config.SURGE_THRESHOLD_RATIO)
      .div(this.config.SURGE_THRESHOLD_DENOMINATOR);
    const initialCapacityUsed = surgeStartPoint.add(10);

    const { premium: actualPremium } = await stakingPool.calculatePremium(
      stakedProduct,
      period,
      coverAmount,
      initialCapacityUsed,
      totalCapacity,
      stakedProduct.targetPrice,
      timestamp,
    );
    const { surgePremiumPerYear, surgePremiumSkipped } = calculateSurgePremiums(
      coverAmountRaw,
      initialCapacityUsed,
      totalCapacity,
      this.config,
    );
    const basePrice = calculateBasePrice(timestamp, stakedProduct, this.config.PRICE_CHANGE_PER_DAY);
    const basePremium = BigNumber.from(coverAmount.mul(NXM_PER_ALLOCATION_UNIT))
      .mul(basePrice)
      .div(INITIAL_PRICE_DENOMINATOR);
    const expectedPremium = basePremium.add(surgePremiumPerYear).sub(surgePremiumSkipped);
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
    const { timestamp } = await ethers.provider.getBlock('latest');
    const { INITIAL_PRICE_DENOMINATOR, NXM_PER_ALLOCATION_UNIT } = this.config;
    const stakedProduct = { ...stakedProductTemplate, nextPriceUpdateTime: timestamp };
    const period = daysToSeconds(365);
    const coverAmountRaw = 1;
    const coverAmount = divCeil(coverAmountRaw, NXM_PER_ALLOCATION_UNIT);

    const totalCapacity = coverAmount.mul(100);
    const initialCapacityUsed = 0;
    const basePrice = calculateBasePrice(timestamp, stakedProduct, this.config.PRICE_CHANGE_PER_DAY);
    const { premium: actualPremium } = await stakingPool.calculatePremium(
      stakedProduct,
      period,
      coverAmount,
      initialCapacityUsed,
      totalCapacity,
      stakedProduct.targetPrice,
      timestamp,
    );
    const { surgePremiumPerYear, surgePremiumSkipped } = calculateSurgePremiums(
      coverAmountRaw,
      initialCapacityUsed,
      totalCapacity,
      this.config,
    );
    const basePremium = BigNumber.from(coverAmount.mul(NXM_PER_ALLOCATION_UNIT))
      .mul(basePrice)
      .div(INITIAL_PRICE_DENOMINATOR);
    const expectedPremium = basePremium.add(surgePremiumPerYear);
    expect(surgePremiumPerYear).to.be.eq(0);
    expect(surgePremiumSkipped).to.be.eq(0);
    expect(actualPremium).to.be.equal(expectedPremium);
  });

  it('initialCapacityUsed < surgeStartPoint & finalCapacityUsed < surgeStartPoint', async function () {
    const { stakingPool } = this;
    const { timestamp } = await ethers.provider.getBlock('latest');
    const { INITIAL_PRICE_DENOMINATOR, NXM_PER_ALLOCATION_UNIT } = this.config;
    const stakedProduct = { ...stakedProductTemplate, nextPriceUpdateTime: timestamp };
    const period = daysToSeconds(365);
    const coverAmountRaw = parseEther('1');
    const coverAmount = divCeil(coverAmountRaw, NXM_PER_ALLOCATION_UNIT);

    const totalCapacity = coverAmount.mul(100);
    const initialCapacityUsed = 0;
    const basePrice = calculateBasePrice(timestamp, stakedProduct, this.config.PRICE_CHANGE_PER_DAY);
    const { premium: actualPremium } = await stakingPool.calculatePremium(
      stakedProduct,
      period,
      coverAmount,
      initialCapacityUsed,
      totalCapacity,
      stakedProduct.targetPrice,
      timestamp,
    );
    const { surgePremiumPerYear, surgePremiumSkipped } = calculateSurgePremiums(
      coverAmountRaw,
      initialCapacityUsed,
      totalCapacity,
      this.config,
    );
    const basePremium = BigNumber.from(coverAmount.mul(NXM_PER_ALLOCATION_UNIT))
      .mul(basePrice)
      .div(INITIAL_PRICE_DENOMINATOR);
    const expectedPremium = basePremium.add(surgePremiumPerYear);
    expect(surgePremiumPerYear).to.be.eq(0);
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
    const { premium: actualPremium } = await stakingPool.calculatePremium(
      stakedProduct,
      period,
      coverAmount,
      initialCapacityUsed,
      totalCapacity,
      stakedProduct.targetPrice,
      timestamp,
    );
    const { surgePremiumPerYear, surgePremiumSkipped } = calculateSurgePremiums(
      coverAmountRaw,
      initialCapacityUsed,
      totalCapacity,
      this.config,
    );
    const basePremium = BigNumber.from(coverAmount.mul(NXM_PER_ALLOCATION_UNIT))
      .mul(basePrice)
      .div(INITIAL_PRICE_DENOMINATOR);
    const expectedPremium = basePremium.add(surgePremiumPerYear);
    expect(surgePremiumPerYear).to.be.lt(coverAmountRaw.mul(20).div(100));
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
    ).to.be.revertedWithPanic(DIVIDE_BY_ZERO);
    await expect(
      stakingPool.calculatePremiumPerYear(basePrice, coverAmount, initialCapacityUsed, totalCapacity),
    ).to.be.revertedWithPanic(DIVIDE_BY_ZERO);
  });

  it('should correctly calculate fixed price premium', async function () {
    const { stakingPool } = this;
    const { timestamp } = await ethers.provider.getBlock('latest');
    const { INITIAL_PRICE_DENOMINATOR, NXM_PER_ALLOCATION_UNIT } = this.config;
    const stakedProduct = { ...stakedProductTemplate, nextPriceUpdateTime: timestamp };
    const period = daysToSeconds(182.5);
    const coverAmountRaw = parseEther('4321');
    const coverAmount = divCeil(coverAmountRaw, NXM_PER_ALLOCATION_UNIT);

    const totalCapacity = coverAmount.mul(1e6);
    const initialCapacityUsed = 0;
    const basePrice = calculateBasePrice(timestamp, stakedProduct, this.config.PRICE_CHANGE_PER_DAY);
    const { premium: actualPremium } = await stakingPool.calculatePremium(
      stakedProduct,
      period,
      coverAmount,
      initialCapacityUsed,
      totalCapacity,
      stakedProduct.targetPrice,
      timestamp,
    );
    const { surgePremiumPerYear } = calculateSurgePremiums(
      coverAmountRaw,
      initialCapacityUsed,
      totalCapacity,
      this.config,
    );

    const basePremium = BigNumber.from(coverAmount.mul(NXM_PER_ALLOCATION_UNIT))
      .mul(basePrice)
      .div(INITIAL_PRICE_DENOMINATOR);
    const expectedPremium = basePremium.add(surgePremiumPerYear).mul(period).div(daysToSeconds(365));

    const fixedPricePremium = await stakingPool.calculateFixedPricePremium(coverAmount, period, basePrice);
    const expectedFixedPricePremium = calculateFixedPricePremium(
      coverAmount,
      period,
      basePrice,
      NXM_PER_ALLOCATION_UNIT,
      INITIAL_PRICE_DENOMINATOR,
    );
    expect(fixedPricePremium, expectedFixedPricePremium);
    expect(fixedPricePremium).to.be.equal(actualPremium);
    expect(surgePremiumPerYear).to.be.equal(0);
    expect(actualPremium).to.be.equal(expectedPremium);
  });
});

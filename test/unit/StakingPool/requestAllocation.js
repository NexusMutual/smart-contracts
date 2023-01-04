const { expect } = require('chai');
const { ethers } = require('hardhat');
const {
  getCurrentTrancheId,
  calculateBasePrice,
  calculateSurgePremium,
  calculatePriceBump,
  divCeil,
  roundUpToNearestAllocationUnit,
  calculateBasePremium,
} = require('./helpers');

const { setNextBlockTime } = require('../utils').evm;
const { daysToSeconds } = require('../utils').helpers;

const { AddressZero, MaxUint256 } = ethers.constants;
const { parseEther } = ethers.utils;
const { BigNumber } = ethers;

describe('requestAllocation', function () {
  const periodInDays = 91.25;
  const periodsInYear = 365 / periodInDays;
  const coverId = 0;
  const productId = 0;
  const stakedNxmAmount = parseEther('50000');

  const buyCoverParamsTemplate = {
    owner: AddressZero,
    coverId: MaxUint256,
    productId: 0,
    coverAsset: 0, // ETH
    amount: parseEther('4800'),
    period: daysToSeconds(periodInDays),
    maxPremiumInAsset: parseEther('100'),
    paymentAsset: 0,
    payWithNXM: false,
    commissionRatio: 1,
    commissionDestination: AddressZero,
    ipfsData: 'ipfs data',
  };

  const coverProductTemplate = {
    productType: 1,
    yieldTokenAddress: AddressZero,
    coverAssets: 1111,
    initialPriceRatio: 2000, // 20%
    capacityReductionRatio: 0,
    useFixedPrice: false,
  };

  const productInitializationParams = [
    {
      productId: 0,
      weight: 100, // 1.00
      initialPrice: coverProductTemplate.initialPriceRatio,
      targetPrice: 200, // 2%}
    },
  ];

  beforeEach(async function () {
    const { stakingPool, cover } = this;
    const { defaultSender: manager } = this.accounts;
    const [staker] = this.accounts.members;
    const productId = 0;
    // Set global product and product type
    await cover.setProduct(coverProductTemplate, productId);
    await cover.setProductType({ claimMethod: 1, gracePeriod: daysToSeconds(7) }, productId);

    // Initialize staking pool
    const poolId = 0;
    const isPrivatePool = false;
    const ipfsDescriptionHash = 'Staking pool 1';
    const maxPoolFee = 10; // 10%
    const initialPoolFee = 7; // 7%

    await cover.initializeStaking(
      stakingPool.address,
      manager.address,
      isPrivatePool,
      initialPoolFee,
      maxPoolFee,
      productInitializationParams,
      poolId,
      ipfsDescriptionHash,
    );

    // Deposit into pool
    const amount = stakedNxmAmount;
    await stakingPool.connect(staker).depositTo(amount, (await getCurrentTrancheId()) + 4, poolId, staker.address);
  });

  async function setNextBlockDaysForward(days) {
    let { timestamp } = await ethers.provider.getBlock('latest');
    timestamp += daysToSeconds(days);
    await setNextBlockTime(timestamp);
  }

  it('should correctly calculate the premium and price for year long cover', async function () {
    const { stakingPool, cover } = this;
    const { GLOBAL_CAPACITY_RATIO, NXM_PER_ALLOCATION_UNIT, INITIAL_PRICE_DENOMINATOR } = this.config;

    const product = await stakingPool.products(productId);
    const initialPrice = BigNumber.from(coverProductTemplate.initialPriceRatio);
    expect(product.bumpedPrice).to.be.equal(initialPrice);

    const { totalCapacity } = await stakingPool.getActiveTrancheCapacities(
      buyCoverParamsTemplate.productId,
      GLOBAL_CAPACITY_RATIO,
      coverProductTemplate.capacityReductionRatio,
    );
    const expectedPremium = buyCoverParamsTemplate.amount.mul(initialPrice).div(INITIAL_PRICE_DENOMINATOR);
    const priceBump = calculatePriceBump(
      buyCoverParamsTemplate.amount,
      this.config.PRICE_BUMP_RATIO,
      totalCapacity,
      NXM_PER_ALLOCATION_UNIT,
    );

    // buy cover and check premium + new price
    const buyCoverParams = { ...buyCoverParamsTemplate, period: daysToSeconds(365) };
    await cover.allocateCapacity(buyCoverParams, coverId, stakingPool.address);

    const updatedProduct = await stakingPool.products(productId);
    expect(await cover.lastPremium()).to.be.equal(expectedPremium);
    expect(updatedProduct.bumpedPrice).to.be.equal(initialPrice.add(priceBump));
  });

  it('should correctly calculate the premium and price for a very small cover', async function () {
    const { stakingPool, cover } = this;
    const { GLOBAL_CAPACITY_RATIO, NXM_PER_ALLOCATION_UNIT, INITIAL_PRICE_DENOMINATOR } = this.config;

    const amount = BigNumber.from(1);
    const initialPrice = BigNumber.from(coverProductTemplate.initialPriceRatio);

    const { totalCapacity } = await stakingPool.getActiveTrancheCapacities(
      buyCoverParamsTemplate.productId,
      GLOBAL_CAPACITY_RATIO,
      coverProductTemplate.capacityReductionRatio,
    );
    const priceBump = calculatePriceBump(amount, this.config.PRICE_BUMP_RATIO, totalCapacity, NXM_PER_ALLOCATION_UNIT);

    {
      // buy cover and check premium + new price
      const buyCoverParams = { ...buyCoverParamsTemplate, amount };
      await cover.allocateCapacity(buyCoverParams, coverId, stakingPool.address);

      const product = await stakingPool.products(productId);

      // cover purchases below NXM_PER_ALLOCATION_UNIT are charged at NXM_PER_ALLOCATION_UNIT rate
      expect(await cover.lastPremium()).to.be.equal(
        roundUpToNearestAllocationUnit(amount, NXM_PER_ALLOCATION_UNIT)
          .mul(initialPrice)
          .div(INITIAL_PRICE_DENOMINATOR)
          .div(periodsInYear),
      );
      expect(product.bumpedPrice).to.be.equal(initialPrice.add(priceBump));
    }
  });

  it('should correctly calculate the premium using the initial price', async function () {
    const { stakingPool, cover } = this;
    const { GLOBAL_CAPACITY_RATIO, NXM_PER_ALLOCATION_UNIT, INITIAL_PRICE_DENOMINATOR } = this.config;

    const product = await stakingPool.products(productId);
    const initialPrice = BigNumber.from(coverProductTemplate.initialPriceRatio);
    expect(product.bumpedPrice).to.be.equal(initialPrice);

    const { totalCapacity } = await stakingPool.getActiveTrancheCapacities(
      buyCoverParamsTemplate.productId,
      GLOBAL_CAPACITY_RATIO,
      coverProductTemplate.capacityReductionRatio,
    );
    const expectedPremium = buyCoverParamsTemplate.amount
      .mul(initialPrice)
      .div(INITIAL_PRICE_DENOMINATOR)
      .div(periodsInYear);
    const priceBump = calculatePriceBump(
      buyCoverParamsTemplate.amount,
      this.config.PRICE_BUMP_RATIO,
      totalCapacity,
      NXM_PER_ALLOCATION_UNIT,
    );

    {
      // buy cover and check premium + new price
      await cover.allocateCapacity({ ...buyCoverParamsTemplate }, coverId, stakingPool.address);

      const product = await stakingPool.products(productId);
      expect(await cover.lastPremium()).to.be.equal(expectedPremium);
      expect(product.bumpedPrice).to.be.equal(initialPrice.add(priceBump));
    }
  });

  it('should decrease price by PRICE_CHANGE_PER_DAY until it reaches product target price', async function () {
    const { stakingPool, cover } = this;
    const { PRICE_CHANGE_PER_DAY, INITIAL_PRICE_DENOMINATOR } = this.config;
    const initialPrice = coverProductTemplate.initialPriceRatio;
    const daysToMove = 1;
    const expectedPrice = initialPrice - PRICE_CHANGE_PER_DAY * daysToMove;
    await setNextBlockDaysForward(daysToMove);
    await cover.allocateCapacity({ ...buyCoverParamsTemplate }, coverId, stakingPool.address);
    const expectedPremium = buyCoverParamsTemplate.amount
      .mul(expectedPrice)
      .div(INITIAL_PRICE_DENOMINATOR)
      .div(periodsInYear);
    expect(await cover.lastPremium()).to.be.equal(expectedPremium);
    {
      const product = await stakingPool.products(productId);
      const daysToMove = 50;
      await setNextBlockDaysForward(daysToMove);
      await cover.allocateCapacity({ ...buyCoverParamsTemplate }, coverId, stakingPool.address);
      const expectedPremium = buyCoverParamsTemplate.amount
        .mul(product.targetPrice)
        .div(INITIAL_PRICE_DENOMINATOR)
        .div(periodsInYear);
      expect(await cover.lastPremium()).to.be.equal(expectedPremium);
    }
  });

  it('shouldnt underflow while expiring cover during allocate capacity', async function () {
    const { stakingPool, cover } = this;
    const { PRICE_CHANGE_PER_DAY, INITIAL_PRICE_DENOMINATOR } = this.config;
    const initialPrice = coverProductTemplate.initialPriceRatio;
    const daysToMove = 1;
    const expectedPrice = initialPrice - PRICE_CHANGE_PER_DAY * daysToMove;
    await setNextBlockDaysForward(daysToMove);
    await cover.allocateCapacity({ ...buyCoverParamsTemplate }, coverId, stakingPool.address);
    const expectedPremium = buyCoverParamsTemplate.amount
      .mul(expectedPrice)
      .div(INITIAL_PRICE_DENOMINATOR)
      .div(periodsInYear);
    expect(await cover.lastPremium()).to.be.equal(expectedPremium);
    {
      const product = await stakingPool.products(productId);
      const daysToMove = 100;
      await setNextBlockDaysForward(daysToMove);
      await cover.allocateCapacity({ ...buyCoverParamsTemplate }, coverId, stakingPool.address);
      const expectedPremium = buyCoverParamsTemplate.amount
        .mul(product.targetPrice)
        .div(INITIAL_PRICE_DENOMINATOR)
        .div(periodsInYear);
      expect(await cover.lastPremium()).to.be.equal(expectedPremium);
    }
  });

  it('should correctly calculate price when all coverage is bought in a single purchase', async function () {
    const { stakingPool, cover } = this;
    const [coverBuyer] = this.accounts.members;
    const { GLOBAL_CAPACITY_RATIO, PRICE_CHANGE_PER_DAY, NXM_PER_ALLOCATION_UNIT } = this.config;
    const GLOBAL_CAPACITY_DENOMINATOR = BigNumber.from(10000);

    const amount = stakedNxmAmount.mul(GLOBAL_CAPACITY_RATIO).div(GLOBAL_CAPACITY_DENOMINATOR);
    const buyCoverParams = { ...buyCoverParamsTemplate, amount };

    const initialCapacityUsed = BigNumber.from(0);
    const { totalCapacity } = await stakingPool.getActiveTrancheCapacities(
      buyCoverParamsTemplate.productId,
      GLOBAL_CAPACITY_RATIO,
      coverProductTemplate.capacityReductionRatio,
    );

    const product = await stakingPool.products(productId);
    const { timestamp } = await ethers.provider.getBlock('latest');

    // calculate premiums
    const expectedBasePrice = calculateBasePrice(timestamp, product, PRICE_CHANGE_PER_DAY);
    const expectedBasePremium = calculateBasePremium(amount, expectedBasePrice, buyCoverParams.period, this.config);

    const {
      surgePremium: expectedSurgePremium, // should be 0
      surgePremiumSkipped: expectedSurgePremiumSkipped,
    } = calculateSurgePremium(amount, initialCapacityUsed, totalCapacity, buyCoverParams.period, this.config);

    const actualPremium = await stakingPool.calculatePremium(
      product,
      buyCoverParams.period,
      divCeil(amount, NXM_PER_ALLOCATION_UNIT), // allocation amount
      0, // initialCapacityUsed
      totalCapacity,
      product.targetPrice, // targetPrice
      timestamp, // current block timestamp
    );

    const expectedPremium = expectedBasePremium.add(expectedSurgePremium);
    expect(actualPremium.premium).to.be.equal(expectedPremium);
    expect(expectedSurgePremiumSkipped).to.be.equal(0);

    await cover.connect(coverBuyer).allocateCapacity(buyCoverParams, coverId, stakingPool.address);

    // get active allocations
    const activeAllocations = await stakingPool.getActiveAllocations(productId);
    const totalActiveAllocations = activeAllocations.reduce(
      (acc, allocation) => acc.add(allocation),
      BigNumber.from(0),
    );

    expect(totalActiveAllocations).to.be.equal(totalCapacity);
    expect(await cover.lastPremium()).to.be.equal(expectedPremium);
  });

  it('should overflow uint32 tranche allocation when cover amount is too large', async function () {
    const { stakingPool, cover } = this;
    const [coverBuyer, staker] = this.accounts.members;
    const amount = BigNumber.from(2).pow(96).sub(1);
    const buyCoverParams = { ...buyCoverParamsTemplate, amount };

    await stakingPool.connect(staker).depositTo(
      amount,
      (await getCurrentTrancheId()) + 3, // trancheId
      0, // tokenID
      staker.address, // destination
    );

    await expect(
      cover.connect(coverBuyer).allocateCapacity(buyCoverParams, coverId, stakingPool.address),
    ).to.be.revertedWith("SafeCast: value doesn't fit in 32 bits");
  });
});

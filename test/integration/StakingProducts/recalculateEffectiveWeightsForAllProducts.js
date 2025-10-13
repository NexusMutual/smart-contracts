const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');

const { daysToSeconds } = require('../utils');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('../setup');
const { calculatePremium, getInternalPrice } = require('../../../lib/protocol');
const { roundUpToMultiple, divCeil } = require('../../../lib/helpers').BigIntMath;

const { parseEther } = ethers;
const { PoolAsset } = nexus.constants;

const ONE_NXM = parseEther('1');

const stakedProductParamTemplate = {
  productId: 1,
  recalculateEffectiveWeight: true,
  setTargetWeight: true,
  targetWeight: 100,
  setTargetPrice: true,
  targetPrice: 100,
};

const buyCoverFixture = (overrides = {}) => ({
  coverId: 0,
  owner: ethers.ZeroAddress,
  productId: 0,
  coverAsset: PoolAsset.ETH,
  amount: ethers.parseEther('1'),
  period: daysToSeconds(30),
  maxPremiumInAsset: ethers.MaxUint256,
  paymentAsset: PoolAsset.ETH,
  payWitNXM: false,
  commissionRatio: 0,
  commissionDestination: ethers.ZeroAddress,
  ipfsData: '',
  ...overrides,
});

describe('recalculateEffectiveWeightsForAllProducts', function () {
  it('recalculates effective weights when there is 0 activeStake and targetWeight = 5', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts } = fixture.contracts;
    const [manager] = fixture.accounts.stakingPoolManagers;

    const poolId = 1;
    const productId = 1;
    const targetWeight = 5;

    const productParams = { ...stakedProductParamTemplate, targetWeight };
    await stakingProducts.connect(manager).setProducts(poolId, [productParams]);
    await stakingProducts.recalculateEffectiveWeightsForAllProducts(poolId);

    const product = await stakingProducts.getProduct(poolId, productId);
    expect(product.lastEffectiveWeight).to.be.equal(targetWeight);
  });

  it('recalculates effective weights correctly when activeWeight > targetWeight', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts, cover, pool, ramm, tokenController } = fixture.contracts;
    const [, coverBuyer] = fixture.accounts.members;
    const [manager] = fixture.accounts.stakingPoolManagers;
    const { GLOBAL_CAPACITY_DENOMINATOR, CAPACITY_REDUCTION_DENOMINATOR, WEIGHT_DENOMINATOR, NXM_PER_ALLOCATION_UNIT } =
      fixture.config;

    const poolId = 1;
    const productId = 0;

    // setup product with an initial target weight of 10 in order to buy cover
    const initialTargetWeight = 10;
    const productParams = { ...stakedProductParamTemplate, productId, targetWeight: initialTargetWeight };
    await stakingProducts.connect(manager).setProducts(poolId, [productParams]);

    // Cover inputs for cover purchase used to increase activeWeight
    const coverAsset = PoolAsset.ETH;
    const period = daysToSeconds(30); // 30 days
    const amount = parseEther('1000');

    const latestTimestamp = await time.latest();
    const nextBlockTimestamp = latestTimestamp + 10;

    const product = await stakingProducts.getProduct(1, productId);
    const ethRate = await getInternalPrice(ramm, pool, tokenController, nextBlockTimestamp);
    const { premiumInAsset } = calculatePremium(
      amount,
      ethRate,
      period,
      product.bumpedPrice,
      NXM_PER_ALLOCATION_UNIT,
      coverAsset,
    );

    // Calculate expected active weight based on cover allocation and available capacity
    const coverAmountInNXM = roundUpToMultiple(divCeil(amount * ONE_NXM, ethRate), NXM_PER_ALLOCATION_UNIT);
    const coverAllocationAmount = coverAmountInNXM / NXM_PER_ALLOCATION_UNIT;

    // Calculate available capacity in allocation units
    const stakingPool = fixture.contracts.stakingPool1;
    const activeStake = await stakingPool.getActiveStake();
    const { _globalCapacityRatio, _defaultMinPriceRatio } = await cover.getGlobalCapacityAndPriceRatios();
    const availableCapacityRatio = CAPACITY_REDUCTION_DENOMINATOR - _defaultMinPriceRatio;
    const capacityMultiplier = _globalCapacityRatio * availableCapacityRatio;
    const capacityDenominator = GLOBAL_CAPACITY_DENOMINATOR * CAPACITY_REDUCTION_DENOMINATOR;
    const availableCapacity = (activeStake * capacityMultiplier) / capacityDenominator / NXM_PER_ALLOCATION_UNIT;

    // Expected active weight = allocation / capacity
    const expectedActiveWeight = (coverAllocationAmount * BigInt(WEIGHT_DENOMINATOR)) / availableCapacity;

    const buyCoverParams = buyCoverFixture({
      owner: await coverBuyer.getAddress(),
      productId,
      coverAsset,
      amount,
      period,
      maxPremiumInAsset: premiumInAsset,
      paymentAsset: coverAsset,
    });

    await time.setNextBlockTimestamp(nextBlockTimestamp);
    await cover
      .connect(coverBuyer)
      .buyCover(buyCoverParams, [{ poolId: 1, coverAmountInAsset: amount }], { value: premiumInAsset });

    const newTargetWeight = 0; // Must be < expectedActiveWeight (which is 1)
    expect(expectedActiveWeight).to.be.gt(newTargetWeight);

    const newProductParams = { ...stakedProductParamTemplate, targetWeight: newTargetWeight, productId };
    await stakingProducts.connect(manager).setProducts(poolId, [newProductParams]);
    await stakingProducts.recalculateEffectiveWeightsForAllProducts(poolId);

    const updatedProduct = await stakingProducts.getProduct(poolId, productId);
    expect(updatedProduct.lastEffectiveWeight).to.be.equal(expectedActiveWeight);
  });

  it('recalculates effective weights for 2 products when activeWeight > targetWeight', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts, cover, pool, ramm, tokenController } = fixture.contracts;
    const [, coverBuyer] = fixture.accounts.members;
    const [manager] = fixture.accounts.stakingPoolManagers;
    const { GLOBAL_CAPACITY_DENOMINATOR, CAPACITY_REDUCTION_DENOMINATOR, WEIGHT_DENOMINATOR, NXM_PER_ALLOCATION_UNIT } =
      fixture.config;

    const poolId = 1;
    const firstProductId = 0;
    const secondProductId = 1;

    // setup products with an initial target weight of 10 in order to buy cover
    const initialTargetWeight = 10;
    await stakingProducts.connect(manager).setProducts(poolId, [
      { ...stakedProductParamTemplate, productId: firstProductId, targetWeight: initialTargetWeight },
      { ...stakedProductParamTemplate, productId: secondProductId, targetWeight: initialTargetWeight },
    ]);

    const coverAsset = PoolAsset.ETH;
    const period = daysToSeconds(30); // 30 days

    let firstProductExpectedActiveWeight;
    {
      const productId = firstProductId;
      const amount = parseEther('1400');

      // Calculate expected active weight based on cover allocation and available capacity
      const nxmPriceInCoverAsset = await pool.getInternalTokenPriceInAsset(coverAsset);
      const coverAmountInNXM = roundUpToMultiple(
        divCeil(amount * ONE_NXM, nxmPriceInCoverAsset),
        NXM_PER_ALLOCATION_UNIT,
      );
      const coverAllocationAmount = coverAmountInNXM / NXM_PER_ALLOCATION_UNIT;

      // Calculate available capacity in allocation units
      const stakingPool = fixture.contracts.stakingPool1;
      const activeStake = await stakingPool.getActiveStake();
      const { _globalCapacityRatio, _defaultMinPriceRatio } = await cover.getGlobalCapacityAndPriceRatios();
      const availableCapacityRatio = CAPACITY_REDUCTION_DENOMINATOR - _defaultMinPriceRatio;
      const capacityMultiplier = _globalCapacityRatio * availableCapacityRatio;
      const capacityDenominator = GLOBAL_CAPACITY_DENOMINATOR * CAPACITY_REDUCTION_DENOMINATOR;
      const availableCapacity = (activeStake * capacityMultiplier) / capacityDenominator / NXM_PER_ALLOCATION_UNIT;

      // Expected active weight = allocation / capacity
      const expectedActiveWeight = (coverAllocationAmount * BigInt(WEIGHT_DENOMINATOR)) / availableCapacity;

      const currentTimestamp = await time.latest();
      const nextTimestamp = currentTimestamp + 10;
      const product = await stakingProducts.getProduct(1, productId);
      const ethRate = await getInternalPrice(ramm, pool, tokenController, nextTimestamp);

      const { premiumInAsset } = calculatePremium(
        amount,
        ethRate,
        period,
        product.bumpedPrice,
        NXM_PER_ALLOCATION_UNIT,
        coverAsset,
      );

      const buyCoverParams = buyCoverFixture({
        owner: await coverBuyer.getAddress(),
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: premiumInAsset,
        paymentAsset: coverAsset,
      });

      await time.setNextBlockTimestamp(nextTimestamp);
      await cover
        .connect(coverBuyer)
        .buyCover(buyCoverParams, [{ poolId: 1, coverAmountInAsset: amount }], { value: premiumInAsset });

      const targetWeight = 0; // Must be < expectedActiveWeight (which is 1)
      expect(expectedActiveWeight).to.be.gt(targetWeight);

      await stakingProducts
        .connect(manager)
        .setProducts(poolId, [{ ...stakedProductParamTemplate, targetWeight, productId }]);

      firstProductExpectedActiveWeight = expectedActiveWeight;
    }

    let secondProductExpectedActiveWeight;
    {
      const amount = parseEther('3500');
      const productId = secondProductId;

      // Calculate expected active weight based on cover allocation and available capacity
      const nxmPriceInCoverAsset = await pool.getInternalTokenPriceInAsset(coverAsset);
      const coverAmountInNXM = roundUpToMultiple(
        divCeil(amount * ONE_NXM, nxmPriceInCoverAsset),
        NXM_PER_ALLOCATION_UNIT,
      );
      const coverAllocationAmount = coverAmountInNXM / NXM_PER_ALLOCATION_UNIT;

      // Calculate available capacity in allocation units
      const stakingPool = fixture.contracts.stakingPool1;
      const activeStake = await stakingPool.getActiveStake();
      const { _globalCapacityRatio, _defaultMinPriceRatio } = await cover.getGlobalCapacityAndPriceRatios();
      const availableCapacityRatio = CAPACITY_REDUCTION_DENOMINATOR - _defaultMinPriceRatio;
      const capacityMultiplier = _globalCapacityRatio * availableCapacityRatio;
      const capacityDenominator = GLOBAL_CAPACITY_DENOMINATOR * CAPACITY_REDUCTION_DENOMINATOR;
      const availableCapacity = (activeStake * capacityMultiplier) / capacityDenominator / NXM_PER_ALLOCATION_UNIT;

      // Expected active weight = allocation / capacity
      const expectedActiveWeight = (coverAllocationAmount * BigInt(WEIGHT_DENOMINATOR)) / availableCapacity;

      const currentTimestamp2 = await time.latest();
      const nextTimestamp2 = currentTimestamp2 + 10;
      const product = await stakingProducts.getProduct(1, productId);
      const ethRate = await getInternalPrice(ramm, pool, tokenController, nextTimestamp2);

      const { premiumInAsset } = calculatePremium(
        amount,
        ethRate,
        period,
        product.bumpedPrice,
        NXM_PER_ALLOCATION_UNIT,
        coverAsset,
      );

      const buyCoverParams = buyCoverFixture({
        owner: await coverBuyer.getAddress(),
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: premiumInAsset,
        paymentAsset: coverAsset,
      });

      await time.setNextBlockTimestamp(nextTimestamp2);
      await cover
        .connect(coverBuyer)
        .buyCover(buyCoverParams, [{ poolId: 1, coverAmountInAsset: amount }], { value: premiumInAsset });

      const targetWeight = 2; // Must be < expectedActiveWeight (which is 5)
      expect(expectedActiveWeight).to.be.gt(targetWeight);

      await stakingProducts
        .connect(manager)
        .setProducts(poolId, [{ ...stakedProductParamTemplate, targetWeight, productId }]);

      secondProductExpectedActiveWeight = expectedActiveWeight;
    }

    await stakingProducts.recalculateEffectiveWeightsForAllProducts(poolId);

    const firstProduct = await stakingProducts.getProduct(poolId, firstProductId);
    expect(firstProduct.lastEffectiveWeight).to.be.equal(firstProductExpectedActiveWeight);

    const secondProduct = await stakingProducts.getProduct(poolId, secondProductId);
    expect(secondProduct.lastEffectiveWeight).to.be.equal(secondProductExpectedActiveWeight);
  });
});

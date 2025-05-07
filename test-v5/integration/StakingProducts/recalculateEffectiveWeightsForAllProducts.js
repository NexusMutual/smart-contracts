const { ethers } = require('hardhat');
const { expect } = require('chai');
const { BigNumber } = require('ethers');

const { calculateFirstTrancheId } = require('../utils/staking');
const { daysToSeconds } = require('../../../lib/helpers');
const { buyCover, ETH_ASSET_ID } = require('../utils/cover');
const { setNextBlockTime } = require('../utils').evm;
const { divCeil } = require('../utils').bnMath;
const { getInternalPrice } = require('../../utils/rammCalculations');
const { roundUpToNearestAllocationUnit } = require('../../unit/StakingPool/helpers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('../setup');

const { MaxUint256 } = ethers.constants;
const { parseEther } = ethers.utils;

const stakedProductParamTemplate = {
  productId: 1,
  recalculateEffectiveWeight: true,
  setTargetWeight: true,
  targetWeight: 100,
  setTargetPrice: true,
  targetPrice: 100,
};

const ONE_NXM = parseEther('1');
const ALLOCATION_UNITS_PER_NXM = 100;
const NXM_PER_ALLOCATION_UNIT = ONE_NXM.div(ALLOCATION_UNITS_PER_NXM);
const WEIGHT_DENOMINATOR = 100;
const GLOBAL_CAPACITY_DENOMINATOR = BigNumber.from(10000);
const CAPACITY_REDUCTION_DENOMINATOR = BigNumber.from(10000);

async function recalculateEffectiveWeightsForAllProductsSetup() {
  const fixture = await loadFixture(setup);
  const { tk: nxm, tc: tokenController } = fixture.contracts;
  await nxm.approve(tokenController.address, MaxUint256);

  return fixture;
}

describe('recalculateEffectiveWeightsForAllProducts', function () {
  it('recalculates effective weights when there is 0 activeStake and targetWeight = 5', async function () {
    const fixture = await loadFixture(recalculateEffectiveWeightsForAllProductsSetup);
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
    const fixture = await loadFixture(recalculateEffectiveWeightsForAllProductsSetup);
    const { DEFAULT_PRODUCTS } = fixture;
    const { stakingProducts, stakingPool1, cover, p1: pool, ra, tc, mcr } = fixture.contracts;
    const staker = fixture.accounts.defaultSender;
    const [, coverBuyer] = fixture.accounts.members;
    const [manager] = fixture.accounts.stakingPoolManagers;

    const poolId = 1;
    const productId = 1;

    const stakeAmount = parseEther('6000000');

    // setup product with an initial target weight of 10 in order to buy cover
    const initialTargetWeight = 10;
    const productParams = { ...stakedProductParamTemplate, productId, targetWeight: initialTargetWeight };
    await stakingProducts.connect(manager).setProducts(poolId, [productParams]);

    // stake
    const latestBlock = await ethers.provider.getBlock('latest');
    const firstActiveTrancheId = calculateFirstTrancheId(latestBlock, daysToSeconds(30), 0);
    await stakingPool1.connect(staker).depositTo(stakeAmount, firstActiveTrancheId + 5, 0, staker.address);

    // Cover inputs for cover purchase used to increase activeWeight
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const priceDenominator = 10000;
    const amount = parseEther('3000');

    const { timestamp } = latestBlock;
    // Compute expectedActiveWeight given how much the cover is worth in NXM and existing capacity
    const nxmPriceInCoverAsset = await getInternalPrice(ra, pool, tc, mcr, timestamp + 2);
    // NOTE: should be called before buyCover as buyCover execution will slightly adjust the price

    const coverAmountInNXM = roundUpToNearestAllocationUnit(
      divCeil(amount.mul(ONE_NXM), nxmPriceInCoverAsset),
      NXM_PER_ALLOCATION_UNIT,
    );
    const { _globalCapacityRatio, _defaultMinPriceRatio } = await cover.getGlobalCapacityAndPriceRatios();

    const expectedCapacity = stakeAmount
      .mul(_globalCapacityRatio)
      .mul(CAPACITY_REDUCTION_DENOMINATOR.sub(_defaultMinPriceRatio))
      .div(GLOBAL_CAPACITY_DENOMINATOR)
      .div(CAPACITY_REDUCTION_DENOMINATOR);
    const expectedActiveWeight = coverAmountInNXM.mul(WEIGHT_DENOMINATOR).div(expectedCapacity);

    await setNextBlockTime(timestamp + 2);
    // Buy Cover
    await buyCover({
      amount,
      productId,
      coverAsset,
      period,
      cover,
      coverBuyer,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      priceDenominator,
    });

    // make sure the new target weight we picked is lower than the currently expected weight
    const newTargetWeight = 1;
    expect(expectedActiveWeight).to.be.gt(newTargetWeight);

    const newProductParams = { ...stakedProductParamTemplate, targetWeight: newTargetWeight, productId };
    await stakingProducts.connect(manager).setProducts(poolId, [newProductParams]);
    await stakingProducts.recalculateEffectiveWeightsForAllProducts(poolId);

    const product = await stakingProducts.getProduct(poolId, productId);
    expect(product.lastEffectiveWeight).to.be.equal(expectedActiveWeight);
  });

  it('recalculates effective weights for 2 products when activeWeight > targetWeight', async function () {
    const fixture = await loadFixture(recalculateEffectiveWeightsForAllProductsSetup);
    const { DEFAULT_PRODUCTS } = fixture;
    const { stakingProducts, stakingPool1, cover, p1: pool } = fixture.contracts;
    const staker = fixture.accounts.defaultSender;
    const [, coverBuyer] = fixture.accounts.members;
    const [manager] = fixture.accounts.stakingPoolManagers;

    const poolId = 1;
    const firstProductId = 1;
    const secondProductId = 2;

    // NOTE: either bump the stakeAmount or pool asset value to fix InsufficientCapacity() error
    const stakeAmount = parseEther('6000000');

    // setup products with an initial target weight of 10 in order to buy cover
    const initialTargetWeight = 10;
    await stakingProducts.connect(manager).setProducts(poolId, [
      { ...stakedProductParamTemplate, productId: firstProductId, targetWeight: initialTargetWeight },
      { ...stakedProductParamTemplate, productId: secondProductId, targetWeight: initialTargetWeight },
    ]);

    // stake
    const latestBlock = await ethers.provider.getBlock('latest');
    const firstActiveTrancheId = calculateFirstTrancheId(latestBlock, daysToSeconds(30), 0);
    await stakingPool1.connect(staker).depositTo(stakeAmount, firstActiveTrancheId + 5, 0, staker.address);

    // Cover inputs for cover purchase used to increase activeWeight
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const priceDenominator = 10000;
    const newTargetWeight = 1;

    let firstProductExpectedActiveWeight;
    {
      const productId = firstProductId;
      const amount = parseEther('3000');

      // Compute expectedActiveWeight given how much the cover is worth in NXM and existing capacity
      const nxmPriceInCoverAsset = await pool.getInternalTokenPriceInAsset(coverAsset);
      const coverAmountInNXM = roundUpToNearestAllocationUnit(
        divCeil(amount.mul(ONE_NXM), nxmPriceInCoverAsset),
        NXM_PER_ALLOCATION_UNIT,
      );
      const { _globalCapacityRatio, _defaultMinPriceRatio } = await cover.getGlobalCapacityAndPriceRatios();

      const expectedCapacity = stakeAmount
        .mul(_globalCapacityRatio)
        .mul(CAPACITY_REDUCTION_DENOMINATOR.sub(_defaultMinPriceRatio))
        .div(GLOBAL_CAPACITY_DENOMINATOR)
        .div(CAPACITY_REDUCTION_DENOMINATOR);
      const expectedActiveWeight = coverAmountInNXM.mul(WEIGHT_DENOMINATOR).div(expectedCapacity);

      // Buy Cover
      await buyCover({
        amount,
        productId,
        coverAsset,
        period,
        cover,
        coverBuyer,
        targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
        priceDenominator,
      });

      expect(expectedActiveWeight).to.be.gt(newTargetWeight);

      await stakingProducts
        .connect(manager)
        .setProducts(productId, [{ ...stakedProductParamTemplate, targetWeight: newTargetWeight, productId }]);

      firstProductExpectedActiveWeight = expectedActiveWeight;
    }

    let secondProductExpectedActiveWeight;
    {
      const amount = parseEther('9000');
      const productId = secondProductId;

      // Compute expectedActiveWeight given how much the cover is worth in NXM and existing capacity
      const nxmPriceInCoverAsset = await pool.getInternalTokenPriceInAsset(coverAsset);
      const coverAmountInNXM = roundUpToNearestAllocationUnit(
        divCeil(amount.mul(ONE_NXM), nxmPriceInCoverAsset),
        NXM_PER_ALLOCATION_UNIT,
      );
      const { _globalCapacityRatio, _defaultMinPriceRatio } = await cover.getGlobalCapacityAndPriceRatios();

      const expectedCapacity = stakeAmount
        .mul(_globalCapacityRatio)
        .mul(CAPACITY_REDUCTION_DENOMINATOR.sub(_defaultMinPriceRatio))
        .div(GLOBAL_CAPACITY_DENOMINATOR)
        .div(CAPACITY_REDUCTION_DENOMINATOR);
      const expectedActiveWeight = coverAmountInNXM.mul(WEIGHT_DENOMINATOR).div(expectedCapacity);

      // Buy Cover
      await buyCover({
        amount,
        productId,
        coverAsset,
        period,
        cover,
        coverBuyer,
        targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
        priceDenominator,
      });

      expect(expectedActiveWeight).to.be.gt(newTargetWeight);

      await stakingProducts
        .connect(manager)
        .setProducts(poolId, [{ ...stakedProductParamTemplate, targetWeight: newTargetWeight, productId }]);

      secondProductExpectedActiveWeight = expectedActiveWeight;
    }

    await stakingProducts.recalculateEffectiveWeightsForAllProducts(poolId);

    const firstProduct = await stakingProducts.getProduct(poolId, firstProductId);
    expect(firstProduct.lastEffectiveWeight).to.be.equal(firstProductExpectedActiveWeight);

    const secondProduct = await stakingProducts.getProduct(poolId, secondProductId);
    expect(secondProduct.lastEffectiveWeight).to.be.equal(secondProductExpectedActiveWeight);
  });
});

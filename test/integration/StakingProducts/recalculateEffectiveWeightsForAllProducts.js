const { ethers } = require('hardhat');
const { expect } = require('chai');
const { calculateFirstTrancheId } = require('../utils/staking');
const { MaxUint256 } = ethers.constants;
const { parseEther } = ethers.utils;
const { daysToSeconds } = require('../../../lib/helpers');
const { buyCover, ETH_ASSET_ID } = require('../utils/cover');
const { BigNumber } = require('ethers');
const { divCeil, roundUpToNearestAllocationUnit } = require('../../unit/StakingPool/helpers');

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

describe('recalculateEffectiveWeightsForAllProducts', function () {
  beforeEach(async function () {
    const { tk: nxm, tc: tokenController } = this.contracts;
    await nxm.approve(tokenController.address, MaxUint256);
  });

  it('recalculates effective weights when there is 0 activeStake and targetWeight = 5', async function () {
    const { stakingProducts, stakingPool1 } = this.contracts;
    const staker = this.accounts.defaultSender;
    const [manager1] = this.accounts.stakingPoolManagers;

    const poolId = 1;
    const productId = 1;

    const stakeAmount = parseEther('9000000');

    const targetWeight = 5;
    await stakingProducts.connect(manager1).setProducts(productId, [
      {
        ...stakedProductParamTemplate,
        targetWeight,
      },
    ]);

    // stake
    const firstActiveTrancheId = await calculateFirstTrancheId(
      await ethers.provider.getBlock('latest'),
      daysToSeconds(30),
      0,
    );
    await stakingPool1.connect(staker).depositTo(stakeAmount, firstActiveTrancheId + 5, 0, staker.address);

    await stakingProducts.recalculateEffectiveWeightsForAllProducts(poolId);

    const product = await stakingProducts.getProduct(poolId, productId);
    expect(product.lastEffectiveWeight).to.be.equal(targetWeight);
  });

  it('recalculates effective weights when activeWeight > targetWeight', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { stakingProducts, stakingPool1, cover, p1: pool } = this.contracts;
    const staker = this.accounts.defaultSender;
    const [, coverBuyer1] = this.accounts.members;
    const [manager1] = this.accounts.stakingPoolManagers;

    const poolId = 1;
    const productId = 1;

    const stakeAmount = parseEther('9000000');

    // setup product with an initial target weight of 10 in order to buy cover
    const initialTargetWeight = 10;
    await stakingProducts.connect(manager1).setProducts(poolId, [
      {
        ...stakedProductParamTemplate,
        productId,
        targetWeight: initialTargetWeight,
      },
    ]);

    // stake
    const firstActiveTrancheId = await calculateFirstTrancheId(
      await ethers.provider.getBlock('latest'),
      daysToSeconds(30),
      0,
    );
    await stakingPool1.connect(staker).depositTo(stakeAmount, firstActiveTrancheId + 5, 0, staker.address);

    // Cover inputs for cover purchase used to increase activeWeight
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const priceDenominator = 10000;
    const amount = parseEther('300000');

    // Compute expectedActiveWeight given how much the cover is worth in NXM and existing capacity
    const nxmPriceInCoverAsset = await pool.getTokenPriceInAsset(coverAsset);
    const coverAmountInNXM = roundUpToNearestAllocationUnit(
      divCeil(amount.mul(ONE_NXM), nxmPriceInCoverAsset),
      NXM_PER_ALLOCATION_UNIT,
    );
    const { _globalCapacityRatio, _capacityReductionRatios } = await cover.getPriceAndCapacityRatios([productId]);

    const expectedCapacity = stakeAmount
      .mul(_globalCapacityRatio)
      .mul(CAPACITY_REDUCTION_DENOMINATOR.sub(_capacityReductionRatios[0]))
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
      coverBuyer: coverBuyer1,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      priceDenominator,
    });

    // lower the target weight for product so that the active weight exceeds the target weight
    const targetWeightAfterCoverBuy = 1;
    expect(BigNumber.from(targetWeightAfterCoverBuy)).to.be.lessThan(expectedActiveWeight);

    await stakingProducts.connect(manager1).setProducts(poolId, [
      {
        ...stakedProductParamTemplate,
        targetWeight: targetWeightAfterCoverBuy,
        productId,
      },
    ]);

    await stakingProducts.recalculateEffectiveWeightsForAllProducts(poolId);

    const product = await stakingProducts.getProduct(poolId, productId);
    expect(product.lastEffectiveWeight).to.be.equal(expectedActiveWeight);
  });

  it('recalculates effective weights for 2 products when activeWeight > targetWeight', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { stakingProducts, stakingPool1, cover, p1: pool } = this.contracts;
    const staker = this.accounts.defaultSender;
    const [, coverBuyer1] = this.accounts.members;
    const [manager1] = this.accounts.stakingPoolManagers;

    const poolId = 1;
    const firstProductId = 1;
    const secondProductId = 2;

    const stakeAmount = parseEther('9000000');

    // setup products with an initial target weight of 10 in order to buy cover
    const initialTargetWeight = 10;
    await stakingProducts.connect(manager1).setProducts(poolId, [
      {
        ...stakedProductParamTemplate,
        productId: firstProductId,
        targetWeight: initialTargetWeight,
      },
      {
        ...stakedProductParamTemplate,
        productId: secondProductId,
        targetWeight: initialTargetWeight,
      },
    ]);

    // stake
    const firstActiveTrancheId = await calculateFirstTrancheId(
      await ethers.provider.getBlock('latest'),
      daysToSeconds(30),
      0,
    );
    await stakingPool1.connect(staker).depositTo(stakeAmount, firstActiveTrancheId + 5, 0, staker.address);

    let firstProductExpectedActiveWeight;
    {
      const productId = firstProductId;

      // Cover inputs for cover purchase used to increase activeWeight
      const coverAsset = ETH_ASSET_ID; // ETH
      const period = 3600 * 24 * 30; // 30 days
      const priceDenominator = 10000;
      const amount = parseEther('300000');

      // Compute expectedActiveWeight given how much the cover is worth in NXM and existing capacity
      const nxmPriceInCoverAsset = await pool.getTokenPriceInAsset(coverAsset);
      const coverAmountInNXM = roundUpToNearestAllocationUnit(
        divCeil(amount.mul(ONE_NXM), nxmPriceInCoverAsset),
        NXM_PER_ALLOCATION_UNIT,
      );
      const { _globalCapacityRatio, _capacityReductionRatios } = await cover.getPriceAndCapacityRatios([productId]);

      const expectedCapacity = stakeAmount
        .mul(_globalCapacityRatio)
        .mul(CAPACITY_REDUCTION_DENOMINATOR.sub(_capacityReductionRatios[0]))
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
        coverBuyer: coverBuyer1,
        targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
        priceDenominator,
      });

      // lower the target weight for product so that the active weight exceeds the target weight
      const targetWeightAfterCoverBuy = 1;
      expect(BigNumber.from(targetWeightAfterCoverBuy)).to.be.lessThan(expectedActiveWeight);

      await stakingProducts.connect(manager1).setProducts(productId, [
        {
          ...stakedProductParamTemplate,
          targetWeight: targetWeightAfterCoverBuy,
          productId,
        },
      ]);
      firstProductExpectedActiveWeight = expectedActiveWeight;
    }

    let secondProductExpectedActiveWeight;
    {
      // Cover inputs for cover purchase used to increase activeWeight
      const coverAsset = ETH_ASSET_ID; // ETH
      const period = 3600 * 24 * 30; // 30 days
      const priceDenominator = 10000;
      const amount = parseEther('200000');

      const productId = secondProductId;

      // Compute expectedActiveWeight given how much the cover is worth in NXM and existing capacity
      const nxmPriceInCoverAsset = await pool.getTokenPriceInAsset(coverAsset);
      const coverAmountInNXM = roundUpToNearestAllocationUnit(
        divCeil(amount.mul(ONE_NXM), nxmPriceInCoverAsset),
        NXM_PER_ALLOCATION_UNIT,
      );
      const { _globalCapacityRatio, _capacityReductionRatios } = await cover.getPriceAndCapacityRatios([productId]);

      const expectedCapacity = stakeAmount
        .mul(_globalCapacityRatio)
        .mul(CAPACITY_REDUCTION_DENOMINATOR.sub(_capacityReductionRatios[0]))
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
        coverBuyer: coverBuyer1,
        targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
        priceDenominator,
      });

      // lower the target weight for product so that the active weight exceeds the target weight
      const targetWeightAfterCoverBuy = 1;
      expect(BigNumber.from(targetWeightAfterCoverBuy)).to.be.lessThan(expectedActiveWeight);

      await stakingProducts.connect(manager1).setProducts(poolId, [
        {
          ...stakedProductParamTemplate,
          targetWeight: targetWeightAfterCoverBuy,
          productId,
        },
      ]);
      secondProductExpectedActiveWeight = expectedActiveWeight;
    }

    await stakingProducts.recalculateEffectiveWeightsForAllProducts(poolId);

    {
      const product = await stakingProducts.getProduct(poolId, firstProductId);
      expect(product.lastEffectiveWeight).to.be.equal(firstProductExpectedActiveWeight);
    }

    {
      const product = await stakingProducts.getProduct(poolId, secondProductId);
      expect(product.lastEffectiveWeight).to.be.equal(secondProductExpectedActiveWeight);
    }
  });
});

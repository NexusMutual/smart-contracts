const { expect } = require('chai');
const { ethers } = require('hardhat');
const { setEtherBalance } = require('../../utils/').evm;
const { daysToSeconds } = require('./helpers');
const { calculateBasePremium, calculateBasePrice, calculateSurgePremium } = require('../StakingPool/helpers');
const { parseEther } = ethers.utils;
const { Zero, One } = ethers.constants;
const errors = require('../../utils/errors');

const stakedProductTemplate = {
  bumpedPriceUpdateTime: Zero,
  bumpedPrice: One.mul(5000),
  targetPrice: One.mul(1001),
  targetWeight: One.mul(100),
};

const getPremiumParamsTemplate = {
  poolId: Zero,
  productId: Zero,
  period: daysToSeconds('30'),
  coverAmount: One.mul(91),
  initialCapacityUsed: Zero,
  totalCapacity: One.mul(100),
  globalMinPrice: One.mul(1000),
  useFixedPrice: false,
  nxmPerAllocationUnit: Zero,
  allocationUnitsPerNXM: Zero,
};

// const coverAmountRaw = parseEther('1.00');
async function getPremiumParams(params) {
  const { stakingPool } = this;
  return {
    ...getPremiumParamsTemplate,
    ...params,
    globalMinPrice: this.config.GLOBAL_MIN_PRICE_RATIO,
    nxmPerAllocationUnit: this.config.NXM_PER_ALLOCATION_UNIT,
    allocationUnitsPerNXM: this.config.ALLOCATION_UNITS_PER_NXM,
    poolId: await stakingPool.getPoolId(),
  };
}

async function calculateExpectedPremium(params) {
  const { product, coverAmount, initialCapacityUsed, totalCapacity, period, nxmPerAllocationUnit } = params;
  const { config } = this;

  const amount = coverAmount.mul(nxmPerAllocationUnit);

  // get base price
  const { timestamp } = await ethers.provider.getBlock('latest');
  const basePrice = calculateBasePrice(timestamp, product, config.PRICE_CHANGE_PER_DAY);
  console.log('basePrice', basePrice.toString());

  // get base premium
  const basePremium = calculateBasePremium(amount, basePrice, period, config);
  console.log('basePremium', basePremium.toString());

  // get surge premium
  const { surgePremium } = calculateSurgePremium(amount, initialCapacityUsed, totalCapacity, period, config);
  console.log('surgePremium', surgePremium.toString());

  return basePremium.add(surgePremium);
}
describe('getPremium', function () {
  before(async function () {
    // calculate staking pool address for poolId 0
    const { stakingPool } = this;

    const stakingPoolSigner = await ethers.getImpersonatedSigner(stakingPool.address);
    await setEtherBalance(stakingPoolSigner.address, parseEther('100'));

    this.stakingPoolSigner = stakingPoolSigner;
  });

  it('should revert if not called by staking pool', async function () {
    const { stakingProducts } = this;

    await expect(
      this.stakingProducts.getPremium(...Object.values(getPremiumParamsTemplate)),
    ).to.be.revertedWithCustomError(stakingProducts, 'OnlyStakingPool');
  });

  it('should revert if capacity is 0', async function () {
    const { stakingProducts, stakingPoolSigner } = this;

    const noCapacityGetPremiumParams = await getPremiumParams.call(this, { totalCapacity: Zero });

    await expect(
      stakingProducts.connect(stakingPoolSigner).getPremium(...Object.values(noCapacityGetPremiumParams)),
    ).to.be.revertedWithPanic(errors.DIVISION_BY_ZERO);
  });

  it.skip('should correctly calculate and store premium', async function () {
    const { stakingProducts, stakingPoolSigner } = this;

    const { timestamp } = await ethers.provider.getBlock('latest');

    const params = await getPremiumParams.call(this);
    const stakedProduct = { ...stakedProductTemplate, bumpedPriceUpdateTime: timestamp };

    const expectedPremium = await calculateExpectedPremium.call(this, { product: stakedProduct, ...params });

    const premium = await stakingProducts.connect(stakingPoolSigner).callStatic.getPremium(...Object.values(params));

    expect(premium).to.equal(expectedPremium);
    // TODO: check product values
  });

  it.skip('should correctly calculate and store premium with fixed price', async function () {});

  it.skip('should use global min price if product price is below it', async function () {});

  it.skip('should calculate surge premium when initial capacity is beyond surge start point', async function () {});
});

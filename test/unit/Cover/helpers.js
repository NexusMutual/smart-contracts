const { ethers } = require('hardhat');
const { expect } = require('chai');

const { parseEther } = ethers.utils;
const { AddressZero } = ethers.constants;

const DEFAULT_POOL_FEE = '5';
const DEFAULT_PRODUCTS = [{ productId: 0, weight: 100 }];
const MAX_COVER_PERIOD = 3600 * 24 * 365;

async function createStakingPool(
  stakingProducts,
  productId,
  capacity,
  targetPrice,
  activeCover,
  manager,
  currentPrice,
) {
  const productInitializationParams = DEFAULT_PRODUCTS.map(p => {
    p.initialPrice = currentPrice;
    p.targetPrice = targetPrice;
    return p;
  });

  const factoryAddress = await stakingProducts.stakingPoolFactory();
  const stakingPoolFactory = await ethers.getContractAt('StakingPoolFactory', factoryAddress);

  await stakingProducts.connect(manager).createStakingPool(
    false, // isPrivatePool,
    DEFAULT_POOL_FEE, // initialPoolFee
    DEFAULT_POOL_FEE, // maxPoolFee,
    productInitializationParams,
    'ipfsDescriptionHash',
  );

  const stakingPoolId = await stakingPoolFactory.stakingPoolCount();
  const stakingPoolAddress = await stakingProducts.stakingPool(stakingPoolId);
  const stakingPool = await ethers.getContractAt('COMockStakingPool', stakingPoolAddress);

  await stakingPool.setStake(productId, capacity);
  await stakingPool.setUsedCapacity(productId, activeCover);
  await stakingPool.setPrice(productId, currentPrice); // 2.6%

  return stakingPool;
}

async function assertCoverFields(
  cover,
  coverId,
  { productId, coverAsset, period, amount, gracePeriod, segmentId = 0, amountPaidOut = 0 },
) {
  const storedCoverData = await cover.coverData(coverId);
  const segment = await cover.coverSegmentWithRemainingAmount(coverId, segmentId);
  expect(storedCoverData.productId).to.equal(productId);
  expect(storedCoverData.coverAsset).to.equal(coverAsset);
  expect(storedCoverData.amountPaidOut).to.be.equal(amountPaidOut);
  expect(segment.gracePeriod).to.equal(gracePeriod);
  expect(segment.period).to.equal(period);
  expect(segment.amount).to.equal(amount);
}

async function buyCoverOnOnePool(params) {
  const { stakingProducts } = this;
  const [, stakingPoolManager] = this.accounts.members;

  const { productId, capacity, activeCover, targetPriceRatio, amount } = params;

  // TODO: call this ONCE in beforeEach or setup to avoid creating a new pool on every cover buy
  await createStakingPool(
    stakingProducts,
    productId,
    capacity,
    targetPriceRatio,
    activeCover,
    stakingPoolManager,
    targetPriceRatio,
  );

  const allocationRequest = [{ poolId: 1, coverAmountInAsset: amount }];

  return buyCoverOnMultiplePools.call(this, { ...params, allocationRequest });
}

async function buyCoverOnMultiplePools({
  productId,
  coverAsset,
  period,
  amount,
  targetPriceRatio,
  priceDenominator,
  allocationRequest,
}) {
  const { cover } = this;
  const [coverBuyer] = this.accounts.members;

  const expectedPremium = amount
    .mul(targetPriceRatio)
    .div(priceDenominator)
    .mul(period)
    .div(3600 * 24 * 365);

  const tx = await cover.connect(coverBuyer).buyCover(
    {
      owner: coverBuyer.address,
      coverId: 0,
      productId,
      coverAsset,
      amount,
      period,
      maxPremiumInAsset: expectedPremium,
      paymentAsset: coverAsset,
      commissionRatio: parseEther('0'),
      commissionDestination: AddressZero,
      ipfsData: '',
    },
    allocationRequest,
    { value: coverAsset === 0 ? expectedPremium : 0 },
  );

  const { events } = await tx.wait();
  const { coverId, segmentId } = events.find(e => e.event === 'CoverEdited').args;

  const storedCoverData = await cover.coverData(coverId);
  const segment = await cover.coverSegmentWithRemainingAmount(coverId, segmentId);

  return {
    expectedPremium,
    storedCoverData,
    segment,
    coverId,
    segmentId,
  };
}

module.exports = {
  assertCoverFields,
  buyCoverOnOnePool,
  buyCoverOnMultiplePools,
  createStakingPool,
  MAX_COVER_PERIOD,
};

const { ethers } = require('hardhat');
const { assert, expect } = require('chai');

const { parseEther } = ethers.utils;
const { AddressZero } = ethers.constants;

const DEFAULT_POOL_FEE = '5';
const DEFAULT_PRODUCT_INITIALIZATION = [{ productId: 0, weight: 100 }];

async function createStakingPool(cover, productId, capacity, targetPrice, activeCover, creator, manager, currentPrice) {
  const productinitializationParams = DEFAULT_PRODUCT_INITIALIZATION.map(p => {
    p.initialPrice = currentPrice;
    p.targetPrice = targetPrice;
    return p;
  });

  const stakingPoolIndex = await cover.stakingPoolCount();

  const tx = await cover.connect(creator).createStakingPool(
    manager.address,
    false, // isPrivatePool,
    DEFAULT_POOL_FEE, // initialPoolFee
    DEFAULT_POOL_FEE, // maxPoolFee,
    productinitializationParams,
    '0', // depositAmount,
    '0', // trancheId
  );

  await tx.wait();

  const stakingPoolAddress = await cover.stakingPool(stakingPoolIndex);
  const stakingPool = await ethers.getContractAt('CoverMockStakingPool', stakingPoolAddress);

  await stakingPool.setStake(productId, capacity);
  await stakingPool.setTargetPrice(productId, targetPrice);
  await stakingPool.setUsedCapacity(productId, activeCover);
  await stakingPool.setPrice(productId, currentPrice); // 2.6%

  return stakingPool;
}

async function assertCoverFields(
  cover,
  coverId,
  { productId, coverAsset, period, amount, targetPriceRatio, segmentId = '0', amountPaidOut = '0' },
) {
  const storedCoverData = await cover.coverData(coverId);

  const segment = await cover.coverSegments(coverId, segmentId);

  assert.equal(storedCoverData.productId, productId);
  assert.equal(storedCoverData.coverAsset, coverAsset);
  expect(storedCoverData.amountPaidOut).to.be.equal(amountPaidOut);
  assert.equal(segment.period, period);
  assert.equal(segment.amount.toString(), amount.toString());
  expect(segment.priceRatio.toString()).to.be.equal(targetPriceRatio.toString());
}

async function buyCoverOnOnePool({
  productId,
  coverAsset,
  period,
  amount,
  targetPriceRatio,
  priceDenominator,
  activeCover,
  capacity,
}) {
  const { cover } = this;
  const [coverBuyer, stakingPoolManager] = this.accounts.members;

  await createStakingPool(
    cover,
    productId,
    capacity,
    targetPriceRatio,
    activeCover,
    stakingPoolManager,
    stakingPoolManager,
    targetPriceRatio,
  );

  const expectedPremium = amount
    .mul(targetPriceRatio)
    .div(priceDenominator)
    .mul(period)
    .div(3600 * 24 * 365);

  const tx = await cover.connect(coverBuyer).buyCover(
    {
      owner: coverBuyer.address,
      productId,
      coverAsset,
      amount,
      period,
      maxPremiumInAsset: expectedPremium,
      paymentAsset: coverAsset,
      payWitNXM: false,
      commissionRatio: parseEther('0'),
      commissionDestination: AddressZero,
      ipfsData: '',
    },
    [{ poolId: '0', coverAmountInAsset: amount }],
    { value: expectedPremium },
  );

  const { events } = await tx.wait();
  const coverBoughtEvent = events.filter(e => e.event === 'CoverBought')[0];

  const coverId = coverBoughtEvent.args.coverId;
  const segmentId = coverBoughtEvent.args.segmentId;

  const storedCoverData = await cover.coverData(coverId);
  const segment = await cover.coverSegments(coverId, segmentId);

  return {
    expectedPremium,
    storedCoverData,
    segment,
    coverId,
    segmentId,
  };
}

const MAX_COVER_PERIOD = 3600 * 24 * 365;

module.exports = {
  assertCoverFields,
  buyCoverOnOnePool,
  MAX_COVER_PERIOD,
  createStakingPool,
};

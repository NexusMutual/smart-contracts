const { artifacts, ethers: { utils: { parseEther }, BigNumber } } = require('hardhat');
const { constants: { ZERO_ADDRESS } } = require('@openzeppelin/test-helpers');
const Decimal = require('decimal.js');
const { assert, expect } = require('chai');
const { bnEqual } = require("../../../lib/helpers");

const DEFAULT_POOL_FEE = '5'

const DEFAULT_PRODUCT_INITIALIZATION = [
  {
    productId: 0,
    weight: 100
  }
]

async function createStakingPool (
  cover, productId, capacity, targetPrice, activeCover, stakingPoolCreator, stakingPoolManager, currentPrice,
) {

  const productinitializationParams = DEFAULT_PRODUCT_INITIALIZATION.map(p => {
    p.initialPrice = currentPrice;
    p.targetPrice = targetPrice;
    return p;
  });

  const tx = await cover.connect(stakingPoolCreator).createStakingPool(
    stakingPoolManager.address,
    false, // isPrivatePool,
    DEFAULT_POOL_FEE, // initialPoolFee
    DEFAULT_POOL_FEE, // maxPoolFee,
    productinitializationParams,
    '0', // depositAmount,
    '0', // trancheId
  );

  await tx.wait();

  const stakingPoolCount = await cover.stakingPoolCount();

  const stakingPoolIndex = stakingPoolCount.sub(1);

  const stakingPoolAddress = await cover.stakingPool(stakingPoolIndex);

  const stakingPool = await ethers.getContractAt('CoverMockStakingPool', stakingPoolAddress);

  await stakingPool.setStake(productId, capacity);


  await stakingPool.setTargetPrice(productId, targetPrice);
  await stakingPool.setUsedCapacity(productId, activeCover);

  await stakingPool.setPrice(productId, currentPrice); // 2.6%

  return stakingPool;
}

async function assertCoverFields (
  cover,
  coverId,
  { productId, coverAsset, period, amount, targetPriceRatio, segmentId = '0', amountPaidOut = '0' },
) {
  const storedCoverData = await cover.coverData(coverId);

  const segment = await cover.coverSegments(coverId, segmentId);

  assert.equal(storedCoverData.productId, productId);
  assert.equal(storedCoverData.coverAsset, coverAsset);
  bnEqual(storedCoverData.amountPaidOut, amountPaidOut);
  assert.equal(segment.period, period);
  assert.equal(segment.amount.toString(), amount.toString());
  bnEqual(segment.priceRatio, targetPriceRatio);
}

async function buyCoverOnOnePool (
  {
    productId,
    coverAsset,
    period,
    amount,
    targetPriceRatio,
    priceDenominator,
    activeCover,
    capacity,
    capacityFactor,
  },
) {
  const { cover } = this;

  const {
    members: [member1],
    members: [coverBuyer1, stakingPoolManager],
  } = this.accounts;

  await createStakingPool(
    cover, productId, capacity, targetPriceRatio, activeCover, stakingPoolManager, stakingPoolManager, targetPriceRatio,
  );

  const expectedPremium = amount.mul(targetPriceRatio).div(priceDenominator).mul(period).div(3600 * 24 * 365);

  const tx = await cover.connect(member1).buyCover(
    {
      owner: coverBuyer1.address,
      productId,
      coverAsset,
      amount,
      period,
      maxPremiumInAsset: expectedPremium,
      paymentAsset: coverAsset,
      payWitNXM: false,
      commissionRatio: parseEther('0'),
      commissionDestination: ZERO_ADDRESS,
      ipfsData: ''
    },
    [{ poolId: '0', coverAmountInAsset: amount.toString() }],
    {
      value: expectedPremium,
    },
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
    segmentId
  };
}

const MAX_COVER_PERIOD = 3600 * 24 * 365;

function toDecimal (x) {
  return new Decimal(x.toString());
}

module.exports = {
  assertCoverFields,
  buyCoverOnOnePool,
  MAX_COVER_PERIOD,
  createStakingPool
};

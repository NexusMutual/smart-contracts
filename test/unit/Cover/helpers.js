const { artifacts, ethers: { utils: { parseEther }, BigNumber } } = require('hardhat');
const { constants: { ZERO_ADDRESS } } = require('@openzeppelin/test-helpers');
const Decimal = require('decimal.js');
const { assert, expect} = require('chai');
const CoverMockStakingPool = artifacts.require('CoverMockStakingPool');
const { bnRoughlyEqual } = require('../utils').helpers;

async function createStakingPool (
  cover, productId, capacity, targetPrice, activeCover, stakingPoolCreator, stakingPoolManager, currentPrice,
) {

  const tx = await cover.connect(stakingPoolCreator).createStakingPool(stakingPoolManager.address);

  const receipt = await tx.wait();

  const { stakingPoolAddress } = receipt.events[0].args;

  const stakingPool = await CoverMockStakingPool.at(stakingPoolAddress);

  await stakingPool.setStake(productId, capacity);
  await stakingPool.setTargetPrice(productId, targetPrice);
  await stakingPool.setUsedCapacity(productId, activeCover);

  await stakingPool.setPrice(productId, BigNumber.from(currentPrice).mul(1e16.toString())); // 2.6%

  return stakingPool;
}

async function assertCoverFields (
  cover,
  coverId,
  { productId, payoutAsset, period, amount, targetPriceRatio, segmentId = '0' },
) {
  const storedCoverData = await cover.coverData(coverId);

  const segment = await cover.coverSegments(coverId, segmentId);

  assert.equal(storedCoverData.productId, productId);
  assert.equal(storedCoverData.payoutAsset, payoutAsset);
  assert.equal(storedCoverData.amountPaidOut, '0');
  assert.equal(segment.period, period);
  assert.equal(segment.amount.toString(), amount.toString());
  bnRoughlyEqual(segment.priceRatio, BigNumber.from(targetPriceRatio));
}

async function buyCoverOnOnePool (
  {
    productId,
    payoutAsset,
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
    governanceContracts: [gv1],
    members: [member1],
    members: [coverBuyer1, stakingPoolManager],
  } = this.accounts;

  await cover.connect(gv1).setGlobalCapacityRatio(capacityFactor);

  await createStakingPool(
    cover, productId, capacity, targetPriceRatio, activeCover, stakingPoolManager, stakingPoolManager, targetPriceRatio,
  );

  const expectedPremium = amount.mul(targetPriceRatio).div(priceDenominator).mul(period).div(3600 * 24 * 365);

  const tx = await cover.connect(member1).buyCover(
    {
      owner: coverBuyer1.address,
      productId,
      payoutAsset,
      amount,
      period,
      maxPremiumInAsset: expectedPremium,
      paymentAsset: payoutAsset,
      payWitNXM: false,
      commissionRatio: parseEther('0'),
      commissionDestination: ZERO_ADDRESS,
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

const PRICE_DENOMINATOR = 10000;

function toDecimal (x) {
  return new Decimal(x.toString());
}

module.exports = {
  createStakingPool,
  assertCoverFields,
  buyCoverOnOnePool,
  MAX_COVER_PERIOD,
  PRICE_DENOMINATOR
};

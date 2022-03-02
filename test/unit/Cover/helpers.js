const { artifacts, ethers: { utils: { parseEther }, BigNumber } } = require('hardhat');
const { constants: { ZERO_ADDRESS } } = require('@openzeppelin/test-helpers');
const Decimal = require('decimal.js');
const { assert } = require('chai');
const CoverMockStakingPool = artifacts.require('CoverMockStakingPool');

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

  console.log({
    currentPrice: currentPrice.toString()
  })
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

  await assert.equal(storedCoverData.productId, productId);
  await assert.equal(storedCoverData.payoutAsset, payoutAsset);
  await assert.equal(storedCoverData.amountPaidOut, '0');
  await assert.equal(segment.period, period);
  await assert.equal(segment.amount.toString(), amount.toString());
  await assert.equal(segment.priceRatio.toString(), targetPriceRatio.toString());
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

  const expectedPremium = amount.mul(targetPriceRatio).div(priceDenominator);

  await cover.connect(member1).buyCover(
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
}

function toDecimal (x) {
  return new Decimal(x.toString());
}

module.exports = {
  createStakingPool,
  assertCoverFields,
  buyCoverOnOnePool,
};

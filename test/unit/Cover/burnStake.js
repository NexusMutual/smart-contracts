const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');
const { assertCoverFields, buyCoverOnOnePool, buyCoverOnMultiplePools, createStakingPool } = require('./helpers');
const { expect } = require('chai');

const { parseEther } = ethers.utils;

const gracePeriod = 120 * 24 * 3600; // 120 days
const GLOBAL_CAPACITY_DENOMINATOR = 10000;

describe('burnStake', function () {
  const coverBuyFixture = {
    coverId: 0,
    productId: 0,
    coverAsset: 0, // ETH
    period: 3600 * 24 * 30, // 30 days
    amount: parseEther('1000'),
    targetPriceRatio: 260,
    priceDenominator: 10000,
    activeCover: parseEther('5000'),
    capacity: parseEther('10000'),
    capacityFactor: '10000',
  };

  it('should perform a burn a cover with 1 segment and 1 pool allocation', async function () {
    const fixture = await loadFixture(setup);
    const { cover, stakingProducts, accounts } = fixture;
    const [internal] = accounts.internalContracts;
    const { productId, coverAsset, period, amount, targetPriceRatio } = coverBuyFixture;
    const { segmentId, coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const payoutAmountInAsset = amount.div(2);
    const remainingAmount = amount.sub(payoutAmountInAsset);

    const segment = await cover.coverSegmentWithRemainingAmount(expectedCoverId, segmentId);
    const segmentAllocation = await cover.coverSegmentAllocations(expectedCoverId, segmentId, '0');

    const payoutAmountInNXM = segmentAllocation.coverAmountInNXM.mul(payoutAmountInAsset).div(segment.amount);
    const expectedBurnAmount = payoutAmountInNXM.mul(GLOBAL_CAPACITY_DENOMINATOR).div(segment.globalCapacityRatio);

    await cover.connect(internal).burnStake(expectedCoverId, segmentId, payoutAmountInAsset);
    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period,
      amount: remainingAmount,
      targetPriceRatio,
      gracePeriod,
      segmentId,
      amountPaidOut: payoutAmountInAsset,
    });

    const stakingPool = await ethers.getContractAt('COMockStakingPool', await stakingProducts.stakingPool(1));
    const burnStakeCalledWithAmount = await stakingPool.burnStakeCalledWithAmount();
    expect(burnStakeCalledWithAmount).to.be.equal(expectedBurnAmount);
  });

  it('reverts if caller is not an internal contract', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;
    const [member] = fixture.accounts.members;
    const { amount } = coverBuyFixture;
    const { segmentId, coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const burnAmountDivisor = 2;
    const burnAmount = amount.div(burnAmountDivisor);

    await expect(cover.connect(member).burnStake(expectedCoverId, segmentId, burnAmount)).to.be.revertedWith(
      'Caller is not an internal contract',
    );
  });

  it('updates segment allocation cover amount in nxm', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;
    const [internal] = fixture.accounts.internalContracts;
    const { amount } = coverBuyFixture;
    const { segmentId, coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const burnAmountDivisor = 2;
    const burnAmount = amount.div(burnAmountDivisor);
    const segmentAllocationBefore = await cover.coverSegmentAllocations(expectedCoverId, segmentId, 0);
    const payoutAmountInNXM = segmentAllocationBefore.coverAmountInNXM.div(burnAmountDivisor);

    await cover.connect(internal).burnStake(expectedCoverId, segmentId, burnAmount);

    const segmentAllocationAfter = await cover.coverSegmentAllocations(expectedCoverId, segmentId, 0);
    expect(segmentAllocationAfter.coverAmountInNXM).to.be.equal(
      segmentAllocationBefore.coverAmountInNXM.sub(payoutAmountInNXM),
    );
  });

  it('should perform a burn on a cover with 1 segment and 2 pool allocations', async function () {
    const fixture = await loadFixture(setup);
    const { cover, stakingProducts } = fixture;
    const [internal] = fixture.accounts.internalContracts;
    const [, stakingPoolManager] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, capacity, activeCover } = coverBuyFixture;
    const amountOfPools = 4;
    const amountPerPool = amount.div(amountOfPools);

    const allocationRequest = [];
    for (let i = 1; i <= amountOfPools; i++) {
      await createStakingPool(
        stakingProducts,
        productId,
        capacity,
        targetPriceRatio,
        activeCover,
        stakingPoolManager,
        targetPriceRatio,
      );
      allocationRequest.push({ poolId: i, coverAmountInAsset: amountPerPool });
    }

    const { segmentId, coverId: expectedCoverId } = await buyCoverOnMultiplePools.call(fixture, {
      ...coverBuyFixture,
      allocationRequest,
    });

    const burnAmountDivisor = 2;
    const payoutAmountInAsset = amount.div(burnAmountDivisor);
    const remainingAmount = amount.sub(payoutAmountInAsset);
    const segmentAllocationsBefore = [];
    const expectedBurnAmount = [];

    const segment = await cover.coverSegmentWithRemainingAmount(expectedCoverId, segmentId);

    for (let i = 0; i < amountOfPools; i++) {
      const segmentAllocationBefore = await cover.coverSegmentAllocations(expectedCoverId, segmentId, i);
      segmentAllocationsBefore.push(segmentAllocationBefore);

      const payoutAmountInNXM = segmentAllocationBefore.coverAmountInNXM.mul(payoutAmountInAsset).div(segment.amount);
      expectedBurnAmount.push(payoutAmountInNXM.mul(GLOBAL_CAPACITY_DENOMINATOR).div(segment.globalCapacityRatio));
    }

    await cover.connect(internal).burnStake(expectedCoverId, segmentId, payoutAmountInAsset);
    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period,
      amount: remainingAmount,
      targetPriceRatio,
      gracePeriod,
      segmentId,
      amountPaidOut: payoutAmountInAsset,
    });

    for (let i = 0; i < amountOfPools; i++) {
      const stakingPool = await ethers.getContractAt('COMockStakingPool', await stakingProducts.stakingPool(i + 1));

      const burnStakeCalledWithAmount = await stakingPool.burnStakeCalledWithAmount();
      expect(burnStakeCalledWithAmount).to.be.equal(expectedBurnAmount[i]);

      const segmentAllocationAfter = await cover.coverSegmentAllocations(expectedCoverId, segmentId, i);
      const payoutAmountInNXM = segmentAllocationsBefore[i].coverAmountInNXM.div(burnAmountDivisor);

      expect(segmentAllocationAfter.coverAmountInNXM).to.be.equal(
        segmentAllocationsBefore[i].coverAmountInNXM.sub(payoutAmountInNXM),
      );
    }
  });

  it('should perform a burn with globalCapacityRatio when the cover was bought', async function () {
    const fixture = await loadFixture(setup);
    const { cover, stakingProducts } = fixture;
    const [internal] = fixture.accounts.internalContracts;
    const { productId, coverAsset, period, amount, targetPriceRatio } = coverBuyFixture;
    const { segmentId, coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    // TODO: need to figure out a way to change the capacity ratio here
    // ...

    const payoutAmountInAsset = amount.div(2);
    const remainingAmount = amount.sub(payoutAmountInAsset);

    const segment = await cover.coverSegmentWithRemainingAmount(expectedCoverId, segmentId);
    const segmentAllocation = await cover.coverSegmentAllocations(expectedCoverId, segmentId, '0');

    const payoutAmountInNXM = segmentAllocation.coverAmountInNXM.mul(payoutAmountInAsset).div(segment.amount);
    const expectedBurnAmount = payoutAmountInNXM.mul(GLOBAL_CAPACITY_DENOMINATOR).div(segment.globalCapacityRatio);

    await cover.connect(internal).burnStake(expectedCoverId, segmentId, payoutAmountInAsset);
    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period,
      amount: remainingAmount,
      targetPriceRatio,
      gracePeriod,
      segmentId,
      amountPaidOut: payoutAmountInAsset,
    });

    const stakingPool = await ethers.getContractAt('COMockStakingPool', await stakingProducts.stakingPool(1));
    const burnStakeCalledWithAmount = await stakingPool.burnStakeCalledWithAmount();
    expect(burnStakeCalledWithAmount).to.be.equal(expectedBurnAmount);
  });

  it('updates segment allocation premium in nxm', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;
    const [internal] = fixture.accounts.internalContracts;
    const { amount } = coverBuyFixture;
    const { segmentId, coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const burnAmountDivisor = 2;
    const burnAmount = amount.div(burnAmountDivisor);
    const segmentAllocationBefore = await cover.coverSegmentAllocations(expectedCoverId, segmentId, 0);
    const payoutAmountInNXM = segmentAllocationBefore.premiumInNXM.div(burnAmountDivisor);

    await cover.connect(internal).burnStake(expectedCoverId, segmentId, burnAmount);

    const segmentAllocationAfter = await cover.coverSegmentAllocations(expectedCoverId, segmentId, 0);
    expect(segmentAllocationAfter.premiumInNXM).to.be.equal(
      segmentAllocationBefore.premiumInNXM.sub(payoutAmountInNXM),
    );
  });
});

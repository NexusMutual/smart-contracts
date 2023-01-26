const { ethers } = require('hardhat');
const { assertCoverFields, buyCoverOnOnePool, buyCoverOnMultiplePools, createStakingPool } = require('./helpers');
const { expect } = require('chai');

const { MaxUint256 } = ethers.constants;
const { parseEther } = ethers.utils;

const gracePeriod = 120 * 24 * 3600; // 120 days
const GLOBAL_CAPACITY_DENOMINATOR = 10000;

describe('burnStake', function () {
  const coverBuyFixture = {
    coverId: MaxUint256,
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
    const { cover } = this;
    const [internal] = this.accounts.internalContracts;
    const { productId, coverAsset, period, amount, targetPriceRatio } = coverBuyFixture;
    const { segmentId, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const payoutAmountInAsset = amount.div(2);
    const remainingAmount = amount.sub(payoutAmountInAsset);

    const segment = await cover.coverSegments(expectedCoverId, segmentId);
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

    const stakingPool = await ethers.getContractAt('CoverMockStakingPool', await cover.stakingPool(0));
    const burnStakeCalledWithAmount = await stakingPool.burnStakeCalledWithAmount();
    expect(burnStakeCalledWithAmount).to.be.equal(expectedBurnAmount);
  });

  it('reverts if caller is not an internal contract', async function () {
    const { cover } = this;
    const [member] = this.accounts.members;
    const { amount } = coverBuyFixture;
    const { segmentId, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const burnAmountDivisor = 2;
    const burnAmount = amount.div(burnAmountDivisor);

    await expect(cover.connect(member).burnStake(expectedCoverId, segmentId, burnAmount)).to.be.revertedWith(
      'Caller is not an internal contract',
    );
  });

  it('updates segment allocation cover amount in nxm', async function () {
    const { cover } = this;
    const [internal] = this.accounts.internalContracts;
    const { amount } = coverBuyFixture;
    const { segmentId, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

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
    const { cover } = this;
    const [internal] = this.accounts.internalContracts;
    const [, stakingPoolManager] = this.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, capacity, activeCover } = coverBuyFixture;
    const amountOfPools = 4;
    const amountPerPool = amount.div(amountOfPools);

    const allocationRequest = [];
    for (let i = 0; i < amountOfPools; i++) {
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
      allocationRequest.push({ poolId: i, coverAmountInAsset: amountPerPool });
    }

    const { segmentId, coverId: expectedCoverId } = await buyCoverOnMultiplePools.call(this, {
      ...coverBuyFixture,
      allocationRequest,
    });

    const burnAmountDivisor = 2;
    const payoutAmountInAsset = amount.div(burnAmountDivisor);
    const remainingAmount = amount.sub(payoutAmountInAsset);
    const segmentAllocationsBefore = [];
    const expectedBurnAmount = [];

    const segment = await cover.coverSegments(expectedCoverId, segmentId);

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
      const stakingPool = await ethers.getContractAt('CoverMockStakingPool', await cover.stakingPool(i));

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
    const GLOBAL_CAPACITY_RATIO = 30000;
    const { cover, accounts } = this;
    const [internal] = this.accounts.internalContracts;
    const { productId, coverAsset, period, amount, targetPriceRatio } = coverBuyFixture;
    const { segmentId, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    await cover.connect(accounts.governanceContracts[0]).updateUintParameters([0], [GLOBAL_CAPACITY_RATIO]);

    const payoutAmountInAsset = amount.div(2);
    const remainingAmount = amount.sub(payoutAmountInAsset);

    const segment = await cover.coverSegments(expectedCoverId, segmentId);
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

    const stakingPool = await ethers.getContractAt('CoverMockStakingPool', await cover.stakingPool(0));
    const burnStakeCalledWithAmount = await stakingPool.burnStakeCalledWithAmount();
    expect(burnStakeCalledWithAmount).to.be.equal(expectedBurnAmount);
  });

  it('updates segment allocation premium in nxm', async function () {
    const { cover } = this;
    const [internal] = this.accounts.internalContracts;
    const { amount } = coverBuyFixture;
    const { segmentId, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

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

  it('call stakingPool with correct parameters', async function () {
    const { cover } = this;
    const [internal] = this.accounts.internalContracts;
    const { amount, productId } = coverBuyFixture;
    const { segmentId, coverId: expectedCoverId } = await buyCoverOnOnePool.call(this, coverBuyFixture);

    const burnAmountDivisor = 2;
    const payoutAmountInAsset = amount.div(burnAmountDivisor);
    const burnAmount = amount.div(burnAmountDivisor);

    const segment = await cover.coverSegments(expectedCoverId, segmentId);
    const segmentAllocation = await cover.coverSegmentAllocations(expectedCoverId, segmentId, '0');

    const payoutAmountInNXM = segmentAllocation.coverAmountInNXM.mul(payoutAmountInAsset).div(segment.amount);
    const expectedBurnAmount = payoutAmountInNXM.mul(GLOBAL_CAPACITY_DENOMINATOR).div(segment.globalCapacityRatio);

    await cover.connect(internal).burnStake(expectedCoverId, segmentId, burnAmount);

    const stakingPool = await ethers.getContractAt('CoverMockStakingPool', await cover.stakingPool(0));

    const burnStakeCalledWithAmount = await stakingPool.burnStakeCalledWithAmount();
    expect(burnStakeCalledWithAmount).to.be.equal(expectedBurnAmount);

    const allocationId = 0;
    const burnStakeCalledWithParams = await stakingPool.burnStakeCalledWithParams();
    expect(burnStakeCalledWithParams.allocationId).to.be.equal(allocationId);
    expect(burnStakeCalledWithParams.period).to.be.equal(segment.period);
    expect(burnStakeCalledWithParams.start).to.be.equal(segment.start);
    expect(burnStakeCalledWithParams.productId).to.be.equal(productId);
    expect(burnStakeCalledWithParams.deallocationAmount).to.be.equal(payoutAmountInNXM);
  });
});

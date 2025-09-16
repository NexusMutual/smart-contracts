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
    const { productId, coverAsset, period, amount } = coverBuyFixture;
    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const payoutAmountInAsset = amount.div(2);
    const remainingAmount = amount.sub(payoutAmountInAsset);

    const coverData = await cover.getCoverData(expectedCoverId);
    const [poolAllocation] = await cover.getPoolAllocations(expectedCoverId);

    const payoutAmountInNXM = poolAllocation.coverAmountInNXM.mul(payoutAmountInAsset).div(coverData.amount);
    const expectedBurnAmount = payoutAmountInNXM.mul(GLOBAL_CAPACITY_DENOMINATOR).div(coverData.capacityRatio);

    await cover.connect(internal).burnStake(expectedCoverId, payoutAmountInAsset);
    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period,
      amount: remainingAmount,
      gracePeriod,
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
    const { coverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const burnAmountDivisor = 2;
    const burnAmount = amount.div(burnAmountDivisor);

    await expect(cover.connect(member).burnStake(coverId, burnAmount)).to.be.revertedWith(
      'Caller is not an internal contract',
    );
  });

  it('updates segment allocation cover amount in nxm', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;
    const [internal] = fixture.accounts.internalContracts;
    const { amount } = coverBuyFixture;
    const { coverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const burnAmountDivisor = 2;
    const burnAmount = amount.div(burnAmountDivisor);

    const [poolAllocationBefore] = await cover.getPoolAllocations(coverId);
    const payoutAmountInNXM = poolAllocationBefore.coverAmountInNXM.div(burnAmountDivisor);

    await cover.connect(internal).burnStake(coverId, burnAmount);

    const [poolAllocationAfter] = await cover.getPoolAllocations(coverId);

    expect(poolAllocationAfter.coverAmountInNXM).to.be.equal(
      poolAllocationBefore.coverAmountInNXM.sub(payoutAmountInNXM),
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

    const { coverId } = await buyCoverOnMultiplePools.call(fixture, {
      ...coverBuyFixture,
      allocationRequest,
    });

    const burnAmountDivisor = 2;
    const payoutAmountInAsset = amount.div(burnAmountDivisor);
    const remainingAmount = amount.sub(payoutAmountInAsset);

    const coverData = await cover.getCoverData(coverId);
    const poolAllocationsBefore = await cover.getPoolAllocations(coverId);

    const expectedBurnAmount = poolAllocationsBefore.map(allocation => {
      const payoutInNXM = allocation.coverAmountInNXM.mul(payoutAmountInAsset).div(coverData.amount);
      return payoutInNXM.mul(GLOBAL_CAPACITY_DENOMINATOR).div(coverData.capacityRatio);
    });

    await cover.connect(internal).burnStake(coverId, payoutAmountInAsset);
    await assertCoverFields(cover, coverId, {
      productId,
      coverAsset,
      period,
      amount: remainingAmount,
      gracePeriod,
    });

    const poolAllocationsAfter = await cover.getPoolAllocations(coverId);

    for (let i = 0; i < amountOfPools; i++) {
      const stakingPool = await ethers.getContractAt('COMockStakingPool', await stakingProducts.stakingPool(i + 1));

      const burnStakeCalledWithAmount = await stakingPool.burnStakeCalledWithAmount();
      expect(burnStakeCalledWithAmount).to.be.equal(expectedBurnAmount[i]);

      const payoutAmountInNXM = poolAllocationsBefore[i].coverAmountInNXM.div(burnAmountDivisor);

      expect(poolAllocationsAfter[i].coverAmountInNXM).to.be.equal(
        poolAllocationsBefore[i].coverAmountInNXM.sub(payoutAmountInNXM),
      );
    }
  });

  it('should perform a burn with globalCapacityRatio when the cover was bought', async function () {
    const fixture = await loadFixture(setup);
    const { cover, stakingProducts } = fixture;
    const [internal] = fixture.accounts.internalContracts;
    const { productId, coverAsset, period, amount } = coverBuyFixture;
    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const payoutAmountInAsset = amount.div(2);
    const remainingAmount = amount.sub(payoutAmountInAsset);

    const coverData = await cover.getCoverData(expectedCoverId);
    const [poolAllocation] = await cover.getPoolAllocations(expectedCoverId);

    const payoutAmountInNXM = poolAllocation.coverAmountInNXM.mul(payoutAmountInAsset).div(coverData.amount);
    const expectedBurnAmount = payoutAmountInNXM.mul(GLOBAL_CAPACITY_DENOMINATOR).div(coverData.capacityRatio);

    await cover.connect(internal).burnStake(expectedCoverId, payoutAmountInAsset);
    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period,
      amount: remainingAmount,
      gracePeriod,
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
    const { coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const burnAmountDivisor = 2;
    const burnAmount = amount.div(burnAmountDivisor);

    const [poolAllocationBefore] = await cover.getPoolAllocations(expectedCoverId);

    await cover.connect(internal).burnStake(expectedCoverId, burnAmount);

    const payoutAmountInNXM = poolAllocationBefore.premiumInNXM.div(burnAmountDivisor);
    const [poolAllocationAfter] = await cover.getPoolAllocations(expectedCoverId);
    expect(poolAllocationAfter.premiumInNXM).to.be.equal(poolAllocationBefore.premiumInNXM.sub(payoutAmountInNXM));
  });
});

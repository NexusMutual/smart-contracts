const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');
const {
  assertCoverFields,
  buyCoverOnOnePool,
  buyCoverOnMultiplePools,
  createStakingPool,
  calculateRemainingPeriod,
  calculateMockEditPremium,
} = require('./helpers');
const {
  evm: { setNextBlockTime },
} = require('../utils');
const { daysToSeconds } = require('../utils').helpers;
const { expect } = require('chai');
const { BigNumber } = require('ethers');
const { AddressZero } = ethers.constants;

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

    const stakingPool = await ethers.getContractAt('CoverMockStakingPool', await stakingProducts.stakingPool(1));
    const burnStakeCalledWithAmount = await stakingPool.burnStakeCalledWithAmount();
    expect(burnStakeCalledWithAmount).to.be.equal(expectedBurnAmount);
  });

  it('should perform a burn on the last segment for cover with 2 segments and 1 pool allocation', async function () {
    const fixture = await loadFixture(setup);
    const { cover, stakingProducts, accounts } = fixture;
    const [coverBuyer] = fixture.accounts.members;
    const [internal] = accounts.internalContracts;
    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;
    const { segmentId, coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const payoutAmountInAsset = amount.div(3);

    const segment = await cover.coverSegmentWithRemainingAmount(expectedCoverId, segmentId);
    const segmentAllocation = await cover.coverSegmentAllocations(expectedCoverId, segmentId, '0');

    const payoutAmountInNXM = segmentAllocation.coverAmountInNXM.mul(payoutAmountInAsset).div(segment.amount);
    const expectedBurnAmount = payoutAmountInNXM.mul(GLOBAL_CAPACITY_DENOMINATOR).div(segment.globalCapacityRatio);

    const passedPeriod = daysToSeconds(15);
    const { start: startTimestamp } = await cover.coverSegmentWithRemainingAmount(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const remainingPeriod = calculateRemainingPeriod({ period, passedPeriod });

    const extraPeriod = period;
    const increasedPeriod = remainingPeriod.add(extraPeriod);
    const increasedAmount = amount.mul(4);

    const expectedPremium = calculateMockEditPremium({
      existingAmount: amount,
      increasedAmount,
      targetPriceRatio,
      period: increasedPeriod,
      extraPeriod,
      priceDenominator,
    });

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: increasedAmount,
        period: extraPeriod,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: increasedAmount.toString() }],
      {
        value: expectedPremium,
      },
    );

    const lastSegmentId = 1;

    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period: increasedPeriod,
      amount: increasedAmount,
      gracePeriod,
      segmentId: lastSegmentId,
    });

    await cover.connect(internal).burnStake(expectedCoverId, lastSegmentId, payoutAmountInAsset);

    const remainingAmount = increasedAmount.sub(payoutAmountInAsset);

    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period: increasedPeriod,
      amount: remainingAmount,
      targetPriceRatio,
      gracePeriod,
      segmentId: lastSegmentId,
      amountPaidOut: payoutAmountInAsset,
    });

    const stakingPool = await ethers.getContractAt('CoverMockStakingPool', await stakingProducts.stakingPool(1));
    const burnStakeCalledWithAmount = await stakingPool.burnStakeCalledWithAmount();
    expect(burnStakeCalledWithAmount).to.be.equal(expectedBurnAmount);

    const deallocateCalledWithParams = await stakingPool.deallocateCalledWithParams();

    const lastSegment = await cover.coverSegmentWithRemainingAmount(expectedCoverId, lastSegmentId);

    expect(deallocateCalledWithParams.allocationId).to.be.equal(0);
    expect(deallocateCalledWithParams.productId).to.be.equal(productId);
    expect(deallocateCalledWithParams.start).to.be.equal(lastSegment.start);
    expect(deallocateCalledWithParams.period).to.be.equal(lastSegment.period);
    expect(deallocateCalledWithParams.deallocationAmount).to.be.equal(payoutAmountInNXM);
  });

  it('should perform a burn on the first segment for cover with 2 segments and 1 pool allocation', async function () {
    const fixture = await loadFixture(setup);
    const { cover, stakingProducts, accounts } = fixture;
    const [coverBuyer] = fixture.accounts.members;
    const [internal] = accounts.internalContracts;
    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = coverBuyFixture;
    const { segmentId: firstSegmentId, coverId: expectedCoverId } = await buyCoverOnOnePool.call(
      fixture,
      coverBuyFixture,
    );

    const payoutAmountInAsset = amount.div(3);

    const segment = await cover.coverSegmentWithRemainingAmount(expectedCoverId, firstSegmentId);
    const segmentAllocation = await cover.coverSegmentAllocations(expectedCoverId, firstSegmentId, '0');

    const payoutAmountInNXM = segmentAllocation.coverAmountInNXM.mul(payoutAmountInAsset).div(segment.amount);
    const expectedBurnAmount = payoutAmountInNXM.mul(GLOBAL_CAPACITY_DENOMINATOR).div(segment.globalCapacityRatio);

    const passedPeriod = daysToSeconds(15);
    const { start: startTimestamp } = await cover.coverSegmentWithRemainingAmount(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const remainingPeriod = calculateRemainingPeriod({ period, passedPeriod });

    const extraPeriod = period;
    const increasedPeriod = remainingPeriod.add(extraPeriod);

    const increasedAmount = amount.mul(4);

    const expectedPremium = calculateMockEditPremium({
      existingAmount: amount,
      increasedAmount,
      targetPriceRatio,
      period: increasedPeriod,
      extraPeriod,
      priceDenominator,
    });

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: increasedAmount,
        period: extraPeriod,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: increasedAmount.toString() }],
      {
        value: expectedPremium,
      },
    );

    const lastSegmentId = 1;

    await cover.connect(internal).burnStake(expectedCoverId, firstSegmentId, payoutAmountInAsset);
    const remainingAmount = increasedAmount.sub(payoutAmountInAsset);

    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period: increasedPeriod,
      amount: remainingAmount,
      targetPriceRatio,
      gracePeriod,
      segmentId: lastSegmentId,
      amountPaidOut: payoutAmountInAsset,
    });

    const stakingPool = await ethers.getContractAt('CoverMockStakingPool', await stakingProducts.stakingPool(1));
    const burnStakeCalledWithAmount = await stakingPool.burnStakeCalledWithAmount();
    expect(burnStakeCalledWithAmount).to.be.equal(expectedBurnAmount);

    const deallocateCalledWithParams = await stakingPool.deallocateCalledWithParams();

    const lastSegment = await cover.coverSegmentWithRemainingAmount(expectedCoverId, lastSegmentId);

    expect(deallocateCalledWithParams.allocationId).to.be.equal(0);
    expect(deallocateCalledWithParams.productId).to.be.equal(productId);
    expect(deallocateCalledWithParams.start).to.be.equal(lastSegment.start);
    expect(deallocateCalledWithParams.period).to.be.equal(lastSegment.period);
    expect(deallocateCalledWithParams.deallocationAmount).to.be.equal(payoutAmountInNXM);
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

    const allocationRequests = [];
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
      allocationRequests.push({ poolId: i, coverAmountInAsset: amountPerPool });
    }

    const { segmentId, coverId: expectedCoverId } = await buyCoverOnMultiplePools.call(fixture, {
      ...coverBuyFixture,
      allocationRequest: allocationRequests,
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
      const stakingPool = await ethers.getContractAt('CoverMockStakingPool', await stakingProducts.stakingPool(i + 1));

      const burnStakeCalledWithAmount = await stakingPool.burnStakeCalledWithAmount();
      expect(burnStakeCalledWithAmount).to.be.equal(expectedBurnAmount[i]);

      const segmentAllocationAfter = await cover.coverSegmentAllocations(expectedCoverId, segmentId, i);
      const payoutAmountInNXM = segmentAllocationsBefore[i].coverAmountInNXM.div(burnAmountDivisor);

      expect(segmentAllocationAfter.coverAmountInNXM).to.be.equal(
        segmentAllocationsBefore[i].coverAmountInNXM.sub(payoutAmountInNXM),
      );
    }
  });

  it('should perform a burn on the last segment of a cover with 3 pool allocations', async function () {
    const fixture = await loadFixture(setup);
    const { cover, stakingProducts } = fixture;
    const [internal] = fixture.accounts.internalContracts;
    const [coverBuyer, stakingPoolManager] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, capacity, activeCover, priceDenominator } =
      coverBuyFixture;
    const amountOfPools = 3;

    const amountsPerPoolsForFirstSegment = [parseEther('500'), parseEther('200'), parseEther('300')];

    const allocationRequests = [];
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
      allocationRequests.push({ poolId: i, coverAmountInAsset: amountsPerPoolsForFirstSegment[i - 1] });
    }

    const { segmentId, coverId: expectedCoverId } = await buyCoverOnMultiplePools.call(fixture, {
      ...coverBuyFixture,
      allocationRequest: allocationRequests,
    });

    const passedPeriod = daysToSeconds(15);
    const { start: startTimestamp } = await cover.coverSegmentWithRemainingAmount(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const remainingPeriod = calculateRemainingPeriod({ period, passedPeriod });

    const extraPeriod = period;
    const increasedPeriod = remainingPeriod.add(extraPeriod);

    const increasedAmount = amount.mul(2);

    const amountsPerPoolsForSecondSegment = [parseEther('1000'), parseEther('1000'), parseEther('0')];

    const allocationRequestsForSecondSegment = [];

    let totalExpectedPremium = BigNumber.from(0);
    for (let i = 1; i <= amountOfPools; i++) {
      const expectedPremiumPerPool = calculateMockEditPremium({
        existingAmount: amountsPerPoolsForFirstSegment[i - 1],
        increasedAmount,
        targetPriceRatio,
        period: increasedPeriod,
        extraPeriod,
        priceDenominator,
      });

      totalExpectedPremium = totalExpectedPremium.add(expectedPremiumPerPool);
      allocationRequestsForSecondSegment.push({
        poolId: i,
        coverAmountInAsset: amountsPerPoolsForSecondSegment[i - 1],
      });
    }

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: increasedAmount,
        period: extraPeriod,
        maxPremiumInAsset: totalExpectedPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      allocationRequestsForSecondSegment,
      {
        value: totalExpectedPremium,
      },
    );

    const secondSegmentId = segmentId + 1;

    const burnAmountDivisor = 2;
    const payoutAmountInAsset = increasedAmount.div(burnAmountDivisor);
    const remainingAmount = increasedAmount.sub(payoutAmountInAsset);
    const segmentAllocationsBefore = [];
    const expectedBurnAmount = [];

    const segment = await cover.coverSegmentWithRemainingAmount(expectedCoverId, secondSegmentId);

    const amountOfPoolsAfterEdit = amountsPerPoolsForSecondSegment.filter(amount => amount.gt(0)).length;

    for (let i = 0; i < amountOfPoolsAfterEdit; i++) {
      const segmentAllocationBefore = await cover.coverSegmentAllocations(expectedCoverId, secondSegmentId, i);
      segmentAllocationsBefore.push(segmentAllocationBefore);

      const payoutAmountInNXM = segmentAllocationBefore.coverAmountInNXM.mul(payoutAmountInAsset).div(segment.amount);
      expectedBurnAmount.push(payoutAmountInNXM.mul(GLOBAL_CAPACITY_DENOMINATOR).div(segment.globalCapacityRatio));
    }

    await cover.connect(internal).burnStake(expectedCoverId, secondSegmentId, payoutAmountInAsset);

    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period: increasedPeriod,
      amount: remainingAmount,
      targetPriceRatio,
      gracePeriod,
      segmentId: secondSegmentId,
      amountPaidOut: payoutAmountInAsset,
    });

    for (let i = 0; i < amountOfPoolsAfterEdit; i++) {
      const stakingPool = await ethers.getContractAt('CoverMockStakingPool', await stakingProducts.stakingPool(i + 1));

      const burnStakeCalledWithAmount = await stakingPool.burnStakeCalledWithAmount();
      expect(burnStakeCalledWithAmount).to.be.equal(expectedBurnAmount[i]);

      const segmentAllocationAfter = await cover.coverSegmentAllocations(expectedCoverId, secondSegmentId, i);
      const payoutAmountInNXM = segmentAllocationsBefore[i].coverAmountInNXM.div(burnAmountDivisor);

      expect(segmentAllocationAfter.coverAmountInNXM).to.be.equal(
        segmentAllocationsBefore[i].coverAmountInNXM.sub(payoutAmountInNXM),
      );
    }
  });

  it('should perform a burn on a previous segment of a cover with 3 pool allocations', async function () {
    const fixture = await loadFixture(setup);
    const { cover, stakingProducts } = fixture;
    const [internal] = fixture.accounts.internalContracts;
    const [coverBuyer, stakingPoolManager] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, capacity, activeCover, priceDenominator } =
      coverBuyFixture;
    const amountOfPools = 3;

    const amountsPerPoolsForFirstSegment = [parseEther('500'), parseEther('500')];

    const allocationRequests = [];
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

      if (i <= amountsPerPoolsForFirstSegment.length) {
        allocationRequests.push({ poolId: i, coverAmountInAsset: amountsPerPoolsForFirstSegment[i - 1] });
      }
    }

    const { segmentId, coverId: expectedCoverId } = await buyCoverOnMultiplePools.call(fixture, {
      ...coverBuyFixture,
      allocationRequest: allocationRequests,
    });

    const passedPeriod = daysToSeconds(15);
    const { start: startTimestamp } = await cover.coverSegmentWithRemainingAmount(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const remainingPeriod = calculateRemainingPeriod({ period, passedPeriod });

    const extraPeriod = period;
    const increasedPeriod = remainingPeriod.add(extraPeriod);

    const increasedAmount = amount.mul(2);

    // allocation for first segment is increased and a new allocation is added
    const amountsPerPoolsForSecondSegment = [parseEther('1000'), parseEther('500'), parseEther('500')];

    const allocationRequestsForSecondSegment = [];

    let totalExpectedPremium = BigNumber.from(0);
    for (let i = 1; i <= amountsPerPoolsForSecondSegment.length; i++) {
      const expectedPremiumPerPool = calculateMockEditPremium({
        existingAmount:
          i <= amountsPerPoolsForFirstSegment.length ? amountsPerPoolsForFirstSegment[i - 1] : BigNumber.from(0),
        increasedAmount,
        targetPriceRatio,
        period: increasedPeriod,
        extraPeriod,
        priceDenominator,
      });

      totalExpectedPremium = totalExpectedPremium.add(expectedPremiumPerPool);
      allocationRequestsForSecondSegment.push({
        poolId: i,
        coverAmountInAsset: amountsPerPoolsForSecondSegment[i - 1],
      });
    }

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: increasedAmount,
        period: extraPeriod,
        maxPremiumInAsset: totalExpectedPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      allocationRequestsForSecondSegment,
      {
        value: totalExpectedPremium,
      },
    );

    const burnedSegmentId = segmentId;
    const lastSegmentId = segmentId + 1;

    const burnAmountDivisor = 2;
    const payoutAmountInAsset = increasedAmount.div(burnAmountDivisor);
    const remainingAmount = increasedAmount.sub(payoutAmountInAsset);
    const segmentAllocationsBefore = [];
    const expectedBurnAmount = [];

    const segment = await cover.coverSegmentWithRemainingAmount(expectedCoverId, burnedSegmentId);

    const amountOfPoolsAfterEdit = amountsPerPoolsForSecondSegment.filter(amount => amount.gt(0)).length;

    for (let i = 0; i < amountsPerPoolsForSecondSegment.length; i++) {
      const segmentAllocationBefore = await cover.coverSegmentAllocations(expectedCoverId, lastSegmentId, i);
      segmentAllocationsBefore.push(segmentAllocationBefore);
    }

    for (let i = 0; i < amountsPerPoolsForFirstSegment.length; i++) {
      const burnedSegmentAllocationBefore = await cover.coverSegmentAllocations(expectedCoverId, burnedSegmentId, i);
      const payoutAmountInNXM = burnedSegmentAllocationBefore.coverAmountInNXM
        .mul(payoutAmountInAsset)
        .div(segment.amount);
      expectedBurnAmount.push(payoutAmountInNXM.mul(GLOBAL_CAPACITY_DENOMINATOR).div(segment.globalCapacityRatio));
    }

    await cover.connect(internal).burnStake(expectedCoverId, burnedSegmentId, payoutAmountInAsset);

    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period: increasedPeriod,
      amount: remainingAmount,
      targetPriceRatio,
      gracePeriod,
      segmentId: segmentId + 1,
      amountPaidOut: payoutAmountInAsset,
    });

    for (let i = 0; i < amountOfPoolsAfterEdit; i++) {
      const stakingPool = await ethers.getContractAt('CoverMockStakingPool', await stakingProducts.stakingPool(i + 1));

      if (i < amountsPerPoolsForFirstSegment.length) {
        const burnStakeCalledWithAmount = await stakingPool.burnStakeCalledWithAmount();
        expect(burnStakeCalledWithAmount).to.be.equal(expectedBurnAmount[i]);
      }

      const segmentAllocationAfter = await cover.coverSegmentAllocations(expectedCoverId, lastSegmentId, i);
      const payoutAmountInNXM = segmentAllocationsBefore[i].coverAmountInNXM.div(burnAmountDivisor);

      expect(segmentAllocationAfter.coverAmountInNXM).to.be.equal(
        segmentAllocationsBefore[i].coverAmountInNXM.sub(payoutAmountInNXM),
      );
    }
  });

  it('should perform a burn on a previous segment of a cover with pools replaced completely', async function () {
    const fixture = await loadFixture(setup);
    const { cover, stakingProducts } = fixture;
    const [internal] = fixture.accounts.internalContracts;
    const [coverBuyer, stakingPoolManager] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, capacity, activeCover, priceDenominator } =
      coverBuyFixture;
    const amountOfPools = 3;

    const totalAmountOfPools = amountOfPools * 2;

    const amountsPerPoolsForFirstSegment = [parseEther('500'), parseEther('300'), parseEther('200')];

    const allocationRequests = [];
    for (let i = 1; i <= totalAmountOfPools; i++) {
      await createStakingPool(
        stakingProducts,
        productId,
        capacity,
        targetPriceRatio,
        activeCover,
        stakingPoolManager,
        targetPriceRatio,
      );

      if (i <= amountsPerPoolsForFirstSegment.length) {
        allocationRequests.push({ poolId: i, coverAmountInAsset: amountsPerPoolsForFirstSegment[i - 1] });
      }
    }

    const { segmentId, coverId: expectedCoverId } = await buyCoverOnMultiplePools.call(fixture, {
      ...coverBuyFixture,
      allocationRequest: allocationRequests,
    });

    const passedPeriod = daysToSeconds(15);
    const { start: startTimestamp } = await cover.coverSegmentWithRemainingAmount(expectedCoverId, 0);
    const editTimestamp = BigNumber.from(startTimestamp).add(passedPeriod);
    await setNextBlockTime(editTimestamp.toNumber());

    const remainingPeriod = calculateRemainingPeriod({ period, passedPeriod });

    const extraPeriod = period;
    const increasedPeriod = remainingPeriod.add(extraPeriod);

    const increasedAmount = amount.mul(2);

    // allocation for first segment is increased and a new allocation is added
    const amountsPerPoolsForSecondSegment = [
      parseEther('0'),
      parseEther('0'),
      parseEther('0'),
      parseEther('1000'),
      parseEther('500'),
      parseEther('500'),
    ];

    const allocationRequestsForSecondSegment = [];

    let totalExpectedPremium = BigNumber.from(0);
    for (let i = 1; i <= amountsPerPoolsForSecondSegment.length; i++) {
      const expectedPremiumPerPool = calculateMockEditPremium({
        existingAmount:
          i <= amountsPerPoolsForFirstSegment.length ? amountsPerPoolsForFirstSegment[i - 1] : BigNumber.from(0),
        increasedAmount,
        targetPriceRatio,
        period: increasedPeriod,
        extraPeriod,
        priceDenominator,
      });

      totalExpectedPremium = totalExpectedPremium.add(expectedPremiumPerPool);
      allocationRequestsForSecondSegment.push({
        poolId: i,
        coverAmountInAsset: amountsPerPoolsForSecondSegment[i - 1],
      });
    }

    await cover.connect(coverBuyer).buyCover(
      {
        coverId: expectedCoverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: increasedAmount,
        period: extraPeriod,
        maxPremiumInAsset: totalExpectedPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      allocationRequestsForSecondSegment,
      {
        value: totalExpectedPremium,
      },
    );

    const burnedSegmentId = segmentId;
    const lastSegmentId = segmentId + 1;

    const burnAmountDivisor = 2;
    const payoutAmountInAsset = increasedAmount.div(burnAmountDivisor);
    const remainingAmount = increasedAmount.sub(payoutAmountInAsset);
    const segmentAllocationsBefore = [];
    const expectedBurnAmount = [];

    const segment = await cover.coverSegmentWithRemainingAmount(expectedCoverId, burnedSegmentId);

    const amountOfPoolsAfterEdit = amountsPerPoolsForSecondSegment.filter(amount => amount.gt(0)).length;

    for (let i = 0; i < amountOfPoolsAfterEdit; i++) {
      const segmentAllocationBefore = await cover.coverSegmentAllocations(expectedCoverId, lastSegmentId, i);
      segmentAllocationsBefore.push(segmentAllocationBefore);
    }

    for (let i = 0; i < amountsPerPoolsForFirstSegment.length; i++) {
      const burnedSegmentAllocationBefore = await cover.coverSegmentAllocations(expectedCoverId, burnedSegmentId, i);
      const payoutAmountInNXM = burnedSegmentAllocationBefore.coverAmountInNXM
        .mul(payoutAmountInAsset)
        .div(segment.amount);
      expectedBurnAmount.push(payoutAmountInNXM.mul(GLOBAL_CAPACITY_DENOMINATOR).div(segment.globalCapacityRatio));
    }

    await cover.connect(internal).burnStake(expectedCoverId, burnedSegmentId, payoutAmountInAsset);

    await assertCoverFields(cover, expectedCoverId, {
      productId,
      coverAsset,
      period: increasedPeriod,
      amount: remainingAmount,
      targetPriceRatio,
      gracePeriod,
      segmentId: segmentId + 1,
      amountPaidOut: payoutAmountInAsset,
    });

    for (let i = 0; i < amountOfPoolsAfterEdit; i++) {
      const stakingPool = await ethers.getContractAt('CoverMockStakingPool', await stakingProducts.stakingPool(i + 1));

      if (i < amountsPerPoolsForFirstSegment.length) {
        const burnStakeCalledWithAmount = await stakingPool.burnStakeCalledWithAmount();
        expect(burnStakeCalledWithAmount).to.be.equal(expectedBurnAmount[i]);
      }

      const segmentAllocationAfter = await cover.coverSegmentAllocations(expectedCoverId, lastSegmentId, i);
      const payoutAmountInNXM = segmentAllocationsBefore[i].coverAmountInNXM.div(burnAmountDivisor);

      expect(segmentAllocationAfter.coverAmountInNXM).to.be.equal(
        segmentAllocationsBefore[i].coverAmountInNXM.sub(payoutAmountInNXM),
      );
    }
  });

  it.skip('should perform a burn with globalCapacityRatio when the cover was bought', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture;
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

    const stakingPool = await ethers.getContractAt('CoverMockStakingPool', await cover.stakingPool(1));
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

  it('call stakingPool with correct parameters', async function () {
    const fixture = await loadFixture(setup);
    const { cover, stakingProducts } = fixture;
    const [internal] = fixture.accounts.internalContracts;
    const { amount, productId } = coverBuyFixture;
    const { segmentId, coverId: expectedCoverId } = await buyCoverOnOnePool.call(fixture, coverBuyFixture);

    const burnAmountDivisor = 2;
    const payoutAmountInAsset = amount.div(burnAmountDivisor);
    const burnAmount = amount.div(burnAmountDivisor);

    const segment = await cover.coverSegmentWithRemainingAmount(expectedCoverId, segmentId);
    const segmentAllocation = await cover.coverSegmentAllocations(expectedCoverId, segmentId, '0');

    const payoutAmountInNXM = segmentAllocation.coverAmountInNXM.mul(payoutAmountInAsset).div(segment.amount);
    const expectedBurnAmount = payoutAmountInNXM.mul(GLOBAL_CAPACITY_DENOMINATOR).div(segment.globalCapacityRatio);

    await cover.connect(internal).burnStake(expectedCoverId, segmentId, burnAmount);

    const stakingPool = await ethers.getContractAt('CoverMockStakingPool', await stakingProducts.stakingPool(1));

    const burnStakeCalledWithAmount = await stakingPool.burnStakeCalledWithAmount();
    expect(burnStakeCalledWithAmount).to.be.equal(expectedBurnAmount);

    const allocationId = 0;
    const deallocateCalledWithParams = await stakingPool.deallocateCalledWithParams();
    expect(deallocateCalledWithParams.allocationId).to.be.equal(allocationId);
    expect(deallocateCalledWithParams.period).to.be.equal(segment.period);
    expect(deallocateCalledWithParams.start).to.be.equal(segment.start);
    expect(deallocateCalledWithParams.productId).to.be.equal(productId);
    expect(deallocateCalledWithParams.deallocationAmount).to.be.equal(payoutAmountInNXM);
  });
});

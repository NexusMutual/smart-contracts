const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { getTranches, moveTimeToNextBucket, moveTimeToNextTranche, BUCKET_DURATION, setTime } = require('./helpers');
const { daysToSeconds } = require('../../../lib/helpers');

const { AddressZero, Two, Zero } = ethers.constants;
const { parseEther } = ethers.utils;

const MaxUint32 = Two.pow(32).sub(1);

const DEFAULT_PERIOD = daysToSeconds(30);
const DEFAULT_GRACE_PERIOD = daysToSeconds(30);
const BUCKET_TRANCHE_GROUP_SIZE = 8;
const EXPIRING_ALLOCATION_DATA_GROUP_SIZE = 32;

const initialProduct = {
  productId: 0,
  weight: 100,
  initialPrice: 255,
  targetPrice: 386,
};

const poolInitParams = {
  poolId: 1,
  initialPoolFee: 5, // 5%
  maxPoolFee: 5, // 5%
  products: [initialProduct],
};

const productTypeFixture = {
  claimMethod: 0,
  gracePeriod: daysToSeconds(7), // 7 days
};

const coverProductTemplate = {
  productType: 1,
  minPrice: 0,
  __gap: 0,
  coverAssets: 1111,
  initialPriceRatio: 500,
  capacityReductionRatio: 0,
  isDeprecated: false,
  useFixedPrice: false,
};

const burnStakeParams = {
  allocationId: 0,
  productId: 0,
  start: 0,
  period: 0,
  deallocationAmount: 0,
};

const allocationRequestParams = {
  productId: 0,
  coverId: 0,
  period: DEFAULT_PERIOD,
  gracePeriod: DEFAULT_GRACE_PERIOD,
  useFixedPrice: false,
  capacityRatio: 20000,
  capacityReductionRatio: 0,
  rewardRatio: 5000,
  productMinPrice: 10000,
};

const stakedNxmAmount = parseEther('100');
const burnAmount = parseEther('10');
const setup = require('./setup');

async function burnStakeSetup() {
  const fixture = await loadFixture(setup);
  const { stakingPool, stakingProducts, coverProducts } = fixture;
  const [staker] = fixture.accounts.members;
  const { poolId, initialPoolFee, maxPoolFee, products } = poolInitParams;

  await coverProducts.setProductType(productTypeFixture, initialProduct.productId);
  await coverProducts.setProduct(coverProductTemplate, initialProduct.productId);

  await stakingPool.connect(fixture.stakingProductsSigner).initialize(
    false, // isPrivatePool
    initialPoolFee,
    maxPoolFee,
    poolId,
  );

  await stakingProducts.connect(fixture.stakingProductsSigner).setInitialProducts(poolId, products);

  // Move to the beginning of the next tranche
  const currentTrancheId = await moveTimeToNextTranche(1);

  // Deposit into pool
  await stakingPool.connect(staker).depositTo(stakedNxmAmount, currentTrancheId, 0, AddressZero);
  await stakingPool.connect(staker).depositTo(stakedNxmAmount, currentTrancheId + 1, 0, AddressZero);
  await stakingPool.connect(staker).depositTo(stakedNxmAmount, currentTrancheId + 2, 0, AddressZero);

  return fixture;
}

describe('burnStake', function () {
  it('should revert if the caller is not the cover contract', async function () {
    const fixture = await loadFixture(burnStakeSetup);
    const { stakingPool } = fixture;
    await expect(stakingPool.burnStake(10, burnStakeParams)).to.be.revertedWithCustomError(
      stakingPool,
      'OnlyCoverContract',
    );
  });

  it('should block the pool if 100% of the stake is burned', async function () {
    const fixture = await loadFixture(burnStakeSetup);
    const { stakingPool } = fixture;
    const {
      members: [member],
    } = fixture.accounts;

    // burn all of the active stake
    const activeStake = await stakingPool.getActiveStake();
    await stakingPool.connect(fixture.coverSigner).burnStake(activeStake, burnStakeParams);
    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);

    // depositTo and extendDeposit should revert
    await expect(
      stakingPool.connect(member).depositTo(stakedNxmAmount, firstActiveTrancheId, 0, AddressZero),
    ).to.be.revertedWithCustomError(stakingPool, 'PoolHalted');
    await expect(stakingPool.connect(member).extendDeposit(0, 0, 0, 0)).to.be.revertedWithCustomError(
      stakingPool,
      'PoolHalted',
    );
  });

  it('should not block pool if 99% of the stake is burned', async function () {
    const fixture = await loadFixture(burnStakeSetup);
    const { stakingPool } = fixture;
    const {
      members: [member],
    } = fixture.accounts;

    // burn activeStake - 1
    const activeStake = await stakingPool.getActiveStake();
    await stakingPool.connect(fixture.coverSigner).burnStake(activeStake.sub(1), burnStakeParams);

    // deposit should work
    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);
    await expect(stakingPool.connect(member).depositTo(stakedNxmAmount, firstActiveTrancheId, 0, AddressZero)).to.not.be
      .reverted;

    // Burn all activeStake
    await stakingPool.connect(fixture.coverSigner).burnStake(stakedNxmAmount.add(1), burnStakeParams);

    // deposit should fail
    await expect(
      stakingPool.connect(member).depositTo(stakedNxmAmount, firstActiveTrancheId, 0, AddressZero),
    ).to.be.revertedWithCustomError(stakingPool, 'PoolHalted');
  });

  it('reduces activeStake', async function () {
    const fixture = await loadFixture(burnStakeSetup);
    const { stakingPool } = fixture;

    const activeStakeBefore = await stakingPool.getActiveStake();

    await stakingPool.connect(fixture.coverSigner).burnStake(burnAmount, burnStakeParams);

    const activeStakeAfter = await stakingPool.getActiveStake();
    expect(activeStakeAfter).to.equal(activeStakeBefore.sub(burnAmount));
  });

  it('emits StakeBurned and ActiveStakeUpdated events', async function () {
    const fixture = await loadFixture(burnStakeSetup);
    const { stakingPool } = fixture;

    const expectedStakeSharesSupply = await stakingPool.getStakeSharesSupply(); // shouldn't change

    const activeStakeBefore = await stakingPool.getActiveStake();
    const expectedActiveStake = activeStakeBefore.sub(burnAmount);

    const tx = stakingPool.connect(fixture.coverSigner).burnStake(burnAmount, burnStakeParams);

    await expect(tx).to.emit(stakingPool, 'StakeBurned').withArgs(burnAmount);
    await expect(tx)
      .to.emit(stakingPool, 'ActiveStakeUpdated')
      .withArgs(expectedActiveStake, expectedStakeSharesSupply);
  });

  it('burns staked NXM in token controller', async function () {
    const fixture = await loadFixture(burnStakeSetup);
    const { stakingPool, nxm, tokenController } = fixture;

    const poolId = await stakingPool.getPoolId();

    const balanceBefore = await nxm.balanceOf(tokenController.address);
    const tcBalancesBefore = await tokenController.stakingPoolNXMBalances(poolId);

    await stakingPool.connect(fixture.coverSigner).burnStake(burnAmount, burnStakeParams);

    const balanceAfter = await nxm.balanceOf(tokenController.address);
    const tcBalancesAfter = await tokenController.stakingPoolNXMBalances(poolId);

    expect(balanceAfter).to.equal(balanceBefore.sub(burnAmount));
    expect(tcBalancesAfter.deposits).to.equal(tcBalancesBefore.deposits.sub(burnAmount));
  });

  it('works correctly if burnAmount > initialStake', async function () {
    const fixture = await loadFixture(burnStakeSetup);
    const { stakingPool, nxm, tokenController } = fixture;

    const poolId = await stakingPool.getPoolId();

    const initialStake = await stakingPool.getActiveStake();
    const balanceBefore = await nxm.balanceOf(tokenController.address);
    const tcBalancesBefore = await tokenController.stakingPoolNXMBalances(poolId);

    const burnAmount = initialStake.add(parseEther('1'));

    // leaves 1 wei to avoid division by zero
    const actualBurnedAmount = initialStake.sub(1);
    await expect(stakingPool.connect(fixture.coverSigner).burnStake(burnAmount, burnStakeParams))
      .to.emit(stakingPool, 'StakeBurned')
      .withArgs(actualBurnedAmount);

    const activeStakeAfter = await stakingPool.getActiveStake();
    const balanceAfter = await nxm.balanceOf(tokenController.address);
    const tcBalancesAfter = await tokenController.stakingPoolNXMBalances(poolId);

    expect(activeStakeAfter).to.equal(initialStake.sub(actualBurnedAmount));
    expect(balanceAfter).to.equal(balanceBefore.sub(actualBurnedAmount));
    expect(tcBalancesAfter.deposits).to.equal(tcBalancesBefore.deposits.sub(actualBurnedAmount));
  });

  it('correctly deallocates cover tranche allocations', async function () {
    const fixture = await loadFixture(burnStakeSetup);
    const { stakingPool } = fixture;
    const { NXM_PER_ALLOCATION_UNIT } = fixture.config;

    const coverTrancheAllocationAmount = stakedNxmAmount.div(NXM_PER_ALLOCATION_UNIT);

    const allocationId1 = await stakingPool.getNextAllocationId();
    const allocationAmount1 = stakedNxmAmount;

    // allocates 50% of first tranche
    await stakingPool.connect(fixture.coverSigner).requestAllocation(allocationAmount1, allocationRequestParams);
    const firstAllocationBlock = await ethers.provider.getBlock('latest');

    {
      const coverTrancheAllocations = await stakingPool.coverTrancheAllocations(allocationId1);
      expect(coverTrancheAllocations.and(MaxUint32)).to.equal(allocationAmount1.div(NXM_PER_ALLOCATION_UNIT));
      expect(coverTrancheAllocations.shr(32)).to.equal(0);
      expect(coverTrancheAllocations.shr(64)).to.equal(0);
    }

    const allocationAmount2 = stakedNxmAmount.mul(2);
    const allocationId2 = await stakingPool.getNextAllocationId();

    // allocates 50% of first tranche and 50% of second tranche
    await stakingPool.connect(fixture.coverSigner).requestAllocation(allocationAmount2, allocationRequestParams);

    {
      const coverTrancheAllocations = await stakingPool.coverTrancheAllocations(allocationId2);
      expect(coverTrancheAllocations.and(MaxUint32)).to.equal(coverTrancheAllocationAmount);
      expect(coverTrancheAllocations.shr(32)).to.equal(coverTrancheAllocationAmount);
      expect(coverTrancheAllocations.shr(64)).to.equal(0);
    }

    const allocationAmount3 = stakedNxmAmount.mul(3);
    const allocationId3 = await stakingPool.getNextAllocationId();

    // deallocate first allocation, and allocate new one to be 50% of first tranche,
    // 50% of second tranche and 50% of third tranche
    await stakingPool.connect(fixture.coverSigner).requestDeallocation({
      allocationId: allocationId1,
      productId: allocationRequestParams.productId,
      premium: 0,
      start: firstAllocationBlock.timestamp,
      period: allocationRequestParams.period,
      rewardsRatio: 0,
    });
    await stakingPool.connect(fixture.coverSigner).requestAllocation(allocationAmount3, allocationRequestParams);

    const editAllocationBlock = await ethers.provider.getBlock('latest');

    {
      const coverTrancheAllocations = await stakingPool.coverTrancheAllocations(allocationId3);
      expect(coverTrancheAllocations.and(MaxUint32)).to.equal(coverTrancheAllocationAmount);
      expect(coverTrancheAllocations.shr(32).and(MaxUint32)).to.equal(coverTrancheAllocationAmount);
      expect(coverTrancheAllocations.shr(64)).to.equal(coverTrancheAllocationAmount);
    }

    // deallocates half of the last tranche
    const firstDeallocationAmount = stakedNxmAmount.div(2);
    const params = {
      allocationId: allocationId3,
      productId: allocationRequestParams.productId,
      start: editAllocationBlock.timestamp,
      period: allocationRequestParams.period,
      deallocationAmount: firstDeallocationAmount,
    };

    await stakingPool.connect(fixture.coverSigner).burnStake(0, params);

    {
      const coverTrancheAllocations = await stakingPool.coverTrancheAllocations(allocationId3);
      expect(coverTrancheAllocations.and(MaxUint32)).to.equal(coverTrancheAllocationAmount);
      expect(coverTrancheAllocations.shr(32).and(MaxUint32)).to.equal(coverTrancheAllocationAmount);
      expect(coverTrancheAllocations.shr(64)).to.equal(stakedNxmAmount.div(2).div(NXM_PER_ALLOCATION_UNIT));
    }

    // deallocates 100%
    const deallocationAmount = allocationAmount3.sub(firstDeallocationAmount);
    await stakingPool.connect(fixture.coverSigner).burnStake(0, { ...params, deallocationAmount });

    {
      const coverTrancheAllocations = await stakingPool.coverTrancheAllocations(allocationId1);
      expect(coverTrancheAllocations.and(MaxUint32)).to.equal(0);
      expect(coverTrancheAllocations.shr(32)).to.equal(0);
      expect(coverTrancheAllocations.shr(64)).to.equal(0);
    }
  });

  it('correctly deallocates stored tranche allocations', async function () {
    const fixture = await loadFixture(burnStakeSetup);
    const { stakingPool } = fixture;
    const { NXM_PER_ALLOCATION_UNIT } = fixture.config;

    const { productId } = allocationRequestParams;

    const allocationId1 = await stakingPool.getNextAllocationId();
    const allocationAmount1 = stakedNxmAmount;

    {
      const activeAllocations = await stakingPool.getActiveAllocations(productId);
      expect(activeAllocations[0]).to.equal(0);
    }

    // allocates 50% of first tranche
    await stakingPool.connect(fixture.coverSigner).requestAllocation(allocationAmount1, allocationRequestParams);
    const firstAllocationBlock = await ethers.provider.getBlock('latest');

    const allocationAmountInUnit = stakedNxmAmount.div(NXM_PER_ALLOCATION_UNIT);

    {
      const activeAllocations = await stakingPool.getActiveAllocations(productId);
      expect(activeAllocations[0]).to.equal(allocationAmountInUnit);
      expect(activeAllocations[1]).to.equal(0);
      expect(activeAllocations[2]).to.equal(0);
    }

    const allocationAmount2 = stakedNxmAmount.mul(2);

    // allocates 50% of first tranche and 50% of second tranche
    await stakingPool.connect(fixture.coverSigner).requestAllocation(allocationAmount2, allocationRequestParams);

    {
      const activeAllocations = await stakingPool.getActiveAllocations(productId);
      expect(activeAllocations[0]).to.equal(allocationAmountInUnit.mul(2));
      expect(activeAllocations[1]).to.equal(allocationAmountInUnit);
      expect(activeAllocations[2]).to.equal(0);
    }

    const allocationAmount3 = stakedNxmAmount.mul(3);
    const allocationId3 = await stakingPool.getNextAllocationId();

    // deallocate first allocation, and allocate new one to be 50% of first tranche,
    // 50% of second tranche and 50% of third tranche
    await stakingPool.connect(fixture.coverSigner).requestDeallocation({
      allocationId: allocationId1,
      productId: allocationRequestParams.productId,
      premium: 0,
      start: firstAllocationBlock.timestamp,
      period: allocationRequestParams.period,
      rewardsRatio: 0,
    });
    await stakingPool.connect(fixture.coverSigner).requestAllocation(allocationAmount3, allocationRequestParams);
    const editAllocationBlock = await ethers.provider.getBlock('latest');

    {
      const activeAllocations = await stakingPool.getActiveAllocations(productId);
      expect(activeAllocations[0]).to.equal(allocationAmountInUnit.mul(2));
      expect(activeAllocations[1]).to.equal(allocationAmountInUnit.mul(2));
      expect(activeAllocations[2]).to.equal(allocationAmountInUnit);
    }

    // deallocates half of the last tranche
    const firstDeallocationAmount = stakedNxmAmount.div(2);
    const params = {
      allocationId: allocationId3,
      productId,
      start: editAllocationBlock.timestamp,
      period: allocationRequestParams.period,
      deallocationAmount: firstDeallocationAmount,
    };

    await stakingPool.connect(fixture.coverSigner).burnStake(0, params);

    {
      const activeAllocations = await stakingPool.getActiveAllocations(productId);
      expect(activeAllocations[0]).to.equal(allocationAmountInUnit.mul(2));
      expect(activeAllocations[1]).to.equal(allocationAmountInUnit.mul(2));
      expect(activeAllocations[2]).to.equal(allocationAmountInUnit.div(2));
    }

    // deallocates 100%
    const deallocationAmount = allocationAmount3.sub(firstDeallocationAmount);
    await stakingPool.connect(fixture.coverSigner).burnStake(0, { ...params, deallocationAmount });

    {
      const activeAllocations = await stakingPool.getActiveAllocations(productId);
      expect(activeAllocations[0]).to.equal(allocationAmountInUnit);
      expect(activeAllocations[1]).to.equal(allocationAmountInUnit);
      expect(activeAllocations[2]).to.equal(0);
    }
  });

  it('does not deallocate after cover expiry', async function () {
    const fixture = await loadFixture(burnStakeSetup);
    const { stakingPool } = fixture;
    const { productId, period } = allocationRequestParams;

    // get to a new bucket to avoid expiration issues
    await moveTimeToNextBucket(1);

    const allocationId = await stakingPool.getNextAllocationId();
    const allocateTx = await stakingPool
      .connect(fixture.coverSigner)
      .requestAllocation(stakedNxmAmount, allocationRequestParams);

    const { blockNumber } = await allocateTx.wait();
    const { timestamp: allocationTimestamp } = await ethers.provider.getBlock(blockNumber);

    const initialAllocations = await stakingPool.getActiveAllocations(productId);
    const initiallyAllocatedTotal = initialAllocations.reduce((acc, val) => acc.add(val), Zero);

    const burnParams = {
      allocationId,
      productId,
      start: allocationTimestamp,
      period,
      deallocationAmount: initiallyAllocatedTotal.div(2), // claimed half of the cover amount
    };

    await setTime(allocationTimestamp + period + 1);
    await stakingPool.connect(fixture.coverSigner).burnStake(0, burnParams);

    const finalAllocations = await stakingPool.getActiveAllocations(productId);
    const finallyAllocatedTotal = finalAllocations.reduce((acc, val) => acc.add(val), Zero);

    expect(initiallyAllocatedTotal).to.equal(finallyAllocatedTotal);
  });

  it('does not deallocate if in grace period', async function () {
    const fixture = await loadFixture(burnStakeSetup);
    const { stakingPool } = fixture;
    const { NXM_PER_ALLOCATION_UNIT } = fixture.config;

    const { productId, period } = allocationRequestParams;

    const allocationId1 = await stakingPool.getNextAllocationId();
    const allocationAmount1 = stakedNxmAmount;

    {
      const activeAllocations = await stakingPool.getActiveAllocations(productId);
      expect(activeAllocations[0]).to.equal(0);
    }

    // allocates 50% of first tranche
    await stakingPool.connect(fixture.coverSigner).requestAllocation(allocationAmount1, allocationRequestParams);
    const firstAllocationBlock = await ethers.provider.getBlock('latest');

    const { firstActiveTrancheId: currentTrancheId } = await getTranches();

    const targetBucketId = Math.ceil((firstAllocationBlock.timestamp + period) / BUCKET_DURATION);

    const firstTrancheGroupId = Math.floor(currentTrancheId / BUCKET_TRANCHE_GROUP_SIZE);
    const firstTrancheIndexInGroup = currentTrancheId % BUCKET_TRANCHE_GROUP_SIZE;

    const secondTrancheId = currentTrancheId + 1;
    const secondTrancheGroupId = Math.floor(secondTrancheId / BUCKET_TRANCHE_GROUP_SIZE);
    const secondTrancheIndexInGroup = secondTrancheId % BUCKET_TRANCHE_GROUP_SIZE;

    const thirdTrancheId = currentTrancheId + 2;
    const thirdTrancheGroupId = Math.floor(thirdTrancheId / BUCKET_TRANCHE_GROUP_SIZE);
    const thirdTrancheIndexInGroup = thirdTrancheId % BUCKET_TRANCHE_GROUP_SIZE;

    const allocationAmountInUnit = stakedNxmAmount.div(NXM_PER_ALLOCATION_UNIT);

    {
      const expiringCoverBuckets = await stakingPool.expiringCoverBuckets(
        productId,
        targetBucketId,
        firstTrancheGroupId,
      );
      expect(expiringCoverBuckets.shr(firstTrancheIndexInGroup * EXPIRING_ALLOCATION_DATA_GROUP_SIZE)).to.equal(
        allocationAmountInUnit,
      );
    }

    const allocationAmount2 = stakedNxmAmount.mul(2);

    // allocates 50% of first tranche and 50% of second tranche
    await stakingPool.connect(fixture.coverSigner).requestAllocation(allocationAmount2, allocationRequestParams);

    {
      const expiringCoverBuckets = await stakingPool.expiringCoverBuckets(
        productId,
        targetBucketId,
        firstTrancheGroupId,
      );
      expect(
        expiringCoverBuckets.shr(firstTrancheIndexInGroup * EXPIRING_ALLOCATION_DATA_GROUP_SIZE).and(MaxUint32),
      ).to.equal(allocationAmountInUnit.mul(2));
    }

    {
      const expiringCoverBuckets = await stakingPool.expiringCoverBuckets(
        productId,
        targetBucketId,
        secondTrancheGroupId,
      );
      expect(
        expiringCoverBuckets.shr(secondTrancheIndexInGroup * EXPIRING_ALLOCATION_DATA_GROUP_SIZE).and(MaxUint32),
      ).to.equal(allocationAmountInUnit);
    }

    const allocationAmount3 = stakedNxmAmount.mul(3);
    const allocationId3 = await stakingPool.getNextAllocationId();

    // deallocate first allocation, and allocate new one to be 50% of first tranche,
    // 50% of second tranche and 50% of third tranche
    await stakingPool.connect(fixture.coverSigner).requestDeallocation({
      allocationId: allocationId1,
      productId: allocationRequestParams.productId,
      premium: 0,
      start: firstAllocationBlock.timestamp,
      period: allocationRequestParams.period,
      rewardsRatio: 0,
    });
    await stakingPool.connect(fixture.coverSigner).requestAllocation(allocationAmount3, allocationRequestParams);
    const editAllocationBlock = await ethers.provider.getBlock('latest');

    {
      const expiringCoverBuckets = await stakingPool.expiringCoverBuckets(
        productId,
        targetBucketId,
        firstTrancheGroupId,
      );
      expect(
        expiringCoverBuckets.shr(firstTrancheIndexInGroup * EXPIRING_ALLOCATION_DATA_GROUP_SIZE).and(MaxUint32),
      ).to.equal(allocationAmountInUnit.mul(2));
    }

    {
      const expiringCoverBuckets = await stakingPool.expiringCoverBuckets(
        productId,
        targetBucketId,
        secondTrancheGroupId,
      );
      expect(
        expiringCoverBuckets.shr(secondTrancheIndexInGroup * EXPIRING_ALLOCATION_DATA_GROUP_SIZE).and(MaxUint32),
      ).to.equal(allocationAmountInUnit.mul(2));
    }

    {
      const expiringCoverBuckets = await stakingPool.expiringCoverBuckets(
        productId,
        targetBucketId,
        thirdTrancheGroupId,
      );
      expect(
        expiringCoverBuckets.shr(thirdTrancheIndexInGroup * EXPIRING_ALLOCATION_DATA_GROUP_SIZE).and(MaxUint32),
      ).to.equal(allocationAmountInUnit);
    }

    // deallocates half of the last tranche
    const firstDeallocationAmount = stakedNxmAmount.div(2);
    const params = {
      allocationId: allocationId3,
      productId,
      start: editAllocationBlock.timestamp,
      period: allocationRequestParams.period,
      deallocationAmount: firstDeallocationAmount,
    };

    await stakingPool.connect(fixture.coverSigner).burnStake(0, params);

    {
      const expiringCoverBuckets = await stakingPool.expiringCoverBuckets(
        productId,
        targetBucketId,
        firstTrancheGroupId,
      );
      expect(
        expiringCoverBuckets.shr(firstTrancheIndexInGroup * EXPIRING_ALLOCATION_DATA_GROUP_SIZE).and(MaxUint32),
      ).to.equal(allocationAmountInUnit.mul(2));
    }

    {
      const expiringCoverBuckets = await stakingPool.expiringCoverBuckets(
        productId,
        targetBucketId,
        secondTrancheGroupId,
      );
      expect(
        expiringCoverBuckets.shr(secondTrancheIndexInGroup * EXPIRING_ALLOCATION_DATA_GROUP_SIZE).and(MaxUint32),
      ).to.equal(allocationAmountInUnit.mul(2));
    }

    {
      const expiringCoverBuckets = await stakingPool.expiringCoverBuckets(
        productId,
        targetBucketId,
        thirdTrancheGroupId,
      );
      expect(
        expiringCoverBuckets.shr(thirdTrancheIndexInGroup * EXPIRING_ALLOCATION_DATA_GROUP_SIZE).and(MaxUint32),
      ).to.equal(allocationAmountInUnit.div(2));
    }

    // deallocates 100%
    const deallocationAmount = allocationAmount3.sub(firstDeallocationAmount);
    await stakingPool.connect(fixture.coverSigner).burnStake(0, { ...params, deallocationAmount });

    {
      const expiringCoverBuckets = await stakingPool.expiringCoverBuckets(
        productId,
        targetBucketId,
        firstTrancheGroupId,
      );
      expect(
        expiringCoverBuckets.shr(firstTrancheIndexInGroup * EXPIRING_ALLOCATION_DATA_GROUP_SIZE).and(MaxUint32),
      ).to.equal(allocationAmountInUnit);
    }

    {
      const expiringCoverBuckets = await stakingPool.expiringCoverBuckets(
        productId,
        targetBucketId,
        secondTrancheGroupId,
      );
      expect(
        expiringCoverBuckets.shr(secondTrancheIndexInGroup * EXPIRING_ALLOCATION_DATA_GROUP_SIZE).and(MaxUint32),
      ).to.equal(allocationAmountInUnit);
    }

    {
      const expiringCoverBuckets = await stakingPool.expiringCoverBuckets(
        productId,
        targetBucketId,
        thirdTrancheGroupId,
      );
      expect(
        expiringCoverBuckets.shr(thirdTrancheIndexInGroup * EXPIRING_ALLOCATION_DATA_GROUP_SIZE).and(MaxUint32),
      ).to.equal(0);
    }
  });

  it('calls process expirations', async function () {
    const fixture = await loadFixture(burnStakeSetup);
    const { stakingPool } = fixture;

    const initialFirstActiveBucketId = await stakingPool.getFirstActiveBucketId();
    const initialFirstActiveTrancheId = await stakingPool.getFirstActiveTrancheId();

    await moveTimeToNextTranche(2);

    await stakingPool.connect(fixture.coverSigner).burnStake(burnAmount, burnStakeParams);

    const firstActiveBucketId = await stakingPool.getFirstActiveBucketId();
    const firstActiveTrancheId = await stakingPool.getFirstActiveTrancheId();

    expect(firstActiveBucketId).to.gt(initialFirstActiveBucketId);
    expect(firstActiveTrancheId).to.gt(initialFirstActiveTrancheId);
  });
});

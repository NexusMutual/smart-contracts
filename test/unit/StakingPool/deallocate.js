const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { getTranches, moveTimeToNextTranche, BUCKET_DURATION } = require('./helpers');
const { daysToSeconds } = require('../../../lib/helpers');

const { AddressZero, Two } = ethers.constants;
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
  ipfsDescriptionHash: 'Description Hash',
};

const productTypeFixture = {
  claimMethod: 1,
  gracePeriod: daysToSeconds(7), // 7 days
};

const coverProductTemplate = {
  productType: 1,
  yieldTokenAddress: AddressZero,
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
  allocationId: 0,
  period: DEFAULT_PERIOD,
  gracePeriod: DEFAULT_GRACE_PERIOD,
  previousStart: 0,
  previousExpiration: 0,
  previousRewardsRatio: 5000,
  useFixedPrice: false,
  globalCapacityRatio: 20000,
  capacityReductionRatio: 0,
  rewardRatio: 5000,
  globalMinPrice: 10000,
  extraPeriod: 0,
};

const stakedNxmAmount = parseEther('100');
const setup = require('./setup');

async function burnStakeSetup() {
  const fixture = await loadFixture(setup);
  const { stakingPool, stakingProducts, cover } = fixture;
  const [staker] = fixture.accounts.members;
  const { poolId, initialPoolFee, maxPoolFee, products, ipfsDescriptionHash } = poolInitParams;

  await cover.setProductType(productTypeFixture, initialProduct.productId);
  await cover.setProduct(coverProductTemplate, initialProduct.productId);

  await stakingPool.connect(fixture.stakingProductsSigner).initialize(
    false, // isPrivatePool
    initialPoolFee,
    maxPoolFee,
    poolId,
    ipfsDescriptionHash,
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

describe('deallocate', function () {
  it('should revert if the caller is not the cover contract', async function () {
    const fixture = await loadFixture(burnStakeSetup);
    const { stakingPool } = fixture;
    await expect(stakingPool.deallocate(burnStakeParams)).to.be.revertedWithCustomError(
      stakingPool,
      'OnlyCoverContract',
    );
  });

  it('correctly deallocates cover tranche allocations', async function () {
    const fixture = await loadFixture(burnStakeSetup);
    const { stakingPool } = fixture;
    const { NXM_PER_ALLOCATION_UNIT } = fixture.config;

    const coverTrancheAllocationAmount = stakedNxmAmount.div(NXM_PER_ALLOCATION_UNIT);

    const allocationId1 = await stakingPool.getNextAllocationId();
    const allocationAmount1 = stakedNxmAmount;

    // allocates 50% of first tranche
    await stakingPool.connect(fixture.coverSigner).requestAllocation(allocationAmount1, 0, allocationRequestParams);
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
    await stakingPool.connect(fixture.coverSigner).requestAllocation(allocationAmount2, 0, allocationRequestParams);

    {
      const coverTrancheAllocations = await stakingPool.coverTrancheAllocations(allocationId2);
      expect(coverTrancheAllocations.and(MaxUint32)).to.equal(coverTrancheAllocationAmount);
      expect(coverTrancheAllocations.shr(32)).to.equal(coverTrancheAllocationAmount);
      expect(coverTrancheAllocations.shr(64)).to.equal(0);
    }

    const allocationAmount3 = stakedNxmAmount.mul(3);

    // updates allocation to be 50% of first tranche, 50% of second tranche and 50% of third tranche
    await stakingPool.connect(fixture.coverSigner).requestAllocation(allocationAmount3, 0, {
      ...allocationRequestParams,
      allocationId: allocationId1,
      previousStart: firstAllocationBlock.timestamp,
      previousExpiration: firstAllocationBlock.timestamp + allocationRequestParams.period,
    });
    const editAllocationBlock = await ethers.provider.getBlock('latest');

    {
      const coverTrancheAllocations = await stakingPool.coverTrancheAllocations(allocationId1);
      expect(coverTrancheAllocations.and(MaxUint32)).to.equal(coverTrancheAllocationAmount);
      expect(coverTrancheAllocations.shr(32).and(MaxUint32)).to.equal(coverTrancheAllocationAmount);
      expect(coverTrancheAllocations.shr(64)).to.equal(coverTrancheAllocationAmount);
    }

    // deallocates half of the last tranche
    const firstDeallocationAmount = stakedNxmAmount.div(2);
    const params = {
      allocationId: allocationId1,
      productId: allocationRequestParams.productId,
      start: editAllocationBlock.timestamp,
      period: allocationRequestParams.period,
      deallocationAmount: firstDeallocationAmount,
    };

    await stakingPool.connect(fixture.coverSigner).deallocate(params);

    {
      const coverTrancheAllocations = await stakingPool.coverTrancheAllocations(allocationId1);
      expect(coverTrancheAllocations.and(MaxUint32)).to.equal(coverTrancheAllocationAmount);
      expect(coverTrancheAllocations.shr(32).and(MaxUint32)).to.equal(coverTrancheAllocationAmount);
      expect(coverTrancheAllocations.shr(64)).to.equal(stakedNxmAmount.div(2).div(NXM_PER_ALLOCATION_UNIT));
    }

    // deallocates 100%
    const deallocationAmount = allocationAmount3.sub(firstDeallocationAmount);
    await stakingPool.connect(fixture.coverSigner).deallocate({ ...params, deallocationAmount });

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
    await stakingPool.connect(fixture.coverSigner).requestAllocation(allocationAmount1, 0, allocationRequestParams);
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
    await stakingPool.connect(fixture.coverSigner).requestAllocation(allocationAmount2, 0, allocationRequestParams);

    {
      const activeAllocations = await stakingPool.getActiveAllocations(productId);
      expect(activeAllocations[0]).to.equal(allocationAmountInUnit.mul(2));
      expect(activeAllocations[1]).to.equal(allocationAmountInUnit);
      expect(activeAllocations[2]).to.equal(0);
    }

    const allocationAmount3 = stakedNxmAmount.mul(3);

    // updates allocation to be 50% of first tranche, 50% of second tranche and 50% of third tranche
    await stakingPool.connect(fixture.coverSigner).requestAllocation(allocationAmount3, 0, {
      ...allocationRequestParams,
      allocationId: allocationId1,
      previousStart: firstAllocationBlock.timestamp,
      previousExpiration: firstAllocationBlock.timestamp + allocationRequestParams.period,
    });
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
      allocationId: allocationId1,
      productId,
      start: editAllocationBlock.timestamp,
      period: allocationRequestParams.period,
      deallocationAmount: firstDeallocationAmount,
    };

    await stakingPool.connect(fixture.coverSigner).deallocate(params);

    {
      const activeAllocations = await stakingPool.getActiveAllocations(productId);
      expect(activeAllocations[0]).to.equal(allocationAmountInUnit.mul(2));
      expect(activeAllocations[1]).to.equal(allocationAmountInUnit.mul(2));
      expect(activeAllocations[2]).to.equal(allocationAmountInUnit.div(2));
    }

    // deallocates 100%
    const deallocationAmount = allocationAmount3.sub(firstDeallocationAmount);
    await stakingPool.connect(fixture.coverSigner).deallocate({ ...params, deallocationAmount });

    {
      const activeAllocations = await stakingPool.getActiveAllocations(productId);
      expect(activeAllocations[0]).to.equal(allocationAmountInUnit);
      expect(activeAllocations[1]).to.equal(allocationAmountInUnit);
      expect(activeAllocations[2]).to.equal(0);
    }
  });

  it('correctly deallocates expiring cover amounts', async function () {
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
    await stakingPool.connect(fixture.coverSigner).requestAllocation(allocationAmount1, 0, allocationRequestParams);
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
    await stakingPool.connect(fixture.coverSigner).requestAllocation(allocationAmount2, 0, allocationRequestParams);

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

    // updates allocation to be 50% of first tranche, 50% of second tranche and 50% of third tranche
    await stakingPool.connect(fixture.coverSigner).requestAllocation(allocationAmount3, 0, {
      ...allocationRequestParams,
      allocationId: allocationId1,
      previousStart: firstAllocationBlock.timestamp,
      previousExpiration: firstAllocationBlock.timestamp + allocationRequestParams.period,
    });
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
      allocationId: allocationId1,
      productId,
      start: editAllocationBlock.timestamp,
      period: allocationRequestParams.period,
      deallocationAmount: firstDeallocationAmount,
    };

    await stakingPool.connect(fixture.coverSigner).deallocate(params);

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
    await stakingPool.connect(fixture.coverSigner).deallocate({ ...params, deallocationAmount });

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

    await stakingPool.connect(fixture.coverSigner).deallocate(burnStakeParams);

    const firstActiveBucketId = await stakingPool.getFirstActiveBucketId();
    const firstActiveTrancheId = await stakingPool.getFirstActiveTrancheId();

    expect(firstActiveBucketId).to.gt(initialFirstActiveBucketId);
    expect(firstActiveTrancheId).to.gt(initialFirstActiveTrancheId);
  });
});

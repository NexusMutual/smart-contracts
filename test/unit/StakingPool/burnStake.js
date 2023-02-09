const { expect } = require('chai');
const { ethers } = require('hardhat');
const { getTranches, moveTimeToNextTranche, setTime, BUCKET_DURATION } = require('./helpers');
const { daysToSeconds } = require('../../../lib/helpers');
const { setEtherBalance } = require('../utils').evm;

const { AddressZero, MaxUint256, Two } = ethers.constants;
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

const stakedNxmAmount = parseEther('1235');

describe('burnStake', function () {
  beforeEach(async function () {
    const { stakingPool, stakingProducts, cover, nxm, tokenController } = this;
    const { defaultSender: manager } = this.accounts;
    const [staker] = this.accounts.members;
    const { TRANCHE_DURATION } = this.config;
    const { poolId, initialPoolFee, maxPoolFee, products, ipfsDescriptionHash } = poolInitParams;

    this.coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(this.coverSigner.address, parseEther('1'));

    await cover.setProductType(productTypeFixture, initialProduct.productId);
    await cover.setProduct(coverProductTemplate, initialProduct.productId);

    await stakingPool.connect(this.coverSigner).initialize(
      manager.address,
      false, // isPrivatePool
      initialPoolFee,
      maxPoolFee,
      poolId,
      ipfsDescriptionHash,
    );

    await stakingProducts.connect(this.coverSigner).setInitialProducts(poolId, products);

    await nxm.mint(manager.address, MaxUint256.div(1e6));
    await nxm.connect(manager).approve(tokenController.address, MaxUint256);

    // Deposit into pool
    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);
    await stakingPool.connect(manager).depositTo(stakedNxmAmount, firstActiveTrancheId + 1, MaxUint256, AddressZero);

    // Move to the beginning of the next tranche
    const { firstActiveTrancheId: trancheId } = await getTranches();
    await setTime(TRANCHE_DURATION.mul(trancheId + 1).toNumber());

    // Deposit into pool
    await stakingPool.connect(staker).depositTo(stakedNxmAmount, trancheId + 1, 0, AddressZero);
    await stakingPool.connect(staker).depositTo(stakedNxmAmount, trancheId + 2, 0, AddressZero);
    await stakingPool.connect(staker).depositTo(stakedNxmAmount, trancheId + 3, 0, AddressZero);
  });

  it('should revert if the caller is not the cover contract', async function () {
    const { stakingPool } = this;
    await expect(stakingPool.burnStake(10, burnStakeParams)).to.be.revertedWithCustomError(
      stakingPool,
      'OnlyCoverContract',
    );
  });

  it('should block the pool if 100% of the stake is burned', async function () {
    const { stakingPool } = this;
    const {
      members: [member],
    } = this.accounts;

    // burn all of the active stake
    const activeStake = await stakingPool.getActiveStake();
    await stakingPool.connect(this.coverSigner).burnStake(activeStake, burnStakeParams);
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
    const { stakingPool } = this;
    const {
      members: [member],
    } = this.accounts;

    // burn activeStake - 1
    const activeStake = await stakingPool.getActiveStake();
    await stakingPool.connect(this.coverSigner).burnStake(activeStake.sub(1), burnStakeParams);

    // deposit should work
    const { firstActiveTrancheId } = await getTranches(DEFAULT_PERIOD, DEFAULT_GRACE_PERIOD);
    await expect(stakingPool.connect(member).depositTo(stakedNxmAmount, firstActiveTrancheId, 0, AddressZero)).to.not.be
      .reverted;

    // Burn all activeStake
    await stakingPool.connect(this.coverSigner).burnStake(stakedNxmAmount.add(1), burnStakeParams);

    // deposit should fail
    await expect(
      stakingPool.connect(member).depositTo(stakedNxmAmount, firstActiveTrancheId, 0, AddressZero),
    ).to.be.revertedWithCustomError(stakingPool, 'PoolHalted');
  });

  it('reduces activeStake', async function () {
    const { stakingPool } = this;
    const activeStakeBefore = await stakingPool.getActiveStake();
    await stakingPool.connect(this.coverSigner).burnStake(burnAmount, burnStakeParams);
    const activeStakeAfter = await stakingPool.getActiveStake();
    expect(activeStakeAfter).to.equal(activeStakeBefore.sub(burnAmount));
  });

  it('emits StakeBurned event', async function () {
    const { stakingPool } = this;

    await expect(stakingPool.connect(this.coverSigner).burnStake(burnAmount, burnStakeParams))
      .to.emit(stakingPool, 'StakeBurned')
      .withArgs(burnAmount);
  });

  it('burns staked NXM in token controller', async function () {
    const { stakingPool, nxm, tokenController } = this;

    const poolId = await stakingPool.poolId();

    const balanceBefore = await nxm.balanceOf(tokenController.address);
    const tcBalancesBefore = await tokenController.stakingPoolNXMBalances(poolId);

    await stakingPool.connect(this.coverSigner).burnStake(burnAmount, burnStakeParams);

    const balanceAfter = await nxm.balanceOf(tokenController.address);
    const tcBalancesAfter = await tokenController.stakingPoolNXMBalances(poolId);

    expect(balanceAfter).to.equal(balanceBefore.sub(burnAmount));
    expect(tcBalancesAfter.deposits).to.equal(tcBalancesBefore.deposits.sub(burnAmount));
  });

  it('works correctly if burnAmount > initialStake', async function () {
    const { stakingPool, nxm, tokenController } = this;

    const poolId = await stakingPool.poolId();

    const initialStake = await stakingPool.getActiveStake();
    const balanceBefore = await nxm.balanceOf(tokenController.address);
    const tcBalancesBefore = await tokenController.stakingPoolNXMBalances(poolId);

    const burnAmount = initialStake.add(parseEther('1'));

    // leaves 1 wei to avoid division by zero
    const actualBurnedAmount = initialStake.sub(1);
    await expect(stakingPool.connect(this.coverSigner).burnStake(burnAmount, burnStakeParams))
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
    const { stakingPool } = this;
    const { NXM_PER_ALLOCATION_UNIT } = this.config;

    const coverTrancheAllocationAmount = stakedNxmAmount.div(NXM_PER_ALLOCATION_UNIT);

    const allocationId1 = await stakingPool.getNextAllocationId();
    const allocationAmount1 = stakedNxmAmount;

    // allocates 50% of first tranche
    await stakingPool.connect(this.coverSigner).requestAllocation(allocationAmount1, 0, allocationRequestParams);
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
    await stakingPool.connect(this.coverSigner).requestAllocation(allocationAmount2, 0, allocationRequestParams);

    {
      const coverTrancheAllocations = await stakingPool.coverTrancheAllocations(allocationId2);
      expect(coverTrancheAllocations.and(MaxUint32)).to.equal(coverTrancheAllocationAmount);
      expect(coverTrancheAllocations.shr(32)).to.equal(coverTrancheAllocationAmount);
      expect(coverTrancheAllocations.shr(64)).to.equal(0);
    }

    const allocationAmount3 = stakedNxmAmount.mul(3);

    // updates allocation to be 50% of first tranche, 50% of second tranche and 50% of third tranche
    await stakingPool.connect(this.coverSigner).requestAllocation(allocationAmount3, 0, {
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

    await stakingPool.connect(this.coverSigner).burnStake(0, params);

    {
      const coverTrancheAllocations = await stakingPool.coverTrancheAllocations(allocationId1);
      expect(coverTrancheAllocations.and(MaxUint32)).to.equal(coverTrancheAllocationAmount);
      expect(coverTrancheAllocations.shr(32).and(MaxUint32)).to.equal(coverTrancheAllocationAmount);
      expect(coverTrancheAllocations.shr(64)).to.equal(stakedNxmAmount.div(2).div(NXM_PER_ALLOCATION_UNIT));
    }

    // deallocates 100%
    const deallocationAmount = allocationAmount3.sub(firstDeallocationAmount);
    await stakingPool.connect(this.coverSigner).burnStake(0, { ...params, deallocationAmount });

    {
      const coverTrancheAllocations = await stakingPool.coverTrancheAllocations(allocationId1);
      expect(coverTrancheAllocations.and(MaxUint32)).to.equal(0);
      expect(coverTrancheAllocations.shr(32)).to.equal(0);
      expect(coverTrancheAllocations.shr(64)).to.equal(0);
    }
  });

  it('correctly deallocates stored tranche allocations', async function () {
    const { stakingPool } = this;
    const { NXM_PER_ALLOCATION_UNIT } = this.config;

    const { productId } = allocationRequestParams;

    const allocationId1 = await stakingPool.getNextAllocationId();
    const allocationAmount1 = stakedNxmAmount;

    {
      const activeAllocations = await stakingPool.getActiveAllocations(productId);
      expect(activeAllocations[0]).to.equal(0);
    }

    // allocates 50% of first tranche
    await stakingPool.connect(this.coverSigner).requestAllocation(allocationAmount1, 0, allocationRequestParams);
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
    await stakingPool.connect(this.coverSigner).requestAllocation(allocationAmount2, 0, allocationRequestParams);

    {
      const activeAllocations = await stakingPool.getActiveAllocations(productId);
      expect(activeAllocations[0]).to.equal(allocationAmountInUnit.mul(2));
      expect(activeAllocations[1]).to.equal(allocationAmountInUnit);
      expect(activeAllocations[2]).to.equal(0);
    }

    const allocationAmount3 = stakedNxmAmount.mul(3);

    // updates allocation to be 50% of first tranche, 50% of second tranche and 50% of third tranche
    await stakingPool.connect(this.coverSigner).requestAllocation(allocationAmount3, 0, {
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

    await stakingPool.connect(this.coverSigner).burnStake(0, params);

    {
      const activeAllocations = await stakingPool.getActiveAllocations(productId);
      expect(activeAllocations[0]).to.equal(allocationAmountInUnit.mul(2));
      expect(activeAllocations[1]).to.equal(allocationAmountInUnit.mul(2));
      expect(activeAllocations[2]).to.equal(allocationAmountInUnit.div(2));
    }

    // deallocates 100%
    const deallocationAmount = allocationAmount3.sub(firstDeallocationAmount);
    await stakingPool.connect(this.coverSigner).burnStake(0, { ...params, deallocationAmount });

    {
      const activeAllocations = await stakingPool.getActiveAllocations(productId);
      expect(activeAllocations[0]).to.equal(allocationAmountInUnit);
      expect(activeAllocations[1]).to.equal(allocationAmountInUnit);
      expect(activeAllocations[2]).to.equal(0);
    }
  });

  it('correctly deallocates expiring cover amounts', async function () {
    const { stakingPool } = this;
    const { NXM_PER_ALLOCATION_UNIT } = this.config;

    const { productId, period } = allocationRequestParams;

    const allocationId1 = await stakingPool.getNextAllocationId();
    const allocationAmount1 = stakedNxmAmount;

    {
      const activeAllocations = await stakingPool.getActiveAllocations(productId);
      expect(activeAllocations[0]).to.equal(0);
    }

    // allocates 50% of first tranche
    await stakingPool.connect(this.coverSigner).requestAllocation(allocationAmount1, 0, allocationRequestParams);
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
    await stakingPool.connect(this.coverSigner).requestAllocation(allocationAmount2, 0, allocationRequestParams);

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
    await stakingPool.connect(this.coverSigner).requestAllocation(allocationAmount3, 0, {
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

    await stakingPool.connect(this.coverSigner).burnStake(0, params);

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
    await stakingPool.connect(this.coverSigner).burnStake(0, { ...params, deallocationAmount });

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
    const { stakingPool } = this;

    const initialFirstActiveBucketId = await stakingPool.getFirstActiveBucketId();
    const initialFirstActiveTrancheId = await stakingPool.getFirstActiveTrancheId();

    await moveTimeToNextTranche(2);

    await stakingPool.connect(this.coverSigner).burnStake(burnAmount, burnStakeParams);

    const firstActiveBucketId = await stakingPool.getFirstActiveBucketId();
    const firstActiveTrancheId = await stakingPool.getFirstActiveTrancheId();

    expect(firstActiveBucketId).to.gt(initialFirstActiveBucketId);
    expect(firstActiveTrancheId).to.gt(initialFirstActiveTrancheId);
  });
});

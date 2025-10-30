const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const {
  getCurrentTrancheId,
  calculateBasePrice,
  calculatePriceBump,
  roundUpToNearestAllocationUnit,
  calculateBasePremium,
  getCurrentBucket,
  MAX_ACTIVE_TRANCHES,
  BUCKET_DURATION,
  moveTimeToNextBucket,
  moveTimeToNextTranche,
} = require('./helpers');
const setup = require('./setup');

const { divCeil } = require('../utils').bnMath;
const { increaseTime } = require('../utils').evm;
const { daysToSeconds } = require('../utils').helpers;

const { AddressZero, Two, Zero } = ethers.constants;
const { parseEther } = ethers.utils;
const { BigNumber } = ethers;

// TODO: get rid of these two and just use `period` for calculation
const periodInDays = 91.25;
const periodsInYear = 365 / periodInDays;

const coverId = 0;
const productId = 0;
const stakedNxmAmount = parseEther('50000');

const COVER_TRANCHE_GROUP_SIZE = 5;
const BUCKET_TRANCHE_GROUP_SIZE = 8;
const TRANCHE_ALLOCATION_DATA_GROUP_SIZE = 48;
const EXPIRING_ALLOCATION_DATA_GROUP_SIZE = 32;
const LAST_BUCKET_ID_DATA_GROUP_SIZE = 16;
const MaxUint16 = Two.pow(16).sub(1);
const MaxUint32 = Two.pow(32).sub(1);
const LAST_BUCKET_ID_MASK = MaxUint16;

const allocationRequestParams = {
  productId: 0,
  coverId: 0,
  period: daysToSeconds(10),
  gracePeriod: daysToSeconds(10),
  useFixedPrice: false,
  capacityRatio: 20000,
  capacityReductionRatio: 0,
  rewardRatio: 5000,
  productMinPrice: 10000,
};

const buyCoverParamsTemplate = {
  owner: AddressZero,
  coverId: 0,
  productId: 0,
  coverAsset: 0, // ETH
  amount: parseEther('4800'),
  period: daysToSeconds(periodInDays),
  maxPremiumInAsset: parseEther('100'),
  paymentAsset: 0,
  payWithNXM: false,
  commissionRatio: 1,
  commissionDestination: AddressZero,
  ipfsData: 'ipfs data',
};

const coverProductTemplate = {
  productType: 1,
  minPrice: 0,
  __gap: 0,
  coverAssets: 1111,
  initialPriceRatio: 2000, // 20%
  capacityReductionRatio: 0,
  useFixedPrice: false,
};

const defaultProduct = {
  productId: 0,
  weight: 100, // 1.00
  initialPrice: coverProductTemplate.initialPriceRatio,
  targetPrice: 200, // 2%
};

const product2 = {
  productId: 1,
  weight: 100, // 1.00
  initialPrice: coverProductTemplate.initialPriceRatio,
  targetPrice: 200, // 2%
};

const product3 = {
  productId: 2,
  weight: 90, // 1.00
  initialPrice: coverProductTemplate.initialPriceRatio,
  targetPrice: 200, // 2%
};

const poolId = 1;
const trancheOffset = 5;

async function requestAllocationSetup() {
  const fixture = await loadFixture(setup);
  const { stakingPool, stakingProducts, coverProducts } = fixture;
  const [staker] = fixture.accounts.members;
  const productId = 0;
  const trancheId = (await getCurrentTrancheId()) + trancheOffset;

  // Set global product and product type
  await coverProducts.setProduct(coverProductTemplate, productId);
  await coverProducts.setProductType({ claimMethod: 0, gracePeriod: daysToSeconds(7) }, productId);

  // Initialize staking pool
  const poolId = 1;
  const isPrivatePool = false;
  const maxPoolFee = 10; // 10%
  const initialPoolFee = 7; // 7%

  await stakingPool
    .connect(fixture.stakingProductsSigner)
    .initialize(isPrivatePool, initialPoolFee, maxPoolFee, poolId);

  await stakingProducts
    .connect(fixture.stakingProductsSigner)
    .setInitialProducts(poolId, [defaultProduct, product2, product3]);

  // Deposit into pool
  const amount = stakedNxmAmount;
  await stakingPool.connect(staker).depositTo(amount, trancheId, 0, staker.address);

  return fixture;
}

describe('requestAllocation', function () {
  it('should allocate the amount for tranches and generate new allocation Id', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const { stakingPool, cover } = fixture;
    const { NXM_PER_ALLOCATION_UNIT } = fixture.config;
    const buyCoverParams = { ...buyCoverParamsTemplate, period: daysToSeconds(365) };
    const coverAmount = Math.ceil(buyCoverParams.amount / NXM_PER_ALLOCATION_UNIT);

    const nextAllocationIdBefore = await stakingPool.getNextAllocationId();
    const activeTrancheCapacitiesBefore = await stakingPool.getActiveAllocations(buyCoverParamsTemplate.productId);

    await cover.allocateCapacity(buyCoverParams, coverId, 0, stakingPool.address);

    const nextAllocationIdAfter = await stakingPool.getNextAllocationId();
    const activeTrancheCapacitiesAfter = await stakingPool.getActiveAllocations(buyCoverParamsTemplate.productId);

    expect(activeTrancheCapacitiesBefore[trancheOffset]).to.be.equal(0);
    expect(nextAllocationIdAfter).to.be.equal(BigNumber.from(nextAllocationIdBefore).add(1));
    expect(activeTrancheCapacitiesAfter[trancheOffset]).to.be.equal(coverAmount);
  });

  it('should update allocation amount', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const { stakingPool } = fixture;
    const { NXM_PER_ALLOCATION_UNIT } = fixture.config;
    const { timestamp } = await ethers.provider.getBlock('latest');

    const allocationId = await stakingPool.getNextAllocationId();
    const amount = parseEther('4800');
    await stakingPool.connect(fixture.coverSigner).requestAllocation(amount, allocationRequestParams);

    const coverTrancheAllocations = await stakingPool.coverTrancheAllocations(allocationId);
    expect(coverTrancheAllocations).to.not.be.equal(0);

    const activeTrancheCapacitiesBefore = await stakingPool.getActiveAllocations(buyCoverParamsTemplate.productId);
    const newAmount = parseEther('5000');
    const coverAmount = Math.ceil(newAmount / NXM_PER_ALLOCATION_UNIT);

    await stakingPool.connect(fixture.coverSigner).requestDeallocation({
      allocationId,
      productId: allocationRequestParams.productId,
      premium: 0,
      start: timestamp,
      period: allocationRequestParams.period,
      rewardsRatio: 0,
    });
    await stakingPool.connect(fixture.coverSigner).requestAllocation(newAmount, allocationRequestParams);

    const activeTrancheCapacitiesAfter = await stakingPool.getActiveAllocations(buyCoverParamsTemplate.productId);

    expect(activeTrancheCapacitiesBefore[trancheOffset]).not.to.be.equal(activeTrancheCapacitiesAfter[trancheOffset]);
    expect(activeTrancheCapacitiesAfter[trancheOffset]).to.be.equal(coverAmount);
  });

  it('should correctly calculate the premium and price for year long cover', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const { stakingProducts, stakingPool, cover } = fixture;
    const { GLOBAL_CAPACITY_RATIO, NXM_PER_ALLOCATION_UNIT, INITIAL_PRICE_DENOMINATOR } = fixture.config;

    const product = await stakingProducts.getProduct(poolId, productId);
    const initialPrice = BigNumber.from(coverProductTemplate.initialPriceRatio);
    expect(product.bumpedPrice).to.be.equal(initialPrice);

    const { totalCapacity } = await stakingPool.getActiveTrancheCapacities(
      buyCoverParamsTemplate.productId,
      GLOBAL_CAPACITY_RATIO,
      coverProductTemplate.capacityReductionRatio,
    );
    const expectedPremium = buyCoverParamsTemplate.amount.mul(initialPrice).div(INITIAL_PRICE_DENOMINATOR);
    const priceBump = calculatePriceBump(
      buyCoverParamsTemplate.amount,
      fixture.config.PRICE_BUMP_RATIO,
      totalCapacity,
      NXM_PER_ALLOCATION_UNIT,
    );

    // buy cover and check premium + new price
    const buyCoverParams = { ...buyCoverParamsTemplate, period: daysToSeconds(365) };
    await cover.allocateCapacity(buyCoverParams, coverId, 0, stakingPool.address);

    const updatedProduct = await stakingProducts.getProduct(poolId, productId);
    expect(await cover.lastPremium()).to.be.equal(expectedPremium);
    expect(updatedProduct.bumpedPrice).to.be.equal(initialPrice.add(priceBump));
  });

  it('should correctly calculate the premium and price for a very small cover', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const { stakingProducts, stakingPool, cover } = fixture;
    const { GLOBAL_CAPACITY_RATIO, NXM_PER_ALLOCATION_UNIT, INITIAL_PRICE_DENOMINATOR } = fixture.config;

    const amount = BigNumber.from(1);
    const initialPrice = BigNumber.from(coverProductTemplate.initialPriceRatio);

    const { totalCapacity } = await stakingPool.getActiveTrancheCapacities(
      buyCoverParamsTemplate.productId,
      GLOBAL_CAPACITY_RATIO,
      coverProductTemplate.capacityReductionRatio,
    );
    const priceBump = calculatePriceBump(
      amount,
      fixture.config.PRICE_BUMP_RATIO,
      totalCapacity,
      NXM_PER_ALLOCATION_UNIT,
    );

    {
      // buy cover and check premium + new price
      const buyCoverParams = { ...buyCoverParamsTemplate, amount };
      await cover.allocateCapacity(buyCoverParams, coverId, 0, stakingPool.address);

      const product = await stakingProducts.getProduct(poolId, productId);

      // cover purchases below NXM_PER_ALLOCATION_UNIT are charged at NXM_PER_ALLOCATION_UNIT rate
      expect(await cover.lastPremium()).to.be.equal(
        roundUpToNearestAllocationUnit(amount, NXM_PER_ALLOCATION_UNIT)
          .mul(initialPrice)
          .div(INITIAL_PRICE_DENOMINATOR)
          .div(periodsInYear),
      );
      expect(product.bumpedPrice).to.be.equal(initialPrice.add(priceBump));
    }
  });

  it('should correctly calculate the premium using the initial price', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const { stakingProducts, stakingPool, cover } = fixture;
    const { GLOBAL_CAPACITY_RATIO, NXM_PER_ALLOCATION_UNIT, INITIAL_PRICE_DENOMINATOR } = fixture.config;

    const product = await stakingProducts.getProduct(poolId, productId);
    const initialPrice = BigNumber.from(coverProductTemplate.initialPriceRatio);
    expect(product.bumpedPrice).to.be.equal(initialPrice);

    const { totalCapacity } = await stakingPool.getActiveTrancheCapacities(
      buyCoverParamsTemplate.productId,
      GLOBAL_CAPACITY_RATIO,
      coverProductTemplate.capacityReductionRatio,
    );
    const expectedPremium = buyCoverParamsTemplate.amount
      .mul(initialPrice)
      .div(INITIAL_PRICE_DENOMINATOR)
      .div(periodsInYear);
    const priceBump = calculatePriceBump(
      buyCoverParamsTemplate.amount,
      fixture.config.PRICE_BUMP_RATIO,
      totalCapacity,
      NXM_PER_ALLOCATION_UNIT,
    );

    {
      // buy cover and check premium + new price
      await cover.allocateCapacity({ ...buyCoverParamsTemplate }, coverId, 0, stakingPool.address);

      const product = await stakingProducts.getProduct(poolId, productId);
      expect(await cover.lastPremium()).to.be.equal(expectedPremium);
      expect(product.bumpedPrice).to.be.equal(initialPrice.add(priceBump));
    }
  });

  it('should decrease price by PRICE_CHANGE_PER_DAY until it reaches product target price', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const { stakingProducts, stakingPool, cover } = fixture;
    const { PRICE_CHANGE_PER_DAY, INITIAL_PRICE_DENOMINATOR } = fixture.config;
    const initialPrice = coverProductTemplate.initialPriceRatio;
    const daysForward = 1;
    const expectedPrice = initialPrice - PRICE_CHANGE_PER_DAY * daysForward;
    await increaseTime(daysToSeconds(daysForward));
    await cover.allocateCapacity({ ...buyCoverParamsTemplate }, coverId, 0, stakingPool.address);
    const expectedPremium = buyCoverParamsTemplate.amount
      .mul(expectedPrice)
      .div(INITIAL_PRICE_DENOMINATOR)
      .div(periodsInYear);
    expect(await cover.lastPremium()).to.be.equal(expectedPremium);
    {
      const product = await stakingProducts.getProduct(poolId, productId);
      const daysForward = 50;
      await increaseTime(daysToSeconds(daysForward));
      await cover.allocateCapacity({ ...buyCoverParamsTemplate }, coverId, 0, stakingPool.address);
      const expectedPremium = buyCoverParamsTemplate.amount
        .mul(product.targetPrice)
        .div(INITIAL_PRICE_DENOMINATOR)
        .div(periodsInYear);
      expect(await cover.lastPremium()).to.be.equal(expectedPremium);
    }
  });

  it('shouldnt underflow while expiring cover during allocate capacity', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const { stakingProducts, stakingPool, cover } = fixture;
    const { PRICE_CHANGE_PER_DAY, INITIAL_PRICE_DENOMINATOR } = fixture.config;
    const initialPrice = coverProductTemplate.initialPriceRatio;
    const daysForward = 1;
    const expectedPrice = initialPrice - PRICE_CHANGE_PER_DAY * daysForward;
    await increaseTime(daysToSeconds(daysForward));
    await cover.allocateCapacity({ ...buyCoverParamsTemplate }, coverId, 0, stakingPool.address);
    const expectedPremium = buyCoverParamsTemplate.amount
      .mul(expectedPrice)
      .div(INITIAL_PRICE_DENOMINATOR)
      .div(periodsInYear);
    expect(await cover.lastPremium()).to.be.equal(expectedPremium);
    {
      const product = await stakingProducts.getProduct(poolId, productId);
      const daysForward = 100;
      await increaseTime(daysToSeconds(daysForward));
      await cover.allocateCapacity({ ...buyCoverParamsTemplate }, coverId, 0, stakingPool.address);
      const expectedPremium = buyCoverParamsTemplate.amount
        .mul(product.targetPrice)
        .div(INITIAL_PRICE_DENOMINATOR)
        .div(periodsInYear);
      expect(await cover.lastPremium()).to.be.equal(expectedPremium);
    }
  });

  it('should correctly calculate price when all coverage is bought in a single purchase', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const { stakingProducts, stakingPool, cover } = fixture;
    const [coverBuyer] = fixture.accounts.members;
    const { GLOBAL_CAPACITY_RATIO, PRICE_CHANGE_PER_DAY, NXM_PER_ALLOCATION_UNIT, TARGET_PRICE_DENOMINATOR } =
      fixture.config;
    const GLOBAL_CAPACITY_DENOMINATOR = BigNumber.from(10000);

    const amount = stakedNxmAmount.mul(GLOBAL_CAPACITY_RATIO).div(GLOBAL_CAPACITY_DENOMINATOR);
    const buyCoverParams = { ...buyCoverParamsTemplate, amount };

    const { totalCapacity } = await stakingPool.getActiveTrancheCapacities(
      buyCoverParamsTemplate.productId,
      GLOBAL_CAPACITY_RATIO,
      coverProductTemplate.capacityReductionRatio,
    );

    const product = await stakingProducts.getProduct(poolId, productId);
    const { timestamp } = await ethers.provider.getBlock('latest');

    // calculate premiums
    const expectedBasePrice = calculateBasePrice(timestamp, product, PRICE_CHANGE_PER_DAY);
    const expectedBasePremium = calculateBasePremium(amount, expectedBasePrice, buyCoverParams.period, fixture.config);

    const actualPremium = await stakingProducts.calculatePremium(
      product,
      buyCoverParams.period,
      divCeil(amount, NXM_PER_ALLOCATION_UNIT), // allocation amount
      totalCapacity,
      product.targetPrice, // targetPrice
      timestamp, // current block timestamp
      NXM_PER_ALLOCATION_UNIT,
      TARGET_PRICE_DENOMINATOR,
    );

    const expectedPremium = expectedBasePremium;
    expect(actualPremium.premium).to.be.equal(expectedPremium);

    await cover.connect(coverBuyer).allocateCapacity(buyCoverParams, coverId, 0, stakingPool.address);

    // get active allocations
    const activeAllocations = await stakingPool.getActiveAllocations(productId);
    const totalActiveAllocations = activeAllocations.reduce(
      (acc, allocation) => acc.add(allocation),
      BigNumber.from(0),
    );

    expect(totalActiveAllocations).to.be.equal(totalCapacity);
    expect(await cover.lastPremium()).to.be.equal(expectedPremium);
  });

  it('should overflow uint32 tranche allocation when cover amount is too large', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const { stakingPool, cover } = fixture;
    const [coverBuyer, staker] = fixture.accounts.members;
    const amount = BigNumber.from(2).pow(95).sub(1);
    const buyCoverParams = { ...buyCoverParamsTemplate, amount };

    await stakingPool.connect(staker).depositTo(
      amount,
      (await getCurrentTrancheId()) + 3, // trancheId
      0, // tokenID
      staker.address, // destination
    );

    await expect(
      cover.connect(coverBuyer).allocateCapacity(buyCoverParams, coverId, 0, stakingPool.address),
    ).to.be.revertedWith("SafeCast: value doesn't fit in 32 bits");
  });

  it('reverts if caller is not cover contract', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;

    const amount = parseEther('1');

    await expect(
      stakingPool.connect(user).requestAllocation(amount, allocationRequestParams),
    ).to.be.revertedWithCustomError(stakingPool, 'OnlyCoverContract');
  });

  it('correctly allocates capacity to the correct product and current tranche', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;

    const { NXM_PER_ALLOCATION_UNIT } = fixture.config;

    const currentTrancheId = await moveTimeToNextTranche(1);
    await stakingPool.connect(user).depositTo(parseEther('100'), currentTrancheId, 0, AddressZero);

    const amount = parseEther('100');
    const { productId } = allocationRequestParams;

    const groupId = Math.floor(currentTrancheId / COVER_TRANCHE_GROUP_SIZE);
    const currentTrancheIndexInGroup = currentTrancheId % COVER_TRANCHE_GROUP_SIZE;

    {
      const trancheAllocationGroup = await stakingPool.trancheAllocationGroups(productId, groupId);
      expect(trancheAllocationGroup).to.equal(0);
    }

    await stakingPool.connect(fixture.coverSigner).requestAllocation(amount, allocationRequestParams);

    {
      const trancheAllocationGroup = await stakingPool.trancheAllocationGroups(productId, groupId);
      expect(
        trancheAllocationGroup.shr(
          currentTrancheIndexInGroup * TRANCHE_ALLOCATION_DATA_GROUP_SIZE + LAST_BUCKET_ID_DATA_GROUP_SIZE,
        ),
      ).to.equal(amount.div(NXM_PER_ALLOCATION_UNIT));
    }
  });

  it('correctly updates last bucket id in each active group', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;

    const currentTrancheId = await moveTimeToNextTranche(1);
    await stakingPool.connect(user).depositTo(parseEther('100'), currentTrancheId, 0, AddressZero);

    const amount = parseEther('100');
    const { productId } = allocationRequestParams;

    const currentBucketId = await getCurrentBucket();

    const firstGroupId = Math.floor(currentTrancheId / COVER_TRANCHE_GROUP_SIZE);
    const lastGroupId = Math.floor((currentTrancheId + MAX_ACTIVE_TRANCHES - 1) / COVER_TRANCHE_GROUP_SIZE);
    const groupCount = lastGroupId - firstGroupId + 1;

    for (let i = 0; i < groupCount; i++) {
      const trancheAllocationGroup = await stakingPool.trancheAllocationGroups(productId, firstGroupId + i);
      expect(trancheAllocationGroup).to.equal(0);
    }

    await stakingPool.connect(fixture.coverSigner).requestAllocation(amount, allocationRequestParams);

    for (let i = 0; i < groupCount; i++) {
      const trancheAllocationGroup = await stakingPool.trancheAllocationGroups(productId, firstGroupId + i);
      expect(trancheAllocationGroup.and(LAST_BUCKET_ID_MASK)).to.equal(currentBucketId);
    }
  });

  it('correctly stores expiring cover amounts', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;

    const { NXM_PER_ALLOCATION_UNIT } = fixture.config;

    const currentTrancheId = await moveTimeToNextTranche(1);
    await stakingPool.connect(user).depositTo(parseEther('100'), currentTrancheId, 0, AddressZero);

    const amount = parseEther('100');
    const { productId, period } = allocationRequestParams;

    const lastBlock = await ethers.provider.getBlock('latest');
    const targetBucketId = Math.ceil((lastBlock.timestamp + period) / BUCKET_DURATION);

    const groupId = Math.floor(currentTrancheId / BUCKET_TRANCHE_GROUP_SIZE);
    const currentTrancheIndexInGroup = currentTrancheId % BUCKET_TRANCHE_GROUP_SIZE;

    {
      const expiringCoverBuckets = await stakingPool.expiringCoverBuckets(productId, targetBucketId, groupId);
      expect(expiringCoverBuckets).to.equal(0);
    }

    await stakingPool.connect(fixture.coverSigner).requestAllocation(amount, allocationRequestParams);

    {
      const expiringCoverBuckets = await stakingPool.expiringCoverBuckets(productId, targetBucketId, groupId);
      expect(expiringCoverBuckets.shr(currentTrancheIndexInGroup * EXPIRING_ALLOCATION_DATA_GROUP_SIZE)).to.equal(
        amount.div(NXM_PER_ALLOCATION_UNIT),
      );
    }
  });

  it('just deallocates if amount is 0', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;

    const { NXM_PER_ALLOCATION_UNIT } = fixture.config;

    const currentTrancheId = await moveTimeToNextTranche(1);
    await stakingPool.connect(user).depositTo(parseEther('100'), currentTrancheId, 0, AddressZero);

    const amount = parseEther('100');
    const { productId, period } = allocationRequestParams;

    const currentBucketId = await getCurrentBucket();

    const trancheGroupId = Math.floor(currentTrancheId / COVER_TRANCHE_GROUP_SIZE);
    const currentTrancheIndexInGroup = currentTrancheId % COVER_TRANCHE_GROUP_SIZE;

    const lastBlock = await ethers.provider.getBlock('latest');
    const bucketGroupId = Math.floor(currentTrancheId / BUCKET_TRANCHE_GROUP_SIZE);
    const targetBucketId = Math.ceil((lastBlock.timestamp + period) / BUCKET_DURATION);
    const currentBucketIndexInGroup = currentTrancheId % BUCKET_TRANCHE_GROUP_SIZE;

    const allocationId = await stakingPool.getNextAllocationId();

    {
      const trancheAllocationGroup = await stakingPool.trancheAllocationGroups(productId, trancheGroupId);
      expect(trancheAllocationGroup).to.equal(0);

      const expiringCoverBuckets = await stakingPool.expiringCoverBuckets(productId, targetBucketId, bucketGroupId);
      expect(expiringCoverBuckets).to.equal(0);

      const coverTrancheAllocations = await stakingPool.coverTrancheAllocations(allocationId);
      expect(coverTrancheAllocations).to.equal(0);
    }

    // Allocate
    await stakingPool.connect(fixture.coverSigner).requestAllocation(amount, allocationRequestParams);

    {
      const trancheAllocationGroup = await stakingPool.trancheAllocationGroups(productId, trancheGroupId);
      expect(
        trancheAllocationGroup.shr(
          currentTrancheIndexInGroup * TRANCHE_ALLOCATION_DATA_GROUP_SIZE + LAST_BUCKET_ID_DATA_GROUP_SIZE,
        ),
      ).to.equal(amount.div(NXM_PER_ALLOCATION_UNIT));

      const expiringCoverBuckets = await stakingPool.expiringCoverBuckets(productId, targetBucketId, bucketGroupId);
      expect(expiringCoverBuckets.shr(currentBucketIndexInGroup * EXPIRING_ALLOCATION_DATA_GROUP_SIZE)).to.equal(
        amount.div(NXM_PER_ALLOCATION_UNIT),
      );

      const coverTrancheAllocations = await stakingPool.coverTrancheAllocations(allocationId);
      expect(coverTrancheAllocations.and(MaxUint32)).to.equal(amount.div(NXM_PER_ALLOCATION_UNIT));
    }

    // Deallocate
    await stakingPool.connect(fixture.coverSigner).requestDeallocation({
      allocationId,
      productId: allocationRequestParams.productId,
      premium: 0,
      start: lastBlock.timestamp,
      period,
      rewardsRatio: 0,
    });

    {
      const trancheAllocationGroup = await stakingPool.trancheAllocationGroups(productId, trancheGroupId);
      // tranche allocation removed, only currentBucketId kept stored
      expect(trancheAllocationGroup).to.equal(currentBucketId);

      const expiringCoverBuckets = await stakingPool.expiringCoverBuckets(productId, targetBucketId, bucketGroupId);
      expect(expiringCoverBuckets).to.equal(0);

      const coverTrancheAllocations = await stakingPool.coverTrancheAllocations(allocationId);
      // coverTrancheAllocations for allocationId is not updated as it is not needed
      // allocationId can't be used again for future allocations
      expect(coverTrancheAllocations.and(MaxUint32)).to.equal(0);
    }
  });

  it('correctly allocates capacity to multiple tranches', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;

    const { GLOBAL_CAPACITY_RATIO, NXM_PER_ALLOCATION_UNIT } = fixture.config;
    const GLOBAL_CAPACITY_DENOMINATOR = BigNumber.from(10000);

    const currentTrancheId = await moveTimeToNextTranche(8);

    const tranches = Array(3)
      .fill(0)
      .map((e, i) => currentTrancheId + i);

    const depositPerTranche = parseEther('10');
    const maxAllocationPerTranche = depositPerTranche
      .mul(GLOBAL_CAPACITY_RATIO)
      .div(GLOBAL_CAPACITY_DENOMINATOR)
      .div(NXM_PER_ALLOCATION_UNIT);

    const allocationAmount = depositPerTranche.mul(6); // should fully allocate 3 tranches

    const { productId } = allocationRequestParams;

    for (let i = 0; i < tranches.length; i++) {
      await stakingPool.connect(user).depositTo(depositPerTranche, tranches[i], 0, AddressZero);
    }

    const previousActiveAllocations = await stakingPool.getActiveAllocations(productId);

    for (let i = 0; i < tranches.length; i++) {
      expect(previousActiveAllocations[i]).to.equal(0);
    }

    await stakingPool.connect(fixture.coverSigner).requestAllocation(allocationAmount, allocationRequestParams);

    {
      const activeAllocations = await stakingPool.getActiveAllocations(productId);

      for (let i = 0; i < tranches.length; i++) {
        expect(activeAllocations[i]).to.equal(maxAllocationPerTranche);
      }
    }

    // double capacity
    for (let i = 0; i < tranches.length; i++) {
      await stakingPool.connect(user).depositTo(depositPerTranche, tranches[i], 0, AddressZero);
    }

    // double allocation
    await stakingPool.connect(fixture.coverSigner).requestAllocation(allocationAmount, allocationRequestParams);

    {
      const activeAllocations = await stakingPool.getActiveAllocations(productId);

      for (let i = 0; i < tranches.length; i++) {
        expect(activeAllocations[i]).to.equal(maxAllocationPerTranche.mul(2));
      }
    }
  });

  it('correctly allocates capacity to multiple covers allocations', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;

    const { NXM_PER_ALLOCATION_UNIT } = fixture.config;

    const currentTrancheId = await moveTimeToNextTranche(8);

    const depositAmount = parseEther('10');

    // add capacity to three tranches
    await stakingPool.connect(user).depositTo(parseEther('10'), currentTrancheId, 0, AddressZero);
    await stakingPool.connect(user).depositTo(parseEther('10'), currentTrancheId + 1, 0, AddressZero);
    await stakingPool.connect(user).depositTo(parseEther('10'), currentTrancheId + 2, 0, AddressZero);

    const allocationAmount = depositAmount.mul(3);
    const allocationAmountInNXMUnit = allocationAmount.div(NXM_PER_ALLOCATION_UNIT);
    const { productId } = allocationRequestParams;

    const allocationId1 = await stakingPool.getNextAllocationId();

    {
      const activeAllocations = await stakingPool.getActiveAllocations(productId);
      expect(activeAllocations[0]).to.equal(0);

      const coverTrancheAllocations = await stakingPool.coverTrancheAllocations(allocationId1);
      expect(coverTrancheAllocations).to.equal(0);
    }

    // allocation will allocate 2/3 of amount to first tranche + 1/3 amount other second tranche
    await stakingPool.connect(fixture.coverSigner).requestAllocation(allocationAmount, allocationRequestParams);

    {
      const activeAllocations = await stakingPool.getActiveAllocations(productId);
      expect(activeAllocations[0]).to.equal(allocationAmountInNXMUnit.mul(2).div(3));
      expect(activeAllocations[1]).to.equal(allocationAmountInNXMUnit.div(3));
      expect(activeAllocations[2]).to.equal(0);

      const coverTrancheAllocations = await stakingPool.coverTrancheAllocations(allocationId1);
      expect(coverTrancheAllocations.and(MaxUint32)).to.equal(allocationAmountInNXMUnit.mul(2).div(3));
      expect(coverTrancheAllocations.shr(32)).to.equal(allocationAmountInNXMUnit.div(3));
      expect(coverTrancheAllocations.shr(64)).to.equal(0);
    }

    const allocationId2 = await stakingPool.getNextAllocationId();

    {
      const coverTrancheAllocations = await stakingPool.coverTrancheAllocations(allocationId2);
      expect(coverTrancheAllocations).to.equal(0);
    }

    // allocation will allocate 1/3 amount to the second tranche + 2/3 amount to the third tranche
    await stakingPool.connect(fixture.coverSigner).requestAllocation(allocationAmount, allocationRequestParams);

    {
      const activeAllocations = await stakingPool.getActiveAllocations(productId);
      expect(activeAllocations[0]).to.equal(allocationAmountInNXMUnit.mul(2).div(3));
      expect(activeAllocations[1]).to.equal(allocationAmountInNXMUnit.mul(2).div(3));
      expect(activeAllocations[2]).to.equal(allocationAmountInNXMUnit.mul(2).div(3));

      const coverTrancheAllocations1 = await stakingPool.coverTrancheAllocations(allocationId1);
      expect(coverTrancheAllocations1.and(MaxUint32)).to.equal(allocationAmountInNXMUnit.mul(2).div(3));
      expect(coverTrancheAllocations1.shr(32)).to.equal(allocationAmountInNXMUnit.div(3));
      expect(coverTrancheAllocations1.shr(64)).to.equal(0);

      const coverTrancheAllocations2 = await stakingPool.coverTrancheAllocations(allocationId2);
      expect(coverTrancheAllocations2.and(MaxUint32)).to.equal(0);
      expect(coverTrancheAllocations2.shr(32).and(MaxUint32)).to.equal(allocationAmountInNXMUnit.div(3));
      expect(coverTrancheAllocations2.shr(64)).to.equal(allocationAmountInNXMUnit.mul(2).div(3));
    }
  });

  it('correctly allocates capacity to multiple products', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;

    const { NXM_PER_ALLOCATION_UNIT } = fixture.config;

    const currentTrancheId = await moveTimeToNextTranche(1);
    await stakingPool.connect(user).depositTo(parseEther('100'), currentTrancheId, 0, AddressZero);

    const amountProduct1 = parseEther('10');
    const amountProduct2 = parseEther('20');
    const { productId: productId1, period } = allocationRequestParams;
    const { productId: productId2 } = product2;

    const lastBlock = await ethers.provider.getBlock('latest');
    const targetBucketId = Math.ceil((lastBlock.timestamp + period) / BUCKET_DURATION);

    const groupId = Math.floor(currentTrancheId / BUCKET_TRANCHE_GROUP_SIZE);
    const currentTrancheIndexInGroup = currentTrancheId % BUCKET_TRANCHE_GROUP_SIZE;

    {
      const activeAllocationsProduct1 = await stakingPool.getActiveAllocations(productId1);
      expect(activeAllocationsProduct1[0]).to.equal(0);

      const expiringCoverBuckets1 = await stakingPool.expiringCoverBuckets(productId1, targetBucketId, groupId);
      expect(expiringCoverBuckets1).to.equal(0);

      const activeAllocationsProduct2 = await stakingPool.getActiveAllocations(productId2);
      expect(activeAllocationsProduct2[0]).to.equal(0);

      const expiringCoverBuckets2 = await stakingPool.expiringCoverBuckets(productId2, targetBucketId, groupId);
      expect(expiringCoverBuckets2).to.equal(0);
    }

    // allocate to product 1
    await stakingPool.connect(fixture.coverSigner).requestAllocation(amountProduct1, allocationRequestParams);

    // allocate to product 2
    await stakingPool.connect(fixture.coverSigner).requestAllocation(amountProduct2, {
      ...allocationRequestParams,
      productId: productId2,
    });

    {
      const amountProduct1InNXM = amountProduct1.div(NXM_PER_ALLOCATION_UNIT);
      const activeAllocationsProduct1 = await stakingPool.getActiveAllocations(productId1);
      expect(activeAllocationsProduct1[0]).to.equal(amountProduct1InNXM);

      const expiringCoverBuckets1 = await stakingPool.expiringCoverBuckets(productId1, targetBucketId, groupId);
      expect(expiringCoverBuckets1.shr(currentTrancheIndexInGroup * EXPIRING_ALLOCATION_DATA_GROUP_SIZE)).to.equal(
        amountProduct1InNXM,
      );

      const amountProduct2InNXM = amountProduct2.div(NXM_PER_ALLOCATION_UNIT);
      const activeAllocationsProduct2 = await stakingPool.getActiveAllocations(productId2);
      expect(activeAllocationsProduct2[0]).to.equal(amountProduct2InNXM);

      const expiringCoverBuckets2 = await stakingPool.expiringCoverBuckets(productId2, targetBucketId, groupId);
      expect(expiringCoverBuckets2.shr(currentTrancheIndexInGroup * EXPIRING_ALLOCATION_DATA_GROUP_SIZE)).to.equal(
        amountProduct2InNXM,
      );
    }
  });

  it('calls process expirations updating accNxmPerRewardsShare and lastAccNxmUpdate', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;

    const currentTrancheId = await moveTimeToNextTranche(1);
    await stakingPool.connect(user).depositTo(parseEther('100'), currentTrancheId, 0, AddressZero);

    const amount = parseEther('100');

    await stakingPool.connect(fixture.coverSigner).requestAllocation(amount, allocationRequestParams);

    const accNxmPerRewardsShareBefore = await stakingPool.getAccNxmPerRewardsShare();
    const lastAccNxmUpdateBefore = await stakingPool.getLastAccNxmUpdate();

    await stakingPool.connect(fixture.coverSigner).requestAllocation(amount, allocationRequestParams);

    const accNxmPerRewardsShareAfter = await stakingPool.getAccNxmPerRewardsShare();
    const lastAccNxmUpdateAfter = await stakingPool.getLastAccNxmUpdate();

    expect(accNxmPerRewardsShareAfter).to.gt(accNxmPerRewardsShareBefore);
    expect(lastAccNxmUpdateAfter).to.gt(lastAccNxmUpdateBefore);
  });

  it('calculates, update bucket rewards and mint rewards in NXM', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const { stakingPool, cover, tokenController, nxm } = fixture;
    const [user] = fixture.accounts.members;

    const { REWARDS_DENOMINATOR } = fixture.config;
    const { rewardRatio } = allocationRequestParams;

    const currentTrancheId = await moveTimeToNextTranche(1);
    await stakingPool.connect(user).depositTo(parseEther('100'), currentTrancheId, 0, AddressZero);

    const amount = parseEther('100');

    const currentBlock = await ethers.provider.getBlock('latest');
    const expirationBucket = Math.ceil((currentBlock.timestamp + allocationRequestParams.period) / BUCKET_DURATION);

    {
      const rewardPerSecond = await stakingPool.getRewardPerSecond();
      expect(rewardPerSecond).to.equal(0);

      const rewardPerSecondCut = await stakingPool.rewardPerSecondCut(expirationBucket);
      expect(rewardPerSecondCut).to.equal(0);
    }

    let tcBalanceBefore = await nxm.balanceOf(tokenController.address);

    await cover.requestAllocation(amount, allocationRequestParams, stakingPool.address);

    let previousRewardPerSecond;
    let previousRewardBuckets;
    {
      const premium = await cover.lastPremium();

      const lastBlock = await ethers.provider.getBlock('latest');
      const rewardStreamPeriod = expirationBucket * BUCKET_DURATION - lastBlock.timestamp;

      const rewards = premium.mul(rewardRatio).div(REWARDS_DENOMINATOR);
      const expectedRewardPerSecond = rewards.div(rewardStreamPeriod);
      const expectedRewards = expectedRewardPerSecond.mul(rewardStreamPeriod);

      const tcBalanceAfter = await nxm.balanceOf(tokenController.address);
      expect(tcBalanceAfter).to.equal(tcBalanceBefore.add(expectedRewards));

      const rewardPerSecond = await stakingPool.getRewardPerSecond();
      expect(rewardPerSecond).to.equal(expectedRewardPerSecond);

      const rewardPerSecondCut = await stakingPool.rewardPerSecondCut(expirationBucket);
      expect(rewardPerSecondCut).to.equal(expectedRewardPerSecond);

      tcBalanceBefore = tcBalanceAfter;
      previousRewardPerSecond = rewardPerSecond;
      previousRewardBuckets = rewardPerSecondCut;
    }

    await cover.requestAllocation(amount, allocationRequestParams, stakingPool.address);

    {
      const premium = await cover.lastPremium();

      const lastBlock = await ethers.provider.getBlock('latest');
      const rewardStreamPeriod = expirationBucket * BUCKET_DURATION - lastBlock.timestamp;

      const rewards = premium.mul(rewardRatio).div(REWARDS_DENOMINATOR);
      const expectedRewardPerSecond = rewards.div(rewardStreamPeriod);
      const expectedRewards = expectedRewardPerSecond.mul(rewardStreamPeriod);

      const tcBalanceAfter = await nxm.balanceOf(tokenController.address);
      expect(tcBalanceAfter).to.equal(tcBalanceBefore.add(expectedRewards));

      const rewardPerSecond = await stakingPool.getRewardPerSecond();
      expect(rewardPerSecond).to.equal(previousRewardPerSecond.add(expectedRewardPerSecond));

      const rewardPerSecondCut = await stakingPool.rewardPerSecondCut(expirationBucket);
      expect(rewardPerSecondCut).to.equal(previousRewardBuckets.add(expectedRewardPerSecond));
    }
  });

  it('removes and burns previous NXM premium in case of update', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const { stakingPool, tokenController, nxm } = fixture;
    const [user] = fixture.accounts.members;

    const { GLOBAL_REWARDS_RATIO, REWARDS_DENOMINATOR } = fixture.config;
    const { rewardRatio } = allocationRequestParams;

    const currentTrancheId = await moveTimeToNextTranche(1);
    await stakingPool.connect(user).depositTo(parseEther('100'), currentTrancheId, 0, AddressZero);

    const amount = parseEther('100');

    const currentBlock = await ethers.provider.getBlock('latest');
    const expirationBucket = Math.ceil((currentBlock.timestamp + allocationRequestParams.period) / BUCKET_DURATION);

    {
      const rewardPerSecond = await stakingPool.getRewardPerSecond();
      expect(rewardPerSecond).to.equal(0);

      const rewardPerSecondCut = await stakingPool.rewardPerSecondCut(expirationBucket);
      expect(rewardPerSecondCut).to.equal(0);
    }

    const tcBalanceBefore = await nxm.balanceOf(tokenController.address);

    const requestAllocationResult = await stakingPool
      .connect(fixture.coverSigner)
      .callStatic.requestAllocation(amount, allocationRequestParams);

    await stakingPool.connect(fixture.coverSigner).requestAllocation(amount, allocationRequestParams);

    const premium = requestAllocationResult.premium;

    const firstAllocationBlock = await ethers.provider.getBlock('latest');
    const rewardStreamPeriod = expirationBucket * BUCKET_DURATION - firstAllocationBlock.timestamp;

    const rewards = premium.mul(rewardRatio).div(REWARDS_DENOMINATOR);
    const expectedRewardPerSecond = rewards.div(rewardStreamPeriod);
    const expectedRewards = expectedRewardPerSecond.mul(rewardStreamPeriod);

    {
      const tcBalanceAfter = await nxm.balanceOf(tokenController.address);
      expect(tcBalanceAfter).to.equal(tcBalanceBefore.add(expectedRewards));

      const rewardPerSecond = await stakingPool.getRewardPerSecond();
      expect(rewardPerSecond).to.equal(expectedRewardPerSecond);

      const rewardPerSecondCut = await stakingPool.rewardPerSecondCut(expirationBucket);
      expect(rewardPerSecondCut).to.equal(expectedRewardPerSecond);
    }

    await stakingPool.connect(fixture.coverSigner).requestDeallocation({
      allocationId: requestAllocationResult.allocationId,
      productId: allocationRequestParams.productId,
      premium: requestAllocationResult.premium,
      start: firstAllocationBlock.timestamp,
      period: allocationRequestParams.period,
      rewardsRatio: GLOBAL_REWARDS_RATIO,
    });

    const secondAllocationBlock = await ethers.provider.getBlock('latest');
    const expectedBurnedRewards = expectedRewardPerSecond.mul(
      expirationBucket * BUCKET_DURATION - secondAllocationBlock.timestamp,
    );

    {
      const tcBalanceAfter = await nxm.balanceOf(tokenController.address);
      expect(tcBalanceAfter).to.equal(tcBalanceBefore.add(expectedRewards).sub(expectedBurnedRewards));

      const rewardPerSecond = await stakingPool.getRewardPerSecond();
      expect(rewardPerSecond).to.equal(0);

      const rewardPerSecondCut = await stakingPool.rewardPerSecondCut(expirationBucket);
      expect(rewardPerSecondCut).to.equal(0);
    }
  });

  it('revers if insufficient capacity', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;

    const currentTrancheId = await moveTimeToNextTranche(8);

    const depositAmount = parseEther('10');

    // add capacity to three tranches
    await stakingPool.connect(user).depositTo(depositAmount, currentTrancheId, 0, AddressZero);
    await stakingPool.connect(user).depositTo(depositAmount, currentTrancheId + 1, 0, AddressZero);
    await stakingPool.connect(user).depositTo(depositAmount, currentTrancheId + 2, 0, AddressZero);

    let maxAllocationAmount = depositAmount.mul(6);

    // exceed max allocation
    await expect(
      stakingPool.connect(fixture.coverSigner).requestAllocation(maxAllocationAmount.add(1), allocationRequestParams),
    ).to.be.revertedWithCustomError(stakingPool, 'InsufficientCapacity');

    {
      const allocationAmount = parseEther('10');

      await stakingPool.connect(fixture.coverSigner).requestAllocation(allocationAmount, allocationRequestParams);

      maxAllocationAmount = maxAllocationAmount.sub(allocationAmount);
    }

    // exceed max allocation
    await expect(
      stakingPool.connect(fixture.coverSigner).requestAllocation(maxAllocationAmount.add(1), allocationRequestParams),
    ).to.be.revertedWithCustomError(stakingPool, 'InsufficientCapacity');

    {
      const allocationAmount = parseEther('20');

      await stakingPool.connect(fixture.coverSigner).requestAllocation(allocationAmount, allocationRequestParams);

      maxAllocationAmount = maxAllocationAmount.sub(allocationAmount);
    }

    // exceed max allocation
    await expect(
      stakingPool.connect(fixture.coverSigner).requestAllocation(maxAllocationAmount.add(1), allocationRequestParams),
    ).to.be.revertedWithCustomError(stakingPool, 'InsufficientCapacity');

    {
      const allocationAmount = parseEther('30');

      await stakingPool.connect(fixture.coverSigner).requestAllocation(allocationAmount, allocationRequestParams);

      maxAllocationAmount = maxAllocationAmount.sub(allocationAmount);
    }

    // exceed max allocation
    await expect(
      stakingPool.connect(fixture.coverSigner).requestAllocation(1, allocationRequestParams),
    ).to.be.revertedWithCustomError(stakingPool, 'InsufficientCapacity');
  });

  it('updates expiring cover amounts', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;

    const { NXM_PER_ALLOCATION_UNIT } = fixture.config;

    const currentTrancheId = await moveTimeToNextTranche(1);
    await stakingPool.connect(user).depositTo(parseEther('100'), currentTrancheId, 0, AddressZero);

    const amount = parseEther('10');
    const nextAllocationId = await stakingPool.getNextAllocationId();
    const { productId, period } = allocationRequestParams;

    const lastBlock = await ethers.provider.getBlock('latest');
    const targetBucketId = Math.ceil((lastBlock.timestamp + period) / BUCKET_DURATION);

    const groupId = Math.floor(currentTrancheId / BUCKET_TRANCHE_GROUP_SIZE);
    const currentTrancheIndexInGroup = currentTrancheId % BUCKET_TRANCHE_GROUP_SIZE;

    {
      const expiringCoverBuckets = await stakingPool.expiringCoverBuckets(productId, targetBucketId, groupId);
      expect(expiringCoverBuckets).to.equal(0);
    }

    await stakingPool.connect(fixture.coverSigner).requestAllocation(amount, allocationRequestParams);

    {
      const expiringCoverBuckets = await stakingPool.expiringCoverBuckets(productId, targetBucketId, groupId);
      expect(expiringCoverBuckets.shr(currentTrancheIndexInGroup * EXPIRING_ALLOCATION_DATA_GROUP_SIZE)).to.equal(
        amount.div(NXM_PER_ALLOCATION_UNIT),
      );
    }

    const newPeriod = daysToSeconds(35);
    const secondAllocationAmount = parseEther('20');
    await stakingPool.connect(fixture.coverSigner).requestDeallocation({
      allocationId: nextAllocationId,
      productId: allocationRequestParams.productId,
      premium: 0,
      start: lastBlock.timestamp,
      period,
      rewardsRatio: 0,
    });
    await stakingPool.connect(fixture.coverSigner).requestAllocation(secondAllocationAmount, {
      ...allocationRequestParams,
      period: newPeriod,
    });

    {
      const expiringCoverBuckets = await stakingPool.expiringCoverBuckets(productId, targetBucketId, groupId);
      expect(expiringCoverBuckets).to.equal(0);
    }

    const secondTargetBucketId = Math.ceil((lastBlock.timestamp + newPeriod) / BUCKET_DURATION);

    {
      const expiringCoverBuckets = await stakingPool.expiringCoverBuckets(productId, secondTargetBucketId, groupId);
      expect(expiringCoverBuckets.shr(currentTrancheIndexInGroup * EXPIRING_ALLOCATION_DATA_GROUP_SIZE)).to.equal(
        secondAllocationAmount.div(NXM_PER_ALLOCATION_UNIT),
      );
    }

    const thirdAllocationAmount = parseEther('5');
    await stakingPool.connect(fixture.coverSigner).requestAllocation(thirdAllocationAmount, allocationRequestParams);

    const fourthAllocationAmount = parseEther('15');
    await stakingPool
      .connect(fixture.coverSigner)
      .requestAllocation(fourthAllocationAmount, { ...allocationRequestParams, period: newPeriod });

    {
      const firstExpiringCoverBuckets = await stakingPool.expiringCoverBuckets(productId, targetBucketId, groupId);
      expect(firstExpiringCoverBuckets.shr(currentTrancheIndexInGroup * EXPIRING_ALLOCATION_DATA_GROUP_SIZE)).to.equal(
        thirdAllocationAmount.div(NXM_PER_ALLOCATION_UNIT),
      );

      const secondExpiringCoverBuckets = await stakingPool.expiringCoverBuckets(
        productId,
        secondTargetBucketId,
        groupId,
      );
      expect(secondExpiringCoverBuckets.shr(currentTrancheIndexInGroup * EXPIRING_ALLOCATION_DATA_GROUP_SIZE)).to.equal(
        secondAllocationAmount.add(fourthAllocationAmount).div(NXM_PER_ALLOCATION_UNIT),
      );
    }
  });

  it('updates stored tranche allocations', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;

    const { NXM_PER_ALLOCATION_UNIT } = fixture.config;

    const currentTrancheId = await moveTimeToNextTranche(8);

    await stakingPool.connect(user).depositTo(parseEther('100'), currentTrancheId, 0, AddressZero);
    await stakingPool.connect(user).depositTo(parseEther('100'), currentTrancheId + 1, 0, AddressZero);
    await stakingPool.connect(user).depositTo(parseEther('100'), currentTrancheId + 2, 0, AddressZero);

    const amount = parseEther('200');
    const nextAllocationId = await stakingPool.getNextAllocationId();
    const { productId, period } = allocationRequestParams;

    {
      const activeAllocations = await stakingPool.getActiveAllocations(productId);
      expect(activeAllocations[0]).to.equal(0);
    }

    await stakingPool.connect(fixture.coverSigner).requestAllocation(amount, allocationRequestParams);

    {
      const activeAllocations = await stakingPool.getActiveAllocations(productId);
      expect(activeAllocations[0]).to.equal(amount.div(NXM_PER_ALLOCATION_UNIT));
    }

    const secondAllocationBlock = await ethers.provider.getBlock('latest');

    const secondAllocationAmount = amount.div(2);
    // decrease amount to half
    await stakingPool.connect(fixture.coverSigner).requestDeallocation({
      allocationId: nextAllocationId,
      productId: allocationRequestParams.productId,
      premium: 0,
      start: secondAllocationBlock.timestamp,
      period,
      rewardsRatio: 0,
    });
    await stakingPool.connect(fixture.coverSigner).requestAllocation(secondAllocationAmount, allocationRequestParams);

    {
      const activeAllocations = await stakingPool.getActiveAllocations(productId);
      expect(activeAllocations[0]).to.equal(secondAllocationAmount.div(NXM_PER_ALLOCATION_UNIT));
    }

    const thirdAllocationAmount = secondAllocationAmount;

    // should fully allocate tranche again
    await stakingPool.connect(fixture.coverSigner).requestAllocation(thirdAllocationAmount, allocationRequestParams);

    {
      const activeAllocations = await stakingPool.getActiveAllocations(productId);
      expect(activeAllocations[0]).to.equal(
        secondAllocationAmount.add(thirdAllocationAmount).div(NXM_PER_ALLOCATION_UNIT),
      );
    }

    const fourthAllocationAmount = parseEther('180');
    await stakingPool.connect(fixture.coverSigner).requestAllocation(fourthAllocationAmount, allocationRequestParams);

    {
      const activeAllocations = await stakingPool.getActiveAllocations(productId);

      expect(activeAllocations[0]).to.equal(
        secondAllocationAmount.add(thirdAllocationAmount).div(NXM_PER_ALLOCATION_UNIT),
      );
      expect(activeAllocations[1]).to.equal(fourthAllocationAmount.div(NXM_PER_ALLOCATION_UNIT));
    }

    const fifthAllocationAmount = parseEther('40');
    await stakingPool.connect(fixture.coverSigner).requestAllocation(fifthAllocationAmount, allocationRequestParams);

    {
      const activeAllocations = await stakingPool.getActiveAllocations(productId);

      expect(activeAllocations[0]).to.equal(
        secondAllocationAmount.add(thirdAllocationAmount).div(NXM_PER_ALLOCATION_UNIT),
      );
      expect(activeAllocations[1]).to.equal(
        fourthAllocationAmount.add(fifthAllocationAmount.div(2)).div(NXM_PER_ALLOCATION_UNIT),
      );
      expect(activeAllocations[2]).to.equal(fifthAllocationAmount.div(2).div(NXM_PER_ALLOCATION_UNIT));
    }
  });

  it('updates stored cover allocations', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;

    const { NXM_PER_ALLOCATION_UNIT } = fixture.config;

    const otherAllocationId = await stakingPool.getNextAllocationId();

    // add a previous unrelated allocation in order to generate an allocation id > 0
    await stakingPool.connect(fixture.coverSigner).requestAllocation(
      parseEther('100'), // amount
      allocationRequestParams,
    );

    const otherAllocations = await stakingPool.coverTrancheAllocations(otherAllocationId);

    const currentTrancheId = await moveTimeToNextTranche(8);

    await stakingPool.connect(user).depositTo(parseEther('100'), currentTrancheId, 0, AddressZero);
    await stakingPool.connect(user).depositTo(parseEther('100'), currentTrancheId + 1, 0, AddressZero);
    await stakingPool.connect(user).depositTo(parseEther('100'), currentTrancheId + 2, 0, AddressZero);

    const amount = parseEther('200');
    const allocationId = await stakingPool.getNextAllocationId();
    const { period } = allocationRequestParams;

    {
      const coverTrancheAllocations = await stakingPool.coverTrancheAllocations(allocationId);
      expect(coverTrancheAllocations).to.equal(0);
    }

    await stakingPool.connect(fixture.coverSigner).requestAllocation(amount, allocationRequestParams);

    {
      const coverTrancheAllocations = await stakingPool.coverTrancheAllocations(allocationId);
      expect(coverTrancheAllocations.and(MaxUint32)).to.equal(amount.div(NXM_PER_ALLOCATION_UNIT));
      expect(await stakingPool.coverTrancheAllocations(otherAllocationId)).to.equal(otherAllocations);
    }

    const { timestamp: firstAllocationTimestamp } = await ethers.provider.getBlock('latest');

    const secondAllocationAmount = amount.div(2);
    const secondAllocationId = await stakingPool.getNextAllocationId();
    // decrease amount to half
    await stakingPool.connect(fixture.coverSigner).requestDeallocation({
      allocationId,
      productId: allocationRequestParams.productId,
      premium: 0,
      start: firstAllocationTimestamp,
      period,
      rewardsRatio: 0,
    });
    await stakingPool.connect(fixture.coverSigner).requestAllocation(secondAllocationAmount, allocationRequestParams);

    {
      const coverTrancheAllocations = await stakingPool.coverTrancheAllocations(secondAllocationId);
      expect(coverTrancheAllocations.and(MaxUint32)).to.equal(secondAllocationAmount.div(NXM_PER_ALLOCATION_UNIT));
      expect(await stakingPool.coverTrancheAllocations(otherAllocationId)).to.equal(otherAllocations);
    }

    const { timestamp: secondAllocationTimestamp } = await ethers.provider.getBlock('latest');
    const thirdAllocationAmount = amount;
    const thirdAllocationId = await stakingPool.getNextAllocationId();

    // should fully allocate tranche again
    await stakingPool.connect(fixture.coverSigner).requestDeallocation({
      allocationId: secondAllocationId,
      productId: allocationRequestParams.productId,
      premium: 0,
      start: secondAllocationTimestamp,
      period,
      rewardsRatio: 0,
    });

    await stakingPool.connect(fixture.coverSigner).requestAllocation(thirdAllocationAmount, allocationRequestParams);

    {
      const coverTrancheAllocations = await stakingPool.coverTrancheAllocations(thirdAllocationId);
      expect(coverTrancheAllocations.and(MaxUint32)).to.equal(thirdAllocationAmount.div(NXM_PER_ALLOCATION_UNIT));
      expect(await stakingPool.coverTrancheAllocations(otherAllocationId)).to.equal(otherAllocations);
    }

    const { timestamp: thirdAllocationTimestamp } = await ethers.provider.getBlock('latest');
    const fourthAllocationIncreaseAmount = parseEther('180');
    const fourthAllocationId = await stakingPool.getNextAllocationId();

    await stakingPool.connect(fixture.coverSigner).requestDeallocation({
      allocationId: thirdAllocationId,
      productId: allocationRequestParams.productId,
      premium: 0,
      start: thirdAllocationTimestamp,
      period,
      rewardsRatio: 0,
    });
    await stakingPool
      .connect(fixture.coverSigner)
      .requestAllocation(thirdAllocationAmount.add(fourthAllocationIncreaseAmount), allocationRequestParams);

    {
      const coverTrancheAllocations = await stakingPool.coverTrancheAllocations(fourthAllocationId);
      expect(coverTrancheAllocations.and(MaxUint32)).to.equal(thirdAllocationAmount.div(NXM_PER_ALLOCATION_UNIT));
      expect(coverTrancheAllocations.shr(32)).to.equal(fourthAllocationIncreaseAmount.div(NXM_PER_ALLOCATION_UNIT));
      expect(await stakingPool.coverTrancheAllocations(otherAllocationId)).to.equal(otherAllocations);
    }

    const { timestamp: fourthAllocationTimestamp } = await ethers.provider.getBlock('latest');
    const fifthAllocationIncreaseAmount = parseEther('40');
    const fifthAllocationId = await stakingPool.getNextAllocationId();

    await stakingPool.connect(fixture.coverSigner).requestDeallocation({
      allocationId: fourthAllocationId,
      productId: allocationRequestParams.productId,
      premium: 0,
      start: fourthAllocationTimestamp,
      period,
      rewardsRatio: 0,
    });

    await stakingPool
      .connect(fixture.coverSigner)
      .requestAllocation(
        thirdAllocationAmount.add(fourthAllocationIncreaseAmount).add(fifthAllocationIncreaseAmount),
        allocationRequestParams,
      );

    {
      const coverTrancheAllocations = await stakingPool.coverTrancheAllocations(fifthAllocationId);
      expect(coverTrancheAllocations.and(MaxUint32)).to.equal(thirdAllocationAmount.div(NXM_PER_ALLOCATION_UNIT));
      expect(coverTrancheAllocations.shr(32).and(MaxUint32)).to.equal(
        fourthAllocationIncreaseAmount.add(fifthAllocationIncreaseAmount.div(2)).div(NXM_PER_ALLOCATION_UNIT),
      );
      expect(coverTrancheAllocations.shr(64)).to.equal(
        fifthAllocationIncreaseAmount.div(2).div(NXM_PER_ALLOCATION_UNIT),
      );
      expect(await stakingPool.coverTrancheAllocations(otherAllocationId)).to.equal(otherAllocations);
    }
  });

  it('capacity considers global capacity ratio', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;

    const { GLOBAL_CAPACITY_RATIO, GLOBAL_CAPACITY_DENOMINATOR } = fixture.config;

    const currentTrancheId = await moveTimeToNextTranche(8);

    const depositAmount = parseEther('100');

    // add capacity to three tranches
    await stakingPool.connect(user).depositTo(depositAmount, currentTrancheId, 0, AddressZero);

    let maxAllocationAmount = depositAmount.mul(GLOBAL_CAPACITY_RATIO).div(GLOBAL_CAPACITY_DENOMINATOR);

    // exceed max allocation
    await expect(
      stakingPool.connect(fixture.coverSigner).requestAllocation(maxAllocationAmount.add(1), allocationRequestParams),
    ).to.be.revertedWithCustomError(stakingPool, 'InsufficientCapacity');

    const newGlobalCapacityRatio = 30000;
    maxAllocationAmount = depositAmount.mul(newGlobalCapacityRatio).div(GLOBAL_CAPACITY_DENOMINATOR);

    await expect(
      stakingPool.connect(fixture.coverSigner).requestAllocation(maxAllocationAmount.add(1), {
        ...allocationRequestParams,
        capacityRatio: newGlobalCapacityRatio,
      }),
    ).to.be.revertedWithCustomError(stakingPool, 'InsufficientCapacity');

    await expect(
      await stakingPool.connect(fixture.coverSigner).requestAllocation(maxAllocationAmount, {
        ...allocationRequestParams,
        capacityRatio: newGlobalCapacityRatio,
      }),
    ).to.not.be.reverted;
  });

  it('capacity considers product target weight', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;

    const { GLOBAL_CAPACITY_RATIO, GLOBAL_CAPACITY_DENOMINATOR, WEIGHT_DENOMINATOR } = fixture.config;

    const { weight: product1Weight } = defaultProduct;
    const { weight: product3Weight, productId: productId3 } = product3;

    const currentTrancheId = await moveTimeToNextTranche(8);

    const depositAmount = parseEther('100');

    // add capacity to three tranches
    await stakingPool.connect(user).depositTo(depositAmount, currentTrancheId, 0, AddressZero);

    const maxAllocationAmountProduct1 = depositAmount
      .mul(GLOBAL_CAPACITY_RATIO)
      .mul(product1Weight)
      .div(WEIGHT_DENOMINATOR)
      .div(GLOBAL_CAPACITY_DENOMINATOR);

    const maxAllocationAmountProduct3 = depositAmount
      .mul(GLOBAL_CAPACITY_RATIO)
      .mul(product3Weight)
      .div(WEIGHT_DENOMINATOR)
      .div(GLOBAL_CAPACITY_DENOMINATOR);

    // exceed max allocation given product1 weight is bigger than product 3
    await expect(
      stakingPool.connect(fixture.coverSigner).requestAllocation(maxAllocationAmountProduct1, {
        ...allocationRequestParams,
        productId: productId3,
      }),
    ).to.be.revertedWithCustomError(stakingPool, 'InsufficientCapacity');

    await expect(
      stakingPool.connect(fixture.coverSigner).requestAllocation(maxAllocationAmountProduct3, {
        ...allocationRequestParams,
        productId: productId3,
      }),
    ).to.not.be.reverted;
  });

  it('capacity considers reduction ratio', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const { stakingPool } = fixture;
    const [user] = fixture.accounts.members;

    const { GLOBAL_CAPACITY_RATIO, GLOBAL_CAPACITY_DENOMINATOR, CAPACITY_REDUCTION_DENOMINATOR } = fixture.config;

    const currentTrancheId = await moveTimeToNextTranche(8);

    const depositAmount = parseEther('100');
    const capacityReductionRatio = 1000;

    // add capacity to three tranches
    await stakingPool.connect(user).depositTo(depositAmount, currentTrancheId, 0, AddressZero);

    const maxAllocationAmount = depositAmount
      .mul(GLOBAL_CAPACITY_RATIO)
      .mul(CAPACITY_REDUCTION_DENOMINATOR.sub(capacityReductionRatio))
      .div(CAPACITY_REDUCTION_DENOMINATOR)
      .div(GLOBAL_CAPACITY_DENOMINATOR);

    // exceed max allocation
    await expect(
      stakingPool.connect(fixture.coverSigner).requestAllocation(maxAllocationAmount.add(1), {
        ...allocationRequestParams,
        capacityReductionRatio,
      }),
    ).to.be.revertedWithCustomError(stakingPool, 'InsufficientCapacity');

    await expect(
      stakingPool.connect(fixture.coverSigner).requestAllocation(maxAllocationAmount.add(1), {
        ...allocationRequestParams,
        capacityReductionRatio: 0,
      }),
    ).to.not.be.reverted;
  });

  it('mints rewards to staking pool', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const { tokenController, stakingPool, stakingProducts } = fixture;
    const { REWARDS_DENOMINATOR, PRICE_CHANGE_PER_DAY } = fixture.config;
    const [user] = fixture.accounts.members;
    const { rewardRatio } = allocationRequestParams;

    const currentTrancheId = await moveTimeToNextTranche(1);
    const stakedAmount = parseEther('100');
    await stakingPool.connect(user).depositTo(stakedAmount, currentTrancheId, 0, AddressZero);

    // setup allocation request
    const amount = parseEther('13');
    const stakingPoolRewardBefore = await tokenController.stakingPoolNXMBalances(poolId);
    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const expirationBucket = Math.ceil((currentTimestamp + allocationRequestParams.period) / BUCKET_DURATION);

    // request allocation
    await stakingPool.connect(fixture.coverSigner).requestAllocation(amount, {
      ...allocationRequestParams,
    });

    // calculate premiums
    const { timestamp } = await ethers.provider.getBlock('latest');
    const expectedBasePrice = calculateBasePrice(
      timestamp,
      await stakingProducts.getProduct(1 /* poolId */, allocationRequestParams.productId),
      PRICE_CHANGE_PER_DAY,
    );
    const premium = calculateBasePremium(amount, expectedBasePrice, allocationRequestParams.period, fixture.config);

    // calculate rewards
    const rewardStreamPeriod = BigNumber.from(expirationBucket).mul(BUCKET_DURATION).sub(timestamp);
    const rewards = premium.mul(rewardRatio).div(REWARDS_DENOMINATOR);
    const expectedRewardPerSecond = rewards.div(rewardStreamPeriod);
    const expectedRewards = expectedRewardPerSecond.mul(rewardStreamPeriod);

    // validate that rewards increased
    const stakingPoolRewardAfter = await tokenController.stakingPoolNXMBalances(poolId);
    expect(stakingPoolRewardAfter.rewards).to.be.equal(stakingPoolRewardBefore.rewards.add(expectedRewards));
  });

  it('accounts for carried over allocations filling all capacity', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const { stakingPool, stakingNFT } = fixture;
    const [staker] = fixture.accounts.members;
    const { GLOBAL_CAPACITY_RATIO, NXM_PER_ALLOCATION_UNIT } = fixture.config;

    const { productId } = allocationRequestParams;
    const amount = parseEther('100000');

    const allocationRequest = {
      ...allocationRequestParams,
      period: daysToSeconds(10),
      gracePeriod: 0,
    };

    const currentTrancheId = await moveTimeToNextTranche(1);
    const stakeTrancheId = currentTrancheId + trancheOffset - 1;

    const { trancheCapacities: capacities } = await stakingPool.getActiveTrancheCapacities(
      productId,
      GLOBAL_CAPACITY_RATIO,
      0, // capacityReductionRatio
    );

    const initialAllocations = await stakingPool.getActiveAllocations(productId);
    initialAllocations.forEach(allocation => {
      expect(allocation).to.be.equal(0);
    });

    // allocate all available capacity
    await stakingPool.connect(fixture.coverSigner).requestAllocation(amount, allocationRequest);

    // expect all available capacity to be used
    const midAllocations = await stakingPool.getActiveAllocations(productId);
    expect(midAllocations).to.be.deep.equal(capacities);

    const tokenId = await stakingNFT.totalSupply();
    await stakingPool.connect(staker).extendDeposit(tokenId, stakeTrancheId, stakeTrancheId + 1, 0);

    const unfullfillableRequest = {
      ...allocationRequestParams,
      // targetting tranche idx 5
      period: daysToSeconds(91 * 4),
      gracePeriod: daysToSeconds(91),
    };

    await expect(
      stakingPool.connect(fixture.coverSigner).requestAllocation(
        NXM_PER_ALLOCATION_UNIT, // smallest amount
        unfullfillableRequest,
      ),
    ).to.be.revertedWithCustomError(stakingPool, 'InsufficientCapacity');
  });

  it('accounts for carried over allocations partially filling the capacity', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const { stakingPool, stakingNFT } = fixture;
    const [staker] = fixture.accounts.members;
    const { NXM_PER_ALLOCATION_UNIT } = fixture.config;

    const { productId } = allocationRequestParams;
    const firstCoverAmount = parseEther('80000');
    const maxCoverAmount = parseEther('20000');

    const firstAllocationRequest = {
      ...allocationRequestParams,
      period: daysToSeconds(10),
      gracePeriod: 0,
    };

    const currentTrancheId = await moveTimeToNextTranche(1);
    const stakeTrancheId = currentTrancheId + trancheOffset - 1;

    const initialAllocations = await stakingPool.getActiveAllocations(productId);
    initialAllocations.forEach(allocation => {
      expect(allocation).to.be.equal(0);
    });

    // allocate all available capacity
    await stakingPool.connect(fixture.coverSigner).requestAllocation(firstCoverAmount, firstAllocationRequest);

    // expect all available capacity to be used
    const midAllocations = await stakingPool.getActiveAllocations(productId);
    const expectedTrancheAllocation = firstCoverAmount.div(NXM_PER_ALLOCATION_UNIT);
    const expectedAllocations = [Zero, Zero, Zero, Zero, expectedTrancheAllocation, Zero, Zero, Zero];
    expect(midAllocations).to.be.deep.equal(expectedAllocations);

    const tokenId = await stakingNFT.totalSupply();
    await stakingPool.connect(staker).extendDeposit(tokenId, stakeTrancheId, stakeTrancheId + 1, 0);

    const secondAllocationRequest = {
      ...allocationRequestParams,
      // targetting tranche idx 5
      period: daysToSeconds(91 * 4),
      gracePeriod: daysToSeconds(91),
    };

    await expect(
      stakingPool.connect(fixture.coverSigner).requestAllocation(
        maxCoverAmount.add(1), // slightly over the limit
        secondAllocationRequest,
      ),
    ).to.be.revertedWithCustomError(stakingPool, 'InsufficientCapacity');

    await stakingPool.connect(fixture.coverSigner).requestAllocation(
      maxCoverAmount, // exact available amount
      secondAllocationRequest,
    );
  });

  it('correctly removes allocations when expiring a cover', async function () {
    const fixture = await loadFixture(requestAllocationSetup);
    const stakingPool = fixture.stakingPool.connect(fixture.coverSigner);
    const { NXM_PER_ALLOCATION_UNIT } = fixture.config;

    const { productId } = allocationRequestParams;
    const amount = parseEther('100');

    const allocationRequest = {
      ...allocationRequestParams,
      period: daysToSeconds(1),
      gracePeriod: 0,
    };

    await moveTimeToNextBucket(1);
    const allocationId = await stakingPool.getNextAllocationId();
    const allocationTx = await stakingPool.requestAllocation(amount, allocationRequest);
    const allocationReceipt = await allocationTx.wait();
    const { blockNumber: allocationBlockNumber } = allocationReceipt;
    const { timestamp: allocationTimestamp } = await ethers.provider.getBlock(allocationBlockNumber);

    {
      const allocations = await stakingPool.getActiveAllocations(productId);
      const allocatedAmount = allocations.reduce((acc, allocation) => acc.add(allocation), Zero);
      expect(allocatedAmount).to.be.equal(amount.div(NXM_PER_ALLOCATION_UNIT));
    }

    await moveTimeToNextBucket(1);
    await stakingPool.processExpirations(true);

    {
      const allocations = await stakingPool.getActiveAllocations(productId);
      const allocatedAmount = allocations.reduce((acc, allocation) => acc.add(allocation), Zero);
      expect(allocatedAmount).to.be.equal(Zero);
    }

    await expect(
      stakingPool.requestDeallocation({
        allocationId,
        productId: allocationRequest.productId,
        premium: 0,
        start: allocationTimestamp,
        period: allocationRequest.period,
        rewardsRatio: 0,
      }),
    )
      .to.be.revertedWithCustomError(stakingPool, 'AlreadyDeallocated')
      .withArgs(allocationId);
  });
});

const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

const { parseEther } = ethers;
const { ContractIndexes } = nexus.constants;

const gracePeriod = 120 * 24 * 3600; // 120 days
const GLOBAL_CAPACITY_DENOMINATOR = 10000n;

async function burnStakeFixture() {
  const fixture = await loadFixture(setup);
  const { accounts, cover, registry } = fixture;
  const [coverBuyer1, coverBuyer2] = accounts.members;
  const { COVER_BUY_FIXTURE } = fixture.constants;
  const { amount, targetPriceRatio, period, priceDenominator, productId, coverAsset } = COVER_BUY_FIXTURE;

  const [claims] = accounts.internalContracts;
  await registry.addContract(ContractIndexes.C_CLAIMS, claims, true);

  const expectedPremium = (amount * targetPriceRatio * period) / (priceDenominator * 3600n * 24n * 365n);
  // buyCover on 1 pool
  const singlePoolAllocationRequest = [{ poolId: 1, coverAmountInAsset: amount }];
  await cover.connect(coverBuyer1).buyCover(
    {
      owner: coverBuyer1.address,
      coverId: 0,
      productId,
      coverAsset,
      amount,
      period,
      maxPremiumInAsset: expectedPremium,
      paymentAsset: coverAsset,
      commissionRatio: parseEther('0'),
      commissionDestination: '0x0000000000000000000000000000000000000000',
      ipfsData: '',
    },
    singlePoolAllocationRequest,
    { value: coverAsset === 0n ? expectedPremium : 0n },
  );
  const singlePoolCoverId = await cover.getCoverDataCount();

  // buyCover on 2 pools
  const doublePoolAllocationRequest = [
    { poolId: 1, coverAmountInAsset: amount / 2n },
    { poolId: 2, coverAmountInAsset: amount / 2n },
  ];
  await cover.connect(coverBuyer2).buyCover(
    {
      owner: coverBuyer2.address,
      coverId: 0,
      productId,
      coverAsset,
      amount,
      period,
      maxPremiumInAsset: expectedPremium,
      paymentAsset: coverAsset,
      commissionRatio: parseEther('0'),
      commissionDestination: '0x0000000000000000000000000000000000000000',
      ipfsData: '',
    },
    doublePoolAllocationRequest,
    { value: coverAsset === 0n ? expectedPremium : 0n },
  );
  const doublePoolCoverId = await cover.getCoverDataCount();

  return {
    ...fixture,
    singlePoolCoverId,
    singlePoolAllocationRequest,
    doublePoolCoverId,
    doublePoolAllocationRequest,
  };
}

describe('burnStake', function () {
  it('should perform a burn a cover with 1 segment and 1 pool allocation', async function () {
    const fixture = await loadFixture(burnStakeFixture);
    const { cover, stakingProducts, accounts, constants, singlePoolCoverId } = fixture;
    const { COVER_BUY_FIXTURE } = constants;
    const [claims] = accounts.internalContracts;
    const { productId, coverAsset, period, amount } = COVER_BUY_FIXTURE;

    const payoutAmountInAsset = amount / 2n;
    const remainingAmount = amount - payoutAmountInAsset;

    const coverData = await cover.getCoverData(singlePoolCoverId);
    const [poolAllocation] = await cover.getPoolAllocations(singlePoolCoverId);

    const payoutAmountInNXM = (poolAllocation.coverAmountInNXM * payoutAmountInAsset) / coverData.amount;
    const expectedBurnAmount = (payoutAmountInNXM * GLOBAL_CAPACITY_DENOMINATOR) / coverData.capacityRatio;

    await cover.connect(claims).burnStake(singlePoolCoverId, payoutAmountInAsset);
    const storedCoverData = await cover.getCoverData(singlePoolCoverId);

    expect(storedCoverData.productId).to.equal(productId);
    expect(storedCoverData.coverAsset).to.equal(coverAsset);
    expect(storedCoverData.gracePeriod).to.equal(gracePeriod);
    expect(storedCoverData.period).to.equal(period);
    expect(storedCoverData.amount).to.equal(remainingAmount);

    const stakingPool = await ethers.getContractAt('COMockStakingPool', await stakingProducts.stakingPool(1));
    const burnStakeCalledWithAmount = await stakingPool.burnStakeCalledWithAmount();
    expect(burnStakeCalledWithAmount).to.be.equal(expectedBurnAmount);
  });

  it('reverts if caller is not an internal contract', async function () {
    const fixture = await loadFixture(burnStakeFixture);
    const { cover, singlePoolCoverId } = fixture;
    const [member] = fixture.accounts.members;
    const { amount } = fixture.constants.COVER_BUY_FIXTURE;

    const burnAmountDivisor = 2n;
    const burnAmount = amount / burnAmountDivisor;

    await expect(cover.connect(member).burnStake(singlePoolCoverId, burnAmount))
      .to.be.revertedWithCustomError(cover, 'Unauthorized')
      .withArgs(member.address, 0, 1 << 15);
  });

  it('updates segment allocation cover amount in nxm', async function () {
    const fixture = await loadFixture(burnStakeFixture);
    const { cover, singlePoolCoverId } = fixture;
    const { amount } = fixture.constants.COVER_BUY_FIXTURE;
    const [claims] = fixture.accounts.internalContracts;

    const burnAmountDivisor = 2n;
    const burnAmount = amount / burnAmountDivisor;

    const [poolAllocationBefore] = await cover.getPoolAllocations(singlePoolCoverId);
    const payoutAmountInNXM = poolAllocationBefore.coverAmountInNXM / burnAmountDivisor;

    await cover.connect(claims).burnStake(singlePoolCoverId, burnAmount);

    const [poolAllocationAfter] = await cover.getPoolAllocations(singlePoolCoverId);

    expect(poolAllocationAfter.coverAmountInNXM).to.be.equal(poolAllocationBefore.coverAmountInNXM - payoutAmountInNXM);
  });

  it('should perform a burn on a cover with 1 segment and 2 pool allocations', async function () {
    const fixture = await loadFixture(burnStakeFixture);
    const { cover, stakingProducts, constants, doublePoolCoverId } = fixture;
    const { COVER_BUY_FIXTURE } = constants;
    const [claims] = fixture.accounts.internalContracts;

    const { productId, coverAsset, period, amount } = COVER_BUY_FIXTURE;
    const amountOfPools = 2n;

    const burnAmountDivisor = 2n;
    const payoutAmountInAsset = amount / burnAmountDivisor;
    const remainingAmount = amount - payoutAmountInAsset;

    const coverData = await cover.getCoverData(doublePoolCoverId);
    const poolAllocationsBefore = await cover.getPoolAllocations(doublePoolCoverId);

    const expectedBurnAmount = poolAllocationsBefore.map(allocation => {
      const payoutInNXM = (allocation.coverAmountInNXM * payoutAmountInAsset) / coverData.amount;
      return (payoutInNXM * GLOBAL_CAPACITY_DENOMINATOR) / coverData.capacityRatio;
    });

    await cover.connect(claims).burnStake(doublePoolCoverId, payoutAmountInAsset);
    const storedCoverData = await cover.getCoverData(doublePoolCoverId);

    expect(storedCoverData.productId).to.equal(productId);
    expect(storedCoverData.coverAsset).to.equal(coverAsset);
    expect(storedCoverData.gracePeriod).to.equal(gracePeriod);
    expect(storedCoverData.period).to.equal(period);
    expect(storedCoverData.amount).to.equal(remainingAmount);

    const poolAllocationsAfter = await cover.getPoolAllocations(doublePoolCoverId);

    for (let i = 0; i < amountOfPools; i++) {
      const stakingPool = await ethers.getContractAt('COMockStakingPool', await stakingProducts.stakingPool(i + 1));

      const burnStakeCalledWithAmount = await stakingPool.burnStakeCalledWithAmount();
      expect(burnStakeCalledWithAmount).to.be.equal(expectedBurnAmount[i]);

      const payoutAmountInNXM = poolAllocationsBefore[i].coverAmountInNXM / burnAmountDivisor;

      expect(poolAllocationsAfter[i].coverAmountInNXM).to.be.equal(
        poolAllocationsBefore[i].coverAmountInNXM - payoutAmountInNXM,
      );
    }
  });

  it('should perform a burn with globalCapacityRatio when the cover was bought', async function () {
    const fixture = await loadFixture(burnStakeFixture);
    const { cover, stakingProducts, constants, singlePoolCoverId } = fixture;
    const [claims] = fixture.accounts.internalContracts;
    const { productId, coverAsset, period, amount } = constants.COVER_BUY_FIXTURE;

    const payoutAmountInAsset = amount / 2n;
    const remainingAmount = amount - payoutAmountInAsset;

    const coverData = await cover.getCoverData(singlePoolCoverId);
    const [poolAllocation] = await cover.getPoolAllocations(singlePoolCoverId);

    const payoutAmountInNXM = (poolAllocation.coverAmountInNXM * payoutAmountInAsset) / coverData.amount;
    const expectedBurnAmount = (payoutAmountInNXM * GLOBAL_CAPACITY_DENOMINATOR) / coverData.capacityRatio;

    await cover.connect(claims).burnStake(singlePoolCoverId, payoutAmountInAsset);
    const storedCoverData = await cover.getCoverData(singlePoolCoverId);

    expect(storedCoverData.productId).to.equal(productId);
    expect(storedCoverData.coverAsset).to.equal(coverAsset);
    expect(storedCoverData.gracePeriod).to.equal(gracePeriod);
    expect(storedCoverData.period).to.equal(period);
    expect(storedCoverData.amount).to.equal(remainingAmount);

    const stakingPool = await ethers.getContractAt('COMockStakingPool', await stakingProducts.stakingPool(1));
    const burnStakeCalledWithAmount = await stakingPool.burnStakeCalledWithAmount();
    expect(burnStakeCalledWithAmount).to.be.equal(expectedBurnAmount);
  });

  it('updates segment allocation premium in nxm', async function () {
    const fixture = await loadFixture(burnStakeFixture);
    const { cover, singlePoolCoverId } = fixture;
    const [claims] = fixture.accounts.internalContracts;
    const { amount } = fixture.constants.COVER_BUY_FIXTURE;

    const burnAmountDivisor = 2n;
    const burnAmount = amount / burnAmountDivisor;

    const [poolAllocationBefore] = await cover.getPoolAllocations(singlePoolCoverId);

    await cover.connect(claims).burnStake(singlePoolCoverId, burnAmount);

    const payoutAmountInNXM = poolAllocationBefore.premiumInNXM / burnAmountDivisor;
    const [poolAllocationAfter] = await cover.getPoolAllocations(singlePoolCoverId);
    expect(poolAllocationAfter.premiumInNXM).to.be.equal(poolAllocationBefore.premiumInNXM - payoutAmountInNXM);
  });
});

const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');
const { createCover, daysToSeconds, setMCR, calculateCurrentMCR } = require('../utils');

const { parseEther, parseUnits } = ethers;
const { PoolAsset, PauseTypes } = nexus.constants;
const { BigIntMath } = nexus.helpers;

const ONE_NXM = parseEther('1');
const ALLOCATION_UNITS_PER_NXM = 100n;
const NXM_PER_ALLOCATION_UNIT = ONE_NXM / ALLOCATION_UNITS_PER_NXM;
const BUCKET_SIZE = 7n * 24n * 3600n; // 7 days

/**
 * Calculate the exact cover amount that will be allocated by the contract
 * @param {bigint} requestedAmount - The amount of cover requested
 * @param {bigint} nxmPriceInCoverAsset - The NXM price in the cover asset
 * @returns {bigint} The actual cover amount that will be allocated
 */
function calculateAllocatedCoverAmount(requestedAmount, nxmPriceInCoverAsset) {
  const { divCeil, roundUpToMultiple } = BigIntMath;
  const coverAmountInNXM = divCeil(requestedAmount * ONE_NXM, nxmPriceInCoverAsset);
  const roundedCoverAmountInNXM = roundUpToMultiple(coverAmountInNXM, NXM_PER_ALLOCATION_UNIT);
  return (roundedCoverAmountInNXM * nxmPriceInCoverAsset) / ONE_NXM;
}

/**
 * Calculate the bucket expiration time for a cover
 * @param {bigint} coverExpiration - The cover expiration timestamp
 * @returns {bigint} The bucket expiration timestamp
 */
function calculateBucketExpiration(coverExpiration) {
  const expirationBucketId = (coverExpiration + BUCKET_SIZE - 1n) / BUCKET_SIZE;
  return expirationBucketId * BUCKET_SIZE;
}

describe('MCR Integration Tests', function () {
  describe('getMCR', function () {
    it('should return consistent value when called multiple times in same block', async function () {
      const fixture = await loadFixture(setup);
      const { pool } = fixture.contracts;

      const firstCall = await pool.getMCR();
      const secondCall = await pool.getMCR();

      expect(firstCall).to.be.gt(0n);
      expect(firstCall).to.be.equal(secondCall);
    });
  });

  describe('getTotalActiveCoverAmount', function () {
    it('should return 0 when no cover has been bought', async function () {
      const fixture = await loadFixture(setup);
      const { pool } = fixture.contracts;

      const totalActiveCoverAmount = await pool.getTotalActiveCoverAmount();
      expect(totalActiveCoverAmount).to.be.equal(0n);
    });

    it('should return correct amount after buying ETH cover', async function () {
      const fixture = await loadFixture(setup);
      const { pool, cover } = fixture.contracts;
      const [coverBuyer] = fixture.accounts.members;

      const coverAmount = parseEther('10');
      const nxmPriceInEth = await pool.getInternalTokenPriceInAsset(PoolAsset.ETH);
      const expectedAllocatedAmount = calculateAllocatedCoverAmount(coverAmount, nxmPriceInEth);

      await createCover(cover, coverBuyer, {
        coverAsset: PoolAsset.ETH,
        amount: coverAmount,
        periodDays: 30,
      });

      const totalActiveCoverAmount = await pool.getTotalActiveCoverAmount();
      expect(totalActiveCoverAmount).to.be.equal(expectedAllocatedAmount);
    });

    it('should return correct amount after buying USDC cover', async function () {
      const fixture = await loadFixture(setup);
      const { pool, cover, usdc } = fixture.contracts;
      const [coverBuyer] = fixture.accounts.members;

      const usdcCoverAmount = parseUnits('10000', 6);
      const nxmPriceInUsdc = await pool.getInternalTokenPriceInAsset(PoolAsset.USDC);
      const expectedAllocatedAmount = calculateAllocatedCoverAmount(usdcCoverAmount, nxmPriceInUsdc);

      await usdc.mint(coverBuyer.address, usdcCoverAmount * 10n);
      await usdc.connect(coverBuyer).approve(cover.target, usdcCoverAmount * 10n);

      await createCover(cover, coverBuyer, {
        coverAsset: PoolAsset.USDC,
        amount: usdcCoverAmount,
        periodDays: 30,
      });

      const totalActiveCoverAmount = await pool.getTotalActiveCoverAmount();
      const expectedInEth = await pool.getEthForAsset(usdc.target, expectedAllocatedAmount);

      expect(totalActiveCoverAmount).to.be.equal(expectedInEth);
    });

    it('should return correct amount after buying cbBTC cover paymentAsset=NXM', async function () {
      const fixture = await loadFixture(setup);
      const { pool, cover, cbBTC, token } = fixture.contracts;
      const [coverBuyer] = fixture.accounts.members;

      const cbBTCCoverAmount = parseUnits('1', 8);
      const nxmPriceInCbBTC = await pool.getInternalTokenPriceInAsset(PoolAsset.cbBTC);
      const expectedAllocatedAmount = calculateAllocatedCoverAmount(cbBTCCoverAmount, nxmPriceInCbBTC);

      const maxPremiumInNXM = parseEther('100');
      await token.connect(coverBuyer).approve(cover.target, maxPremiumInNXM);

      await createCover(cover, coverBuyer, {
        coverAsset: PoolAsset.cbBTC,
        amount: cbBTCCoverAmount,
        periodDays: 30,
        paymentAsset: PoolAsset.NXM,
        maxPremiumInAsset: maxPremiumInNXM,
      });

      const totalActiveCoverAmount = await pool.getTotalActiveCoverAmount();
      const expectedInEth = await pool.getEthForAsset(cbBTC.target, expectedAllocatedAmount);

      expect(totalActiveCoverAmount).to.be.equal(expectedInEth);
    });

    it('should return correct amount after buying covers in multiple assets', async function () {
      const fixture = await loadFixture(setup);
      const { pool, cover, usdc, cbBTC } = fixture.contracts;
      const [coverBuyer] = fixture.accounts.members;

      const ethCoverAmount = parseEther('10');
      const usdcCoverAmount = parseUnits('10000', 6);
      const cbBTCCoverAmount = parseUnits('1', 8);

      const nxmPriceInEth1 = await pool.getInternalTokenPriceInAsset(PoolAsset.ETH);
      const expectedEthAmount = calculateAllocatedCoverAmount(ethCoverAmount, nxmPriceInEth1);

      // ETH
      await createCover(cover, coverBuyer, {
        coverAsset: PoolAsset.ETH,
        amount: ethCoverAmount,
        periodDays: 30,
      });

      expect(await pool.getTotalActiveCoverAmount()).to.be.equal(expectedEthAmount);

      await usdc.mint(coverBuyer.address, usdcCoverAmount * 10n);
      await usdc.connect(coverBuyer).approve(cover.target, usdcCoverAmount * 10n);

      const nxmPriceInUsdc = await pool.getInternalTokenPriceInAsset(PoolAsset.USDC);
      const expectedUsdcAmount = calculateAllocatedCoverAmount(usdcCoverAmount, nxmPriceInUsdc);

      // USDC
      await createCover(cover, coverBuyer, {
        coverAsset: PoolAsset.USDC,
        amount: usdcCoverAmount,
        periodDays: 30,
      });

      const usdcInEth = await pool.getEthForAsset(usdc.target, expectedUsdcAmount);
      expect(await pool.getTotalActiveCoverAmount()).to.be.equal(expectedEthAmount + usdcInEth);

      await cbBTC.mint(coverBuyer.address, cbBTCCoverAmount * 10n);
      await cbBTC.connect(coverBuyer).approve(cover.target, cbBTCCoverAmount * 10n);

      const nxmPriceInCbBTC = await pool.getInternalTokenPriceInAsset(PoolAsset.cbBTC);
      const expectedCbBTCAmount = calculateAllocatedCoverAmount(cbBTCCoverAmount, nxmPriceInCbBTC);

      // cbBTC
      await createCover(cover, coverBuyer, {
        coverAsset: PoolAsset.cbBTC,
        amount: cbBTCCoverAmount,
        periodDays: 30,
      });

      const cbBTCInEth = await pool.getEthForAsset(cbBTC.target, expectedCbBTCAmount);
      expect(await pool.getTotalActiveCoverAmount()).to.be.equal(expectedEthAmount + usdcInEth + cbBTCInEth);
    });

    it('should decrease when cover expires', async function () {
      const fixture = await loadFixture(setup);
      const { pool, cover } = fixture.contracts;
      const [coverBuyer] = fixture.accounts.members;

      const coverAmount = parseEther('10');
      const periodDays = 30;
      const nxmPriceInEth = await pool.getInternalTokenPriceInAsset(PoolAsset.ETH);
      const expectedAllocatedAmount = calculateAllocatedCoverAmount(coverAmount, nxmPriceInEth);

      await createCover(cover, coverBuyer, {
        coverAsset: PoolAsset.ETH,
        amount: coverAmount,
        periodDays,
      });

      const totalActiveCoverBefore = await pool.getTotalActiveCoverAmount();
      expect(totalActiveCoverBefore).to.be.equal(expectedAllocatedAmount);

      const currentTime = await time.latest();
      const coverExpiration = BigInt(currentTime) + BigInt(daysToSeconds(periodDays));
      const nextBucketTime = calculateBucketExpiration(coverExpiration);

      await time.increaseTo(nextBucketTime);
      await cover.updateTotalActiveCoverAmount(PoolAsset.ETH);

      const totalActiveCoverAfter = await pool.getTotalActiveCoverAmount();
      expect(totalActiveCoverAfter).to.be.equal(0n);
    });

    it('handles multiple covers with different expiration times', async function () {
      const fixture = await loadFixture(setup);
      const { pool, cover } = fixture.contracts;
      const [coverBuyer] = fixture.accounts.members;

      const nxmPriceInEth1 = await pool.getInternalTokenPriceInAsset(PoolAsset.ETH);
      const expectedAmount1 = calculateAllocatedCoverAmount(parseEther('50'), nxmPriceInEth1);

      const currentTime1 = await time.latest();

      await createCover(cover, coverBuyer, {
        coverAsset: PoolAsset.ETH,
        amount: parseEther('50'),
        periodDays: 30,
      });

      const nxmPriceInEth2 = await pool.getInternalTokenPriceInAsset(PoolAsset.ETH);
      const expectedAmount2 = calculateAllocatedCoverAmount(parseEther('50'), nxmPriceInEth2);

      await createCover(cover, coverBuyer, {
        coverAsset: PoolAsset.ETH,
        amount: parseEther('50'),
        periodDays: 60,
      });

      const expectedTotalCoverAmount = expectedAmount1 + expectedAmount2;
      expect(await pool.getTotalActiveCoverAmount()).to.be.equal(expectedTotalCoverAmount);

      // cover 1 expires
      const cover1Expiration = BigInt(currentTime1) + BigInt(daysToSeconds(30));
      const nextBucket1Time = calculateBucketExpiration(cover1Expiration);

      await time.increaseTo(nextBucket1Time);
      await cover.updateTotalActiveCoverAmount(PoolAsset.ETH);

      expect(await pool.getTotalActiveCoverAmount()).to.be.equal(expectedTotalCoverAmount - expectedAmount1);

      // cover 2 expires
      const cover2Expiration = BigInt(currentTime1) + BigInt(daysToSeconds(60));
      const nextBucket2Time = calculateBucketExpiration(cover2Expiration);

      await time.increaseTo(nextBucket2Time);
      await cover.updateTotalActiveCoverAmount(PoolAsset.ETH);

      expect(await pool.getTotalActiveCoverAmount()).to.be.equal(0n);
    });
  });

  describe('calculateCurrentMCR', function () {
    it('should return stored when no time has passed', async function () {
      const fixture = await loadFixture(setup);
      const { pool } = fixture.contracts;

      const stored = parseEther('100');
      const desired = parseEther('150');
      const now = BigInt(await time.latest());

      const calculatedMCR = await pool.calculateCurrentMCR(stored, desired, now, now);
      expect(calculatedMCR).to.be.equal(stored);
    });

    it('should increase MCR over time when desired > stored', async function () {
      const fixture = await loadFixture(setup);
      const { pool } = fixture.contracts;

      const MAX_MCR_INCREMENT = await pool.MAX_MCR_INCREMENT();
      const MAX_MCR_ADJUSTMENT = await pool.MAX_MCR_ADJUSTMENT();
      const BASIS_PRECISION = await pool.BASIS_PRECISION();

      const stored = parseEther('100');
      const desired = parseEther('150');
      const updatedAt = BigInt(await time.latest());

      await setMCR(pool.target, { stored, desired, updatedAt }, ethers.provider);

      await time.increase(3600);

      const now = BigInt(await time.latest());
      const currentMCR = await pool.getMCR();

      const calculatedMCR = calculateCurrentMCR(
        { stored, desired, now, updatedAt },
        { MAX_MCR_INCREMENT, MAX_MCR_ADJUSTMENT, BASIS_PRECISION },
      );

      expect(currentMCR).to.be.equal(calculatedMCR);
      expect(currentMCR).to.be.gt(stored);
      expect(currentMCR).to.be.lt(desired);
    });

    it('should decrease MCR over time when desired < stored', async function () {
      const fixture = await loadFixture(setup);
      const { pool } = fixture.contracts;

      const MAX_MCR_INCREMENT = await pool.MAX_MCR_INCREMENT();
      const MAX_MCR_ADJUSTMENT = await pool.MAX_MCR_ADJUSTMENT();
      const BASIS_PRECISION = await pool.BASIS_PRECISION();

      const stored = parseEther('150');
      const desired = parseEther('100');
      const updatedAt = BigInt(await time.latest());

      await setMCR(pool.target, { stored, desired, updatedAt }, ethers.provider);

      await time.increase(3600);

      const now = BigInt(await time.latest());
      const currentMCR = await pool.getMCR();

      const calculatedMCR = calculateCurrentMCR(
        { stored, desired, now, updatedAt },
        { MAX_MCR_INCREMENT, MAX_MCR_ADJUSTMENT, BASIS_PRECISION },
      );

      expect(currentMCR).to.be.equal(calculatedMCR);
      expect(currentMCR).to.be.lt(stored);
      expect(currentMCR).to.be.gt(desired);
    });

    it('should cap change at MAX_MCR_ADJUSTMENT', async function () {
      const fixture = await loadFixture(setup);
      const { pool } = fixture.contracts;

      const MAX_MCR_ADJUSTMENT = await pool.MAX_MCR_ADJUSTMENT();
      const BASIS_PRECISION = await pool.BASIS_PRECISION();

      const stored = parseEther('100');
      const desired = parseEther('200');
      const updatedAt = BigInt(await time.latest());

      await setMCR(pool.target, { stored, desired, updatedAt }, ethers.provider);

      // increase time significantly
      await time.increase(daysToSeconds(30));

      const currentMCR = await pool.getMCR();

      // MAX_MCR_ADJUSTMENT is 100 bps (1%), so the max allowed MCR is 101% of stored
      const maxAllowedMCR = (stored * (BASIS_PRECISION + MAX_MCR_ADJUSTMENT)) / BASIS_PRECISION;

      expect(currentMCR).to.be.equal(maxAllowedMCR);
      expect(currentMCR).to.be.lt(desired);
    });

    it('should reach desired MCR when enough time passes', async function () {
      const fixture = await loadFixture(setup);
      const { pool } = fixture.contracts;

      const stored = parseEther('100');
      const desired = parseEther('101'); // set desired 1% away from stored
      const updatedAt = BigInt(await time.latest());

      await setMCR(pool.target, { stored, desired, updatedAt }, ethers.provider);

      await time.increase(daysToSeconds(10));

      expect(await pool.getMCR()).to.be.equal(desired);
    });
  });

  describe('updateMCR', function () {
    it('should revert when paused globally', async function () {
      const fixture = await loadFixture(setup);
      const { pool, registry } = fixture.contracts;
      const [ea1, ea2] = fixture.accounts.emergencyAdmins;

      await registry.connect(ea1).proposePauseConfig(PauseTypes.PAUSE_GLOBAL);
      await registry.connect(ea2).confirmPauseConfig(PauseTypes.PAUSE_GLOBAL);

      await expect(pool.updateMCR()).to.be.revertedWithCustomError(pool, 'Paused');
    });

    it('should not update stored MCR if MIN_UPDATE_TIME has not passed', async function () {
      const fixture = await loadFixture(setup);
      const { pool } = fixture.contracts;

      const MIN_UPDATE_TIME = await pool.MIN_UPDATE_TIME();
      const stored = parseEther('100');
      const desired = parseEther('150');
      const updatedAt = BigInt(await time.latest());

      await setMCR(pool.target, { stored, desired, updatedAt }, ethers.provider);

      await time.increase(MIN_UPDATE_TIME - 10n);

      const mcrBefore = await pool.getMCR();
      await pool.updateMCR();
      const mcrAfter = await pool.getMCR();

      expect(mcrAfter).to.be.equal(mcrBefore);
    });

    it('should update stored MCR value after at least MIN_UPDATE_TIME has passed', async function () {
      const fixture = await loadFixture(setup);
      const { pool } = fixture.contracts;

      const MIN_UPDATE_TIME = await pool.MIN_UPDATE_TIME();

      const stored = parseEther('100');
      const desired = parseEther('50'); // desired is lower so MCR should decrease
      const updatedAt = BigInt(await time.latest());

      await setMCR(pool.target, { stored, desired, updatedAt }, ethers.provider);

      const mcrBeforeUpdate = await pool.getMCR();
      expect(mcrBeforeUpdate).to.be.equal(stored);

      await time.increase(MIN_UPDATE_TIME);
      await pool.updateMCR();

      await time.increase(daysToSeconds(1));
      const mcrAfterUpdate = await pool.getMCR();

      expect(mcrAfterUpdate).to.be.lt(mcrBeforeUpdate);
    });

    it('should update MCR to reflect cover amount', async function () {
      const fixture = await loadFixture(setup);
      const { pool, cover } = fixture.contracts;
      const [coverBuyer] = fixture.accounts.members;

      const MIN_UPDATE_TIME = await pool.MIN_UPDATE_TIME();
      const GEARING_FACTOR = await pool.GEARING_FACTOR();
      const BASIS_PRECISION = await pool.BASIS_PRECISION();

      // set same value to keep it stable
      const stored = parseEther('1000');
      const desired = parseEther('1000');
      const updatedAt = BigInt(await time.latest());

      await setMCR(pool.target, { stored, desired, updatedAt }, ethers.provider);

      const mcrBeforeCover = await pool.getMCR();
      expect(mcrBeforeCover).to.be.equal(desired);

      // buy cover to increase desired MCR
      const coverAmount = parseEther('10000');
      const nxmPriceInEth = await pool.getInternalTokenPriceInAsset(PoolAsset.ETH);
      const expectedAllocatedAmount = calculateAllocatedCoverAmount(coverAmount, nxmPriceInEth);

      await createCover(cover, coverBuyer, {
        coverAsset: PoolAsset.ETH,
        amount: coverAmount,
        periodDays: 90,
      });

      const totalActiveCover = await pool.getTotalActiveCoverAmount();
      const newDesiredMCR = (totalActiveCover * BASIS_PRECISION) / GEARING_FACTOR;

      expect(totalActiveCover).to.be.equal(expectedAllocatedAmount);
      expect(newDesiredMCR).to.be.gt(mcrBeforeCover);

      // lock in the new desired value
      await time.increase(MIN_UPDATE_TIME);
      await pool.updateMCR();

      // increase time to see MCR trend upwards new higher desired MCR
      await time.increase(MIN_UPDATE_TIME);
      const mcrAfter = await pool.getMCR();

      expect(mcrAfter).to.be.gt(mcrBeforeCover);
      expect(mcrAfter).to.be.lt(newDesiredMCR);
    });

    it('should gradually move stored MCR towards desired value with active cover', async function () {
      const fixture = await loadFixture(setup);
      const { pool, cover } = fixture.contracts;
      const [coverBuyer] = fixture.accounts.members;

      const MIN_UPDATE_TIME = await pool.MIN_UPDATE_TIME();
      const GEARING_FACTOR = await pool.GEARING_FACTOR();
      const BASIS_PRECISION = await pool.BASIS_PRECISION();

      // establish a desired MCR by buying cover
      const coverAmount = parseEther('1000');
      await createCover(cover, coverBuyer, {
        coverAsset: PoolAsset.ETH,
        amount: coverAmount,
        periodDays: 90,
      });

      const totalActiveCover = await pool.getTotalActiveCoverAmount();
      const targetDesired = (totalActiveCover * BASIS_PRECISION) / GEARING_FACTOR;

      // Set stored MCR lower than desired
      const stored = targetDesired / 2n;
      const updatedAt = BigInt(await time.latest());

      await setMCR(pool.target, { stored, desired: targetDesired, updatedAt }, ethers.provider);

      // update 1
      await time.increase(MIN_UPDATE_TIME);
      await pool.updateMCR();
      const mcr1 = await pool.getMCR();

      // update 2
      await time.increase(MIN_UPDATE_TIME);
      await pool.updateMCR();
      const mcr2 = await pool.getMCR();

      // update 3
      await time.increase(MIN_UPDATE_TIME);
      await pool.updateMCR();
      const mcr3 = await pool.getMCR();

      // MCR should gradually increase towards desired
      expect(mcr1).to.be.gt(stored);
      expect(mcr2).to.be.gte(mcr1);
      expect(mcr3).to.be.gte(mcr2);
      expect(mcr3).to.be.lte(targetDesired);
    });

    it('should increase desired MCR when cover is bought', async function () {
      const fixture = await loadFixture(setup);
      const { pool, cover } = fixture.contracts;
      const [coverBuyer] = fixture.accounts.members;

      const GEARING_FACTOR = await pool.GEARING_FACTOR();
      const BASIS_PRECISION = await pool.BASIS_PRECISION();

      const totalActiveCoverBefore = await pool.getTotalActiveCoverAmount();
      expect(totalActiveCoverBefore).to.be.equal(0n);

      const coverAmount = parseEther('100');
      const nxmPriceInEth = await pool.getInternalTokenPriceInAsset(PoolAsset.ETH);
      const expectedAllocatedAmount = calculateAllocatedCoverAmount(coverAmount, nxmPriceInEth);

      await createCover(cover, coverBuyer, {
        coverAsset: PoolAsset.ETH,
        amount: coverAmount,
        periodDays: 30,
      });

      const totalActiveCoverAfter = await pool.getTotalActiveCoverAmount();
      const expectedDesiredMCR = (expectedAllocatedAmount * BASIS_PRECISION) / GEARING_FACTOR;

      expect(totalActiveCoverAfter).to.be.equal(expectedAllocatedAmount);
      expect(expectedDesiredMCR).to.be.equal((totalActiveCoverAfter * BASIS_PRECISION) / GEARING_FACTOR);
    });
  });

  describe('getMCRRatio', function () {
    it('should reflect pool value to MCR relationship', async function () {
      const fixture = await loadFixture(setup);
      const { pool } = fixture.contracts;

      const poolValue = await pool.getPoolValueInEth();
      const mcr = await pool.getMCR();
      const mcrRatio = await pool.getMCRRatio();

      const MCR_RATIO_DECIMALS = await pool.MCR_RATIO_DECIMALS();
      const expectedRatio = (poolValue * 10n ** MCR_RATIO_DECIMALS) / mcr;

      expect(mcrRatio).to.be.equal(expectedRatio);
      expect(mcrRatio).to.be.gt(0n);
    });

    it('should change as pool value changes', async function () {
      const fixture = await loadFixture(setup);
      const { pool } = fixture.contracts;
      const [sender] = fixture.accounts.members;

      const MCR_RATIO_DECIMALS = await pool.MCR_RATIO_DECIMALS();
      const mcr = await pool.getMCR();
      const poolValueBefore = await pool.getPoolValueInEth();
      const ratioInitial = await pool.getMCRRatio();

      const expectedRatioInitial = (poolValueBefore * 10n ** MCR_RATIO_DECIMALS) / mcr;
      expect(ratioInitial).to.be.equal(expectedRatioInitial);

      const depositAmount = parseEther('1000');
      await sender.sendTransaction({
        to: pool.target,
        value: depositAmount,
      });

      const poolValueAfter = await pool.getPoolValueInEth();
      const ratioAfterDeposit = await pool.getMCRRatio();

      const expectedRatioAfter = (poolValueAfter * 10n ** MCR_RATIO_DECIMALS) / mcr;
      expect(ratioAfterDeposit).to.be.equal(expectedRatioAfter);
      expect(poolValueAfter).to.be.equal(poolValueBefore + depositAmount);
      expect(ratioAfterDeposit).to.be.gt(ratioInitial);
    });
  });
});

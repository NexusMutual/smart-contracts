const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');
const { daysToSeconds, getFundedSigner } = require('../utils');

const { PoolAsset } = nexus.constants;
const { BigIntMath } = nexus.helpers;

const ONE_NXM = ethers.parseEther('1');
const ALLOCATION_UNITS_PER_NXM = 100n;
const NXM_PER_ALLOCATION_UNIT = ONE_NXM / ALLOCATION_UNITS_PER_NXM;

/**
 * Calculate the exact cover amount that will be allocated by the contract
 * Cover._requestAllocation
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

const buyCoverFixture = {
  coverId: 0,
  owner: ethers.ZeroAddress,
  productId: 0,
  coverAsset: PoolAsset.ETH,
  amount: ethers.parseEther('10'),
  period: daysToSeconds(30),
  maxPremiumInAsset: ethers.MaxUint256,
  paymentAsset: PoolAsset.ETH,
  commissionRatio: 0,
  commissionDestination: ethers.ZeroAddress,
  ipfsData: '',
};

const BUCKET_SIZE = 7n * 24n * 3600n; // 7 days in seconds

describe('totalActiveCoverInAsset', function () {
  it('should return 0 when no cover has been bought', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture.contracts;

    const totalActiveCoverInEth = await cover.totalActiveCoverInAsset(PoolAsset.ETH);
    const totalActiveCoverInDai = await cover.totalActiveCoverInAsset(PoolAsset.DAI);
    const totalActiveCoverInUsdc = await cover.totalActiveCoverInAsset(PoolAsset.USDC);

    expect(totalActiveCoverInEth).to.be.equal(0n);
    expect(totalActiveCoverInDai).to.be.equal(0n);
    expect(totalActiveCoverInUsdc).to.be.equal(0n);
  });

  it('should return the correct active cover amount after buying cover', async function () {
    const fixture = await loadFixture(setup);
    const { cover, pool } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, coverAsset } = buyCoverFixture;

    const totalActiveCoverBefore = await cover.totalActiveCoverInAsset(coverAsset);
    expect(totalActiveCoverBefore).to.be.equal(0n);

    const nxmPriceInCoverAsset = await pool.getInternalTokenPriceInAsset(coverAsset);
    const expectedAllocatedAmount = calculateAllocatedCoverAmount(amount, nxmPriceInCoverAsset);

    await cover
      .connect(coverBuyer)
      .buyCover({ ...buyCoverFixture, owner: coverBuyer.address }, [{ poolId: 1, coverAmountInAsset: amount }], {
        value: amount,
      });

    const totalActiveCoverAfter = await cover.totalActiveCoverInAsset(coverAsset);
    expect(totalActiveCoverAfter).to.be.equal(expectedAllocatedAmount);
  });

  it('should track active cover for multiple assets independently', async function () {
    const fixture = await loadFixture(setup);
    const { cover, usdc } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;
    const ethAmount = ethers.parseEther('10');
    const usdcAmount = ethers.parseUnits('50000', 6);

    await usdc.mint(coverBuyer.address, usdcAmount);
    await usdc.connect(coverBuyer).approve(cover.target, ethers.MaxUint256);

    // buy cover (ETH)
    await cover
      .connect(coverBuyer)
      .buyCover(
        { ...buyCoverFixture, owner: coverBuyer.address, amount: ethAmount, coverAsset: PoolAsset.ETH },
        [{ poolId: 1, coverAmountInAsset: ethAmount }],
        { value: ethAmount },
      );

    const ethCoverId = await cover.getCoverDataCount();
    const ethCoverData = await cover.getCoverData(ethCoverId);

    // buy cover (USDC)
    await cover.connect(coverBuyer).buyCover(
      {
        ...buyCoverFixture,
        owner: coverBuyer.address,
        amount: usdcAmount,
        coverAsset: PoolAsset.USDC,
        paymentAsset: PoolAsset.USDC,
      },
      [{ poolId: 1, coverAmountInAsset: usdcAmount }],
    );

    const usdcCoverId = await cover.getCoverDataCount();
    const usdcCoverData = await cover.getCoverData(usdcCoverId);

    const totalActiveCoverInEth = await cover.totalActiveCoverInAsset(PoolAsset.ETH);
    const totalActiveCoverInUsdc = await cover.totalActiveCoverInAsset(PoolAsset.USDC);
    const totalActiveCoverInCbBTC = await cover.totalActiveCoverInAsset(PoolAsset.cbBTC);

    // Verify totalActiveCoverInAsset matches the actual allocated cover amounts
    expect(totalActiveCoverInEth).to.be.equal(ethCoverData.amount);
    expect(totalActiveCoverInUsdc).to.be.equal(usdcCoverData.amount);
    expect(totalActiveCoverInCbBTC).to.be.equal(0n);
  });

  it('should increase active cover when buying multiple covers', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture.contracts;
    const [coverBuyer1, coverBuyer2] = fixture.accounts.members;
    const { amount, coverAsset } = buyCoverFixture;

    // buy cover 1 (ETH)
    await cover
      .connect(coverBuyer1)
      .buyCover({ ...buyCoverFixture, owner: coverBuyer1.address }, [{ poolId: 1, coverAmountInAsset: amount }], {
        value: amount,
      });

    const coverId1 = await cover.getCoverDataCount();
    const coverData1 = await cover.getCoverData(coverId1);
    const totalActiveCoverAfterFirst = await cover.totalActiveCoverInAsset(coverAsset);

    // buy cover 2 (ETH)
    await cover
      .connect(coverBuyer2)
      .buyCover({ ...buyCoverFixture, owner: coverBuyer2.address }, [{ poolId: 1, coverAmountInAsset: amount }], {
        value: amount,
      });

    const coverId2 = await cover.getCoverDataCount();
    const coverData2 = await cover.getCoverData(coverId2);
    const totalActiveCoverAfterSecond = await cover.totalActiveCoverInAsset(coverAsset);
    const actualIncrease = totalActiveCoverAfterSecond - totalActiveCoverAfterFirst;

    expect(totalActiveCoverAfterSecond).to.be.gt(totalActiveCoverAfterFirst);
    expect(actualIncrease).to.be.equal(coverData2.amount);
    expect(totalActiveCoverAfterSecond).to.be.equal(coverData1.amount + coverData2.amount);
  });

  it('should automatically decrease active cover when bucket expires', async function () {
    const fixture = await loadFixture(setup);
    const { cover, pool } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, coverAsset, period } = buyCoverFixture;

    const nxmPriceInCoverAsset = await pool.getInternalTokenPriceInAsset(coverAsset);
    const expectedAllocatedAmount = calculateAllocatedCoverAmount(amount, nxmPriceInCoverAsset);

    await cover
      .connect(coverBuyer)
      .buyCover({ ...buyCoverFixture, owner: coverBuyer.address }, [{ poolId: 1, coverAmountInAsset: amount }], {
        value: amount,
      });

    const totalActiveCoverAfterBuy = await cover.totalActiveCoverInAsset(coverAsset);
    expect(totalActiveCoverAfterBuy).to.be.equal(expectedAllocatedAmount);

    // Move past the cover period and into the next bucket
    await time.increase(BigInt(period) + BUCKET_SIZE + 1n);
    await cover.updateTotalActiveCoverAmount(coverAsset);

    const totalActiveCoverAfterExpiry = await cover.totalActiveCoverInAsset(coverAsset);
    expect(totalActiveCoverAfterExpiry).to.be.equal(0n);
  });

  it('should decrease active cover when expireCover is called', async function () {
    const fixture = await loadFixture(setup);
    const { cover, pool } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, coverAsset, period } = buyCoverFixture;

    const nxmPriceInCoverAsset = await pool.getInternalTokenPriceInAsset(coverAsset);
    const expectedAllocatedAmount = calculateAllocatedCoverAmount(amount, nxmPriceInCoverAsset);

    await cover
      .connect(coverBuyer)
      .buyCover({ ...buyCoverFixture, owner: coverBuyer.address }, [{ poolId: 1, coverAmountInAsset: amount }], {
        value: amount,
      });

    const coverId = await cover.getCoverDataCount();
    const totalActiveCoverAfterBuy = await cover.totalActiveCoverInAsset(coverAsset);

    await time.increase(BigInt(period) + 1n);
    await cover.connect(coverBuyer).expireCover(coverId);

    await time.increase(BUCKET_SIZE);
    const totalActiveCoverAfterExpire = await cover.totalActiveCoverInAsset(coverAsset);

    expect(totalActiveCoverAfterBuy).to.be.equal(expectedAllocatedAmount);
    expect(totalActiveCoverAfterExpire).to.be.equal(0n);
  });

  it('should update active cover correctly when editing cover', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, coverAsset } = buyCoverFixture;

    await cover
      .connect(coverBuyer)
      .buyCover({ ...buyCoverFixture, owner: coverBuyer.address }, [{ poolId: 1, coverAmountInAsset: amount }], {
        value: amount,
      });

    const coverId = await cover.getCoverDataCount();
    const totalActiveCoverAfterFirstBuy = await cover.totalActiveCoverInAsset(coverAsset);

    const newAmount = ethers.parseEther('20');

    await cover
      .connect(coverBuyer)
      .buyCover(
        { ...buyCoverFixture, coverId, owner: coverBuyer.address, amount: newAmount },
        [{ poolId: 1, coverAmountInAsset: newAmount }],
        { value: newAmount },
      );

    const editedCoverId = await cover.getCoverDataCount();
    const editedCoverData = await cover.getCoverData(editedCoverId);

    const totalActiveCoverAfterEdit = await cover.totalActiveCoverInAsset(coverAsset);
    expect(totalActiveCoverAfterEdit).to.be.equal(editedCoverData.amount);
    expect(totalActiveCoverAfterEdit).to.be.gt(totalActiveCoverAfterFirstBuy);
  });

  it('should handle multiple covers with different expiration times', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, coverAsset } = buyCoverFixture;

    const shortPeriod = daysToSeconds(28);
    const longPeriod = daysToSeconds(90);

    await cover
      .connect(coverBuyer)
      .buyCover(
        { ...buyCoverFixture, owner: coverBuyer.address, period: shortPeriod },
        [{ poolId: 1, coverAmountInAsset: amount }],
        { value: amount },
      );

    const shortCoverId = await cover.getCoverDataCount();
    const shortCoverData = await cover.getCoverData(shortCoverId);

    await cover
      .connect(coverBuyer)
      .buyCover(
        { ...buyCoverFixture, owner: coverBuyer.address, period: longPeriod },
        [{ poolId: 1, coverAmountInAsset: amount }],
        { value: amount },
      );

    const longCoverId = await cover.getCoverDataCount();
    const longCoverData = await cover.getCoverData(longCoverId);

    const totalActiveCoverAfterBoth = await cover.totalActiveCoverInAsset(coverAsset);
    expect(totalActiveCoverAfterBoth).to.be.equal(shortCoverData.amount + longCoverData.amount);

    await time.increase(BigInt(shortPeriod) + BUCKET_SIZE + 1n);

    await cover.updateTotalActiveCoverAmount(coverAsset);
    const totalActiveCoverAfterShortExpiry = await cover.totalActiveCoverInAsset(coverAsset);
    expect(totalActiveCoverAfterShortExpiry).to.be.lt(totalActiveCoverAfterBoth);
    expect(totalActiveCoverAfterShortExpiry).to.be.equal(longCoverData.amount);

    await time.increase(BigInt(longPeriod) - BigInt(shortPeriod) + BUCKET_SIZE);

    await cover.updateTotalActiveCoverAmount(coverAsset);
    const totalActiveCoverAfterLongExpiry = await cover.totalActiveCoverInAsset(coverAsset);
    expect(totalActiveCoverAfterLongExpiry).to.be.equal(0n);
  });

  it('should decrease active cover when burnStake is called after claim payout', async function () {
    const fixture = await loadFixture(setup);
    const { cover, claims, pool } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, coverAsset } = buyCoverFixture;

    const nxmPriceInCoverAsset = await pool.getInternalTokenPriceInAsset(coverAsset);
    const expectedAllocatedAmount = calculateAllocatedCoverAmount(amount, nxmPriceInCoverAsset);

    await cover
      .connect(coverBuyer)
      .buyCover({ ...buyCoverFixture, owner: coverBuyer.address }, [{ poolId: 1, coverAmountInAsset: amount }], {
        value: amount,
      });

    const coverId = await cover.getCoverDataCount();
    const totalActiveCoverAfterBuy = await cover.totalActiveCoverInAsset(coverAsset);

    const claimsSigner = await getFundedSigner(claims.target);
    const payoutAmount = amount / 2n;
    await cover.connect(claimsSigner).burnStake(coverId, payoutAmount);

    const totalActiveCoverAfterBurnStake = await cover.totalActiveCoverInAsset(coverAsset);
    const actualDecrease = totalActiveCoverAfterBuy - totalActiveCoverAfterBurnStake;

    expect(totalActiveCoverAfterBuy).to.be.equal(expectedAllocatedAmount);
    expect(totalActiveCoverAfterBurnStake).to.be.lt(totalActiveCoverAfterBuy);
    expect(actualDecrease).to.be.equal(payoutAmount);
  });

  it('should handle full claim payout reducing active cover to remaining amount', async function () {
    const fixture = await loadFixture(setup);
    const { cover, claims, pool } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, coverAsset } = buyCoverFixture;

    const nxmPriceInCoverAsset = await pool.getInternalTokenPriceInAsset(coverAsset);
    const expectedAllocatedAmount = calculateAllocatedCoverAmount(amount, nxmPriceInCoverAsset);

    await cover
      .connect(coverBuyer)
      .buyCover({ ...buyCoverFixture, owner: coverBuyer.address }, [{ poolId: 1, coverAmountInAsset: amount }], {
        value: amount,
      });

    const coverId = await cover.getCoverDataCount();
    const coverData = await cover.getCoverData(coverId);
    const totalActiveCoverAfterBuy = await cover.totalActiveCoverInAsset(coverAsset);

    const claimsSigner = await getFundedSigner(claims.target);
    await cover.connect(claimsSigner).burnStake(coverId, coverData.amount);

    const totalActiveCoverAfterFullBurn = await cover.totalActiveCoverInAsset(coverAsset);
    expect(totalActiveCoverAfterBuy).to.be.equal(expectedAllocatedAmount);
    expect(totalActiveCoverAfterFullBurn).to.be.equal(0n);
  });

  it('should correctly track active cover across multiple pools', async function () {
    const fixture = await loadFixture(setup);
    const { cover, pool } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, coverAsset } = buyCoverFixture;

    const nxmPriceInCoverAsset = await pool.getInternalTokenPriceInAsset(coverAsset);
    const expectedAllocatedAmount = calculateAllocatedCoverAmount(amount, nxmPriceInCoverAsset);

    await cover.connect(coverBuyer).buyCover(
      { ...buyCoverFixture, owner: coverBuyer.address },
      [
        { poolId: 1, coverAmountInAsset: amount / 2n },
        { poolId: 2, coverAmountInAsset: amount / 2n },
      ],
      { value: amount },
    );

    const totalActiveCoverAfter = await cover.totalActiveCoverInAsset(coverAsset);
    expect(totalActiveCoverAfter).to.be.equal(expectedAllocatedAmount);
  });

  it('should handle updateTotalActiveCoverAmount being called manually', async function () {
    const fixture = await loadFixture(setup);
    const { cover, pool } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, coverAsset, period } = buyCoverFixture;

    const nxmPriceInCoverAsset = await pool.getInternalTokenPriceInAsset(coverAsset);
    const expectedAllocatedAmount = calculateAllocatedCoverAmount(amount, nxmPriceInCoverAsset);

    await cover
      .connect(coverBuyer)
      .buyCover({ ...buyCoverFixture, owner: coverBuyer.address }, [{ poolId: 1, coverAmountInAsset: amount }], {
        value: amount,
      });

    const totalActiveCoverAfterBuy = await cover.totalActiveCoverInAsset(coverAsset);

    await time.increase(BigInt(period) + BUCKET_SIZE + 1n);

    const totalActiveCoverBeforeUpdate = await cover.totalActiveCoverInAsset(coverAsset);
    expect(totalActiveCoverBeforeUpdate).to.be.equal(expectedAllocatedAmount);

    await cover.updateTotalActiveCoverAmount(coverAsset);
    const totalActiveCoverAfterUpdate = await cover.totalActiveCoverInAsset(coverAsset);

    expect(totalActiveCoverAfterBuy).to.be.equal(expectedAllocatedAmount);
    expect(totalActiveCoverAfterUpdate).to.be.equal(0n);
  });

  it('should handle recalculateActiveCoverInAsset correctly', async function () {
    const fixture = await loadFixture(setup);
    const { cover, pool } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, coverAsset } = buyCoverFixture;

    const nxmPriceInCoverAsset = await pool.getInternalTokenPriceInAsset(coverAsset);
    const expectedAllocatedAmount = calculateAllocatedCoverAmount(amount, nxmPriceInCoverAsset);

    await cover
      .connect(coverBuyer)
      .buyCover({ ...buyCoverFixture, owner: coverBuyer.address }, [{ poolId: 1, coverAmountInAsset: amount }], {
        value: amount,
      });

    const totalActiveCoverBefore = await cover.totalActiveCoverInAsset(coverAsset);
    await cover.recalculateActiveCoverInAsset(coverAsset);
    const totalActiveCoverAfter = await cover.totalActiveCoverInAsset(coverAsset);

    expect(totalActiveCoverBefore).to.be.equal(totalActiveCoverAfter);
    expect(totalActiveCoverAfter).to.be.equal(expectedAllocatedAmount);
  });

  it('should return correct active cover for cbBTC asset', async function () {
    const fixture = await loadFixture(setup);
    const { cover, cbBTC, pool } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;
    const cbBtcAmount = ethers.parseUnits('1', 8);

    await cbBTC.mint(coverBuyer.address, cbBtcAmount);
    await cbBTC.connect(coverBuyer).approve(cover.target, ethers.MaxUint256);

    const nxmPriceInCbBTC = await pool.getInternalTokenPriceInAsset(PoolAsset.cbBTC);
    const expectedAllocatedAmount = calculateAllocatedCoverAmount(cbBtcAmount, nxmPriceInCbBTC);

    const totalActiveCoverBefore = await cover.totalActiveCoverInAsset(PoolAsset.cbBTC);
    expect(totalActiveCoverBefore).to.be.equal(0n);

    await cover.connect(coverBuyer).buyCover(
      {
        ...buyCoverFixture,
        owner: coverBuyer.address,
        amount: cbBtcAmount,
        coverAsset: PoolAsset.cbBTC,
        paymentAsset: PoolAsset.cbBTC,
        productId: 2,
      },
      [{ poolId: 1, coverAmountInAsset: cbBtcAmount }],
    );

    const totalActiveCoverAfter = await cover.totalActiveCoverInAsset(PoolAsset.cbBTC);
    expect(totalActiveCoverAfter).to.be.equal(expectedAllocatedAmount);
  });

  it('should handle cover edits that reduce cover amount', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;
    const { amount, coverAsset } = buyCoverFixture;

    await cover
      .connect(coverBuyer)
      .buyCover({ ...buyCoverFixture, owner: coverBuyer.address }, [{ poolId: 1, coverAmountInAsset: amount }], {
        value: amount,
      });

    const coverId = await cover.getCoverDataCount();
    const totalActiveCoverAfterFirstBuy = await cover.totalActiveCoverInAsset(coverAsset);

    const reducedAmount = ethers.parseEther('5');

    await cover
      .connect(coverBuyer)
      .buyCover(
        { ...buyCoverFixture, coverId, owner: coverBuyer.address, amount: reducedAmount },
        [{ poolId: 1, coverAmountInAsset: reducedAmount }],
        { value: reducedAmount },
      );

    const editedCoverId = await cover.getCoverDataCount();
    const editedCoverData = await cover.getCoverData(editedCoverId);

    const totalActiveCoverAfterEdit = await cover.totalActiveCoverInAsset(coverAsset);
    expect(totalActiveCoverAfterEdit).to.be.lt(totalActiveCoverAfterFirstBuy);
    expect(totalActiveCoverAfterEdit).to.be.equal(editedCoverData.amount);
  });

  it('should not count expired covers in active cover amount', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture.contracts;
    const [coverBuyer1, coverBuyer2] = fixture.accounts.members;
    const { amount, coverAsset } = buyCoverFixture;

    const shortPeriod = daysToSeconds(28);
    const longPeriod = daysToSeconds(60);

    await cover
      .connect(coverBuyer1)
      .buyCover(
        { ...buyCoverFixture, owner: coverBuyer1.address, period: shortPeriod },
        [{ poolId: 1, coverAmountInAsset: amount }],
        { value: amount },
      );

    const shortCoverId = await cover.getCoverDataCount();
    const shortCoverData = await cover.getCoverData(shortCoverId);

    await cover
      .connect(coverBuyer2)
      .buyCover(
        { ...buyCoverFixture, owner: coverBuyer2.address, period: longPeriod },
        [{ poolId: 1, coverAmountInAsset: amount }],
        { value: amount },
      );

    const longCoverId = await cover.getCoverDataCount();
    const longCoverData = await cover.getCoverData(longCoverId);

    const totalActiveCoverWithBoth = await cover.totalActiveCoverInAsset(coverAsset);
    expect(totalActiveCoverWithBoth).to.be.equal(shortCoverData.amount + longCoverData.amount);

    await time.increase(BigInt(shortPeriod) + BUCKET_SIZE + 1n);

    await cover.updateTotalActiveCoverAmount(coverAsset);
    const totalActiveCoverAfterFirstExpiry = await cover.totalActiveCoverInAsset(coverAsset);
    expect(totalActiveCoverAfterFirstExpiry).to.be.lt(totalActiveCoverWithBoth);
    expect(totalActiveCoverAfterFirstExpiry).to.be.equal(longCoverData.amount);
  });
});

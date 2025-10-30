const { expect } = require('chai');
const { ethers } = require('hardhat');
const { parseEther, ZeroAddress } = ethers;

const { setNextBlockTime } = require('../../utils/evm');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

const gracePeriod = 120 * 24 * 60 * 60;
const MAX_COVER_PERIOD = 3600n * 24n * 365n;

async function setupEditCoverFixture() {
  const fixture = await loadFixture(setup);
  const { cover, accounts } = fixture;
  const coverBuyer = accounts.members[0];
  const { COVER_BUY_FIXTURE } = fixture.constants;
  const { amount, targetPriceRatio, period, priceDenominator, productId, coverAsset } = COVER_BUY_FIXTURE;

  const expectedPremium = (amount * targetPriceRatio * period) / (priceDenominator * 3600n * 24n * 365n);
  // buyCover on 1 pool
  const poolAllocationRequest = [{ poolId: 1, coverAmountInAsset: amount }];
  await cover.connect(coverBuyer).buyCover(
    {
      owner: coverBuyer.address,
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
    poolAllocationRequest,
    { value: coverAsset === 0n ? expectedPremium : 0n },
  );
  const coverId = await cover.getCoverDataCount();
  const coverData = await cover.getCoverData(coverId);

  return {
    ...fixture,
    coverId,
    coverData,
    expectedPremium,
  };
}

describe('editCover', function () {
  it('should edit purchased cover and increase amount', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverId, coverData } = fixture;
    const { COVER_BUY_FIXTURE } = fixture.constants;
    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, priceDenominator, targetPriceRatio } = COVER_BUY_FIXTURE;

    const passedPeriod = 10n;
    const editTimestamp = coverData.start + passedPeriod;
    await setNextBlockTime(Number(editTimestamp));

    const increasedAmount = amount * 2n;

    // premium for the new amount, without refunds
    const expectedNewPremium = (increasedAmount * targetPriceRatio * period) / priceDenominator / (3600n * 24n * 365n);

    // refund for the unused period
    const expectedRefund =
      (coverData.amount * targetPriceRatio * (coverData.period - passedPeriod)) / MAX_COVER_PERIOD / priceDenominator;

    // difference to pay
    const extraPremium = expectedNewPremium - expectedRefund;

    await cover.connect(coverBuyer).buyCover(
      {
        coverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: increasedAmount,
        period,
        maxPremiumInAsset: extraPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: increasedAmount.toString() }],
      { value: extraPremium },
    );

    const editedCoverId = coverId + 1n;
    const storedCoverData = await cover.getCoverData(editedCoverId);

    expect(storedCoverData.productId).to.equal(productId);
    expect(storedCoverData.coverAsset).to.equal(coverAsset);
    expect(storedCoverData.gracePeriod).to.equal(gracePeriod);
    expect(storedCoverData.period).to.equal(period);
    expect(storedCoverData.amount).to.equal(increasedAmount);
  });

  it('should allow to reduce amount', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverId } = fixture;
    const { COVER_BUY_FIXTURE } = fixture.constants;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount } = COVER_BUY_FIXTURE;
    const reducedAmount = amount / 2n;
    const expectedEditPremium = 0;

    await cover.connect(coverBuyer).buyCover(
      {
        coverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: reducedAmount,
        period,
        maxPremiumInAsset: expectedEditPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: reducedAmount.toString() }],
      {
        value: 0,
      },
    );

    const editedCoverId = coverId + 1n;
    const storedCoverData = await cover.getCoverData(editedCoverId);

    expect(storedCoverData.productId).to.equal(productId);
    expect(storedCoverData.coverAsset).to.equal(coverAsset);
    expect(storedCoverData.gracePeriod).to.equal(gracePeriod);
    expect(storedCoverData.period).to.equal(period);
    expect(storedCoverData.amount).to.equal(reducedAmount);
  });

  it('should edit purchased cover and add coverage from a new staking pool', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverId, coverData } = fixture;
    const { COVER_BUY_FIXTURE } = fixture.constants;
    const [coverBuyer] = fixture.accounts.members;
    const { productId, coverAsset, period, amount, priceDenominator, targetPriceRatio } = COVER_BUY_FIXTURE;

    const buyerBalanceBefore = await ethers.provider.getBalance(coverBuyer.address);

    const passedPeriod = 10n;
    const editTimestamp = coverData.start + passedPeriod;
    await setNextBlockTime(Number(editTimestamp));

    const increasedAmount = amount * 2n;

    // premium for the new amount, without refunds
    const expectedNewPremium = (increasedAmount * targetPriceRatio * period) / priceDenominator / (3600n * 24n * 365n);

    // refund for the unused period
    const expectedRefund =
      (coverData.amount * targetPriceRatio * (coverData.period - passedPeriod)) / MAX_COVER_PERIOD / priceDenominator;

    // difference to pay
    const extraPremium = expectedNewPremium - expectedRefund;

    await cover.connect(coverBuyer).buyCover(
      {
        coverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: increasedAmount,
        period,
        maxPremiumInAsset: extraPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      [
        { poolId: 1, coverAmountInAsset: 0 },
        { poolId: 2, coverAmountInAsset: increasedAmount },
      ],
      {
        value: extraPremium,
      },
    );

    const editedCoverId = coverId + 1n;

    const buyerBalanceAfter = await ethers.provider.getBalance(coverBuyer.address);
    expect(buyerBalanceAfter).to.be.lt(buyerBalanceBefore - extraPremium);

    const poolAllocations = await cover.getPoolAllocations(editedCoverId);
    expect(poolAllocations.length).to.be.equal(2);
    expect(poolAllocations[0].coverAmountInNXM).to.be.equal(0);
    expect(poolAllocations[1].coverAmountInNXM).to.be.equal(increasedAmount);

    const storedCoverData = await cover.getCoverData(editedCoverId);

    expect(storedCoverData.productId).to.equal(productId);
    expect(storedCoverData.coverAsset).to.equal(coverAsset);
    expect(storedCoverData.gracePeriod).to.equal(gracePeriod);
    expect(storedCoverData.period).to.equal(period);
    expect(storedCoverData.amount).to.equal(increasedAmount);
  });

  it('should edit purchased cover and increase period', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverId, coverData } = fixture;
    const { COVER_BUY_FIXTURE } = fixture.constants;
    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = COVER_BUY_FIXTURE;

    const passedPeriod = 10n;
    const editTimestamp = coverData.start + passedPeriod;
    await setNextBlockTime(Number(editTimestamp));

    // refund for the unused period
    const expectedRefund =
      (coverData.amount * targetPriceRatio * (coverData.period - passedPeriod)) / MAX_COVER_PERIOD / priceDenominator;

    const increasedPeriod = period * 2n;

    // Get the NXM price in cover asset (ETH) - using hardcoded value for now
    const nxmPriceInCoverAsset = parseEther('1'); // 1 ETH = 1 NXM in the mock

    // Convert cover amount to NXM and round up to nearest allocation unit
    const ONE_NXM = parseEther('1');
    const ALLOCATION_UNITS_PER_NXM = 100n;
    const NXM_PER_ALLOCATION_UNIT = ONE_NXM / ALLOCATION_UNITS_PER_NXM;
    const TARGET_PRICE_DENOMINATOR = 10000n;

    const roundedCoverAmountInNXM =
      ((amount + NXM_PER_ALLOCATION_UNIT - 1n) / NXM_PER_ALLOCATION_UNIT) * NXM_PER_ALLOCATION_UNIT;

    // Calculate premium using the same logic as calculateFixedPricePremium
    const premiumPerYear = (roundedCoverAmountInNXM * targetPriceRatio) / TARGET_PRICE_DENOMINATOR;
    const expectedEditPremium = (premiumPerYear * increasedPeriod) / (365n * 24n * 3600n);

    // Convert premium back to cover asset
    const premiumInCoverAsset = (expectedEditPremium * BigInt(nxmPriceInCoverAsset)) / ONE_NXM;

    const extraPremium = premiumInCoverAsset - expectedRefund;

    await cover.connect(coverBuyer).buyCover(
      {
        coverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount,
        period: increasedPeriod,
        maxPremiumInAsset: extraPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      {
        value: extraPremium,
      },
    );

    const editedCoverId = coverId + 1n;
    const storedCoverData = await cover.getCoverData(editedCoverId);

    expect(storedCoverData.productId).to.equal(productId);
    expect(storedCoverData.coverAsset).to.equal(coverAsset);
    expect(storedCoverData.gracePeriod).to.equal(gracePeriod);
    expect(storedCoverData.period).to.equal(increasedPeriod);
    expect(storedCoverData.amount).to.equal(amount);
  });

  it('should allow to reduce period', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverId } = fixture;
    const { COVER_BUY_FIXTURE } = fixture.constants;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount } = COVER_BUY_FIXTURE;

    const reducedPeriod = period - 24n * 60n * 60n;

    await cover.connect(coverBuyer).buyCover(
      {
        coverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount,
        period: reducedPeriod,
        maxPremiumInAsset: 0,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: amount.toString() }],
      {
        value: 0,
      },
    );

    const editedCoverId = coverId + 1n;
    const storedCoverData = await cover.getCoverData(editedCoverId);

    expect(storedCoverData.productId).to.equal(productId);
    expect(storedCoverData.coverAsset).to.equal(coverAsset);
    expect(storedCoverData.gracePeriod).to.equal(gracePeriod);
    expect(storedCoverData.period).to.equal(reducedPeriod);
    expect(storedCoverData.amount).to.equal(amount);
  });

  it('should mark the edited cover as ending now', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverId } = fixture;
    const { COVER_BUY_FIXTURE } = fixture.constants;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount } = COVER_BUY_FIXTURE;

    const initialCover = await cover.getCoverData(coverId);

    const reducedPeriod = period - 24n * 60n * 60n;

    const tx = await cover.connect(coverBuyer).buyCover(
      {
        coverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount,
        period: reducedPeriod,
        maxPremiumInAsset: 0,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: amount.toString() }],
      {
        value: 0,
      },
    );

    const { blockNumber } = await tx.wait();
    const { timestamp } = await ethers.provider.getBlock(blockNumber);
    const expectedNewPeriod = BigInt(timestamp) - initialCover.start;

    const editedCover = await cover.getCoverData(coverId);
    expect(editedCover.start).to.be.equal(initialCover.start);
    expect(editedCover.period).to.be.equal(expectedNewPeriod);

    const newCoverId = coverId + 1n;
    const storedCoverData = await cover.getCoverData(newCoverId);

    expect(storedCoverData.productId).to.equal(productId);
    expect(storedCoverData.coverAsset).to.equal(coverAsset);
    expect(storedCoverData.gracePeriod).to.equal(gracePeriod);
    expect(storedCoverData.period).to.equal(reducedPeriod);
    expect(storedCoverData.amount).to.equal(amount);
  });

  it('should edit purchased cover and increase period and amount', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverId, coverData } = fixture;
    const { COVER_BUY_FIXTURE } = fixture.constants;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = COVER_BUY_FIXTURE;

    const passedPeriod = 10n;
    const editTimestamp = coverData.start + passedPeriod;
    await setNextBlockTime(Number(editTimestamp));

    const expectedRefund =
      (coverData.amount * targetPriceRatio * (coverData.period - passedPeriod)) / MAX_COVER_PERIOD / priceDenominator;

    const increasedAmount = amount * 2n;
    const increasedPeriod = period * 2n;

    // premium for the new amount, without refunds
    const expectedEditPremium =
      (increasedAmount * targetPriceRatio * increasedPeriod) / (priceDenominator * 3600n * 24n * 365n);

    const extraPremium = expectedEditPremium - expectedRefund;

    await cover.connect(coverBuyer).buyCover(
      {
        coverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: increasedAmount,
        period: increasedPeriod,
        maxPremiumInAsset: extraPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: increasedAmount.toString() }],
      {
        value: extraPremium,
      },
    );

    const editedCoverId = coverId + 1n;
    const storedCoverData = await cover.getCoverData(editedCoverId);

    expect(storedCoverData.productId).to.equal(productId);
    expect(storedCoverData.coverAsset).to.equal(coverAsset);
    expect(storedCoverData.gracePeriod).to.equal(gracePeriod);
    expect(storedCoverData.period).to.equal(increasedPeriod);
    expect(storedCoverData.amount).to.equal(increasedAmount);
  });

  it('should edit purchased cover and increase period and decrease amount', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverId, coverData } = fixture;
    const { COVER_BUY_FIXTURE } = fixture.constants;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = COVER_BUY_FIXTURE;

    const passedPeriod = 10n;
    const editTimestamp = coverData.start + passedPeriod;
    await setNextBlockTime(Number(editTimestamp));

    const expectedRefund =
      (coverData.amount * targetPriceRatio * (coverData.period - passedPeriod)) / MAX_COVER_PERIOD / priceDenominator;

    const decreasedAmount = amount / 2n;
    const increasedPeriod = period * 2n;

    // premium for the new amount, without refunds
    const expectedEditPremium =
      (decreasedAmount * targetPriceRatio * increasedPeriod) / (priceDenominator * 3600n * 24n * 365n);

    const extraPremium = expectedEditPremium - expectedRefund;

    await cover.connect(coverBuyer).buyCover(
      {
        coverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: decreasedAmount,
        period: increasedPeriod,
        maxPremiumInAsset: extraPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: decreasedAmount.toString() }],
      {
        value: extraPremium,
      },
    );

    const editedCoverId = coverId + 1n;
    const storedCoverData = await cover.getCoverData(editedCoverId);

    expect(storedCoverData.productId).to.equal(productId);
    expect(storedCoverData.coverAsset).to.equal(coverAsset);
    expect(storedCoverData.gracePeriod).to.equal(gracePeriod);
    expect(storedCoverData.period).to.equal(increasedPeriod);
    expect(storedCoverData.amount).to.equal(decreasedAmount);
  });

  it('should allow to reduce period and increase amount', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverId, coverData } = fixture;
    const { COVER_BUY_FIXTURE } = fixture.constants;
    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = COVER_BUY_FIXTURE;

    const reducedPeriod = period; // default for the unit tests is  period * 2

    const passedPeriod = 10n;
    const editTimestamp = coverData.start + 10n;

    const expectedRefund =
      (coverData.amount * targetPriceRatio * (coverData.period - passedPeriod)) / MAX_COVER_PERIOD / priceDenominator;

    const increasedAmount = amount * 2n;

    // premium for the new amount, without refunds
    const expectedEditPremium =
      (increasedAmount * targetPriceRatio * reducedPeriod) / (priceDenominator * 3600n * 24n * 365n);

    const extraPremium = expectedEditPremium - expectedRefund;

    await setNextBlockTime(Number(editTimestamp));
    await cover.connect(coverBuyer).buyCover(
      {
        coverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: increasedAmount,
        period: reducedPeriod,
        maxPremiumInAsset: extraPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: increasedAmount.toString() }],
      {
        value: extraPremium,
      },
    );

    const editedCoverId = coverId + 1n;
    const storedCoverData = await cover.getCoverData(editedCoverId);

    expect(storedCoverData.productId).to.equal(productId);
    expect(storedCoverData.coverAsset).to.equal(coverAsset);
    expect(storedCoverData.gracePeriod).to.equal(gracePeriod);
    expect(storedCoverData.period).to.equal(reducedPeriod);
    expect(storedCoverData.amount).to.equal(increasedAmount);
  });

  it('should allow to reduce period and reduce amount', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverId } = fixture;
    const { COVER_BUY_FIXTURE } = fixture.constants;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount } = COVER_BUY_FIXTURE;

    const reducedAmount = amount / 2n;
    const reducedPeriod = period;

    await cover.connect(coverBuyer).buyCover(
      {
        coverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: reducedAmount,
        period: reducedPeriod,
        maxPremiumInAsset: 0,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: reducedAmount.toString() }],
      {
        value: 0,
      },
    );

    const editedCoverId = coverId + 1n;
    const storedCoverData = await cover.getCoverData(editedCoverId);

    expect(storedCoverData.productId).to.equal(productId);
    expect(storedCoverData.coverAsset).to.equal(coverAsset);
    expect(storedCoverData.gracePeriod).to.equal(gracePeriod);
    expect(storedCoverData.period).to.equal(reducedPeriod);
    expect(storedCoverData.amount).to.equal(reducedAmount);
  });

  it('should fail to edit an expired cover', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverId, coverData } = fixture;
    const { COVER_BUY_FIXTURE } = fixture.constants;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, targetPriceRatio, priceDenominator, coverAsset, period, amount } = COVER_BUY_FIXTURE;

    const expectedRefund =
      (coverData.amount * targetPriceRatio * coverData.period) / (MAX_COVER_PERIOD * priceDenominator);

    const increasedAmount = amount * 2n;

    // premium for the new amount, without refunds
    const expectedEditPremium = (increasedAmount * targetPriceRatio * period) / (priceDenominator * 3600n * 24n * 365n);

    const extraPremium = expectedEditPremium - expectedRefund;

    const now = await ethers.provider.getBlock('latest').then(block => block.timestamp);
    await setNextBlockTime(now + Number(period) + 3600);

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount: increasedAmount,
          period,
          maxPremiumInAsset: extraPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount }],
        { value: extraPremium },
      ),
    ).to.be.revertedWithCustomError(cover, 'ExpiredCoversCannotBeEdited');
  });

  it('should revert when period is too long', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverId, coverData } = fixture;
    const { COVER_BUY_FIXTURE } = fixture.constants;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, amount, priceDenominator, targetPriceRatio } = COVER_BUY_FIXTURE;

    const expectedRefund =
      (coverData.amount * targetPriceRatio * coverData.period) / (MAX_COVER_PERIOD * priceDenominator);
    const increasedAmount = amount * 2n;

    // premium for the new amount, without refunds
    const expectedEditPremium =
      (increasedAmount * targetPriceRatio * coverData.period) / (priceDenominator * 3600n * 24n * 365n);
    const extraPremium = expectedEditPremium - expectedRefund;

    const periodTooLong = 366n * 24n * 60n * 60n;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount: increasedAmount,
          period: periodTooLong,
          maxPremiumInAsset: extraPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount.toString() }],
        {
          value: extraPremium,
        },
      ),
    ).to.be.revertedWithCustomError(cover, 'CoverPeriodTooLong');
  });

  it('should revert when commission rate too high', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverId, coverData } = fixture;
    const { COVER_BUY_FIXTURE } = fixture.constants;
    const { MAX_COMMISSION_RATIO } = fixture.config;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, amount, period, priceDenominator, targetPriceRatio } = COVER_BUY_FIXTURE;

    const expectedRefund =
      (coverData.amount * targetPriceRatio * coverData.period) / (MAX_COVER_PERIOD * priceDenominator);
    const increasedAmount = amount * 2n;

    // premium for the new amount, without refunds
    const expectedEditPremium = (increasedAmount * targetPriceRatio * period) / (priceDenominator * 3600n * 24n * 365n);

    const extraPremium = expectedEditPremium - expectedRefund;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount: increasedAmount,
          period,
          maxPremiumInAsset: expectedEditPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: MAX_COMMISSION_RATIO + 1n, // too high
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount.toString() }],
        {
          value: extraPremium,
        },
      ),
    ).to.be.revertedWithCustomError(cover, 'CommissionRateTooHigh');
  });

  it('should store new grace period when editing cover', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverProducts, coverId, coverData } = fixture;
    const [abMember] = fixture.accounts.advisoryBoardMembers;
    const [coverBuyer] = fixture.accounts.members;
    const { COVER_BUY_FIXTURE } = fixture.constants;

    const { productId, targetPriceRatio, priceDenominator, coverAsset, amount, period } = COVER_BUY_FIXTURE;

    // Edit product gracePeriod
    const productTypeBefore = await coverProducts.getProductType(productId);
    const newGracePeriod = 1000n * 24n * 60n * 60n;

    await coverProducts.connect(abMember).setProductTypes([
      {
        productTypeName: 'ProductType X',
        productTypeId: 0,
        ipfsMetadata: 'ipfs metadata',
        productType: {
          claimMethod: '0',
          assessmentCooldownPeriod: 24 * 3600,
          payoutRedemptionPeriod: 3 * 24 * 3600,
          gracePeriod: newGracePeriod,
        },
      },
    ]);
    const productType = await coverProducts.getProductType(productId);
    expect(newGracePeriod).to.be.equal(productType.gracePeriod);

    const passedPeriod = 10n;

    const expectedRefund =
      (coverData.amount * targetPriceRatio * (coverData.period - passedPeriod)) / MAX_COVER_PERIOD / priceDenominator;

    // premium for the new amount, without refunds
    const expectedEditPremium = (amount * targetPriceRatio * period) / (priceDenominator * 3600n * 24n * 365n);

    const extraPremium = expectedEditPremium - expectedRefund;

    // const { start: startTimestamp } = await cover.coverSegmentWithRemainingAmount(expectedCoverId, 0);
    const editTimestamp = coverData.start + passedPeriod;
    await setNextBlockTime(Number(editTimestamp));

    await cover.connect(coverBuyer).buyCover(
      {
        coverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: extraPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      { value: extraPremium },
    );

    const editedCoverId = coverId + 1n;
    const editedCoverData = await cover.getCoverData(editedCoverId);

    // const secondSegment = await cover.coverSegmentWithRemainingAmount(expectedCoverId, 1);
    expect(editedCoverData.gracePeriod).to.be.equal(newGracePeriod);
    expect(productTypeBefore.gracePeriod).to.be.equal(coverData.gracePeriod);
  });

  it('reverts if caller is not NFT owner or approved', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverId } = fixture;
    const { COVER_BUY_FIXTURE } = fixture.constants;

    const [coverBuyer, otherUser] = fixture.accounts.members;

    const { productId, targetPriceRatio, priceDenominator, coverAsset, period, amount } = COVER_BUY_FIXTURE;

    const increasedAmount = amount * 2n;

    // premium for the new amount, without refunds
    const expectedEditPremium = (increasedAmount * targetPriceRatio * period) / (priceDenominator * 3600n * 24n * 365n);
    const extraPremium = expectedEditPremium;

    await expect(
      cover.connect(otherUser).buyCover(
        {
          coverId,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount: increasedAmount,
          period,
          maxPremiumInAsset: expectedEditPremium + 10n,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount }],
        { value: extraPremium + 10n },
      ),
    ).to.be.revertedWithCustomError(cover, 'OnlyOwnerOrApproved');
  });

  it('reverts if invalid coverId', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverId } = fixture;
    const { COVER_BUY_FIXTURE } = fixture.constants;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, targetPriceRatio, priceDenominator, coverAsset, period, amount } = COVER_BUY_FIXTURE;

    const increasedAmount = amount * 2n;

    // premium for the new amount, without refunds
    const expectedEditPremium = (increasedAmount * targetPriceRatio * period) / (priceDenominator * 3600n * 24n * 365n);
    const extraPremium = expectedEditPremium;

    const invalidCoverId = coverId + 100n;
    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: invalidCoverId,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount: increasedAmount,
          period,
          maxPremiumInAsset: expectedEditPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount }],
        { value: extraPremium },
      ),
    ).to.be.revertedWith('NOT_MINTED');
  });

  it('reverts if period is too short', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverId, coverData } = fixture;
    const { COVER_BUY_FIXTURE } = fixture.constants;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, amount, priceDenominator, targetPriceRatio } = COVER_BUY_FIXTURE;

    const expectedRefund =
      (coverData.amount * targetPriceRatio * coverData.period) / (MAX_COVER_PERIOD * priceDenominator);
    const increasedAmount = amount * 2n;

    // premium for the new amount, without refunds
    const expectedEditPremium =
      (increasedAmount * targetPriceRatio * coverData.period) / (priceDenominator * 3600n * 24n * 365n);
    const extraPremium = expectedEditPremium - expectedRefund;

    const periodTooShort = 10n * 24n * 60n * 60n;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount: increasedAmount,
          period: periodTooShort,
          maxPremiumInAsset: expectedEditPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount.toString() }],
        {
          value: extraPremium,
        },
      ),
    ).to.be.revertedWithCustomError(cover, 'CoverPeriodTooShort');
  });

  it('reverts if calculated premium is bigger than maxPremiumInAsset', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverId, coverData } = fixture;
    const { COVER_BUY_FIXTURE } = fixture.constants;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, amount, period, priceDenominator, targetPriceRatio } = COVER_BUY_FIXTURE;

    const expectedRefund =
      (coverData.amount * targetPriceRatio * coverData.period) / (MAX_COVER_PERIOD * priceDenominator);

    const increasedAmount = amount * 2n;

    // premium for the new amount, without refunds
    const expectedEditPremium = (increasedAmount * targetPriceRatio * period) / (priceDenominator * 3600n * 24n * 365n);
    const extraPremium = expectedEditPremium - expectedRefund;

    const smallExpectedEditPremium = expectedEditPremium / 10n;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount: increasedAmount,
          period,
          maxPremiumInAsset: smallExpectedEditPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount.toString() }],
        {
          value: extraPremium,
        },
      ),
    ).to.be.revertedWithCustomError(cover, 'PriceExceedsMaxPremiumInAsset');
  });

  it('works if caller is the owner of the NFT', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverNFT, coverId, coverData } = fixture;
    const [coverBuyer] = fixture.accounts.members;
    const { COVER_BUY_FIXTURE } = fixture.constants;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = COVER_BUY_FIXTURE;

    const passedPeriod = 10n;
    const editTimestamp = coverData.start + passedPeriod;
    await setNextBlockTime(Number(editTimestamp));

    const increasedAmount = amount * 2n;
    const expectedRefund =
      (coverData.amount * targetPriceRatio * (coverData.period - passedPeriod)) / MAX_COVER_PERIOD / priceDenominator;

    // premium for the new amount, without refunds
    const expectedEditPremium = (increasedAmount * targetPriceRatio * period) / (priceDenominator * 3600n * 24n * 365n);

    const extraPremium = expectedEditPremium - expectedRefund;

    const coverOwner = await coverNFT.ownerOf(coverId);
    expect(coverOwner).to.be.equal(coverBuyer.address);

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount: increasedAmount,
          period,
          maxPremiumInAsset: extraPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount }],
        { value: extraPremium },
      ),
    ).to.not.be.reverted;
  });

  it('works if caller approved by the owner of the NFT', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverNFT, coverId } = fixture;
    const { COVER_BUY_FIXTURE } = fixture.constants;

    const [coverBuyer, otherUser] = fixture.accounts.members;

    const { productId, targetPriceRatio, priceDenominator, coverAsset, period, amount } = COVER_BUY_FIXTURE;

    const increasedAmount = amount * 2n;

    // premium for the new amount, without refunds
    const expectedEditPremium = (increasedAmount * targetPriceRatio * period) / (priceDenominator * 3600n * 24n * 365n);
    const extraPremium = expectedEditPremium;

    const coverOwner = await coverNFT.ownerOf(coverId);
    expect(coverOwner).to.be.equal(coverBuyer.address);

    await coverNFT.connect(coverBuyer).approve(otherUser.address, coverId);

    await expect(
      cover.connect(otherUser).buyCover(
        {
          coverId,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount: increasedAmount,
          period,
          maxPremiumInAsset: expectedEditPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount }],
        { value: extraPremium },
      ),
    ).to.not.be.reverted;
  });

  it('reverts if incorrect cover asset', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverId, coverData } = fixture;
    const { COVER_BUY_FIXTURE } = fixture.constants;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = COVER_BUY_FIXTURE;

    const increasedAmount = amount * 2n;
    const expectedRefund =
      (coverData.amount * targetPriceRatio * coverData.period) / (MAX_COVER_PERIOD * priceDenominator);

    // premium for the new amount, without refunds
    const expectedEditPremium = (increasedAmount * targetPriceRatio * period) / (priceDenominator * 3600n * 24n * 365n);
    const extraPremium = expectedEditPremium - expectedRefund;

    const incorrectCoverAsset = 1;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId,
          owner: coverBuyer.address,
          productId,
          coverAsset: incorrectCoverAsset,
          amount: increasedAmount,
          period,
          maxPremiumInAsset: expectedEditPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount }],
        { value: extraPremium },
      ),
    ).to.be.revertedWithCustomError(cover, 'InvalidPaymentAsset');
  });

  it('reverts if incorrect productId', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverId, coverData } = fixture;
    const { COVER_BUY_FIXTURE } = fixture.constants;

    const [coverBuyer] = fixture.accounts.members;

    const { coverAsset, period, amount, targetPriceRatio, priceDenominator } = COVER_BUY_FIXTURE;

    const increasedAmount = amount * 2n;
    const expectedRefund =
      (coverData.amount * targetPriceRatio * coverData.period) / (MAX_COVER_PERIOD * priceDenominator);

    // premium for the new amount, without refunds
    const expectedEditPremium = (increasedAmount * targetPriceRatio * period) / (priceDenominator * 3600n * 24n * 365n);

    const extraPremium = expectedEditPremium - expectedRefund;

    const incorrectProductId = 10;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId,
          owner: coverBuyer.address,
          productId: incorrectProductId,
          coverAsset,
          amount: increasedAmount,
          period,
          maxPremiumInAsset: expectedEditPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount }],
        { value: extraPremium },
      ),
    ).to.be.revertedWithCustomError(cover, 'ProductNotFound');
  });

  it('reverts if empty array of allocationRequests', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverData, coverId } = fixture;
    const { COVER_BUY_FIXTURE } = fixture.constants;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = COVER_BUY_FIXTURE;

    const increasedAmount = amount * 2n;
    const expectedRefund =
      (coverData.amount * targetPriceRatio * coverData.period) / (MAX_COVER_PERIOD * priceDenominator);

    // premium for the new amount, without refunds
    const expectedEditPremium = (increasedAmount * targetPriceRatio * period) / (priceDenominator * 3600n * 24n * 365n);

    const extraPremium = expectedEditPremium - expectedRefund;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount: increasedAmount,
          period,
          maxPremiumInAsset: expectedEditPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        [],
        { value: extraPremium },
      ),
    ).to.be.revertedWithCustomError(cover, 'InsufficientCoverAmountAllocated');
  });

  it('emits CoverBought event', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverNFT, coverId, coverData, registry } = fixture;
    const { COVER_BUY_FIXTURE } = fixture.constants;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = COVER_BUY_FIXTURE;

    const passedPeriod = 10n;
    const editTimestamp = coverData.start + passedPeriod;
    await setNextBlockTime(Number(editTimestamp));

    const increasedAmount = amount * 2n;
    const expectedRefund =
      (coverData.amount * targetPriceRatio * (coverData.period - passedPeriod)) / MAX_COVER_PERIOD / priceDenominator;

    // premium for the new amount, without refunds
    const expectedEditPremium = (increasedAmount * targetPriceRatio * period) / (priceDenominator * 3600n * 24n * 365n);
    const extraPremium = expectedEditPremium - expectedRefund;

    const coverOwner = await coverNFT.ownerOf(coverId);
    expect(coverOwner).to.be.equal(coverBuyer.address);

    const memberId = await registry.getMemberId(coverBuyer.address);

    const ipfsData = 'test data';
    const editedCoverId = coverId + 1n;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount: increasedAmount,
          period,
          maxPremiumInAsset: extraPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: ZeroAddress,
          ipfsData,
        },
        [{ poolId: 1, coverAmountInAsset: increasedAmount }],
        { value: extraPremium },
      ),
    )
      .to.emit(cover, 'CoverBought')
      .withArgs(editedCoverId, coverId, memberId, productId);
  });

  it('stores the ipfs data for the new cover', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverNFT, coverId, coverData } = fixture;
    const { COVER_BUY_FIXTURE } = fixture.constants;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = COVER_BUY_FIXTURE;

    const passedPeriod = 10n;
    const editTimestamp = coverData.start + passedPeriod;
    await setNextBlockTime(Number(editTimestamp));

    const increasedAmount = amount * 2n;
    const expectedRefund =
      (coverData.amount * targetPriceRatio * (coverData.period - passedPeriod)) / MAX_COVER_PERIOD / priceDenominator;

    // premium for the new amount, without refunds
    const expectedEditPremium = (increasedAmount * targetPriceRatio * period) / (priceDenominator * 3600n * 24n * 365n);
    const extraPremium = expectedEditPremium - expectedRefund;

    const coverOwner = await coverNFT.ownerOf(coverId);
    expect(coverOwner).to.be.equal(coverBuyer.address);

    const ipfsData = 'test data';
    const editedCoverId = coverId + 1n;

    await cover.connect(coverBuyer).buyCover(
      {
        coverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: increasedAmount,
        period,
        maxPremiumInAsset: extraPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: ZeroAddress,
        ipfsData,
      },
      [{ poolId: 1, coverAmountInAsset: increasedAmount }],
      { value: extraPremium },
    );

    const coverMetadata = await cover.getCoverMetadata(editedCoverId);
    expect(coverMetadata).to.equal(ipfsData);
  });

  it('retrieves the premium difference from the user in ETH', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, pool, coverData, coverId } = fixture;

    const { COVER_BUY_FIXTURE } = fixture.constants;
    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, priceDenominator, targetPriceRatio } = COVER_BUY_FIXTURE;

    const passedPeriod = 10n;
    const editTimestamp = coverData.start + passedPeriod;
    await setNextBlockTime(Number(editTimestamp));

    const increasedAmount = amount * 2n;

    const expectedRefund =
      (coverData.amount * targetPriceRatio * (coverData.period - passedPeriod)) / MAX_COVER_PERIOD / priceDenominator;

    // premium for the new amount, without refunds
    const expectedEditPremium = (increasedAmount * targetPriceRatio * period) / (priceDenominator * 3600n * 24n * 365n);
    const extraPremium = expectedEditPremium - expectedRefund;

    const poolEthBalanceBefore = await ethers.provider.getBalance(pool.target);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: increasedAmount,
        period,
        maxPremiumInAsset: extraPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: increasedAmount.toString() }],
      {
        value: extraPremium,
      },
    );

    const editedCoverId = coverId + 1n;

    const poolEthBalanceAfter = await ethers.provider.getBalance(pool.target);
    expect(poolEthBalanceAfter).to.equal(poolEthBalanceBefore + extraPremium);
    const storedCoverData = await cover.getCoverData(editedCoverId);

    expect(storedCoverData.productId).to.equal(productId);
    expect(storedCoverData.coverAsset).to.equal(coverAsset);
    expect(storedCoverData.gracePeriod).to.equal(gracePeriod);
    expect(storedCoverData.period).to.equal(period);
    expect(storedCoverData.amount).to.equal(increasedAmount);
  });

  it('retrieves the premium difference from the user in NXM', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, nxm, tokenController, coverData, coverId } = fixture;
    const { COVER_BUY_FIXTURE } = fixture.constants;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, priceDenominator, targetPriceRatio } = COVER_BUY_FIXTURE;

    const NXM_ASSET_ID = 255;

    await nxm.mint(coverBuyer.address, parseEther('1000'));
    await nxm.connect(coverBuyer).approve(tokenController, parseEther('1000'));

    const passedPeriod = 10n;
    const editTimestamp = coverData.start + passedPeriod;
    await setNextBlockTime(Number(editTimestamp));

    const increasedAmount = amount * 2n;

    const expectedRefund =
      (coverData.amount * targetPriceRatio * (coverData.period - passedPeriod)) / MAX_COVER_PERIOD / priceDenominator;

    // premium for the new amount, without refunds
    const expectedEditPremium = (increasedAmount * targetPriceRatio * period) / (priceDenominator * 3600n * 24n * 365n);
    const extraPremium = expectedEditPremium - expectedRefund;

    const userBalanceBefore = await nxm.balanceOf(coverBuyer.address);

    await cover.connect(coverBuyer).buyCover(
      {
        coverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: increasedAmount,
        period,
        maxPremiumInAsset: extraPremium,
        paymentAsset: NXM_ASSET_ID,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: increasedAmount.toString() }],
      {
        value: 0,
      },
    );

    const editedCoverId = coverId + 1n;
    const userBalanceAfter = await nxm.balanceOf(coverBuyer.address);
    expect(userBalanceAfter).to.equal(userBalanceBefore - extraPremium);
    const storedCoverData = await cover.getCoverData(editedCoverId);

    expect(storedCoverData.productId).to.equal(productId);
    expect(storedCoverData.coverAsset).to.equal(coverAsset);
    expect(storedCoverData.gracePeriod).to.equal(gracePeriod);
    expect(storedCoverData.period).to.equal(period);
    expect(storedCoverData.amount).to.equal(increasedAmount);
  });

  it('allows editing the cover multiple times against multiple staking pools', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverData, coverId, expectedPremium } = fixture;

    const { COVER_BUY_FIXTURE } = fixture.constants;
    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, targetPriceRatio, priceDenominator } = COVER_BUY_FIXTURE;

    await cover.connect(coverBuyer).buyCover(
      {
        coverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium + 1n,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      [
        { poolId: 1, coverAmountInAsset: 0 },
        { poolId: 2, coverAmountInAsset: amount },
      ],
      {
        value: expectedPremium + 1n,
      },
    );

    const firstEditId = coverId + 1n;

    {
      const poolAllocations = await cover.getPoolAllocations(firstEditId);
      expect(poolAllocations[0].poolId).to.be.equal(1);
      expect(poolAllocations[0].coverAmountInNXM).to.be.equal(0);
      expect(poolAllocations[1].poolId).to.be.equal(2);
      expect(poolAllocations[1].coverAmountInNXM).to.be.equal(amount);

      const storedCoverData = await cover.getCoverData(firstEditId);

      expect(storedCoverData.productId).to.equal(productId);
      expect(storedCoverData.coverAsset).to.equal(coverAsset);
      expect(storedCoverData.gracePeriod).to.equal(gracePeriod);
      expect(storedCoverData.period).to.equal(period);
      expect(storedCoverData.amount).to.equal(amount);
    }

    const passedPeriod = 10n;
    const editTimestamp = coverData.start + passedPeriod;
    await setNextBlockTime(Number(editTimestamp));

    const increasedPoolAmount = amount * 2n;

    const expectedRefund =
      (coverData.amount * targetPriceRatio * (coverData.period - passedPeriod)) / MAX_COVER_PERIOD / priceDenominator;

    // premium for the new amount, without refunds
    const expectedEditPremium =
      ((increasedPoolAmount * targetPriceRatio * period) / (priceDenominator * 3600n * 24n * 365n)) * 2n;

    const extraPremium = expectedEditPremium - expectedRefund;

    await cover.connect(coverBuyer).buyCover(
      {
        coverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: increasedPoolAmount * 2n,
        period,
        maxPremiumInAsset: extraPremium,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      [
        { poolId: 1, coverAmountInAsset: increasedPoolAmount },
        { poolId: 2, coverAmountInAsset: increasedPoolAmount },
      ],
      {
        value: extraPremium,
      },
    );

    const secondEditId = firstEditId + 1n;

    {
      const poolAllocations = await cover.getPoolAllocations(secondEditId);
      expect(poolAllocations[0].poolId).to.be.equal(1);
      expect(poolAllocations[0].coverAmountInNXM).to.be.equal(increasedPoolAmount);
      expect(poolAllocations[1].poolId).to.be.equal(2);
      expect(poolAllocations[1].coverAmountInNXM).to.be.equal(increasedPoolAmount);

      const storedCoverData = await cover.getCoverData(secondEditId);

      expect(storedCoverData.productId).to.equal(productId);
      expect(storedCoverData.coverAsset).to.equal(coverAsset);
      expect(storedCoverData.gracePeriod).to.equal(gracePeriod);
      expect(storedCoverData.period).to.equal(period);
      expect(storedCoverData.amount).to.equal(increasedPoolAmount * 2n);
    }
  });

  it('reverts if incorrect pool id in request array', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverId, expectedPremium } = fixture;
    const { COVER_BUY_FIXTURE } = fixture.constants;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount } = COVER_BUY_FIXTURE;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: expectedPremium,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        [{ poolId: 15, coverAmountInAsset: amount }],
        {
          value: expectedPremium,
        },
      ),
    ).to.be.reverted;
  });

  it('correctly updates totalActiveCoverInAsset', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverId, coverData } = fixture;
    const { COVER_BUY_FIXTURE } = fixture.constants;

    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount, priceDenominator, targetPriceRatio } = COVER_BUY_FIXTURE;

    const passedPeriod = 10n;
    const editTimestamp = coverData.start + passedPeriod;
    await setNextBlockTime(Number(editTimestamp));

    const increasedAmount = amount * 2n;

    // premium for the new amount, without refunds
    const expectedNewPremium = (increasedAmount * targetPriceRatio * period) / priceDenominator / (3600n * 24n * 365n);

    // refund for the unused period
    const expectedRefund =
      (coverData.amount * targetPriceRatio * (coverData.period - passedPeriod)) / MAX_COVER_PERIOD / priceDenominator;

    // difference to pay
    const extraPremium = expectedNewPremium - expectedRefund;

    await cover.connect(coverBuyer).buyCover(
      {
        coverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: increasedAmount,
        period,
        maxPremiumInAsset: extraPremium + 1n,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: increasedAmount }],
      {
        value: extraPremium + 1n,
      },
    );

    const editedCoverId = coverId + 1n;
    const storedCoverData = await cover.getCoverData(editedCoverId);

    expect(storedCoverData.productId).to.equal(productId);
    expect(storedCoverData.coverAsset).to.equal(coverAsset);
    expect(storedCoverData.gracePeriod).to.equal(gracePeriod);
    expect(storedCoverData.period).to.equal(period);
    expect(storedCoverData.amount).to.equal(increasedAmount);

    const totalActiveCoverInAsset = await cover.totalActiveCoverInAsset(coverAsset);
    expect(totalActiveCoverInAsset).to.equal(increasedAmount);
  });

  it('cover reference should be the same as the cover id if the cover was not edited', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverId } = fixture;

    const coverReference = await cover.getCoverReference(coverId);
    expect(coverReference.originalCoverId).to.equal(coverId);
    expect(coverReference.latestCoverId).to.equal(coverId);
  });

  it('reverts if the cover asset is different', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverId } = fixture;
    const { COVER_BUY_FIXTURE } = fixture.constants;
    const [coverBuyer] = fixture.accounts.members;
    const { ASSETS } = fixture.constants;

    const { productId, period, amount } = COVER_BUY_FIXTURE;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId,
          owner: coverBuyer.address,
          productId,
          coverAsset: ASSETS.cbBTC,
          amount,
          period,
          maxPremiumInAsset: 0,
          paymentAsset: ASSETS.cbBTC,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: amount }],
      ),
    ).to.be.revertedWithCustomError(cover, 'CoverAssetMismatch');
  });

  it('cover reference should change after a cover edit', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverId } = fixture;
    const { COVER_BUY_FIXTURE } = fixture.constants;
    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount } = COVER_BUY_FIXTURE;

    const reducedPeriod = period - 24n * 60n * 60n;

    await cover.connect(coverBuyer).buyCover(
      {
        coverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount: 1,
        period: reducedPeriod,
        maxPremiumInAsset: 0,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: amount.toString() }],
    );

    const editedCoverId = coverId + 1n;
    const coverReferenceForOriginalId = await cover.getCoverReference(coverId);
    const coverReferenceForEditedId = await cover.getCoverReference(editedCoverId);

    expect(coverReferenceForOriginalId.originalCoverId).to.equal(coverId);
    expect(coverReferenceForOriginalId.latestCoverId).to.equal(editedCoverId);
    expect(coverReferenceForEditedId).to.deep.equal(coverReferenceForOriginalId);
  });

  it('cover reference latestCoverId should be correct after 2 edits', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverId } = fixture;
    const { COVER_BUY_FIXTURE } = fixture.constants;
    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount } = COVER_BUY_FIXTURE;

    const reducedPeriodFirstEdit = period - 24n * 60n * 60n;

    await cover.connect(coverBuyer).buyCover(
      {
        coverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount,
        period: reducedPeriodFirstEdit,
        maxPremiumInAsset: 0,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: amount.toString() }],
    );

    const reducedPeriodSecondEdit = reducedPeriodFirstEdit - 24n * 60n * 60n;

    await cover.connect(coverBuyer).buyCover(
      {
        coverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount,
        period: reducedPeriodSecondEdit,
        maxPremiumInAsset: 0,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: amount.toString() }],
    );

    const lastEditCoverId = coverId + 2n;
    const coverReferenceForOriginalId = await cover.getCoverReference(coverId);
    const coverReferenceForLastEditId = await cover.getCoverReference(lastEditCoverId);

    expect(coverReferenceForOriginalId.originalCoverId).to.equal(coverId);
    expect(coverReferenceForOriginalId.latestCoverId).to.equal(lastEditCoverId);
    expect(coverReferenceForLastEditId).to.deep.equal(coverReferenceForOriginalId);
  });

  it('cover edit should revert if coverId is not original cover id', async function () {
    const fixture = await loadFixture(setupEditCoverFixture);
    const { cover, coverId } = fixture;
    const { COVER_BUY_FIXTURE } = fixture.constants;
    const [coverBuyer] = fixture.accounts.members;

    const { productId, coverAsset, period, amount } = COVER_BUY_FIXTURE;

    const reducedPeriodFirstEdit = period - 24n * 60n * 60n;

    await cover.connect(coverBuyer).buyCover(
      {
        coverId,
        owner: coverBuyer.address,
        productId,
        coverAsset,
        amount,
        period: reducedPeriodFirstEdit,
        maxPremiumInAsset: 0,
        paymentAsset: coverAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: amount.toString() }],
    );

    const editedCoverId = coverId + 1n;

    const reducedPeriodSecondEdit = reducedPeriodFirstEdit - 24n * 60n * 60n;

    await expect(
      cover.connect(coverBuyer).buyCover(
        {
          coverId: editedCoverId,
          owner: coverBuyer.address,
          productId,
          coverAsset,
          amount,
          period: reducedPeriodSecondEdit,
          maxPremiumInAsset: 0,
          paymentAsset: coverAsset,
          payWitNXM: false,
          commissionRatio: parseEther('0'),
          commissionDestination: ZeroAddress,
          ipfsData: '',
        },
        [{ poolId: 1, coverAmountInAsset: amount.toString() }],
      ),
    ).to.be.revertedWithCustomError(cover, 'MustBeOriginalCoverId');
  });
});

const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { buyCover, ETH_ASSET_ID, DAI_ASSET_ID } = require('../utils/cover');
const { stake } = require('../utils/staking');
const { assetToEthWithPrecisionLoss } = require('../utils/assetPricing');
const { evm, rammCalculations } = require('../../utils');
const { daysToSeconds } = require('../../../lib/helpers');
const setup = require('../setup');

const { MaxUint256 } = ethers.constants;
const { parseEther } = ethers.utils;
const { setEtherBalance, setNextBlockTime } = evm;
const { getInternalPrice } = rammCalculations;

const ethCoverTemplate = {
  productId: 0, // DEFAULT_PRODUCT
  coverAsset: ETH_ASSET_ID, // ETH
  period: daysToSeconds(30), // 30 days
  gracePeriod: daysToSeconds(30),
  amount: parseEther('100'),
  priceDenominator: 10000,
  coverId: 0,
  segmentId: 0,
  incidentId: 0,
  assessmentId: 0,
};

const daiCoverTemplate = {
  ...ethCoverTemplate,
  productId: 0,
  coverAsset: DAI_ASSET_ID, // DAI
};

async function getTotalActiveCoverAmountSetup() {
  const fixture = await loadFixture(setup);
  const { tk, dai, stakingPool1: stakingPool, tc, mcr, cover } = fixture.contracts;
  const [member1] = fixture.accounts.members;
  const [nonMember1] = fixture.accounts.nonMembers;

  const operator = await tk.operator();
  await setEtherBalance(operator, parseEther('10000000'));

  for (const daiHolder of [member1, nonMember1]) {
    // mint  tokens
    await dai.mint(daiHolder.address, parseEther('1000000000000'));
    await dai.connect(daiHolder).approve(cover.address, MaxUint256);
  }

  await tk.connect(await ethers.getImpersonatedSigner(operator)).mint(member1.address, parseEther('100000'));
  await tk.connect(member1).approve(tc.address, MaxUint256);
  await stake({
    contracts: fixture.contracts,
    stakingPool,
    staker: member1,
    productId: ethCoverTemplate.productId,
    period: daysToSeconds(60),
    gracePeriod: daysToSeconds(30),
  });

  expect(await mcr.getTotalActiveCoverAmount()).to.be.equal(0);

  return fixture;
}

/**
 * Calculates the appropriate next block timestamp according to the TWAP period size
 * @param {Contract} ra - RAMM contract
 * @returns {number} - next block timestamp
 */
async function getNextBlockTimestampByPeriodSize(ra) {
  const PERIOD_SIZE = await ra.PERIOD_SIZE();
  const previousBlock = await ethers.provider.getBlock('latest');
  const PERIOD_COUNT = 3; // 3 observations
  return PERIOD_SIZE.mul(PERIOD_COUNT).add(previousBlock.timestamp).toNumber();
}

describe('getTotalActiveCoverAmount', function () {
  it('returns 0 when no covers exist', async function () {
    const fixture = await loadFixture(getTotalActiveCoverAmountSetup);
    const { mcr } = fixture.contracts;
    const totalAssurace = await mcr.getTotalActiveCoverAmount();
    expect(totalAssurace).to.be.equal(0);
  });

  it('returns total value of ETH purchased cover', async function () {
    const fixture = await loadFixture(getTotalActiveCoverAmountSetup);
    const { mcr, cover, p1, ra, tc } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;
    const targetPrice = fixture.DEFAULT_PRODUCTS[0].targetPrice;
    const priceDenominator = fixture.config.TARGET_PRICE_DENOMINATOR;
    const coverBuyTemplate = { ...ethCoverTemplate };

    const { config } = fixture;
    const { amount } = coverBuyTemplate;
    const nextBlockTimestamp = await getNextBlockTimestampByPeriodSize(ra);
    // NOTE: should be called before buyCover as buyCover execution will slightly adjust the price
    const nxmPriceInEth = await getInternalPrice(ra, p1, tc, mcr, nextBlockTimestamp);

    await setNextBlockTime(nextBlockTimestamp);
    await buyCover({ ...coverBuyTemplate, cover, coverBuyer, targetPrice, priceDenominator });

    const totalAssurance = await mcr.getTotalActiveCoverAmount();
    const expectedTotalAssurance = await assetToEthWithPrecisionLoss(amount, 0, config, nxmPriceInEth);
    expect(totalAssurance).to.be.equal(expectedTotalAssurance);
  });

  it('returns total value of DAI purchased cover', async function () {
    const fixture = await loadFixture(getTotalActiveCoverAmountSetup);
    const { mcr, cover, p1, tc, ra } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;
    const targetPrice = fixture.DEFAULT_PRODUCTS[0].targetPrice;
    const priceDenominator = fixture.config.TARGET_PRICE_DENOMINATOR;
    const coverBuyTemplate = { ...daiCoverTemplate };

    const { config, rates } = fixture;
    const { daiToEthRate } = rates;
    const { amount } = coverBuyTemplate;
    const nextBlockTimestamp = await getNextBlockTimestampByPeriodSize(ra);
    // NOTE: should be called before buyCover as buyCover execution will slightly adjust the price
    const nxmPriceInEth = await getInternalPrice(ra, p1, tc, mcr, nextBlockTimestamp);

    await setNextBlockTime(nextBlockTimestamp);
    await buyCover({ ...coverBuyTemplate, cover, coverBuyer, targetPrice, priceDenominator });

    const totalAssurance = await mcr.getTotalActiveCoverAmount();
    const expectedTotalAssurance = await assetToEthWithPrecisionLoss(amount, daiToEthRate, config, nxmPriceInEth);
    expect(totalAssurance).to.be.equal(expectedTotalAssurance);
  });

  it('returns total value of multiple ETH and DAI covers', async function () {
    const fixture = await loadFixture(getTotalActiveCoverAmountSetup);
    const { mcr, cover, p1, ra, tc } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;
    const targetPrice = fixture.DEFAULT_PRODUCTS[0].targetPrice;
    const priceDenominator = fixture.config.TARGET_PRICE_DENOMINATOR;
    const PERIOD_SIZE = await ra.PERIOD_SIZE();

    const { config, rates } = fixture;
    const { daiToEthRate } = rates;
    const ethAmount = ethCoverTemplate.amount;
    const daiAmount = daiCoverTemplate.amount;

    // ETH cover 1
    const nextBlockTimestamp1 = await getNextBlockTimestampByPeriodSize(ra);
    const nxmPriceInEth1 = await getInternalPrice(ra, p1, tc, mcr, nextBlockTimestamp1);
    await setNextBlockTime(nextBlockTimestamp1);
    await buyCover({ ...ethCoverTemplate, cover, coverBuyer, targetPrice, priceDenominator });
    const expectedEthCoverAmount1 = await assetToEthWithPrecisionLoss(ethAmount, 0, config, nxmPriceInEth1);

    // ETH cover 2
    const nextBlockTimestamp2 = nextBlockTimestamp1 + PERIOD_SIZE.toNumber();
    const nxmPriceInEth2 = await getInternalPrice(ra, p1, tc, mcr, nextBlockTimestamp2);
    await setNextBlockTime(nextBlockTimestamp2);
    await buyCover({ ...ethCoverTemplate, cover, coverBuyer, targetPrice, priceDenominator });
    const expectedEthCoverAmount2 = await assetToEthWithPrecisionLoss(ethAmount, 0, config, nxmPriceInEth2);

    // DAI cover 1
    const nextBlockTimestamp3 = nextBlockTimestamp2 + PERIOD_SIZE.toNumber();
    const nxmPriceInEth3 = await getInternalPrice(ra, p1, tc, mcr, nextBlockTimestamp3);
    await setNextBlockTime(nextBlockTimestamp3);
    await buyCover({ ...daiCoverTemplate, cover, coverBuyer, targetPrice, priceDenominator });
    const expectedDaiCoverAmount1 = await assetToEthWithPrecisionLoss(daiAmount, daiToEthRate, config, nxmPriceInEth3);

    // DAI cover 2
    const nextBlockTimestamp4 = nextBlockTimestamp3 + PERIOD_SIZE.toNumber();
    const nxmPriceInEth4 = await getInternalPrice(ra, p1, tc, mcr, nextBlockTimestamp4);
    await setNextBlockTime(nextBlockTimestamp4);
    await buyCover({ ...daiCoverTemplate, cover, coverBuyer, targetPrice, priceDenominator });
    const expectedDaiCoverAmount2 = await assetToEthWithPrecisionLoss(daiAmount, daiToEthRate, config, nxmPriceInEth4);

    const expectedTotalActiveCoverAmount = expectedEthCoverAmount1
      .add(expectedEthCoverAmount2)
      .add(expectedDaiCoverAmount1)
      .add(expectedDaiCoverAmount2);
    const actualTotalActiveCoverAmount = await mcr.getTotalActiveCoverAmount();

    const totalActiveCoverAmountDiff = expectedTotalActiveCoverAmount - actualTotalActiveCoverAmount;
    expect(
      totalActiveCoverAmountDiff,
      `Total active cover amount ${actualTotalActiveCoverAmount} not close enough to ${expectedTotalActiveCoverAmount}`,
    ).to.be.lessThanOrEqual(1); // <= 1 wei
  });
});

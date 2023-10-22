const { ethers } = require('hardhat');
const { expect } = require('chai');
const { buyCover, ETH_ASSET_ID, DAI_ASSET_ID } = require('../utils/cover');
const { daysToSeconds } = require('../../../lib/helpers');
const { stake } = require('../utils/staking');
const { setEtherBalance } = require('../../utils/evm');
const { assetToEthWithPrecisionLoss } = require('../utils/assetPricing');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('../setup');
const { MaxUint256 } = ethers.constants;
const { parseEther } = ethers.utils;

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

  await tk.connect(await ethers.getImpersonatedSigner(operator)).mint(member1.address, parseEther('1000000000000'));
  await tk.connect(member1).approve(tc.address, MaxUint256);
  await stake({
    stakingPool,
    staker: member1,
    productId: ethCoverTemplate.productId,
    period: daysToSeconds(60),
    gracePeriod: daysToSeconds(30),
  });

  expect(await mcr.getTotalActiveCoverAmount()).to.be.equal(0);

  return fixture;
}

describe('getTotalActiveCoverAmount', function () {
  it('returns 0 when no covers exist', async function () {
    const fixture = await loadFixture(getTotalActiveCoverAmountSetup);
    const { mcr } = fixture.contracts;
    const totalAssurace = await mcr.getTotalActiveCoverAmount();
    expect(totalAssurace).to.be.equal(0);
  });

  // TODO: calculate exact amount
  it.skip('returns total value of ETH purchased cover', async function () {
    const fixture = await loadFixture(getTotalActiveCoverAmountSetup);
    const { mcr, cover, p1 } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;
    const targetPrice = fixture.DEFAULT_PRODUCTS[0].targetPrice;
    const priceDenominator = fixture.config.TARGET_PRICE_DENOMINATOR;
    const coverBuyTemplate = { ...ethCoverTemplate };

    await buyCover({
      ...coverBuyTemplate,
      cover,
      coverBuyer,
      targetPrice,
      priceDenominator,
    });
    const totalAssurance = await mcr.getTotalActiveCoverAmount();
    expect(totalAssurance).to.be.equal(
      await assetToEthWithPrecisionLoss(p1, coverBuyTemplate.amount, 0, fixture.config),
    );
  });

  // TODO: calculate exact amount
  it.skip('returns total value of DAI purchased cover', async function () {
    const fixture = await loadFixture(getTotalActiveCoverAmountSetup);
    const { mcr, cover, p1 } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;
    const targetPrice = fixture.DEFAULT_PRODUCTS[0].targetPrice;
    const priceDenominator = fixture.config.TARGET_PRICE_DENOMINATOR;
    const coverBuyTemplate = { ...daiCoverTemplate };

    await buyCover({
      ...coverBuyTemplate,
      cover,
      coverBuyer,
      targetPrice,
      priceDenominator,
    });

    const expectedTotal = await assetToEthWithPrecisionLoss(
      p1,
      coverBuyTemplate.amount,
      fixture.rates.daiToEthRate,
      fixture.config,
    );

    const totalAssurance = await mcr.getTotalActiveCoverAmount();
    expect(totalAssurance).to.be.equal(expectedTotal);
  });

  // TODO: calculate exact amount
  it.skip('returns total value of multiple ETH and DAI covers', async function () {
    const fixture = await loadFixture(getTotalActiveCoverAmountSetup);
    const { mcr, cover, p1 } = fixture.contracts;
    const [coverBuyer] = fixture.accounts.members;
    const targetPrice = fixture.DEFAULT_PRODUCTS[0].targetPrice;
    const priceDenominator = fixture.config.TARGET_PRICE_DENOMINATOR;

    const ethCoversToBuy = 2;
    for (let i = 0; i < ethCoversToBuy; i++) {
      await buyCover({
        ...ethCoverTemplate,
        cover,
        coverBuyer,
        targetPrice,
        priceDenominator,
      });
    }

    const daiCoversToBuy = 2;
    for (let i = 0; i < daiCoversToBuy; i++) {
      await buyCover({
        ...daiCoverTemplate,
        cover,
        coverBuyer,
        targetPrice,
        priceDenominator,
      });
    }

    // calculate eth covers
    const expectedEthCoverAmount = await assetToEthWithPrecisionLoss(
      p1,
      ethCoverTemplate.amount.mul(2),
      0,
      fixture.config,
    );

    // calculate dai covers
    const expectedDaiCoverAmount = await assetToEthWithPrecisionLoss(
      p1,
      daiCoverTemplate.amount.mul(2),
      fixture.rates.daiToEthRate,
      fixture.config,
    );

    const totalActiveCoverAmount = await mcr.getTotalActiveCoverAmount();
    expect(totalActiveCoverAmount).to.be.equal(expectedEthCoverAmount.add(expectedDaiCoverAmount));
  });
});

const { ethers } = require('hardhat');
const { expect } = require('chai');
const { BigNumber } = ethers;
const { buyCover, ETH_ASSET_ID, DAI_ASSET_ID } = require('../utils/cover');
const { daysToSeconds } = require('../../../lib/helpers');
const { stake } = require('../utils/staking');
const { setEtherBalance } = require('../../utils/evm');
const { roundUpToNearestAllocationUnit, divCeil } = require('../../unit/StakingPool/helpers');
const { MaxUint256 } = ethers.constants;
const { parseEther } = ethers.utils;

const daiProductParamTemplate = {
  productId: 2, // dai
  recalculateEffectiveWeight: true,
  setTargetWeight: true,
  targetWeight: 100,
  setTargetPrice: true,
  targetPrice: 100,
};

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

describe('getAllSumAssurance', function () {
  beforeEach(async function () {
    const { tk, dai, stakingPool0: stakingPool, tc, mcr, cover } = this.contracts;
    const [member1] = this.accounts.members;
    const [nonMember1] = this.accounts.nonMembers;
    const stakingPoolManagers = this.accounts.stakingPoolManagers;

    const operator = await tk.operator();
    await setEtherBalance(operator, parseEther('10000000'));

    for (const daiHolder of [member1, nonMember1]) {
      // mint  tokens
      await dai.mint(daiHolder.address, parseEther('1000000000000'));
      await tk
        .connect(await ethers.getImpersonatedSigner(operator))
        .mint(daiHolder.address, parseEther('1000000000000'));

      // approve token controller and cover
      await dai.connect(daiHolder).approve(tc.address, MaxUint256);
      await dai.connect(daiHolder).approve(cover.address, MaxUint256);
      await tk.connect(daiHolder).approve(tc.address, MaxUint256);
      await tk.connect(daiHolder).approve(cover.address, MaxUint256);

      await stakingPool.connect(stakingPoolManagers[0]).setProducts([daiProductParamTemplate]);
    }
    await stake({
      stakingPool,
      staker: member1,
      productId: ethCoverTemplate.productId,
      period: daysToSeconds(60),
      gracePeriod: daysToSeconds(30),
    });

    expect(await mcr.getAllSumAssurance()).to.be.equal(0);
  });

  async function adjustForPricePrecisionLoss(pool, coverAmountInAsset, NXM_PER_ALLOCATION_UNIT, ONE_NXM) {
    const nxmPriceInCoverAsset = await pool.getTokenPriceInAsset(ETH_ASSET_ID);
    const coverAmountInNXM = roundUpToNearestAllocationUnit(
      divCeil(BigNumber.from(coverAmountInAsset).mul(ONE_NXM), nxmPriceInCoverAsset),
      NXM_PER_ALLOCATION_UNIT,
    );
    const coverAmountInCoverAsset = coverAmountInNXM.mul(nxmPriceInCoverAsset).div(ONE_NXM);
    return coverAmountInCoverAsset;
  }

  it('returns 0 when no covers exist', async function () {
    const { mcr } = this.contracts;

    const totalAssurace = await mcr.getAllSumAssurance();
    assert.equal(totalAssurace.toString(), '0');
  });

  it('returns total value of ETH purchased cover', async function () {
    const { mcr, cover, p1 } = this.contracts;
    const [coverBuyer] = this.accounts.members;
    const targetPrice = this.DEFAULT_PRODUCTS[0].targetPrice;
    const priceDenominator = this.config.TARGET_PRICE_DENOMINATOR;
    const coverBuyTemplate = { ...ethCoverTemplate };

    await buyCover({
      ...coverBuyTemplate,
      cover,
      coverBuyer,
      targetPrice,
      priceDenominator,
    });
    const totalAssurance = await mcr.getAllSumAssurance();
    expect(totalAssurance).to.be.equal(
      await adjustForPricePrecisionLoss(
        p1,
        coverBuyTemplate.amount,
        this.config.NXM_PER_ALLOCATION_UNIT,
        this.config.ONE_NXM,
      ),
    );
  });

  it('returns total value of DAI purchased cover', async function () {
    const { mcr, cover, p1 } = this.contracts;
    const [coverBuyer] = this.accounts.members;
    const targetPrice = this.DEFAULT_PRODUCTS[0].targetPrice;
    const priceDenominator = this.config.TARGET_PRICE_DENOMINATOR;
    const coverBuyTemplate = { ...daiCoverTemplate };

    await buyCover({
      ...coverBuyTemplate,
      cover,
      coverBuyer,
      targetPrice,
      priceDenominator,
    });

    const expectedAmountETH = roundUpToNearestAllocationUnit(
      this.rates.daiToEthRate.mul(coverBuyTemplate.amount).div(this.config.ONE_NXM),
      this.config.NXM_PER_ALLOCATION_UNIT,
    );
    const expectedTotal = await adjustForPricePrecisionLoss(
      p1,
      expectedAmountETH,
      this.config.NXM_PER_ALLOCATION_UNIT,
      this.config.ONE_NXM,
    );

    const totalAssurance = await mcr.getAllSumAssurance();
    expect(totalAssurance).to.be.equal(expectedTotal);
  });

  it('returns total value of multiple ETH and DAI covers', async function () {
    const { mcr, cover, p1 } = this.contracts;
    const [coverBuyer] = this.accounts.members;
    const targetPrice = this.DEFAULT_PRODUCTS[0].targetPrice;
    const priceDenominator = this.config.TARGET_PRICE_DENOMINATOR;

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
    const expectedTotalEthAssurance = await adjustForPricePrecisionLoss(
      p1,
      ethCoverTemplate.amount.mul(2),
      this.config.NXM_PER_ALLOCATION_UNIT,
      this.config.ONE_NXM,
    );

    // calculate dai covers
    const expectedAmountETH = roundUpToNearestAllocationUnit(
      this.rates.daiToEthRate.mul(daiCoverTemplate.amount.mul(2)).div(this.config.ONE_NXM),
      this.config.NXM_PER_ALLOCATION_UNIT,
    );
    const expectedTotalDaiAssurance = await adjustForPricePrecisionLoss(
      p1,
      expectedAmountETH,
      this.config.NXM_PER_ALLOCATION_UNIT,
      this.config.ONE_NXM,
    );

    const totalAssurance = await mcr.getAllSumAssurance();
    expect(totalAssurance).to.be.equal(expectedTotalEthAssurance.add(expectedTotalDaiAssurance));
  });
});

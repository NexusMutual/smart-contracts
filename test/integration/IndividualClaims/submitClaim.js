const { ethers } = require('hardhat');
const { expect } = require('chai');

const { rejectClaim, acceptClaim } = require('../utils/voteClaim');
const { buyCover, transferCoverAsset, ETH_ASSET_ID, DAI_ASSET_ID, USDC_ASSET_ID } = require('../utils/cover');

const { daysToSeconds } = require('../../../lib/helpers');
const { mineNextBlock, setNextBlockTime, setNextBlockBaseFee, setEtherBalance } = require('../../utils/evm');
const { MAX_COVER_PERIOD } = require('../../unit/Cover/helpers');
const { BUCKET_DURATION, moveTimeToNextTranche } = require('../../unit/StakingPool/helpers');

const { BigNumber } = ethers;
const { parseEther, parseUnits } = ethers.utils;
const { AddressZero, Two, MaxUint256 } = ethers.constants;

const MaxUint32 = Two.pow(32).sub(1);
const BUCKET_TRANCHE_GROUP_SIZE = 8;
const EXPIRING_ALLOCATION_DATA_GROUP_SIZE = 32;

const priceDenominator = '10000';
const COVER_ID = 1;
const productId = 0;

let currentTranche = 0;
let assessmentId = 0;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

const timeTravel = async ({ stakingPool, seconds }) => {
  const { timestamp: timestampBefore } = await ethers.provider.getBlock('latest');
  await setTime(timestampBefore + seconds);

  const { timestamp } = await ethers.provider.getBlock('latest');
  const lastTrancheId = Math.floor(timestamp / (91 * 24 * 3600)) + 7;

  if (lastTrancheId > currentTranche) {
    currentTranche = lastTrancheId;
    // Stake to open up capacity
    await stakingPool.depositTo(
      parseEther('1000'),
      lastTrancheId,
      0, // new position
      AddressZero, // destination
    );
  }
};

async function getExpiringCoverBucketsAtTimestamp({ stakingPool, timestamp }) {
  const currentTrancheId = Math.floor(timestamp / (91 * 24 * 3600));
  const targetBucketId = Math.ceil(timestamp / BUCKET_DURATION);
  const groupId = Math.floor(currentTrancheId / BUCKET_TRANCHE_GROUP_SIZE);
  const currentTrancheIndexInGroup = currentTrancheId % BUCKET_TRANCHE_GROUP_SIZE;
  const expiringCoverBuckets = await stakingPool.expiringCoverBuckets(productId, targetBucketId, groupId);
  return expiringCoverBuckets.shr(currentTrancheIndexInGroup * EXPIRING_ALLOCATION_DATA_GROUP_SIZE);
}
async function submitClaimSimple({ ic, as, claimAmount, period }) {
  const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, DAI_ASSET_ID);
  await ic.submitClaim(COVER_ID, 0, claimAmount, '', {
    value: deposit.mul('2'),
  });

  const assessmentStakingAmount = parseEther('1000');
  await acceptClaim({ staker: as.signer, assessmentStakingAmount, as, assessmentId });

  // redeem payout
  await ic.redeemClaimPayout(assessmentId);
  assessmentId++;
}
async function buyCoverSimple({ cover, period = 0, amount = 0 }) {
  const { timestamp } = await ethers.provider.getBlock('latest');
  const coverId = await cover.coverDataCount();

  if (coverId === 0 && period === 0) {
    throw Error('New cover requires period > 0');
  }

  if (coverId > 0) {
    const coverSegmentCount = await cover.coverSegmentsCount(coverId);
    const latestSegment = await cover.coverSegments(coverId, coverSegmentCount.sub(1));

    if (BigNumber.from(latestSegment.start).add(latestSegment.period).lt(timestamp)) {
      throw Error('Cover expired');
    }

    if (period === 0) {
      period = BigNumber.from(latestSegment.start).add(latestSegment.period).sub(timestamp);
    }

    if (amount === 0) {
      const coverData = await cover.coverData(coverId);
      amount = latestSegment.amount.sub(coverData.amountPaidOut);
    }
  }

  // Edit Cover - resets amount for the remaining period
  await cover.buyCover(
    {
      owner: cover.signer.address,
      coverId,
      productId: 0,
      coverAsset: DAI_ASSET_ID,
      amount,
      period,
      maxPremiumInAsset: MaxUint256,
      paymentAsset: DAI_ASSET_ID,
      commissionRatio: parseEther('0'),
      commissionDestination: AddressZero,
      ipfsData: '',
    },
    [{ poolId: 1, coverAmountInAsset: amount }],
  );
}

describe('submitClaim', function () {
  beforeEach(async function () {
    const { tk, dai, cover, tc, stakingPool1 } = this.contracts;
    const defaultSender = this.accounts.defaultSender;
    const members = this.accounts.members.slice(0, 5);
    const amount = BigNumber.from(2).pow(95);
    await dai.mint(defaultSender.address, amount);
    await dai.approve(cover.address, MaxUint256);

    for (const member of members) {
      await tk.transfer(member.address, parseEther('100'));
    }

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(coverSigner.address, parseEther('1000'));

    await tc.connect(coverSigner).mint(defaultSender.address, amount);
    await tk.approve(tc.address, MaxUint256);

    const { timestamp } = await ethers.provider.getBlock('latest');
    const lastTrancheId = Math.floor(timestamp / (91 * 24 * 3600)) + 7;

    // Stake to open up capacity
    await stakingPool1.depositTo(
      amount,
      lastTrancheId,
      0, // new position
      AddressZero, // destination
    );

    const stakingProductParams = {
      productId: 0,
      recalculateEffectiveWeight: true,
      setTargetWeight: true,
      targetWeight: 100, // 1
      setTargetPrice: true,
      targetPrice: 100, // 1%
    };

    // Set staked products
    const managerSigner = await ethers.getSigner(await stakingPool1.manager());
    const stakingProducts = await ethers.getContractAt('StakingProducts', await stakingPool1.stakingProducts());
    await stakingProducts.connect(managerSigner).setProducts(await stakingPool1.getPoolId(), [stakingProductParams]);

    this.allocationId = await stakingPool1.getNextAllocationId();
  });

  it('submits ETH claim and approves claim', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { ic, cover, stakingPool1, as } = this.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Buy Cover
    await buyCover({
      amount,
      productId,
      coverAsset,
      period,
      cover,
      coverBuyer: coverBuyer1,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      priceDenominator,
    });

    // Submit claim
    const claimAmount = amount;
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ic.connect(coverBuyer1).submitClaim(COVER_ID, 0, claimAmount, '', {
      value: deposit.mul('2'),
    });

    const assessmentId = 0;
    const assessmentStakingAmount = parseEther('1000');
    await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

    const ethBalanceBefore = await ethers.provider.getBalance(coverBuyer1.address);

    // redeem payout
    await ic.redeemClaimPayout(assessmentId);

    const ethBalanceAfter = await ethers.provider.getBalance(coverBuyer1.address);
    expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(claimAmount).add(deposit));

    const { payoutRedeemed } = await ic.claims(assessmentId);
    expect(payoutRedeemed).to.be.equal(true);
  });

  it('submits partial ETH claim and approves claim', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { ic, cover, as } = this.contracts;
    const [coverBuyer1, staker2] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const amount = parseEther('1');

    // Buy Cover
    await buyCover({
      amount,
      productId,
      coverAsset,
      period,
      cover,
      coverBuyer: coverBuyer1,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      priceDenominator,
    });

    // Submit partial claim - 1/2 of total amount
    const claimAmount = amount.div(2);
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ic.connect(coverBuyer1).submitClaim(COVER_ID, 0, claimAmount, '', {
      value: deposit.mul('2'),
    });

    const assessmentId = 0;
    const assessmentStakingAmount = parseEther('1000');
    await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

    const ethBalanceBefore = await ethers.provider.getBalance(coverBuyer1.address);

    // redeem payout
    await ic.redeemClaimPayout(assessmentId);

    const ethBalanceAfter = await ethers.provider.getBalance(coverBuyer1.address);
    expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(claimAmount).add(deposit));

    const { payoutRedeemed } = await ic.claims(assessmentId);
    expect(payoutRedeemed).to.be.equal(true);
  });

  it('submits ETH claim and rejects claim', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { ic, cover, stakingPool1, as } = this.contracts;
    const [coverBuyer1, staker1, staker2, staker3] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Buy Cover
    await buyCover({
      amount,
      productId,
      coverAsset,
      period,
      cover,
      coverBuyer: coverBuyer1,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      priceDenominator,
    });

    // Submit claim
    const claimAmount = amount;
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ic.connect(coverBuyer1).submitClaim(COVER_ID, 0, claimAmount, '', {
      value: deposit.mul('2'),
    });

    const assessmentId = 0;
    await rejectClaim({
      approvingStaker: staker2,
      rejectingStaker: staker3,
      as,
      assessmentId,
    });

    // attempt redemption
    await expect(ic.redeemClaimPayout(assessmentId)).to.be.revertedWith('The claim needs to be accepted');
    const { payoutRedeemed } = await ic.claims(assessmentId);
    expect(payoutRedeemed).to.be.equal(false);
  });

  it('submits partial ETH claim and rejects claim', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { ic, cover, stakingPool1, as } = this.contracts;
    const [coverBuyer1, staker1, staker2, staker3] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Buy Cover
    await buyCover({
      amount,
      productId,
      coverAsset,
      period,
      cover,
      coverBuyer: coverBuyer1,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      priceDenominator,
    });

    // Submit claim - 1/2 of total amount
    const claimAmount = amount.div(2);
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ic.connect(coverBuyer1).submitClaim(COVER_ID, 0, claimAmount, '', {
      value: deposit.mul('2'),
    });

    const assessmentId = 0;
    await rejectClaim({
      approvingStaker: staker2,
      rejectingStaker: staker3,
      as,
      assessmentId,
    });

    // attempt redemption
    await expect(ic.redeemClaimPayout(assessmentId)).to.be.revertedWith('The claim needs to be accepted');
    const { payoutRedeemed } = await ic.claims(assessmentId);
    expect(payoutRedeemed).to.be.equal(false);
  });

  it('submits DAI claim and approves claim', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { ic, cover, stakingPool1, as, dai } = this.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = DAI_ASSET_ID; // DAI
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // cover buyer gets cover asset
    await transferCoverAsset({ tokenOwner: this.accounts.defaultSender, coverBuyer: coverBuyer1, asset: dai, cover });

    // Buy Cover
    await buyCover({
      amount,
      productId,
      coverAsset,
      period,
      cover,
      coverBuyer: coverBuyer1,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      priceDenominator,
    });

    // Submit claim
    const claimAmount = amount;
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ic.connect(coverBuyer1).submitClaim(COVER_ID, 0, claimAmount, '', {
      value: deposit.mul('2'),
    });

    const assessmentId = 0;
    const assessmentStakingAmount = parseEther('1000');
    await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

    const daiBalanceBefore = await dai.balanceOf(coverBuyer1.address);

    await ic.redeemClaimPayout(assessmentId);

    const daiBalanceAfter = await dai.balanceOf(coverBuyer1.address);
    expect(daiBalanceAfter).to.be.equal(daiBalanceBefore.add(claimAmount));

    const { payoutRedeemed } = await ic.claims(assessmentId);
    expect(payoutRedeemed).to.be.equal(true);
  });

  it('submits partial DAI claim and approves claim', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { ic, cover, stakingPool1, as, dai } = this.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = DAI_ASSET_ID; // DAI
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // cover buyer gets cover asset
    await transferCoverAsset({ tokenOwner: this.accounts.defaultSender, coverBuyer: coverBuyer1, asset: dai, cover });

    // Buy Cover
    await buyCover({
      amount,
      productId,
      coverAsset,
      period,
      cover,
      coverBuyer: coverBuyer1,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      priceDenominator,
    });

    // Submit claim - 1/2 of total amount
    const claimAmount = amount.div(2);
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ic.connect(coverBuyer1).submitClaim(COVER_ID, 0, claimAmount, '', {
      value: deposit.mul('2'),
    });

    const assessmentId = 0;
    const assessmentStakingAmount = parseEther('1000');
    await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

    const daiBalanceBefore = await dai.balanceOf(coverBuyer1.address);

    await ic.redeemClaimPayout(assessmentId);

    const daiBalanceAfter = await dai.balanceOf(coverBuyer1.address);
    expect(daiBalanceAfter).to.be.equal(daiBalanceBefore.add(claimAmount));

    const { payoutRedeemed } = await ic.claims(assessmentId);
    expect(payoutRedeemed).to.be.equal(true);
  });

  it('submits DAI claim and rejects claim', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { ic, cover, stakingPool1, as, dai } = this.contracts;
    const [coverBuyer1, staker1, staker2, staker3] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = DAI_ASSET_ID; // DAI
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // cover buyer gets cover asset
    await transferCoverAsset({ tokenOwner: this.accounts.defaultSender, coverBuyer: coverBuyer1, asset: dai, cover });

    // Buy Cover
    await buyCover({
      amount,
      productId,
      coverAsset,
      period,
      cover,
      coverBuyer: coverBuyer1,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      priceDenominator,
    });

    // Submit claim
    const claimAmount = amount;
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ic.connect(coverBuyer1).submitClaim(COVER_ID, 0, claimAmount, '', {
      value: deposit.mul('2'),
    });

    const assessmentId = 0;
    await rejectClaim({
      approvingStaker: staker2,
      rejectingStaker: staker3,
      as,
      assessmentId,
    });

    // attempt redemption
    await expect(ic.redeemClaimPayout(assessmentId)).to.be.revertedWith('The claim needs to be accepted');
    const { payoutRedeemed } = await ic.claims(assessmentId);
    expect(payoutRedeemed).to.be.equal(false);
  });

  it('submits partial DAI claim and rejects claim', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { ic, cover, stakingPool1, as, dai } = this.contracts;
    const [coverBuyer1, staker1, staker2, staker3] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = DAI_ASSET_ID; // DAI
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // cover buyer gets cover asset
    await transferCoverAsset({ tokenOwner: this.accounts.defaultSender, coverBuyer: coverBuyer1, asset: dai, cover });

    // Buy Cover
    await buyCover({
      amount,
      productId,
      coverAsset,
      period,
      cover,
      coverBuyer: coverBuyer1,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      priceDenominator,
    });

    // Submit claim - 1/2 of total amount
    const claimAmount = amount.div(2);
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ic.connect(coverBuyer1).submitClaim(COVER_ID, 0, claimAmount, '', {
      value: deposit.mul('2'),
    });

    const assessmentId = 0;
    await rejectClaim({
      approvingStaker: staker2,
      rejectingStaker: staker3,
      as,
      assessmentId,
    });

    // attempt redemption
    await expect(ic.redeemClaimPayout(assessmentId)).to.be.revertedWith('The claim needs to be accepted');
    const { payoutRedeemed } = await ic.claims(assessmentId);
    expect(payoutRedeemed).to.be.equal(false);
  });

  it('submits USDC claim and approves claim (token with 6 decimals)', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { ic, cover, stakingPool1, as, usdc } = this.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;

    const usdcDecimals = 6;

    // Cover inputs
    const productId = 6;
    const coverAsset = USDC_ASSET_ID; // USDC
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseUnits('10', usdcDecimals);

    // cover buyer gets cover asset
    await transferCoverAsset({ tokenOwner: this.accounts.defaultSender, coverBuyer: coverBuyer1, asset: usdc, cover });

    // Buy Cover
    await buyCover({
      amount,
      productId,
      coverAsset,
      period,
      cover,
      coverBuyer: coverBuyer1,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      priceDenominator,
    });

    // Submit claim
    const claimAmount = amount;
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ic.connect(coverBuyer1).submitClaim(COVER_ID, 0, claimAmount, '', {
      value: deposit.mul('2'),
    });

    const assessmentId = 0;
    const assessmentStakingAmount = parseEther('1000');
    await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

    const usdcBalanceBefore = await usdc.balanceOf(coverBuyer1.address);

    await ic.redeemClaimPayout(assessmentId);

    const usdcBalanceAfter = await usdc.balanceOf(coverBuyer1.address);
    expect(usdcBalanceAfter).to.be.equal(usdcBalanceBefore.add(claimAmount));

    const { payoutRedeemed } = await ic.claims(assessmentId);
    expect(payoutRedeemed).to.be.equal(true);
  });

  it('submits partial USDC claim and approves claim', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { ic, cover, stakingPool1, as, usdc } = this.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;

    const usdcDecimals = 6;

    // Cover inputs
    const productId = 6;
    const coverAsset = USDC_ASSET_ID; // USDC
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseUnits('10', usdcDecimals);

    // cover buyer gets cover asset
    await transferCoverAsset({ tokenOwner: this.accounts.defaultSender, coverBuyer: coverBuyer1, asset: usdc, cover });

    // Buy Cover
    await buyCover({
      amount,
      productId,
      coverAsset,
      period,
      cover,
      coverBuyer: coverBuyer1,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      priceDenominator,
    });

    // Submit claim - 1/2 of total amount
    const claimAmount = amount.div(2);
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ic.connect(coverBuyer1).submitClaim(COVER_ID, 0, claimAmount, '', {
      value: deposit.mul('2'),
    });

    const assessmentId = 0;
    const assessmentStakingAmount = parseEther('1000');
    await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

    const usdcBalanceBefore = await usdc.balanceOf(coverBuyer1.address);

    await ic.redeemClaimPayout(assessmentId);

    const usdcBalanceAfter = await usdc.balanceOf(coverBuyer1.address);
    expect(usdcBalanceAfter).to.be.equal(usdcBalanceBefore.add(claimAmount));

    const { payoutRedeemed } = await ic.claims(assessmentId);
    expect(payoutRedeemed).to.be.equal(true);
  });

  it('submits partial USDC claim and rejects claim', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { ic, cover, stakingPool1, as, usdc } = this.contracts;
    const [coverBuyer1, staker1, staker2, staker3] = this.accounts.members;

    const usdcDecimals = 6;

    // Cover inputs
    const productId = 6;
    const coverAsset = USDC_ASSET_ID; // USDC
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseUnits('10', usdcDecimals);

    // cover buyer gets cover asset
    await transferCoverAsset({ tokenOwner: this.accounts.defaultSender, coverBuyer: coverBuyer1, asset: usdc, cover });

    // Buy Cover
    await buyCover({
      amount,
      productId,
      coverAsset,
      period,
      cover,
      coverBuyer: coverBuyer1,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      priceDenominator,
    });

    // Submit claim - 1/2 of total amount
    const claimAmount = amount.div(2);
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ic.connect(coverBuyer1).submitClaim(COVER_ID, 0, claimAmount, '', {
      value: deposit.mul('2'),
    });

    const assessmentId = 0;
    await rejectClaim({
      approvingStaker: staker2,
      rejectingStaker: staker3,
      as,
      assessmentId,
    });

    // attempt redemption
    await expect(ic.redeemClaimPayout(assessmentId)).to.be.revertedWith('The claim needs to be accepted');
    const { payoutRedeemed } = await ic.claims(assessmentId);
    expect(payoutRedeemed).to.be.equal(false);
  });

  it('multiple partial ETH claims approved on the same cover', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { ic, cover, stakingPool1, as } = this.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Buy Cover
    await buyCover({
      amount,
      productId,
      coverAsset,
      period,
      cover,
      coverBuyer: coverBuyer1,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      priceDenominator,
    });

    // Submit First partial claim - 1/2 of total amount
    {
      const claimAmount = amount.div(2);
      const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ic.connect(coverBuyer1).submitClaim(COVER_ID, 0, claimAmount, '', {
        value: deposit.mul('2'),
      });

      const assessmentId = 0;
      const assessmentStakingAmount = parseEther('1000');
      await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

      const ethBalanceBefore = await ethers.provider.getBalance(coverBuyer1.address);

      // redeem payout
      await ic.redeemClaimPayout(assessmentId);

      const ethBalanceAfter = await ethers.provider.getBalance(coverBuyer1.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(claimAmount).add(deposit));

      const { payoutRedeemed } = await ic.claims(assessmentId);
      expect(payoutRedeemed).to.be.equal(true);

      const { poll } = await as.assessments(assessmentId);
      const { payoutCooldownInDays } = await as.config();
      const { payoutRedemptionPeriodInDays } = await ic.config();
      const endPayoutTime =
        poll.end + daysToSeconds(payoutCooldownInDays) + daysToSeconds(payoutRedemptionPeriodInDays);

      await setTime(endPayoutTime);
    }

    // Submit Second partial claim - 1/4 of total amount
    {
      // Submit claim
      const claimAmount = amount.div(4);
      const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ic.connect(coverBuyer1).submitClaim(COVER_ID, 0, claimAmount, '', {
        value: deposit.mul('2'),
      });

      const assessmentId = 1;
      const assessmentStakingAmount = parseEther('1000');
      await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

      const ethBalanceBefore = await ethers.provider.getBalance(coverBuyer1.address);

      // redeem payout
      await ic.redeemClaimPayout(assessmentId);

      const ethBalanceAfter = await ethers.provider.getBalance(coverBuyer1.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(claimAmount).add(deposit));

      const { payoutRedeemed } = await ic.claims(assessmentId);
      expect(payoutRedeemed).to.be.equal(true);

      const { poll } = await as.assessments(assessmentId);
      const { payoutCooldownInDays } = await as.config();
      const { payoutRedemptionPeriodInDays } = await ic.config();
      const endPayoutTime =
        poll.end + daysToSeconds(payoutCooldownInDays) + daysToSeconds(payoutRedemptionPeriodInDays);

      await setTime(endPayoutTime);
    }

    // Submit Third partial claim - 1/4 of total amount
    {
      // Submit claim
      const claimAmount = amount.div(4);
      const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ic.connect(coverBuyer1).submitClaim(COVER_ID, 0, claimAmount, '', {
        value: deposit.mul('2'),
      });

      const assessmentId = 2;
      const assessmentStakingAmount = parseEther('1000');
      await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

      const ethBalanceBefore = await ethers.provider.getBalance(coverBuyer1.address);

      // redeem payout
      await ic.redeemClaimPayout(assessmentId);

      const ethBalanceAfter = await ethers.provider.getBalance(coverBuyer1.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(claimAmount).add(deposit));

      const { payoutRedeemed } = await ic.claims(assessmentId);
      expect(payoutRedeemed).to.be.equal(true);
    }
  });

  it('multiple partial DAI claims approved on the same cover', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { ic, cover, stakingPool1, as, dai } = this.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = DAI_ASSET_ID; // DAI
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // cover buyer gets cover asset
    await transferCoverAsset({ tokenOwner: this.accounts.defaultSender, coverBuyer: coverBuyer1, asset: dai, cover });

    // Buy Cover
    await buyCover({
      amount,
      productId,
      coverAsset,
      period,
      cover,
      coverBuyer: coverBuyer1,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      priceDenominator,
    });

    // Submit First partial claim - 1/2 of total amount
    {
      const claimAmount = amount.div(2);
      const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ic.connect(coverBuyer1).submitClaim(COVER_ID, 0, claimAmount, '', {
        value: deposit.mul('2'),
      });

      const assessmentId = 0;
      const assessmentStakingAmount = parseEther('1000');
      await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

      const daiBalanceBefore = await dai.balanceOf(coverBuyer1.address);

      await ic.redeemClaimPayout(assessmentId);

      const daiBalanceAfter = await dai.balanceOf(coverBuyer1.address);
      expect(daiBalanceAfter).to.be.equal(daiBalanceBefore.add(claimAmount));

      const { payoutRedeemed } = await ic.claims(assessmentId);
      expect(payoutRedeemed).to.be.equal(true);

      const { poll } = await as.assessments(assessmentId);
      const { payoutCooldownInDays } = await as.config();
      const { payoutRedemptionPeriodInDays } = await ic.config();
      const endPayoutTime =
        poll.end + daysToSeconds(payoutCooldownInDays) + daysToSeconds(payoutRedemptionPeriodInDays);

      await setTime(endPayoutTime);
    }

    // Submit Second partial claim - 1/4 of total amount
    {
      const claimAmount = amount.div(4);
      const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ic.connect(coverBuyer1).submitClaim(COVER_ID, 0, claimAmount, '', {
        value: deposit.mul('2'),
      });

      const assessmentId = 1;
      const assessmentStakingAmount = parseEther('1000');
      await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

      const daiBalanceBefore = await dai.balanceOf(coverBuyer1.address);

      await ic.redeemClaimPayout(assessmentId);

      const daiBalanceAfter = await dai.balanceOf(coverBuyer1.address);
      expect(daiBalanceAfter).to.be.equal(daiBalanceBefore.add(claimAmount));

      const { payoutRedeemed } = await ic.claims(assessmentId);
      expect(payoutRedeemed).to.be.equal(true);

      const { poll } = await as.assessments(assessmentId);
      const { payoutCooldownInDays } = await as.config();
      const { payoutRedemptionPeriodInDays } = await ic.config();
      const endPayoutTime =
        poll.end + daysToSeconds(payoutCooldownInDays) + daysToSeconds(payoutRedemptionPeriodInDays);

      await setTime(endPayoutTime);
    }

    // Submit Third partial claim - 1/4 of total amount
    {
      const claimAmount = amount.div(4);
      const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ic.connect(coverBuyer1).submitClaim(COVER_ID, 0, claimAmount, '', {
        value: deposit.mul('2'),
      });

      const assessmentId = 2;
      const assessmentStakingAmount = parseEther('1000');
      await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

      const daiBalanceBefore = await dai.balanceOf(coverBuyer1.address);

      await ic.redeemClaimPayout(assessmentId);

      const daiBalanceAfter = await dai.balanceOf(coverBuyer1.address);
      expect(daiBalanceAfter).to.be.equal(daiBalanceBefore.add(claimAmount));

      const { payoutRedeemed } = await ic.claims(assessmentId);
      expect(payoutRedeemed).to.be.equal(true);
    }
  });

  it('multiple partial USDC claims approved on the same cover', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { ic, cover, stakingPool1, as, usdc } = this.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;

    const usdcDecimals = 6;

    // Cover inputs
    const productId = 6;
    const coverAsset = USDC_ASSET_ID; // USDC
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseUnits('10', usdcDecimals);

    // cover buyer gets cover asset
    await transferCoverAsset({ tokenOwner: this.accounts.defaultSender, coverBuyer: coverBuyer1, asset: usdc, cover });

    // Buy Cover
    await buyCover({
      amount,
      productId,
      coverAsset,
      period,
      cover,
      coverBuyer: coverBuyer1,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      priceDenominator,
    });

    // Submit First partial claim - 1/2 of total amount
    {
      const claimAmount = amount.div(2);
      const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ic.connect(coverBuyer1).submitClaim(COVER_ID, 0, claimAmount, '', {
        value: deposit.mul('2'),
      });

      const assessmentId = 0;
      const assessmentStakingAmount = parseEther('1000');
      await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

      const usdcBalanceBefore = await usdc.balanceOf(coverBuyer1.address);

      await ic.redeemClaimPayout(assessmentId);

      const usdcBalanceAfter = await usdc.balanceOf(coverBuyer1.address);
      expect(usdcBalanceAfter).to.be.equal(usdcBalanceBefore.add(claimAmount));

      const { payoutRedeemed } = await ic.claims(assessmentId);
      expect(payoutRedeemed).to.be.equal(true);

      const { poll } = await as.assessments(assessmentId);
      const { payoutCooldownInDays } = await as.config();
      const { payoutRedemptionPeriodInDays } = await ic.config();
      const endPayoutTime =
        poll.end + daysToSeconds(payoutCooldownInDays) + daysToSeconds(payoutRedemptionPeriodInDays);

      await setTime(endPayoutTime);
    }

    // Submit Second partial claim - 1/4 of total amount
    {
      const claimAmount = amount.div(4);
      const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ic.connect(coverBuyer1).submitClaim(COVER_ID, 0, claimAmount, '', {
        value: deposit.mul('2'),
      });

      const assessmentId = 1;
      const assessmentStakingAmount = parseEther('1000');
      await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

      const usdcBalanceBefore = await usdc.balanceOf(coverBuyer1.address);

      await ic.redeemClaimPayout(assessmentId);

      const usdcBalanceAfter = await usdc.balanceOf(coverBuyer1.address);
      expect(usdcBalanceAfter).to.be.equal(usdcBalanceBefore.add(claimAmount));

      const { payoutRedeemed } = await ic.claims(assessmentId);
      expect(payoutRedeemed).to.be.equal(true);

      const { poll } = await as.assessments(assessmentId);
      const { payoutCooldownInDays } = await as.config();
      const { payoutRedemptionPeriodInDays } = await ic.config();
      const endPayoutTime =
        poll.end + daysToSeconds(payoutCooldownInDays) + daysToSeconds(payoutRedemptionPeriodInDays);

      await setTime(endPayoutTime);
    }

    // Submit Third partial claim - 1/4 of total amount
    {
      const claimAmount = amount.div(4);
      const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ic.connect(coverBuyer1).submitClaim(COVER_ID, 0, claimAmount, '', {
        value: deposit.mul('2'),
      });

      const assessmentId = 2;
      const assessmentStakingAmount = parseEther('1000');
      await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

      const usdcBalanceBefore = await usdc.balanceOf(coverBuyer1.address);

      await ic.redeemClaimPayout(assessmentId);

      const usdcBalanceAfter = await usdc.balanceOf(coverBuyer1.address);
      expect(usdcBalanceAfter).to.be.equal(usdcBalanceBefore.add(claimAmount));

      const { payoutRedeemed } = await ic.claims(assessmentId);
      expect(payoutRedeemed).to.be.equal(true);
    }
  });

  it('multiple partial claims on the same cover with combinations of approved / denied', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { ic, cover, as } = this.contracts;
    const [coverBuyer1, staker2, staker3] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const amount = parseEther('1');

    // Buy Cover
    await buyCover({
      amount,
      productId,
      coverAsset,
      period,
      cover,
      coverBuyer: coverBuyer1,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      priceDenominator,
    });

    // Submit First partial claim - 1/2 of total amount
    {
      const claimAmount = amount.div(2);
      const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ic.connect(coverBuyer1).submitClaim(COVER_ID, 0, claimAmount, '', {
        value: deposit.mul('2'),
      });

      const assessmentId = 0;
      const assessmentStakingAmount = parseEther('1000');
      await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

      const ethBalanceBefore = await ethers.provider.getBalance(coverBuyer1.address);

      // redeem payout
      await ic.redeemClaimPayout(assessmentId);

      const ethBalanceAfter = await ethers.provider.getBalance(coverBuyer1.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(claimAmount).add(deposit));

      const { payoutRedeemed } = await ic.claims(assessmentId);
      expect(payoutRedeemed).to.be.equal(true);

      const { poll } = await as.assessments(assessmentId);
      const { payoutCooldownInDays } = await as.config();
      const { payoutRedemptionPeriodInDays } = await ic.config();
      const endPayoutTime =
        poll.end + daysToSeconds(payoutCooldownInDays) + daysToSeconds(payoutRedemptionPeriodInDays);

      await setTime(endPayoutTime);
    }

    // FAILED Submit Second partial claim - 1/2 of total amount
    {
      // Submit claim
      const claimAmount = amount.div(2);
      const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ic.connect(coverBuyer1).submitClaim(COVER_ID, 0, claimAmount, '', {
        value: deposit.mul('2'),
      });

      const assessmentId = 1;

      await rejectClaim({
        approvingStaker: staker2,
        rejectingStaker: staker3,
        as,
        assessmentId,
      });

      // attempt redemption
      await expect(ic.redeemClaimPayout(assessmentId)).to.be.revertedWith('The claim needs to be accepted');
      const { payoutRedeemed } = await ic.claims(assessmentId);
      expect(payoutRedeemed).to.be.equal(false);

      const { poll } = await as.assessments(assessmentId);
      const { payoutCooldownInDays } = await as.config();
      const { payoutRedemptionPeriodInDays } = await ic.config();
      const endPayoutTime =
        poll.end + daysToSeconds(payoutCooldownInDays) + daysToSeconds(payoutRedemptionPeriodInDays);

      await setTime(endPayoutTime);
    }

    // Submit Third partial claim - 1/2 of total amount
    {
      // Submit claim
      const claimAmount = amount.div(2);
      const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ic.connect(coverBuyer1).submitClaim(COVER_ID, 0, claimAmount, '', {
        value: deposit.mul('2'),
      });

      const assessmentId = 2;
      const assessmentStakingAmount = parseEther('1000');
      await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

      const ethBalanceBefore = await ethers.provider.getBalance(coverBuyer1.address);

      // redeem payout
      await ic.redeemClaimPayout(assessmentId);

      const ethBalanceAfter = await ethers.provider.getBalance(coverBuyer1.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(claimAmount).add(deposit));

      const { payoutRedeemed } = await ic.claims(assessmentId);
      expect(payoutRedeemed).to.be.equal(true);
    }
  });

  it('correctly calculates premium in cover edit after a claim', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { p1, ic, cover, stakingPool1, as } = this.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = daysToSeconds(60); // 60 days
    const gracePeriod = daysToSeconds(30);
    const amount = parseEther('1');

    // Buy Cover
    await buyCover({
      amount,
      productId,
      coverAsset,
      period,
      cover,
      coverBuyer: coverBuyer1,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      priceDenominator,
    });

    const segment = await cover.coverSegments(COVER_ID, 0);
    const previousCoverSegmentAllocation = await cover.coverSegmentAllocations(COVER_ID, 0, 0);

    // Submit partial claim - 1/2 of total amount
    const claimAmount = amount.div(2);

    {
      const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ic.connect(coverBuyer1).submitClaim(COVER_ID, 0, claimAmount, '', {
        value: deposit.mul('2'),
      });

      const assessmentId = 0;
      const assessmentStakingAmount = parseEther('1000');
      await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

      const ethBalanceBefore = await ethers.provider.getBalance(coverBuyer1.address);

      // redeem payout
      await ic.redeemClaimPayout(assessmentId);

      const ethBalanceAfter = await ethers.provider.getBalance(coverBuyer1.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(claimAmount).add(deposit));

      const { payoutRedeemed } = await ic.claims(assessmentId);
      expect(payoutRedeemed).to.be.equal(true);
    }

    const latestBlock = await ethers.provider.getBlock('latest');

    const editTimestamp = BigNumber.from(latestBlock.timestamp).add(1);
    const passedPeriod = editTimestamp.sub(segment.start);
    const remainingPeriod = BigNumber.from(segment.period).sub(passedPeriod);

    const coverSegmentAllocation = await cover.coverSegmentAllocations(COVER_ID, 0, 0);

    const ethTokenPrice = await p1.getTokenPriceInAsset(0);

    const expectedPremium = BigNumber.from(previousCoverSegmentAllocation.premiumInNXM)
      .mul(remainingPeriod)
      .mul(ethTokenPrice)
      .div(segment.period)
      .div(parseEther('1'));

    const refund = BigNumber.from(coverSegmentAllocation.premiumInNXM)
      .mul(remainingPeriod)
      .mul(ethTokenPrice)
      .div(segment.period)
      .div(parseEther('1'));

    const totalEditPremium = expectedPremium.sub(refund);

    const ethBalanceBefore = await ethers.provider.getBalance(coverBuyer1.address);

    await setNextBlockBaseFee('0');
    await setNextBlockTime(editTimestamp.toNumber());

    // Edit Cover - resets amount for the remaining period
    await cover.connect(coverBuyer1).buyCover(
      {
        owner: coverBuyer1.address,
        coverId: COVER_ID,
        productId,
        coverAsset,
        amount,
        period: remainingPeriod,
        maxPremiumInAsset: totalEditPremium,
        paymentAsset: coverAsset,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      { value: totalEditPremium, gasPrice: 0 },
    );

    const ethBalanceAfter = await ethers.provider.getBalance(coverBuyer1.address);

    // should pay for premium to reset amount
    expect(ethBalanceAfter).to.not.be.equal(ethBalanceBefore);
    expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.sub(totalEditPremium));
  });

  it('correctly updates pool allocation after claim and cover edit', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { ic, cover, stakingPool1, as } = this.contracts;
    const [coverBuyer1, staker2] = this.accounts.members;

    const NXM_PER_ALLOCATION_UNIT = await stakingPool1.NXM_PER_ALLOCATION_UNIT();

    // Move to the beginning of the next tranche
    const currentTrancheId = await moveTimeToNextTranche(1);

    // Cover inputs
    const productId = 0;
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = daysToSeconds(60); // 60 days
    const amount = parseEther('1');

    const allocationId = await stakingPool1.getNextAllocationId();
    const lastBlock = await ethers.provider.getBlock('latest');
    const targetBucketId = Math.ceil((lastBlock.timestamp + period) / BUCKET_DURATION);
    const groupId = Math.floor(currentTrancheId / BUCKET_TRANCHE_GROUP_SIZE);
    const currentTrancheIndexInGroup = currentTrancheId % BUCKET_TRANCHE_GROUP_SIZE;

    {
      const activeAllocations = await stakingPool1.getActiveAllocations(productId);
      expect(activeAllocations[0]).to.equal(0);

      const coverTrancheAllocations = await stakingPool1.coverTrancheAllocations(allocationId);
      expect(coverTrancheAllocations).to.equal(0);

      const expiringCoverBuckets = await stakingPool1.expiringCoverBuckets(productId, targetBucketId, groupId);
      expect(expiringCoverBuckets).to.equal(0);
    }

    // Buy Cover
    await buyCover({
      amount,
      productId,
      coverAsset,
      period,
      cover,
      coverBuyer: coverBuyer1,
      targetPrice: DEFAULT_PRODUCTS[0].targetPrice,
      priceDenominator,
    });

    const firstSegment = 0;
    const preBurnCoverAllocation = await cover.coverSegmentAllocations(COVER_ID, firstSegment, 0);

    {
      const activeAllocationsArray = await stakingPool1.getActiveAllocations(productId);
      const activeAllocations = activeAllocationsArray.reduce((acc, val) => acc.add(val), BigNumber.from(0));

      expect(activeAllocations).to.equal(preBurnCoverAllocation.coverAmountInNXM.div(NXM_PER_ALLOCATION_UNIT));

      const coverTrancheAllocations = await stakingPool1.coverTrancheAllocations(allocationId);
      // TODO: this is returning 0
      expect(coverTrancheAllocations.and(MaxUint32)).to.equal(
        preBurnCoverAllocation.coverAmountInNXM.div(NXM_PER_ALLOCATION_UNIT),
      );

      const expiringCoverBuckets = await stakingPool1.expiringCoverBuckets(productId, targetBucketId, groupId);
      expect(expiringCoverBuckets.shr(currentTrancheIndexInGroup * EXPIRING_ALLOCATION_DATA_GROUP_SIZE)).to.equal(
        preBurnCoverAllocation.coverAmountInNXM.div(NXM_PER_ALLOCATION_UNIT),
      );
    }

    // Submit partial claim - 1/2 of total amount
    const claimAmount = amount.div(2);

    {
      const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ic.connect(coverBuyer1).submitClaim(COVER_ID, 0, claimAmount, '', {
        value: deposit.mul('2'),
      });

      const assessmentId = 0;
      const assessmentStakingAmount = parseEther('1000');
      await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

      const ethBalanceBefore = await ethers.provider.getBalance(coverBuyer1.address);

      // redeem payout
      await ic.redeemClaimPayout(assessmentId);

      const ethBalanceAfter = await ethers.provider.getBalance(coverBuyer1.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(claimAmount).add(deposit));

      const { payoutRedeemed } = await ic.claims(assessmentId);
      expect(payoutRedeemed).to.be.equal(true);

      const coverAllocation = await cover.coverSegmentAllocations(COVER_ID, firstSegment, 0);
      const activeAllocations = await stakingPool1.getActiveAllocations(productId);
      expect(activeAllocations[0]).to.equal(
        preBurnCoverAllocation.coverAmountInNXM.div(2).div(NXM_PER_ALLOCATION_UNIT).add(1),
      );
      expect(activeAllocations[0]).to.equal(coverAllocation.coverAmountInNXM.div(NXM_PER_ALLOCATION_UNIT).add(1));

      const coverTrancheAllocations = await stakingPool1.coverTrancheAllocations(allocationId);
      expect(coverTrancheAllocations.and(MaxUint32)).to.equal(
        coverAllocation.coverAmountInNXM.div(NXM_PER_ALLOCATION_UNIT).add(1),
      );

      const expiringCoverBuckets = await stakingPool1.expiringCoverBuckets(productId, targetBucketId, groupId);
      expect(expiringCoverBuckets.shr(currentTrancheIndexInGroup * EXPIRING_ALLOCATION_DATA_GROUP_SIZE)).to.equal(
        coverAllocation.coverAmountInNXM.div(NXM_PER_ALLOCATION_UNIT).add(1),
      );
    }

    const segment = await cover.coverSegments(COVER_ID, 0);
    const latestBlock = await ethers.provider.getBlock('latest');

    const editTimestamp = BigNumber.from(latestBlock.timestamp).add(1);
    const passedPeriod = editTimestamp.sub(segment.start);
    const remainingPeriod = BigNumber.from(segment.period).sub(passedPeriod);

    const expectedPremium = amount
      .mul(DEFAULT_PRODUCTS[0].targetPrice)
      .div(priceDenominator)
      .mul(period)
      .div(MAX_COVER_PERIOD);

    const coverAmountLeft = amount.sub(claimAmount);
    const refund = coverAmountLeft
      .mul(DEFAULT_PRODUCTS[0].targetPrice)
      .mul(BigNumber.from(segment.period).sub(passedPeriod))
      .div(MAX_COVER_PERIOD)
      .div(priceDenominator);
    const totalEditPremium = expectedPremium.sub(refund);

    // Edit Cover - resets amount for the remaining period
    await cover.connect(coverBuyer1).buyCover(
      {
        owner: coverBuyer1.address,
        coverId: COVER_ID,
        productId,
        coverAsset,
        amount,
        period: remainingPeriod,
        maxPremiumInAsset: totalEditPremium,
        paymentAsset: coverAsset,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      { value: totalEditPremium },
    );

    {
      const secondSegment = 1;
      const coverAllocation = await cover.coverSegmentAllocations(COVER_ID, secondSegment, 0);
      expect(coverAllocation.coverAmountInNXM).to.equal(preBurnCoverAllocation.coverAmountInNXM);

      const activeAllocations = await stakingPool1.getActiveAllocations(productId);
      expect(activeAllocations[0]).to.equal(coverAllocation.coverAmountInNXM.div(NXM_PER_ALLOCATION_UNIT));

      const coverTrancheAllocations = await stakingPool1.coverTrancheAllocations(allocationId);
      expect(coverTrancheAllocations.and(MaxUint32)).to.equal(
        coverAllocation.coverAmountInNXM.div(NXM_PER_ALLOCATION_UNIT),
      );

      const expiringCoverBuckets = await stakingPool1.expiringCoverBuckets(productId, targetBucketId, groupId);
      expect(expiringCoverBuckets.shr(currentTrancheIndexInGroup * EXPIRING_ALLOCATION_DATA_GROUP_SIZE)).to.equal(
        coverAllocation.coverAmountInNXM.div(NXM_PER_ALLOCATION_UNIT),
      );
    }
  });

  it('should buy cover, wait 30 days, edit cover, then claim immediately', async function () {
    const { cover, stakingPool1, ic, as } = this.contracts;

    // Test inputs
    const period = daysToSeconds(60); // 60 days
    const amount = parseEther('10');
    const claimAmount = parseEther('4');
    const decreasedAmount = parseEther('2');

    // Buy Cover
    await buyCoverSimple({ cover, period, amount });

    // Move halfway through cover
    await timeTravel({ stakingPool: stakingPool1, seconds: period / 2 });

    // Edit cover - decrease amount
    await buyCoverSimple({ cover, amount: decreasedAmount });

    const segmentBeforeClaim = await cover.coverSegments(COVER_ID, 0);

    // Submit Claim
    await submitClaimSimple({ ic, as, claimAmount, period });

    {
      // check amountPaidOut
      const coverData = await cover.coverData(COVER_ID);
      expect(coverData.amountPaidOut).to.equal(claimAmount);

      // check segment amounts
      const segment = await cover.coverSegments(COVER_ID, 0);
      expect(segment.amount).to.equal(segmentBeforeClaim.amount.sub(claimAmount));
      const segmentTwo = await cover.coverSegments(COVER_ID, 1);
      expect(segmentTwo.amount).to.equal(0);

      // check allocations
      const activeAllocations = await stakingPool1.getActiveAllocations(productId);
      expect(activeAllocations[0]).to.equal(0);
      const coverTrancheAllocations = await stakingPool1.coverTrancheAllocations(this.allocationId);
      expect(coverTrancheAllocations).to.equal(0);

      const { timestamp } = await ethers.provider.getBlock('latest');
      expect(await getExpiringCoverBucketsAtTimestamp({ stakingPool: stakingPool1, timestamp })).to.equal(0);
    }
  });

  it('should buy cover then edit cover and claim immediately', async function () {
    const { cover, stakingPool1, ic, as } = this.contracts;

    // Test inputs
    const period = daysToSeconds(60); // 60 days
    const amount = parseEther('10');
    const claimAmount = parseEther('4');
    const decreasedAmount = parseEther('2');

    // Buy Cover
    await buyCoverSimple({ cover, period, amount });

    // Edit cover - decrease amount
    await buyCoverSimple({ cover, amount: decreasedAmount });

    const segmentBeforeClaim = await cover.coverSegments(COVER_ID, 0);

    // Submit Claim
    await submitClaimSimple({ ic, as, claimAmount, period });

    {
      // check amountPaidOut
      const coverData = await cover.coverData(COVER_ID);
      expect(coverData.amountPaidOut).to.equal(claimAmount);

      // check segment amounts
      const segment = await cover.coverSegments(COVER_ID, 0);
      expect(segment.amount).to.equal(segmentBeforeClaim.amount.sub(claimAmount));
      const segmentTwo = await cover.coverSegments(COVER_ID, 1);
      expect(segmentTwo.amount).to.equal(0);

      // check allocations
      const activeAllocations = await stakingPool1.getActiveAllocations(productId);
      expect(activeAllocations[0]).to.equal(0);
      const coverTrancheAllocations = await stakingPool1.coverTrancheAllocations(this.allocationId);
      expect(coverTrancheAllocations).to.equal(0);

      const { timestamp } = await ethers.provider.getBlock('latest');
      expect(await getExpiringCoverBucketsAtTimestamp({ stakingPool: stakingPool1, timestamp })).to.equal(0);
    }
  });

  it('should buy cover then edit cover to increase amount, then claim twice', async function () {
    const { cover, stakingPool1, ic, as } = this.contracts;

    // Test inputs
    const period = daysToSeconds(60); // 60 days
    const amount = parseEther('10');
    const claimAmount = parseEther('4');
    const decreasedAmount = parseEther('2');

    // Buy Cover
    await buyCoverSimple({ cover, period, amount });

    // Edit cover - decrease amount
    await buyCoverSimple({ cover, amount: decreasedAmount });

    const segmentBeforeClaim = await cover.coverSegments(COVER_ID, 0);

    // Submit Claim
    await submitClaimSimple({ ic, as, claimAmount: claimAmount.div(2), period });

    await submitClaimSimple({ ic, as, claimAmount: claimAmount.div(2), period });

    {
      // check amountPaidOut
      const coverData = await cover.coverData(COVER_ID);
      expect(coverData.amountPaidOut).to.equal(claimAmount);

      // check segment amounts
      const segment = await cover.coverSegments(COVER_ID, 0);
      expect(segment.amount).to.equal(segmentBeforeClaim.amount.sub(claimAmount));
      const segmentTwo = await cover.coverSegments(COVER_ID, 1);
      expect(segmentTwo.amount).to.equal(0);

      // check allocations
      const activeAllocations = await stakingPool1.getActiveAllocations(productId);
      expect(activeAllocations[0]).to.equal(0);
      const coverTrancheAllocations = await stakingPool1.coverTrancheAllocations(this.allocationId);
      expect(coverTrancheAllocations).to.equal(0);

      const { timestamp } = await ethers.provider.getBlock('latest');
      expect(await getExpiringCoverBucketsAtTimestamp({ stakingPool: stakingPool1, timestamp })).to.equal(0);
    }
  });

  // commented ones are already implemented
  // it('should buy cover, wait 30 days, edit cover, then claim immediately', async function () {
  // it('should buy cover, edit cover immediately and then claim immediately', async function () {
  // it('should buy cover then edit cover to increase amount, then claim twice', async function () {});
  it('should buy then edit cover 1 bucket later, then claim', async function () {});
  it('should buy then edit cover to increase amount, then claim on previous segment', async function () {});
  it('should buy cover, wait 30 days, edit cover, wait 30 days, then claim', async function () {});
  it('should buy cover, wait 30 days, edit cover, wait until the cover expiration is processed, then claim', async function () {});

  it('should buy 10 ETH cover, edit cover to 2ETH, claim 4ETH, edit cover again to 2ETH', async function () {
    // TODO: test whether final amount is 2ETH ... maybe should finalize cover and prevent last edit
  });
});

const { ethers } = require('hardhat');
const { expect } = require('chai');

const { stake, stakeOnly } = require('../utils/staking');
const { rejectClaim, acceptClaim } = require('../utils/voteClaim');
const { buyCover, transferCoverAsset, ETH_ASSET_ID, DAI_ASSET_ID, USDC_ASSET_ID } = require('../utils/cover');

const { daysToSeconds } = require('../../../lib/helpers');
const { mineNextBlock, increaseTime, setNextBlockTime, setNextBlockBaseFee } = require('../../utils/evm');
const { BUCKET_DURATION, moveTimeToNextTranche } = require('../../unit/StakingPool/helpers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('../setup');
const { calculateEditPremium } = require('../utils/cover');

const { BigNumber } = ethers;
const { parseEther, parseUnits } = ethers.utils;
const { AddressZero, Two } = ethers.constants;

const MaxUint32 = Two.pow(32).sub(1);
const BUCKET_TRANCHE_GROUP_SIZE = 8;
const EXPIRING_ALLOCATION_DATA_GROUP_SIZE = 32;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

const priceDenominator = '10000';

async function submitClaimSetup() {
  const fixture = await loadFixture(setup);
  const { tk, p1: pool } = fixture.contracts;
  const members = fixture.accounts.members.slice(0, 5);
  const amount = parseEther('10000');

  for (const member of members) {
    await tk.connect(fixture.accounts.defaultSender).transfer(member.address, amount);
  }

  fixture.ethRate = await pool.getTokenPriceInAsset(0);

  return fixture;
}

describe('submitClaim', function () {
  it('submits ETH claim and approves claim', async function () {
    const fixture = await loadFixture(submitClaimSetup);
    const { DEFAULT_PRODUCTS } = fixture;
    const { ci, cover, stakingPool1, as } = fixture.contracts;
    const [coverBuyer1, staker1, staker2] = fixture.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool1, staker: staker1, gracePeriod, period, productId });

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
    const coverId = 1;
    const claimAmount = amount;
    const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ci.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
      value: deposit.mul('2'),
    });

    const assessmentId = 0;
    const assessmentStakingAmount = parseEther('1000');
    await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

    const ethBalanceBefore = await ethers.provider.getBalance(coverBuyer1.address);

    // redeem payout
    await ci.redeemClaimPayout(assessmentId);

    const ethBalanceAfter = await ethers.provider.getBalance(coverBuyer1.address);
    expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(claimAmount).add(deposit));

    const { payoutRedeemed } = await ci.claims(assessmentId);
    expect(payoutRedeemed).to.be.equal(true);
  });

  it('submits partial ETH claim and approves claim', async function () {
    const fixture = await loadFixture(submitClaimSetup);
    const { DEFAULT_PRODUCTS } = fixture;
    const { ci, cover, stakingPool1, as } = fixture.contracts;
    const [coverBuyer1, staker1, staker2] = fixture.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool1, staker: staker1, gracePeriod, period, productId });

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

    const coverId = 1;

    // Submit partial claim - 1/2 of total amount
    const claimAmount = amount.div(2);
    const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ci.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
      value: deposit.mul('2'),
    });

    const assessmentId = 0;
    const assessmentStakingAmount = parseEther('1000');
    await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

    const ethBalanceBefore = await ethers.provider.getBalance(coverBuyer1.address);

    // redeem payout
    await ci.redeemClaimPayout(assessmentId);

    const ethBalanceAfter = await ethers.provider.getBalance(coverBuyer1.address);
    expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(claimAmount).add(deposit));

    const { payoutRedeemed } = await ci.claims(assessmentId);
    expect(payoutRedeemed).to.be.equal(true);
  });

  it('submits ETH claim and rejects claim', async function () {
    const fixture = await loadFixture(submitClaimSetup);
    const { DEFAULT_PRODUCTS } = fixture;
    const { ci, cover, stakingPool1, as } = fixture.contracts;
    const [coverBuyer1, staker1, staker2, staker3] = fixture.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool1, staker: staker1, gracePeriod, period, productId });

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
    const coverId = 1;
    const claimAmount = amount;
    const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ci.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
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
    await expect(ci.redeemClaimPayout(assessmentId)).to.be.revertedWith('The claim needs to be accepted');
    const { payoutRedeemed } = await ci.claims(assessmentId);
    expect(payoutRedeemed).to.be.equal(false);
  });

  it('submits partial ETH claim and rejects claim', async function () {
    const fixture = await loadFixture(submitClaimSetup);
    const { DEFAULT_PRODUCTS } = fixture;
    const { ci, cover, stakingPool1, as } = fixture.contracts;
    const [coverBuyer1, staker1, staker2, staker3] = fixture.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool1, staker: staker1, gracePeriod, period, productId });

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
    const coverId = 1;
    const claimAmount = amount.div(2);
    const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ci.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
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
    await expect(ci.redeemClaimPayout(assessmentId)).to.be.revertedWith('The claim needs to be accepted');
    const { payoutRedeemed } = await ci.claims(assessmentId);
    expect(payoutRedeemed).to.be.equal(false);
  });

  it('submits DAI claim and approves claim', async function () {
    const fixture = await loadFixture(submitClaimSetup);
    const { DEFAULT_PRODUCTS } = fixture;
    const { ci, cover, stakingPool1, as, dai } = fixture.contracts;
    const [coverBuyer1, staker1, staker2] = fixture.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = DAI_ASSET_ID; // DAI
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool1, staker: staker1, gracePeriod, period, productId });

    // cover buyer gets cover asset
    await transferCoverAsset({
      tokenOwner: fixture.accounts.defaultSender,
      coverBuyer: coverBuyer1,
      asset: dai,
      cover,
    });

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
    const coverId = 1;
    const claimAmount = amount;
    const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ci.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
      value: deposit.mul('2'),
    });

    const assessmentId = 0;
    const assessmentStakingAmount = parseEther('1000');
    await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

    const daiBalanceBefore = await dai.balanceOf(coverBuyer1.address);

    await ci.redeemClaimPayout(assessmentId);

    const daiBalanceAfter = await dai.balanceOf(coverBuyer1.address);
    expect(daiBalanceAfter).to.be.equal(daiBalanceBefore.add(claimAmount));

    const { payoutRedeemed } = await ci.claims(assessmentId);
    expect(payoutRedeemed).to.be.equal(true);
  });

  it('submits partial DAI claim and approves claim', async function () {
    const fixture = await loadFixture(submitClaimSetup);
    const { DEFAULT_PRODUCTS } = fixture;
    const { ci, cover, stakingPool1, as, dai } = fixture.contracts;
    const [coverBuyer1, staker1, staker2] = fixture.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = DAI_ASSET_ID; // DAI
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool1, staker: staker1, gracePeriod, period, productId });

    // cover buyer gets cover asset
    await transferCoverAsset({
      tokenOwner: fixture.accounts.defaultSender,
      coverBuyer: coverBuyer1,
      asset: dai,
      cover,
    });

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
    const coverId = 1;
    const claimAmount = amount.div(2);
    const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ci.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
      value: deposit.mul('2'),
    });

    const assessmentId = 0;
    const assessmentStakingAmount = parseEther('1000');
    await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

    const daiBalanceBefore = await dai.balanceOf(coverBuyer1.address);

    await ci.redeemClaimPayout(assessmentId);

    const daiBalanceAfter = await dai.balanceOf(coverBuyer1.address);
    expect(daiBalanceAfter).to.be.equal(daiBalanceBefore.add(claimAmount));

    const { payoutRedeemed } = await ci.claims(assessmentId);
    expect(payoutRedeemed).to.be.equal(true);
  });

  it('submits DAI claim and rejects claim', async function () {
    const fixture = await loadFixture(submitClaimSetup);
    const { DEFAULT_PRODUCTS } = fixture;
    const { ci, cover, stakingPool1, as, dai } = fixture.contracts;
    const [coverBuyer1, staker1, staker2, staker3] = fixture.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = DAI_ASSET_ID; // DAI
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool1, staker: staker1, gracePeriod, period, productId });

    // cover buyer gets cover asset
    await transferCoverAsset({
      tokenOwner: fixture.accounts.defaultSender,
      coverBuyer: coverBuyer1,
      asset: dai,
      cover,
    });

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
    const coverId = 1;
    const claimAmount = amount;
    const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ci.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
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
    await expect(ci.redeemClaimPayout(assessmentId)).to.be.revertedWith('The claim needs to be accepted');
    const { payoutRedeemed } = await ci.claims(assessmentId);
    expect(payoutRedeemed).to.be.equal(false);
  });

  it('submits partial DAI claim and rejects claim', async function () {
    const fixture = await loadFixture(submitClaimSetup);
    const { DEFAULT_PRODUCTS } = fixture;
    const { ci, cover, stakingPool1, as, dai } = fixture.contracts;
    const [coverBuyer1, staker1, staker2, staker3] = fixture.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = DAI_ASSET_ID; // DAI
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool1, staker: staker1, gracePeriod, period, productId });

    // cover buyer gets cover asset
    await transferCoverAsset({
      tokenOwner: fixture.accounts.defaultSender,
      coverBuyer: coverBuyer1,
      asset: dai,
      cover,
    });

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
    const coverId = 1;
    const claimAmount = amount.div(2);
    const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ci.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
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
    await expect(ci.redeemClaimPayout(assessmentId)).to.be.revertedWith('The claim needs to be accepted');
    const { payoutRedeemed } = await ci.claims(assessmentId);
    expect(payoutRedeemed).to.be.equal(false);
  });

  it('submits USDC claim and approves claim (token with 6 decimals)', async function () {
    const fixture = await loadFixture(submitClaimSetup);
    const { DEFAULT_PRODUCTS } = fixture;
    const { ci, cover, stakingPool1, as, usdc } = fixture.contracts;
    const [coverBuyer1, staker1, staker2] = fixture.accounts.members;

    const usdcDecimals = 6;

    // Cover inputs
    const productId = 6;
    const coverAsset = USDC_ASSET_ID; // USDC
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseUnits('10', usdcDecimals);

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool1, staker: staker1, gracePeriod, period, productId });

    // cover buyer gets cover asset
    await transferCoverAsset({
      tokenOwner: fixture.accounts.defaultSender,
      coverBuyer: coverBuyer1,
      asset: usdc,
      cover,
    });

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
    const coverId = 1;
    const claimAmount = amount;
    const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ci.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
      value: deposit.mul('2'),
    });

    const assessmentId = 0;
    const assessmentStakingAmount = parseEther('1000');
    await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

    const usdcBalanceBefore = await usdc.balanceOf(coverBuyer1.address);

    await ci.redeemClaimPayout(assessmentId);

    const usdcBalanceAfter = await usdc.balanceOf(coverBuyer1.address);
    expect(usdcBalanceAfter).to.be.equal(usdcBalanceBefore.add(claimAmount));

    const { payoutRedeemed } = await ci.claims(assessmentId);
    expect(payoutRedeemed).to.be.equal(true);
  });

  it('submits partial USDC claim and approves claim', async function () {
    const fixture = await loadFixture(submitClaimSetup);
    const { DEFAULT_PRODUCTS } = fixture;
    const { ci, cover, stakingPool1, as, usdc } = fixture.contracts;
    const [coverBuyer1, staker1, staker2] = fixture.accounts.members;

    const usdcDecimals = 6;

    // Cover inputs
    const productId = 6;
    const coverAsset = USDC_ASSET_ID; // USDC
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseUnits('10', usdcDecimals);

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool1, staker: staker1, gracePeriod, period, productId });

    // cover buyer gets cover asset
    await transferCoverAsset({
      tokenOwner: fixture.accounts.defaultSender,
      coverBuyer: coverBuyer1,
      asset: usdc,
      cover,
    });

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
    const coverId = 1;
    const claimAmount = amount.div(2);
    const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ci.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
      value: deposit.mul('2'),
    });

    const assessmentId = 0;
    const assessmentStakingAmount = parseEther('1000');
    await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

    const usdcBalanceBefore = await usdc.balanceOf(coverBuyer1.address);

    await ci.redeemClaimPayout(assessmentId);

    const usdcBalanceAfter = await usdc.balanceOf(coverBuyer1.address);
    expect(usdcBalanceAfter).to.be.equal(usdcBalanceBefore.add(claimAmount));

    const { payoutRedeemed } = await ci.claims(assessmentId);
    expect(payoutRedeemed).to.be.equal(true);
  });

  it('submits partial USDC claim and rejects claim', async function () {
    const fixture = await loadFixture(submitClaimSetup);
    const { DEFAULT_PRODUCTS } = fixture;
    const { ci, cover, stakingPool1, as, usdc } = fixture.contracts;
    const [coverBuyer1, staker1, staker2, staker3] = fixture.accounts.members;

    const usdcDecimals = 6;

    // Cover inputs
    const productId = 6;
    const coverAsset = USDC_ASSET_ID; // USDC
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseUnits('10', usdcDecimals);

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool1, staker: staker1, gracePeriod, period, productId });

    // cover buyer gets cover asset
    await transferCoverAsset({
      tokenOwner: fixture.accounts.defaultSender,
      coverBuyer: coverBuyer1,
      asset: usdc,
      cover,
    });

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
    const coverId = 1;
    const claimAmount = amount.div(2);
    const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ci.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
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
    await expect(ci.redeemClaimPayout(assessmentId)).to.be.revertedWith('The claim needs to be accepted');
    const { payoutRedeemed } = await ci.claims(assessmentId);
    expect(payoutRedeemed).to.be.equal(false);
  });

  it('multiple partial ETH claims approved on the same cover', async function () {
    const fixture = await loadFixture(submitClaimSetup);
    const { DEFAULT_PRODUCTS } = fixture;
    const { ci, cover, stakingPool1, as } = fixture.contracts;
    const [coverBuyer1, staker1, staker2] = fixture.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 80; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool1, staker: staker1, gracePeriod, period, productId });

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

    const coverId = 1;

    // Submit First partial claim - 1/2 of total amount
    {
      const claimAmount = amount.div(2);
      const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ci.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
        value: deposit.mul('2'),
      });

      const assessmentId = 0;
      const assessmentStakingAmount = parseEther('1000');
      await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

      const ethBalanceBefore = await ethers.provider.getBalance(coverBuyer1.address);

      // redeem payout
      await ci.redeemClaimPayout(assessmentId);

      const ethBalanceAfter = await ethers.provider.getBalance(coverBuyer1.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(claimAmount).add(deposit));

      const { payoutRedeemed } = await ci.claims(assessmentId);
      expect(payoutRedeemed).to.be.equal(true);

      const { poll } = await as.assessments(assessmentId);
      const { payoutCooldownInDays } = await as.config();
      const { payoutRedemptionPeriodInDays } = await ci.config();
      const endPayoutTime =
        poll.end + daysToSeconds(payoutCooldownInDays) + daysToSeconds(payoutRedemptionPeriodInDays);

      await setTime(endPayoutTime);
    }

    // Submit Second partial claim - 1/4 of total amount
    {
      // Submit claim
      const claimAmount = amount.div(4);
      const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ci.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
        value: deposit.mul('2'),
      });

      const assessmentId = 1;
      const assessmentStakingAmount = parseEther('1000');
      await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

      const ethBalanceBefore = await ethers.provider.getBalance(coverBuyer1.address);

      // redeem payout
      await ci.redeemClaimPayout(assessmentId);

      const ethBalanceAfter = await ethers.provider.getBalance(coverBuyer1.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(claimAmount).add(deposit));

      const { payoutRedeemed } = await ci.claims(assessmentId);
      expect(payoutRedeemed).to.be.equal(true);

      const { poll } = await as.assessments(assessmentId);
      const { payoutCooldownInDays } = await as.config();
      const { payoutRedemptionPeriodInDays } = await ci.config();
      const endPayoutTime =
        poll.end + daysToSeconds(payoutCooldownInDays) + daysToSeconds(payoutRedemptionPeriodInDays);

      await setTime(endPayoutTime);
    }

    // Submit Third partial claim - 1/4 of total amount
    {
      // Submit claim
      const claimAmount = amount.div(4);
      const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ci.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
        value: deposit.mul('2'),
      });

      const assessmentId = 2;
      const assessmentStakingAmount = parseEther('1000');
      await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

      const ethBalanceBefore = await ethers.provider.getBalance(coverBuyer1.address);

      // redeem payout
      await ci.redeemClaimPayout(assessmentId);

      const ethBalanceAfter = await ethers.provider.getBalance(coverBuyer1.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(claimAmount).add(deposit));

      const { payoutRedeemed } = await ci.claims(assessmentId);
      expect(payoutRedeemed).to.be.equal(true);
    }
  });

  it('multiple partial DAI claims approved on the same cover', async function () {
    const fixture = await loadFixture(submitClaimSetup);
    const { DEFAULT_PRODUCTS } = fixture;
    const { ci, cover, stakingPool1, as, dai } = fixture.contracts;
    const [coverBuyer1, staker1, staker2] = fixture.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = DAI_ASSET_ID; // DAI
    const period = 3600 * 24 * 90; // 90 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool1, staker: staker1, gracePeriod, period, productId });

    // cover buyer gets cover asset
    await transferCoverAsset({
      tokenOwner: fixture.accounts.defaultSender,
      coverBuyer: coverBuyer1,
      asset: dai,
      cover,
    });

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
      const coverId = 1;
      const claimAmount = amount.div(2);
      const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ci.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
        value: deposit.mul('2'),
      });

      const assessmentId = 0;
      const assessmentStakingAmount = parseEther('1000');
      await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

      const daiBalanceBefore = await dai.balanceOf(coverBuyer1.address);

      await ci.redeemClaimPayout(assessmentId);

      const daiBalanceAfter = await dai.balanceOf(coverBuyer1.address);
      expect(daiBalanceAfter).to.be.equal(daiBalanceBefore.add(claimAmount));

      const { payoutRedeemed } = await ci.claims(assessmentId);
      expect(payoutRedeemed).to.be.equal(true);

      const { poll } = await as.assessments(assessmentId);
      const { payoutCooldownInDays } = await as.config();
      const { payoutRedemptionPeriodInDays } = await ci.config();
      const endPayoutTime =
        poll.end + daysToSeconds(payoutCooldownInDays) + daysToSeconds(payoutRedemptionPeriodInDays);

      await setTime(endPayoutTime);
    }

    // Submit Second partial claim - 1/4 of total amount
    {
      const coverId = 1;
      const claimAmount = amount.div(4);
      const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ci.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
        value: deposit.mul('2'),
      });

      const assessmentId = 1;
      const assessmentStakingAmount = parseEther('1000');
      await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

      const daiBalanceBefore = await dai.balanceOf(coverBuyer1.address);

      await ci.redeemClaimPayout(assessmentId);

      const daiBalanceAfter = await dai.balanceOf(coverBuyer1.address);
      expect(daiBalanceAfter).to.be.equal(daiBalanceBefore.add(claimAmount));

      const { payoutRedeemed } = await ci.claims(assessmentId);
      expect(payoutRedeemed).to.be.equal(true);

      const { poll } = await as.assessments(assessmentId);
      const { payoutCooldownInDays } = await as.config();
      const { payoutRedemptionPeriodInDays } = await ci.config();
      const endPayoutTime =
        poll.end + daysToSeconds(payoutCooldownInDays) + daysToSeconds(payoutRedemptionPeriodInDays);

      await setTime(endPayoutTime);
    }

    // Submit Third partial claim - 1/4 of total amount
    {
      const coverId = 1;
      const claimAmount = amount.div(4);
      const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ci.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
        value: deposit.mul('2'),
      });

      const assessmentId = 2;
      const assessmentStakingAmount = parseEther('1000');
      await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

      const daiBalanceBefore = await dai.balanceOf(coverBuyer1.address);

      await ci.redeemClaimPayout(assessmentId);

      const daiBalanceAfter = await dai.balanceOf(coverBuyer1.address);
      expect(daiBalanceAfter).to.be.equal(daiBalanceBefore.add(claimAmount));

      const { payoutRedeemed } = await ci.claims(assessmentId);
      expect(payoutRedeemed).to.be.equal(true);
    }
  });

  it('multiple partial USDC claims approved on the same cover', async function () {
    const fixture = await loadFixture(submitClaimSetup);
    const { DEFAULT_PRODUCTS } = fixture;
    const { ci, cover, stakingPool1, as, usdc } = fixture.contracts;
    const [coverBuyer1, staker1, staker2] = fixture.accounts.members;

    const usdcDecimals = 6;

    // Cover inputs
    const productId = 6;
    const coverAsset = USDC_ASSET_ID; // USDC
    const period = 3600 * 24 * 90; // 90 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseUnits('10', usdcDecimals);

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool1, staker: staker1, gracePeriod, period, productId });

    // cover buyer gets cover asset
    await transferCoverAsset({
      tokenOwner: fixture.accounts.defaultSender,
      coverBuyer: coverBuyer1,
      asset: usdc,
      cover,
    });

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
      const coverId = 1;
      const claimAmount = amount.div(2);
      const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ci.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
        value: deposit.mul('2'),
      });

      const assessmentId = 0;
      const assessmentStakingAmount = parseEther('1000');
      await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

      const usdcBalanceBefore = await usdc.balanceOf(coverBuyer1.address);

      await ci.redeemClaimPayout(assessmentId);

      const usdcBalanceAfter = await usdc.balanceOf(coverBuyer1.address);
      expect(usdcBalanceAfter).to.be.equal(usdcBalanceBefore.add(claimAmount));

      const { payoutRedeemed } = await ci.claims(assessmentId);
      expect(payoutRedeemed).to.be.equal(true);

      const { poll } = await as.assessments(assessmentId);
      const { payoutCooldownInDays } = await as.config();
      const { payoutRedemptionPeriodInDays } = await ci.config();
      const endPayoutTime =
        poll.end + daysToSeconds(payoutCooldownInDays) + daysToSeconds(payoutRedemptionPeriodInDays);

      await setTime(endPayoutTime);
    }

    // Submit Second partial claim - 1/4 of total amount
    {
      const coverId = 1;
      const claimAmount = amount.div(4);
      const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ci.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
        value: deposit.mul('2'),
      });

      const assessmentId = 1;
      const assessmentStakingAmount = parseEther('1000');
      await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

      const usdcBalanceBefore = await usdc.balanceOf(coverBuyer1.address);

      await ci.redeemClaimPayout(assessmentId);

      const usdcBalanceAfter = await usdc.balanceOf(coverBuyer1.address);
      expect(usdcBalanceAfter).to.be.equal(usdcBalanceBefore.add(claimAmount));

      const { payoutRedeemed } = await ci.claims(assessmentId);
      expect(payoutRedeemed).to.be.equal(true);

      const { poll } = await as.assessments(assessmentId);
      const { payoutCooldownInDays } = await as.config();
      const { payoutRedemptionPeriodInDays } = await ci.config();
      const endPayoutTime =
        poll.end + daysToSeconds(payoutCooldownInDays) + daysToSeconds(payoutRedemptionPeriodInDays);

      await setTime(endPayoutTime);
    }

    // Submit Third partial claim - 1/4 of total amount
    {
      const coverId = 1;
      const claimAmount = amount.div(4);
      const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ci.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
        value: deposit.mul('2'),
      });

      const assessmentId = 2;
      const assessmentStakingAmount = parseEther('1000');
      await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

      const usdcBalanceBefore = await usdc.balanceOf(coverBuyer1.address);

      await ci.redeemClaimPayout(assessmentId);

      const usdcBalanceAfter = await usdc.balanceOf(coverBuyer1.address);
      expect(usdcBalanceAfter).to.be.equal(usdcBalanceBefore.add(claimAmount));

      const { payoutRedeemed } = await ci.claims(assessmentId);
      expect(payoutRedeemed).to.be.equal(true);
    }
  });

  it('multiple partial claims on the same cover with combinations of approved / denied', async function () {
    const fixture = await loadFixture(submitClaimSetup);
    const { DEFAULT_PRODUCTS } = fixture;
    const { ci, cover, stakingPool1, as } = fixture.contracts;
    const [coverBuyer1, staker1, staker2, staker3] = fixture.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 90; // 90 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool1, staker: staker1, gracePeriod, period, productId });

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

    const coverId = 1;

    // Submit First partial claim - 1/2 of total amount
    {
      const claimAmount = amount.div(2);
      const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ci.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
        value: deposit.mul('2'),
      });

      const assessmentId = 0;
      const assessmentStakingAmount = parseEther('1000');
      await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

      const ethBalanceBefore = await ethers.provider.getBalance(coverBuyer1.address);

      // redeem payout
      await ci.redeemClaimPayout(assessmentId);

      const ethBalanceAfter = await ethers.provider.getBalance(coverBuyer1.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(claimAmount).add(deposit));

      const { payoutRedeemed } = await ci.claims(assessmentId);
      expect(payoutRedeemed).to.be.equal(true);

      const { poll } = await as.assessments(assessmentId);
      const { payoutCooldownInDays } = await as.config();
      const { payoutRedemptionPeriodInDays } = await ci.config();
      const endPayoutTime =
        poll.end + daysToSeconds(payoutCooldownInDays) + daysToSeconds(payoutRedemptionPeriodInDays);

      await setTime(endPayoutTime);
    }

    // FAILED Submit Second partial claim - 1/2 of total amount
    {
      // Submit claim
      const claimAmount = amount.div(2);
      const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ci.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
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
      await expect(ci.redeemClaimPayout(assessmentId)).to.be.revertedWith('The claim needs to be accepted');
      const { payoutRedeemed } = await ci.claims(assessmentId);
      expect(payoutRedeemed).to.be.equal(false);

      const { poll } = await as.assessments(assessmentId);
      const { payoutCooldownInDays } = await as.config();
      const { payoutRedemptionPeriodInDays } = await ci.config();
      const endPayoutTime =
        poll.end + daysToSeconds(payoutCooldownInDays) + daysToSeconds(payoutRedemptionPeriodInDays);

      await setTime(endPayoutTime);
    }

    // Submit Third partial claim - 1/2 of total amount
    {
      // Submit claim
      const claimAmount = amount.div(2);
      const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ci.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
        value: deposit.mul('2'),
      });

      const assessmentId = 2;
      const assessmentStakingAmount = parseEther('1000');
      await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

      const ethBalanceBefore = await ethers.provider.getBalance(coverBuyer1.address);

      // redeem payout
      await ci.redeemClaimPayout(assessmentId);

      const ethBalanceAfter = await ethers.provider.getBalance(coverBuyer1.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(claimAmount).add(deposit));

      const { payoutRedeemed } = await ci.claims(assessmentId);
      expect(payoutRedeemed).to.be.equal(true);
    }
  });

  it('submits claim for edited cover for the last segment', async function () {
    const fixture = await loadFixture(submitClaimSetup);
    const { DEFAULT_PRODUCTS } = fixture;
    const { ci, cover, stakingPool1, as } = fixture.contracts;
    const [coverBuyer, staker1, staker2] = fixture.accounts.members;

    const buyCoverFixture = {
      coverId: 0,
      productId: 0,
      coverAsset: ETH_ASSET_ID, // ETH
      period: 3600 * 24 * 30, // 30 days
      gracePeriod: 3600 * 24 * 30,
      amount: parseEther('1'),
      paymentAsset: ETH_ASSET_ID,
      commissionRatio: parseEther('0'),
      commissionDestination: AddressZero,
      ipfsData: '',
    };
    // Cover inputs
    const productId = 0;
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool1, staker: staker1, gracePeriod, period, productId });

    const expectedPremium = amount.mul(DEFAULT_PRODUCTS[0].targetPrice).div(priceDenominator);

    console.log('EDIT COVER');
    // Buy Cover
    await cover.connect(coverBuyer).buyCover(
      {
        ...buyCoverFixture,
        owner: coverBuyer.address,
        maxPremiumInAsset: expectedPremium,
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      { value: coverAsset === ETH_ASSET_ID ? expectedPremium : 0 },
    );
    const coverId = 1;

    // advance time by 15 days
    await increaseTime(daysToSeconds(15));
    await mineNextBlock();

    const extraPeriod = daysToSeconds(20);

    const increasedAmount = buyCoverFixture.amount.mul(2);

    const editCoverFixture = { ...buyCoverFixture, amount: increasedAmount, coverId, period: extraPeriod };

    const maxPremium = expectedPremium.mul(2);

    await cover.connect(coverBuyer).buyCover(
      {
        ...editCoverFixture,
        owner: coverBuyer.address,
        maxPremiumInAsset: maxPremium,
      },
      [{ poolId: 1, coverAmountInAsset: increasedAmount }],
      { value: maxPremium },
    );

    // Submit partial claim - 1/2 of total amount
    const claimAmount = amount.div(2);
    const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);

    const claimSegment = 1;
    await ci.connect(coverBuyer).submitClaim(coverId, claimSegment, claimAmount, '', {
      value: deposit.mul('2'),
    });

    const assessmentId = 0;
    const assessmentStakingAmount = parseEther('1000');
    await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

    const ethBalanceBefore = await ethers.provider.getBalance(coverBuyer.address);

    // redeem payout
    await ci.redeemClaimPayout(assessmentId);

    const ethBalanceAfter = await ethers.provider.getBalance(coverBuyer.address);
    expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(claimAmount).add(deposit));

    const { payoutRedeemed } = await ci.claims(assessmentId);
    expect(payoutRedeemed).to.be.equal(true);
  });

  it('submits claim for edited cover for the first segment', async function () {
    const fixture = await loadFixture(submitClaimSetup);
    const { DEFAULT_PRODUCTS } = fixture;
    const { ci, cover, stakingPool1, as } = fixture.contracts;
    const [coverBuyer, staker1, staker2] = fixture.accounts.members;

    const buyCoverFixture = {
      coverId: 0,
      productId: 0,
      coverAsset: ETH_ASSET_ID, // ETH
      period: 3600 * 24 * 30, // 30 days
      gracePeriod: 3600 * 24 * 30,
      amount: parseEther('1'),
      paymentAsset: ETH_ASSET_ID,
      commissionRatio: parseEther('0'),
      commissionDestination: AddressZero,
      ipfsData: '',
    };
    // Cover inputs
    const productId = 0;
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool1, staker: staker1, gracePeriod, period, productId });

    const expectedPremium = amount.mul(DEFAULT_PRODUCTS[0].targetPrice).div(priceDenominator);

    // Buy Cover
    await cover.connect(coverBuyer).buyCover(
      {
        ...buyCoverFixture,
        owner: coverBuyer.address,
        maxPremiumInAsset: expectedPremium,
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      { value: coverAsset === ETH_ASSET_ID ? expectedPremium : 0 },
    );
    const coverId = 1;

    // advance time by 15 days
    await increaseTime(daysToSeconds(15));
    await mineNextBlock();

    const extraPeriod = daysToSeconds(20);

    const increasedAmount = buyCoverFixture.amount.mul(2);

    const editCoverFixture = { ...buyCoverFixture, amount: increasedAmount, coverId, period: extraPeriod };

    const maxPremium = expectedPremium.mul(2);

    await cover.connect(coverBuyer).buyCover(
      {
        ...editCoverFixture,
        owner: coverBuyer.address,
        maxPremiumInAsset: maxPremium,
      },
      [{ poolId: 1, coverAmountInAsset: increasedAmount }],
      { value: maxPremium },
    );

    // Submit partial claim - 1/2 of total amount
    const claimAmount = amount.div(2);
    const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);

    const claimSegment = 0;
    await ci.connect(coverBuyer).submitClaim(coverId, claimSegment, claimAmount, '', {
      value: deposit.mul('2'),
    });

    const assessmentId = 0;
    const assessmentStakingAmount = parseEther('1000');
    await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

    const ethBalanceBefore = await ethers.provider.getBalance(coverBuyer.address);

    // redeem payout
    await ci.redeemClaimPayout(assessmentId);

    const ethBalanceAfter = await ethers.provider.getBalance(coverBuyer.address);
    expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(claimAmount).add(deposit));

    const { payoutRedeemed } = await ci.claims(assessmentId);
    expect(payoutRedeemed).to.be.equal(true);
  });

  it('correctly calculates premium in cover edit after a claim', async function () {
    const fixture = await loadFixture(submitClaimSetup);
    const { DEFAULT_PRODUCTS } = fixture;
    const { ci, cover, stakingPool1, as, stakingProducts, p1: pool } = fixture.contracts;
    const [coverBuyer1, staker1, staker2] = fixture.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = daysToSeconds(60); // 60 days
    const gracePeriod = daysToSeconds(30);
    const amount = parseEther('1');

    const NXM_PER_ALLOCATION_UNIT = await stakingPool1.NXM_PER_ALLOCATION_UNIT();

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool1, staker: staker1, gracePeriod, period, productId });
    await stakeOnly({ stakingPool: stakingPool1, staker: staker1, gracePeriod, period, trancheIdOffset: 1 });

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

    const coverId = 1;
    const firstSegment = await cover.coverSegmentWithRemainingAmount(coverId, 0);

    // Submit partial claim - 1/2 of total amount
    const claimAmount = amount.div(2);

    {
      const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ci.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
        value: deposit.mul('2'),
      });

      const assessmentId = 0;
      const assessmentStakingAmount = parseEther('1000');
      await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

      const ethBalanceBefore = await ethers.provider.getBalance(coverBuyer1.address);

      // redeem payout
      await ci.redeemClaimPayout(assessmentId);

      const ethBalanceAfter = await ethers.provider.getBalance(coverBuyer1.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(claimAmount).add(deposit));

      const { payoutRedeemed } = await ci.claims(assessmentId);
      expect(payoutRedeemed).to.be.equal(true);
    }

    const latestBlock = await ethers.provider.getBlock('latest');

    const timestampAtEditTime = BigNumber.from(latestBlock.timestamp);
    const startOfPreviousSegment = firstSegment.start;
    const product = await stakingProducts.getProduct(1, productId);

    const extraPeriod = BigNumber.from('0');

    const newEthRate = await pool.getTokenPriceInAsset(0);

    const { extraPremium } = await calculateEditPremium({
      amount: firstSegment.amount.sub(claimAmount),
      period,
      extraPeriod,
      timestampAtEditTime,
      startOfPreviousSegment,
      increasedAmount: amount,
      ethRate: newEthRate,
      productBumpedPrice: product.bumpedPrice,
      NXM_PER_ALLOCATION_UNIT,
    });

    const ethBalanceBefore = await ethers.provider.getBalance(coverBuyer1.address);

    await setNextBlockBaseFee('0');

    // Edit Cover - resets amount for the remaining period
    await cover.connect(coverBuyer1).buyCover(
      {
        owner: coverBuyer1.address,
        coverId,
        productId,
        coverAsset,
        amount,
        period: extraPeriod,
        maxPremiumInAsset: extraPremium,
        paymentAsset: coverAsset,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      { value: extraPremium, gasPrice: 0 },
    );

    const ethBalanceAfter = await ethers.provider.getBalance(coverBuyer1.address);

    // should pay for premium to reset amount
    expect(ethBalanceAfter).to.not.be.equal(ethBalanceBefore);
    expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.sub(extraPremium));
  });

  it('correctly updates pool allocation after claim and cover edit', async function () {
    const fixture = await loadFixture(submitClaimSetup);
    const { DEFAULT_PRODUCTS, ethRate } = fixture;
    const { ci, cover, stakingPool1, as, stakingProducts } = fixture.contracts;
    const [coverBuyer1, staker1, staker2] = fixture.accounts.members;

    const NXM_PER_ALLOCATION_UNIT = await stakingPool1.NXM_PER_ALLOCATION_UNIT();

    // Move to the beginning of the next tranche
    const currentTrancheId = await moveTimeToNextTranche(1);

    // Cover inputs
    const productId = 0;
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = daysToSeconds(60); // 60 days
    const gracePeriod = daysToSeconds(30);
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool1, staker: staker1, gracePeriod, period, productId });
    await stakeOnly({ stakingPool: stakingPool1, staker: staker1, gracePeriod, period, trancheIdOffset: 1 });

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

    const coverId = 1;
    const firstSegment = 0;
    const preBurnCoverAllocation = await cover.coverSegmentAllocations(coverId, firstSegment, 0);

    {
      const activeAllocations = await stakingPool1.getActiveAllocations(productId);
      expect(activeAllocations[0]).to.equal(preBurnCoverAllocation.coverAmountInNXM.div(NXM_PER_ALLOCATION_UNIT));

      const coverTrancheAllocations = await stakingPool1.coverTrancheAllocations(allocationId);
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
      const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ci.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
        value: deposit.mul('2'),
      });

      const assessmentId = 0;
      const assessmentStakingAmount = parseEther('1000');
      await acceptClaim({ staker: staker2, assessmentStakingAmount, as, assessmentId });

      const ethBalanceBefore = await ethers.provider.getBalance(coverBuyer1.address);

      // redeem payout
      await ci.redeemClaimPayout(assessmentId);

      const ethBalanceAfter = await ethers.provider.getBalance(coverBuyer1.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(claimAmount).add(deposit));

      const { payoutRedeemed } = await ci.claims(assessmentId);
      expect(payoutRedeemed).to.be.equal(true);

      const coverAllocation = await cover.coverSegmentAllocations(coverId, firstSegment, 0);
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
    const segments = await cover.coverSegments(coverId);

    const startOfPreviousSegment = segments[0].start;

    const product = await stakingProducts.getProduct(1, productId);

    const { timestamp: timestampAtEditTime } = await ethers.provider.getBlock('latest');

    const { extraPremium } = await calculateEditPremium({
      amount: amount.sub(claimAmount),
      period,
      extraPeriod: BigNumber.from('0'),
      timestampAtEditTime,
      startOfPreviousSegment,
      increasedAmount: amount,
      ethRate,
      productBumpedPrice: product.bumpedPrice,
      NXM_PER_ALLOCATION_UNIT,
    });

    // Edit Cover - resets amount for the remaining period
    await cover.connect(coverBuyer1).buyCover(
      {
        owner: coverBuyer1.address,
        coverId,
        productId,
        coverAsset,
        amount,
        period: BigNumber.from(0),
        maxPremiumInAsset: extraPremium,
        paymentAsset: coverAsset,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      { value: extraPremium },
    );

    {
      const secondSegment = 1;
      const coverAllocation = await cover.coverSegmentAllocations(coverId, secondSegment, 0);
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
});

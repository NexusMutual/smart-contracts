const { ethers } = require('hardhat');
const { expect } = require('chai');
const { parseEther, parseUnits } = ethers.utils;
const { stake } = require('../utils/staking');
const { rejectClaim, acceptClaim } = require('../utils/voteClaim');
const { buyCover, transferCoverAsset, ETH_ASSET_ID, DAI_ASSET_ID, USDC_ASSET_ID } = require('../utils/cover');

const { daysToSeconds } = require('../../../lib/helpers');
const { mineNextBlock, setNextBlockTime } = require('../../utils/evm');

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

const priceDenominator = '10000';

describe('submitClaim', function () {
  beforeEach(async function () {
    const { tk } = this.contracts;

    const members = this.accounts.members.slice(0, 5);
    const amount = parseEther('10000');
    for (const member of members) {
      await tk.connect(this.accounts.defaultSender).transfer(member.address, amount);
    }
  });

  it('submits ETH claim and approves claim', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { ic, cover, stakingPool0, as } = this.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, gracePeriod, period, productId });

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
    const coverId = 0;
    const claimAmount = amount;
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
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
    const { ic, cover, stakingPool0, as } = this.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, gracePeriod, period, productId });

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

    const coverId = 0;

    // Submit partial claim - 1/2 of total amount
    const claimAmount = amount.div(2);
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
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
    const { ic, cover, stakingPool0, as } = this.contracts;
    const [coverBuyer1, staker1, staker2, staker3] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, gracePeriod, period, productId });

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
    const coverId = 0;
    const claimAmount = amount;
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
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
    const { ic, cover, stakingPool0, as } = this.contracts;
    const [coverBuyer1, staker1, staker2, staker3] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, gracePeriod, period, productId });

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
    const coverId = 0;
    const claimAmount = amount.div(2);
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
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
    const { ic, cover, stakingPool0, as, dai } = this.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = DAI_ASSET_ID; // DAI
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, gracePeriod, period, productId });

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
    const coverId = 0;
    const claimAmount = amount;
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
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
    const { ic, cover, stakingPool0, as, dai } = this.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = DAI_ASSET_ID; // DAI
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, gracePeriod, period, productId });

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
    const coverId = 0;
    const claimAmount = amount.div(2);
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
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
    const { ic, cover, stakingPool0, as, dai } = this.contracts;
    const [coverBuyer1, staker1, staker2, staker3] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = DAI_ASSET_ID; // DAI
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, gracePeriod, period, productId });

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
    const coverId = 0;
    const claimAmount = amount;
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
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
    const { ic, cover, stakingPool0, as, dai } = this.contracts;
    const [coverBuyer1, staker1, staker2, staker3] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = DAI_ASSET_ID; // DAI
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, gracePeriod, period, productId });

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
    const coverId = 0;
    const claimAmount = amount.div(2);
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
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
    const { ic, cover, stakingPool0, as, usdc } = this.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;

    const usdcDecimals = 6;

    // Cover inputs
    const productId = 6;
    const coverAsset = USDC_ASSET_ID; // USDC
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseUnits('10', usdcDecimals);

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, gracePeriod, period, productId });

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
    const coverId = 0;
    const claimAmount = amount;
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
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
    const { ic, cover, stakingPool0, as, usdc } = this.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;

    const usdcDecimals = 6;

    // Cover inputs
    const productId = 6;
    const coverAsset = USDC_ASSET_ID; // USDC
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseUnits('10', usdcDecimals);

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, gracePeriod, period, productId });

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
    const coverId = 0;
    const claimAmount = amount.div(2);
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
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
    const { ic, cover, stakingPool0, as, usdc } = this.contracts;
    const [coverBuyer1, staker1, staker2, staker3] = this.accounts.members;

    const usdcDecimals = 6;

    // Cover inputs
    const productId = 6;
    const coverAsset = USDC_ASSET_ID; // USDC
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseUnits('10', usdcDecimals);

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, gracePeriod, period, productId });

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
    const coverId = 0;
    const claimAmount = amount.div(2);
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
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
    const { ic, cover, stakingPool0, as } = this.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, gracePeriod, period, productId });

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

    const coverId = 0;

    // Submit First partial claim - 1/2 of total amount
    {
      const claimAmount = amount.div(2);
      const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
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
      await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
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
      await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
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
    const { ic, cover, stakingPool0, as, dai } = this.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = DAI_ASSET_ID; // DAI
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, gracePeriod, period, productId });

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
      const coverId = 0;
      const claimAmount = amount.div(2);
      const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
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
      const coverId = 0;
      const claimAmount = amount.div(4);
      const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
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
      const coverId = 0;
      const claimAmount = amount.div(4);
      const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
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
    const { ic, cover, stakingPool0, as, usdc } = this.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;

    const usdcDecimals = 6;

    // Cover inputs
    const productId = 6;
    const coverAsset = USDC_ASSET_ID; // USDC
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseUnits('10', usdcDecimals);

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, gracePeriod, period, productId });

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
      const coverId = 0;
      const claimAmount = amount.div(2);
      const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
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
      const coverId = 0;
      const claimAmount = amount.div(4);
      const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
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
      const coverId = 0;
      const claimAmount = amount.div(4);
      const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
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
    const { ic, cover, stakingPool0, as } = this.contracts;
    const [coverBuyer1, staker1, staker2, staker3] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, gracePeriod, period, productId });

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

    const coverId = 0;

    // Submit First partial claim - 1/2 of total amount
    {
      const claimAmount = amount.div(2);
      const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
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
      await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
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
      await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
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
});

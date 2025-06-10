const { expect } = require('chai');
const { ethers } = require('hardhat');
const { setNextBlockTime, mineNextBlock } = require('../../utils/evm');
const { buyCover, stake } = require('../utils');
const { acceptClaim, rejectClaim } = require('../utils/voteClaim');
const { ETH_ASSET_ID } = require('../../../lib/constants');
const { MAX_COVER_PERIOD } = require('../../unit/Cover/helpers');
const { BUCKET_DURATION, moveTimeToNextTranche } = require('../../unit/StakingPool/helpers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('../setup');

const { parseEther, parseUnits } = ethers;
const { ZeroAddress } = ethers;

const MaxUint32 = BigInt((2n ** 32n) - 1n);
const BUCKET_TRANCHE_GROUP_SIZE = 8;
const EXPIRING_ALLOCATION_DATA_GROUP_SIZE = 32;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

const priceDenominator = '10000';

async function submitClaimSetup() {
  const fixture = await loadFixture(setup);
  const { tk } = fixture.contracts;
  const members = fixture.accounts.members.slice(0, 5);
  const amount = parseEther('10000');

  for (const member of members) {
    await tk.connect(fixture.accounts.defaultSender).transfer(member.address, amount);
  }

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
    await stake({
      contracts: fixture.contracts,
      stakingPool: stakingPool1,
      staker: staker1,
      gracePeriod,
      period,
      productId,
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
    await ci.connect(coverBuyer1).submitClaim(coverId, claimAmount, '', {
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
    await stake({
      contracts: fixture.contracts,
      stakingPool: stakingPool1,
      staker: staker1,
      gracePeriod,
      period,
      productId,
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

    const coverId = 1;

    // Submit partial claim - 1/2 of total amount
    const claimAmount = amount.div(2);
    const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ci.connect(coverBuyer1).submitClaim(coverId, claimAmount, '', {
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
    await stake({
      contracts: fixture.contracts,
      stakingPool: stakingPool1,
      staker: staker1,
      gracePeriod,
      period,
      productId,
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
    await ci.connect(coverBuyer1).submitClaim(coverId, claimAmount, '', {
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
    await expect(ci.redeemClaimPayout(assessmentId)).to.be.revertedWithCustomError(ci, 'ClaimNotAccepted');
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
    await stake({
      contracts: fixture.contracts,
      stakingPool: stakingPool1,
      staker: staker1,
      gracePeriod,
      period,
      productId,
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
    await ci.connect(coverBuyer1).submitClaim(coverId, claimAmount, '', {
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
    await expect(ci.redeemClaimPayout(assessmentId)).to.be.revertedWithCustomError(ci, 'ClaimNotAccepted');
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
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({
      contracts: fixture.contracts,
      stakingPool: stakingPool1,
      staker: staker1,
      gracePeriod,
      period,
      productId,
    });

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
    await ci.connect(coverBuyer1).submitClaim(coverId, claimAmount, '', {
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
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({
      contracts: fixture.contracts,
      stakingPool: stakingPool1,
      staker: staker1,
      gracePeriod,
      period,
      productId,
    });

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
    await ci.connect(coverBuyer1).submitClaim(coverId, claimAmount, '', {
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
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({
      contracts: fixture.contracts,
      stakingPool: stakingPool1,
      staker: staker1,
      gracePeriod,
      period,
      productId,
    });

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
    await ci.connect(coverBuyer1).submitClaim(coverId, claimAmount, '', {
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
    await expect(ci.redeemClaimPayout(assessmentId)).to.be.revertedWithCustomError(ci, 'ClaimNotAccepted');
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
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({
      contracts: fixture.contracts,
      stakingPool: stakingPool1,
      staker: staker1,
      gracePeriod,
      period,
      productId,
    });

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
    await ci.connect(coverBuyer1).submitClaim(coverId, claimAmount, '', {
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
    await expect(ci.redeemClaimPayout(assessmentId)).to.be.revertedWithCustomError(ci, 'ClaimNotAccepted');
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
    const productId = 3;
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseUnits('10', usdcDecimals);

    // Stake to open up capacity
    await stake({
      contracts: fixture.contracts,
      stakingPool: stakingPool1,
      staker: staker1,
      gracePeriod,
      period,
      productId,
    });

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
    await ci.connect(coverBuyer1).submitClaim(coverId, claimAmount, '', {
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
    const productId = 3;
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseUnits('10', usdcDecimals);

    // Stake to open up capacity
    await stake({
      contracts: fixture.contracts,
      stakingPool: stakingPool1,
      staker: staker1,
      gracePeriod,
      period,
      productId,
    });

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
    await ci.connect(coverBuyer1).submitClaim(coverId, claimAmount, '', {
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
    const productId = 3;
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseUnits('10', usdcDecimals);

    // Stake to open up capacity
    await stake({
      contracts: fixture.contracts,
      stakingPool: stakingPool1,
      staker: staker1,
      gracePeriod,
      period,
      productId,
    });

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
    await ci.connect(coverBuyer1).submitClaim(coverId, claimAmount, '', {
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
    await expect(ci.redeemClaimPayout(assessmentId)).to.be.revertedWithCustomError(ci, 'ClaimNotAccepted');
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
    await stake({
      contracts: fixture.contracts,
      stakingPool: stakingPool1,
      staker: staker1,
      gracePeriod,
      period,
      productId,
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

    const coverId = 1;

    // Submit First partial claim - 1/2 of total amount
    {
      const claimAmount = amount.div(2);
      const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ci.connect(coverBuyer1).submitClaim(coverId, claimAmount, '', {
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
      const payoutCooldown = (await as.getPayoutCooldown()).toNumber();
      const payoutRedemptionPeriod = (await ci.getPayoutRedemptionPeriod()).toNumber();
      const endPayoutTime = poll.end + payoutCooldown + payoutRedemptionPeriod;

      await setTime(endPayoutTime);
    }

    // Submit Second partial claim - 1/4 of total amount
    {
      // Submit claim
      const claimAmount = amount.div(4);
      const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ci.connect(coverBuyer1).submitClaim(coverId, claimAmount, '', {
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
      const payoutCooldown = (await as.getPayoutCooldown()).toNumber();
      const payoutRedemptionPeriod = (await ci.getPayoutRedemptionPeriod()).toNumber();
      const endPayoutTime = poll.end + payoutCooldown + payoutRedemptionPeriod;

      await setTime(endPayoutTime);
    }

    // Submit Third partial claim - 1/4 of total amount
    {
      // Submit claim
      const claimAmount = amount.div(4);
      const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ci.connect(coverBuyer1).submitClaim(coverId, claimAmount, '', {
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
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 90; // 90 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({
      contracts: fixture.contracts,
      stakingPool: stakingPool1,
      staker: staker1,
      gracePeriod,
      period,
      productId,
    });

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
      await ci.connect(coverBuyer1).submitClaim(coverId, claimAmount, '', {
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
      const payoutCooldown = (await as.getPayoutCooldown()).toNumber();
      const payoutRedemptionPeriod = (await ci.getPayoutRedemptionPeriod()).toNumber();
      const endPayoutTime = poll.end + payoutCooldown + payoutRedemptionPeriod;

      await setTime(endPayoutTime);
    }

    // Submit Second partial claim - 1/4 of total amount
    {
      const coverId = 1;
      const claimAmount = amount.div(4);
      const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ci.connect(coverBuyer1).submitClaim(coverId, claimAmount, '', {
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
      const payoutCooldown = (await as.getPayoutCooldown()).toNumber();
      const payoutRedemptionPeriod = (await ci.getPayoutRedemptionPeriod()).toNumber();
      const endPayoutTime = poll.end + payoutCooldown + payoutRedemptionPeriod;

      await setTime(endPayoutTime);
    }

    // Submit Third partial claim - 1/4 of total amount
    {
      const coverId = 1;
      const claimAmount = amount.div(4);
      const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ci.connect(coverBuyer1).submitClaim(coverId, claimAmount, '', {
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
    const productId = 3;
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = 3600 * 24 * 90; // 90 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseUnits('10', usdcDecimals);

    // Stake to open up capacity
    await stake({
      contracts: fixture.contracts,
      stakingPool: stakingPool1,
      staker: staker1,
      gracePeriod,
      period,
      productId,
    });

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
      await ci.connect(coverBuyer1).submitClaim(coverId, claimAmount, '', {
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
      const payoutCooldown = (await as.getPayoutCooldown()).toNumber();
      const payoutRedemptionPeriod = (await ci.getPayoutRedemptionPeriod()).toNumber();
      const endPayoutTime = poll.end + payoutCooldown + payoutRedemptionPeriod;

      await setTime(endPayoutTime);
    }

    // Submit Second partial claim - 1/4 of total amount
    {
      const coverId = 1;
      const claimAmount = amount.div(4);
      const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ci.connect(coverBuyer1).submitClaim(coverId, claimAmount, '', {
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
      const payoutCooldown = (await as.getPayoutCooldown()).toNumber();
      const payoutRedemptionPeriod = (await ci.getPayoutRedemptionPeriod()).toNumber();
      const endPayoutTime = poll.end + payoutCooldown + payoutRedemptionPeriod;

      await setTime(endPayoutTime);
    }

    // Submit Third partial claim - 1/4 of total amount
    {
      const coverId = 1;
      const claimAmount = amount.div(4);
      const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ci.connect(coverBuyer1).submitClaim(coverId, claimAmount, '', {
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
    await stake({
      contracts: fixture.contracts,
      stakingPool: stakingPool1,
      staker: staker1,
      gracePeriod,
      period,
      productId,
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

    const coverId = 1;

    // Submit First partial claim - 1/2 of total amount
    {
      const claimAmount = amount.div(2);
      const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ci.connect(coverBuyer1).submitClaim(coverId, claimAmount, '', {
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
      const payoutCooldown = (await as.getPayoutCooldown()).toNumber();
      const payoutRedemptionPeriod = (await ci.getPayoutRedemptionPeriod()).toNumber();
      const endPayoutTime = poll.end + payoutCooldown + payoutRedemptionPeriod;

      await setTime(endPayoutTime);
    }

    // FAILED Submit Second partial claim - 1/2 of total amount
    {
      // Submit claim
      const claimAmount = amount.div(2);
      const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ci.connect(coverBuyer1).submitClaim(coverId, claimAmount, '', {
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
      await expect(ci.redeemClaimPayout(assessmentId)).to.be.revertedWithCustomError(ci, 'ClaimNotAccepted');
      const { payoutRedeemed } = await ci.claims(assessmentId);
      expect(payoutRedeemed).to.be.equal(false);

      const { poll } = await as.assessments(assessmentId);
      const payoutCooldown = (await as.getPayoutCooldown()).toNumber();
      const payoutRedemptionPeriod = (await ci.getPayoutRedemptionPeriod()).toNumber();
      const endPayoutTime = poll.end + payoutCooldown + payoutRedemptionPeriod;

      await setTime(endPayoutTime);
    }

    // Submit Third partial claim - 1/2 of total amount
    {
      // Submit claim
      const claimAmount = amount.div(2);
      const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ci.connect(coverBuyer1).submitClaim(coverId, claimAmount, '', {
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

  it.skip('correctly calculates premium in cover edit after a claim', async function () {
    const fixture = await loadFixture(submitClaimSetup);
    const { DEFAULT_PRODUCTS } = fixture;
    const { p1, ci, cover, stakingPool1, as } = fixture.contracts;
    const [coverBuyer1, staker1, staker2] = fixture.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = ETH_ASSET_ID; // ETH
    const period = daysToSeconds(60); // 60 days
    const gracePeriod = daysToSeconds(30);
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({
      contracts: fixture.contracts,
      stakingPool: stakingPool1,
      staker: staker1,
      gracePeriod,
      period,
      productId,
    });
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
    const segment = await cover.coverSegmentWithRemainingAmount(coverId, 0);
    const previousCoverSegmentAllocation = await cover.coverSegmentAllocations(coverId, 0, 0);

    // Submit partial claim - 1/2 of total amount
    const claimAmount = amount.div(2);

    {
      const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ci.connect(coverBuyer1).submitClaim(coverId, claimAmount, '', {
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

    const editTimestamp = BigInt(latestBlock.timestamp) + 1n;
    const passedPeriod = editTimestamp - segment.start;
    const remainingPeriod = BigInt(segment.period) - passedPeriod;

    const coverSegmentAllocation = await cover.coverSegmentAllocations(coverId, 0, 0);

    const ethTokenPrice = await p1.getInternalTokenPriceInAsset(0);

    const expectedPremium = BigInt(previousCoverSegmentAllocation.premiumInNXM)
      * remainingPeriod
      * ethTokenPrice
      / BigInt(segment.period);

    const refund = BigInt(coverSegmentAllocation.premiumInNXM)
      * remainingPeriod
      * ethTokenPrice
      / BigInt(segment.period);

    const totalEditPremium = expectedPremium - refund;

    const ethBalanceBefore = await ethers.provider.getBalance(coverBuyer1.address);

    await setNextBlockBaseFee('0');
    await setNextBlockTime(Number(editTimestamp));

    // Edit Cover - resets amount for the remaining period
    await cover.connect(coverBuyer1).buyCover(
      {
        owner: coverBuyer1.address,
        coverId,
        productId,
        coverAsset,
        amount,
        period: remainingPeriod,
        maxPremiumInAsset: totalEditPremium,
        paymentAsset: coverAsset,
        commissionRatio: parseEther('0'),
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      { value: totalEditPremium, gasPrice: 0 },
    );

    const ethBalanceAfter = await ethers.provider.getBalance(coverBuyer1.address);

    // should pay for premium to reset amount
    expect(ethBalanceAfter).to.not.be.equal(ethBalanceBefore);
    expect(ethBalanceAfter).to.be.equal(ethBalanceBefore - totalEditPremium);
  });

  it.skip('correctly updates pool allocation after claim and cover edit', async function () {
    const fixture = await loadFixture(submitClaimSetup);
    const { DEFAULT_PRODUCTS } = fixture;
    const { ci, cover, stakingPool1, as } = fixture.contracts;
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
    await stake({
      contracts: fixture.contracts,
      stakingPool: stakingPool1,
      staker: staker1,
      gracePeriod,
      period,
      productId,
    });
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
      expect(coverTrancheAllocations).to.equal(0);

      const expiringCoverBuckets = await stakingPool1.expiringCoverBuckets(productId, targetBucketId, groupId);
      expect(expiringCoverBuckets).to.equal(0);
    }

    // Submit partial claim - 1/2 of total amount
    const claimAmount = amount.div(2);

    {
      const [deposit] = await ci.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
      await ci.connect(coverBuyer1).submitClaim(coverId, claimAmount, '', {
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
      expect(coverTrancheAllocations).to.equal(
        coverAllocation.coverAmountInNXM.div(NXM_PER_ALLOCATION_UNIT).add(1),
      );

      const expiringCoverBuckets = await stakingPool1.expiringCoverBuckets(productId, targetBucketId, groupId);
      expect(expiringCoverBuckets).to.equal(
        coverAllocation.coverAmountInNXM.div(NXM_PER_ALLOCATION_UNIT).add(1),
      );
    }

    const segment = await cover.coverSegmentWithRemainingAmount(coverId, 0);
    const latestBlock = await ethers.provider.getBlock('latest');

    const editTimestamp = BigInt(latestBlock.timestamp) + 1n;
    const passedPeriod = editTimestamp - segment.start;
    const remainingPeriod = BigInt(segment.period) - passedPeriod;

    const expectedPremium = amount
      * DEFAULT_PRODUCTS[0].targetPrice
      * period
      / MAX_COVER_PERIOD;

    const coverAmountLeft = amount - claimAmount;
    const refund = coverAmountLeft
      * DEFAULT_PRODUCTS[0].targetPrice
      * BigInt(segment.period - passedPeriod)
      / MAX_COVER_PERIOD;
    const totalEditPremium = expectedPremium - refund;

    // Edit Cover - resets amount for the remaining period
    await cover.connect(coverBuyer1).buyCover(
      {
        owner: coverBuyer1.address,
        coverId,
        productId,
        coverAsset,
        amount,
        period: remainingPeriod,
        maxPremiumInAsset: totalEditPremium,
        paymentAsset: coverAsset,
        commissionRatio: parseEther('0'),
        commissionDestination: ZeroAddress,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      { value: totalEditPremium },
    );

    {
      const secondSegment = 1;
      const coverAllocation = await cover.coverSegmentAllocations(coverId, secondSegment, 0);
      expect(coverAllocation.coverAmountInNXM).to.equal(preBurnCoverAllocation.coverAmountInNXM);

      const activeAllocations = await stakingPool1.getActiveAllocations(productId);
      expect(activeAllocations[0]).to.equal(coverAllocation.coverAmountInNXM.div(NXM_PER_ALLOCATION_UNIT));

      const coverTrancheAllocations = await stakingPool1.coverTrancheAllocations(allocationId);
      expect(coverTrancheAllocations).to.equal(
        coverAllocation.coverAmountInNXM.div(NXM_PER_ALLOCATION_UNIT),
      );

      const expiringCoverBuckets = await stakingPool1.expiringCoverBuckets(productId, targetBucketId, groupId);
      expect(expiringCoverBuckets).to.equal(
        coverAllocation.coverAmountInNXM.div(NXM_PER_ALLOCATION_UNIT),
      );
    }
  });
});

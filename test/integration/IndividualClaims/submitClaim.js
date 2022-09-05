const { ethers } = require('hardhat');
const { expect } = require('chai');
const { BigNumber } = require('ethers');
const { AddressZero } = ethers.constants;

const { daysToSeconds } = require('../../utils/helpers');
const { mineNextBlock, setNextBlockTime } = require('../../utils/evm');

const { parseEther } = ethers.utils;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

const priceDenominator = '10000';

describe('submitClaim', function () {

  function calculateFirstTrancheId (lastBlock, period, gracePeriod) {
    return Math.floor((lastBlock.timestamp + period + gracePeriod) / (91 * 24 * 3600));
  }

  beforeEach(async function () {
    const { tk } = this.withEthers.contracts;

    const members = this.accounts.members.slice(0, 5);
    const amount = parseEther('10000');
    for (const member of members) {
      await tk.connect(this.accounts.defaultSender).transfer(member.address, amount);
    }
  });

  async function acceptClaim ({ staker, assessmentStakingAmount, as }) {
    const { payoutCooldownInDays } = await as.config();
    await as.connect(staker).stake(assessmentStakingAmount);

    await as.connect(staker).castVotes([0], [true], 0);

    const { poll } = await as.assessments(0);
    const futureTime = poll.end + daysToSeconds(payoutCooldownInDays);

    await setTime(futureTime);
  }

  async function rejectClaim ({ approvingStaker, rejectingStaker, as }) {

    const assessmentStakingAmountForApproval = parseEther('1000');
    const assessmentStakingAmountForRejection = parseEther('2000');
    const { payoutCooldownInDays } = await as.config();
    await as.connect(approvingStaker).stake(assessmentStakingAmountForApproval);

    await as.connect(approvingStaker).castVotes([0], [true], 0);

    await as.connect(rejectingStaker).stake(assessmentStakingAmountForRejection);
    await as.connect(rejectingStaker).castVotes([0], [false], 0);

    const { poll } = await as.assessments(0);
    const futureTime = poll.end + daysToSeconds(payoutCooldownInDays);

    await setTime(futureTime);
  }

  async function stake ({ stakingPool, staker, productId, period, gracePeriod }) {
    // Staking inputs
    const stakingAmount = parseEther('100');
    const lastBlock = await ethers.provider.getBlock('latest');
    const firstTrancheId = calculateFirstTrancheId(lastBlock, period, gracePeriod);

    // Stake to open up capacity
    await stakingPool.connect(staker).depositTo([{
      amount: stakingAmount,
      trancheId: firstTrancheId,
      tokenId: 1, // new position
      destination: AddressZero,
    }]);
    await stakingPool.setTargetWeight(productId, 10);
  }

  it('submits ETH claim and approves claim', async function () {
    const { DEFAULT_PRODUCT_INITIALIZATION } = this;
    const { ic, cover, stakingPool0, as } = this.withEthers.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const payoutAsset = 0; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake(
      { stakingPool: stakingPool0, staker: staker1, gracePeriod, period, productId }
    );

    // Buy Cover
    const expectedPremium = amount
      .mul(BigNumber.from(DEFAULT_PRODUCT_INITIALIZATION[0].targetPrice))
      .div(BigNumber.from(priceDenominator));

    await cover.connect(coverBuyer1).buyCover(
      {
        owner: coverBuyer1.address,
        productId,
        payoutAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: payoutAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: '0', coverAmountInAsset: amount.toString() }],
      {
        value: expectedPremium,
      },
    );

    // Submit claim
    const coverId = 0;
    const claimAmount = amount.sub(1);
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, payoutAsset);
    await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
      value: deposit.mul('2'),
    });

    const assessmentStakingAmount = parseEther('1000');
    await acceptClaim({ staker: staker2, assessmentStakingAmount, as });

    // redeem payout
    await ic.redeemClaimPayout(0);
    const { payoutRedeemed } = await ic.claims(0);
    expect(payoutRedeemed).to.be.equal(true);
  });

  it('submits DAI claim and approves claim', async function () {
    const { DEFAULT_PRODUCT_INITIALIZATION } = this;
    const { ic, cover, stakingPool0, as, tk, dai } = this.withEthers.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const payoutAsset = 1; // DAI
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake(
      { stakingPool: stakingPool0, staker: staker1, gracePeriod, period, productId }
    );

    // Buy Cover
    const expectedPremium = amount
      .mul(BigNumber.from(DEFAULT_PRODUCT_INITIALIZATION[0].targetPrice))
      .div(BigNumber.from(priceDenominator));

    await dai.connect(this.accounts.defaultSender).transfer(coverBuyer1.address, parseEther('1000000'));
    await dai.connect(coverBuyer1).approve(cover.address, expectedPremium);

    await cover.connect(coverBuyer1).buyCover(
      {
        owner: coverBuyer1.address,
        productId,
        payoutAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: payoutAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: '0', coverAmountInAsset: amount.toString() }],
      {
        value: expectedPremium,
      },
    );

    // Submit claim
    const coverId = 0;
    const claimAmount = amount.sub(20);
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, payoutAsset);
    await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
      value: deposit.mul('2'),
    });

    const assessmentStakingAmount = parseEther('1000');
    await acceptClaim({ staker: staker2, assessmentStakingAmount, as });

    await ic.redeemClaimPayout(0);
    const { payoutRedeemed } = await ic.claims(0);
    expect(payoutRedeemed).to.be.equal(true);
  });

  it('submits ETH claim and rejects claim', async function () {
    const { DEFAULT_PRODUCT_INITIALIZATION } = this;
    const { ic, cover, stakingPool0, as, tk } = this.withEthers.contracts;
    const [coverBuyer1, staker1, staker2, staker3] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const payoutAsset = 0; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake(
      { stakingPool: stakingPool0, staker: staker1, gracePeriod, period, productId }
    );

    // Buy Cover
    const expectedPremium = amount
      .mul(BigNumber.from(DEFAULT_PRODUCT_INITIALIZATION[0].targetPrice))
      .div(BigNumber.from(priceDenominator));

    await cover.connect(coverBuyer1).buyCover(
      {
        owner: coverBuyer1.address,
        productId,
        payoutAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: payoutAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: '0', coverAmountInAsset: amount.toString() }],
      {
        value: expectedPremium,
      },
    );

    // Submit claim
    const coverId = 0;
    const claimAmount = amount.sub(1);
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, payoutAsset);
    await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
      value: deposit.mul('2'),
    });

    await rejectClaim({
      approvingStaker: staker2,
      rejectingStaker: staker3,
      as
    });

    // attempt redemption
    await expect(ic.redeemClaimPayout(0)).to.be.revertedWith('The claim needs to be accepted');
    const { payoutRedeemed } = await ic.claims(0);
    expect(payoutRedeemed).to.be.equal(false);
  });

  it('submits DAI claim and rejects claim', async function () {
    const { DEFAULT_PRODUCT_INITIALIZATION } = this;
    const { ic, cover, stakingPool0, as, tk, dai } = this.withEthers.contracts;
    const [coverBuyer1, staker1, staker2, staker3] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const payoutAsset = 1; // DAI
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake(
      { stakingPool: stakingPool0, staker: staker1, gracePeriod, period, productId }
    );

    // Buy Cover
    const expectedPremium = amount
      .mul(BigNumber.from(DEFAULT_PRODUCT_INITIALIZATION[0].targetPrice))
      .div(BigNumber.from(priceDenominator));

    await dai.connect(this.accounts.defaultSender).transfer(coverBuyer1.address, parseEther('1000000'));
    await dai.connect(coverBuyer1).approve(cover.address, expectedPremium);

    await cover.connect(coverBuyer1).buyCover(
      {
        owner: coverBuyer1.address,
        productId,
        payoutAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: payoutAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      [{ poolId: '0', coverAmountInAsset: amount.toString() }],
      {
        value: expectedPremium,
      },
    );

    // Submit claim
    const coverId = 0;
    // TODO: figure out why this higher precision error
    const claimAmount = amount.sub(20);
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, payoutAsset);
    await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
      value: deposit.mul('2'),
    });

    await rejectClaim({
      approvingStaker: staker2,
      rejectingStaker: staker3,
      as
    });

    // attempt redemption
    await expect(ic.redeemClaimPayout(0)).to.be.revertedWith('The claim needs to be accepted');
    const { payoutRedeemed } = await ic.claims(0);
    expect(payoutRedeemed).to.be.equal(false);
  });
});

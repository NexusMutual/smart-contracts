const { ethers } = require('hardhat');
const { expect } = require('chai');
const { BigNumber } = require('ethers');
const { AddressZero, MaxUint256 } = ethers.constants;
const { parseEther } = ethers.utils;
const { stake } = require('../utils/staking');
const { rejectClaim, acceptClaim } = require('../utils/voteClaim');

const { daysToSeconds } = require('../../../lib/helpers');
const { mineNextBlock, setNextBlockTime, setNextBlockBaseFee } = require('../../utils/evm');
const { parseUnits } = require('ethers/lib/utils');

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

const priceDenominator = '10000';
const ETH_ASSET_ID = 0;
const DAI_ASSET_ID = 1;

describe('submitClaim', function () {
  function calculateFirstTrancheId(lastBlock, period, gracePeriod) {
    return Math.floor((lastBlock.timestamp + period + gracePeriod) / (91 * 24 * 3600));
  }

  beforeEach(async function () {
    const { tk } = this.contracts;

    const members = this.accounts.members.slice(0, 5);
    const amount = parseEther('10000');
    for (const member of members) {
      await tk.connect(this.accounts.defaultSender).transfer(member.address, amount);
    }
  });

  it('submits ETH claim and approves claim', async function () {
    const { DEFAULT_PRODUCT_INITIALIZATION } = this;
    const { ic, cover, stakingPool0, as } = this.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = 0; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, gracePeriod, period, productId });

    // Buy Cover
    const expectedPremium = amount
      .mul(BigNumber.from(DEFAULT_PRODUCT_INITIALIZATION[0].targetPrice))
      .div(BigNumber.from(priceDenominator));

    await cover.connect(coverBuyer1).buyCover(
      {
        owner: coverBuyer1.address,
        coverId: MaxUint256,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: coverAsset,
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
    const claimAmount = amount;
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
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

  it('submits ETH claim and rejects claim', async function () {
    const { DEFAULT_PRODUCT_INITIALIZATION } = this;
    const { ic, cover, stakingPool0, as } = this.contracts;
    const [coverBuyer1, staker1, staker2, staker3] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = 0; // ETH
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, gracePeriod, period, productId });

    // Buy Cover
    const expectedPremium = amount
      .mul(BigNumber.from(DEFAULT_PRODUCT_INITIALIZATION[0].targetPrice))
      .div(BigNumber.from(priceDenominator));

    await cover.connect(coverBuyer1).buyCover(
      {
        owner: coverBuyer1.address,
        coverId: MaxUint256,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: coverAsset,
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
    const claimAmount = amount;
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
      value: deposit.mul('2'),
    });

    await rejectClaim({
      approvingStaker: staker2,
      rejectingStaker: staker3,
      as,
    });

    // attempt redemption
    await expect(ic.redeemClaimPayout(0)).to.be.revertedWith('The claim needs to be accepted');
    const { payoutRedeemed } = await ic.claims(0);
    expect(payoutRedeemed).to.be.equal(false);
  });

  it('submits DAI claim and approves claim', async function () {
    const { DEFAULT_PRODUCT_INITIALIZATION } = this;
    const { ic, cover, stakingPool0, as, dai } = this.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = 1; // DAI
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, gracePeriod, period, productId });

    // Buy Cover
    const expectedPremium = amount
      .mul(BigNumber.from(DEFAULT_PRODUCT_INITIALIZATION[0].targetPrice))
      .div(BigNumber.from(priceDenominator));

    await dai.connect(this.accounts.defaultSender).transfer(coverBuyer1.address, parseEther('1000000'));
    await dai.connect(coverBuyer1).approve(cover.address, expectedPremium);

    await cover.connect(coverBuyer1).buyCover(
      {
        owner: coverBuyer1.address,
        coverId: MaxUint256,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: coverAsset,
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
    const claimAmount = amount;
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
      value: deposit.mul('2'),
    });

    const assessmentStakingAmount = parseEther('1000');
    await acceptClaim({ staker: staker2, assessmentStakingAmount, as });

    await ic.redeemClaimPayout(0);
    const { payoutRedeemed } = await ic.claims(0);
    expect(payoutRedeemed).to.be.equal(true);
  });

  it('submits DAI claim and rejects claim', async function () {
    const { DEFAULT_PRODUCT_INITIALIZATION } = this;
    const { ic, cover, stakingPool0, as, dai } = this.contracts;
    const [coverBuyer1, staker1, staker2, staker3] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const coverAsset = 1; // DAI
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('1');

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, gracePeriod, period, productId });

    // Buy Cover
    const expectedPremium = amount
      .mul(BigNumber.from(DEFAULT_PRODUCT_INITIALIZATION[0].targetPrice))
      .div(BigNumber.from(priceDenominator));

    await dai.connect(this.accounts.defaultSender).transfer(coverBuyer1.address, parseEther('1000000'));
    await dai.connect(coverBuyer1).approve(cover.address, expectedPremium);

    await cover.connect(coverBuyer1).buyCover(
      {
        owner: coverBuyer1.address,
        coverId: MaxUint256,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: coverAsset,
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
    const claimAmount = amount;
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
      value: deposit.mul('2'),
    });

    await rejectClaim({
      approvingStaker: staker2,
      rejectingStaker: staker3,
      as,
    });

    // attempt redemption
    await expect(ic.redeemClaimPayout(0)).to.be.revertedWith('The claim needs to be accepted');
    const { payoutRedeemed } = await ic.claims(0);
    expect(payoutRedeemed).to.be.equal(false);
  });

  it('submits USDC claim and approves claim (token with 6 decimals)', async function () {
    const { DEFAULT_PRODUCT_INITIALIZATION } = this;
    const { ic, cover, stakingPool0, as, usdc } = this.contracts;
    const [coverBuyer1, staker1, staker2] = this.accounts.members;

    const usdcDecimals = 6;

    // Cover inputs
    const productId = 6;
    const coverAsset = 2; // USDC
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseUnits('10', usdcDecimals);

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, gracePeriod, period, productId });

    // Buy Cover
    const expectedPremium = amount
      .mul(BigNumber.from(DEFAULT_PRODUCT_INITIALIZATION[0].targetPrice))
      .div(BigNumber.from(priceDenominator));

    await usdc.connect(this.accounts.defaultSender).transfer(coverBuyer1.address, parseUnits('1000000', usdcDecimals));
    await usdc.connect(coverBuyer1).approve(cover.address, expectedPremium);

    await cover.connect(coverBuyer1).buyCover(
      {
        owner: coverBuyer1.address,
        coverId: MaxUint256,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: coverAsset,
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
    const claimAmount = amount;
    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, coverAsset);
    await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
      value: deposit.mul('2'),
    });

    const assessmentStakingAmount = parseEther('1000');
    await acceptClaim({ staker: staker2, assessmentStakingAmount, as });

    await ic.redeemClaimPayout(0);
    const { payoutRedeemed } = await ic.claims(0);
    expect(payoutRedeemed).to.be.equal(true);
  });

  it('submits partial ETH | DAI claim and approves claim', async function () {
    const { DEFAULT_PRODUCT_INITIALIZATION } = this;
    const { ic, cover, stakingPool0, as, dai } = this.contracts;
    const [coverBuyer1, coverBuyer2, staker1, staker2] = this.accounts.members;

    // Cover inputs
    const productId = 0;
    const period = 3600 * 24 * 30; // 30 days
    const gracePeriod = 3600 * 24 * 30;
    const amount = parseEther('10');

    await dai.connect(this.accounts.defaultSender).transfer(coverBuyer1.address, parseEther('1000000'));
    await dai.connect(coverBuyer1).approve(cover.address, MaxUint256);

    await dai.connect(this.accounts.defaultSender).transfer(coverBuyer2.address, parseEther('1000000'));
    await dai.connect(coverBuyer2).approve(cover.address, MaxUint256);

    const buyer1BalanceBefore = await ethers.provider.getBalance(coverBuyer1.address);
    const buyer2BalanceBefore = await dai.balanceOf(coverBuyer2.address);

    // Stake to open up capacity
    await stake({ stakingPool: stakingPool0, staker: staker1, gracePeriod, period, productId });

    // Buy Cover
    const expectedPremium = amount
      .mul(BigNumber.from(DEFAULT_PRODUCT_INITIALIZATION[0].targetPrice))
      .div(BigNumber.from(priceDenominator));

    // Buy Cover buyer1 (ETH)
    {
      const coverAsset = ETH_ASSET_ID;
      await setNextBlockBaseFee('0');
      await cover.connect(coverBuyer1).buyCover(
        {
          owner: coverBuyer1.address,
          coverId: MaxUint256,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: expectedPremium,
          paymentAsset: coverAsset,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: '0', coverAmountInAsset: amount.toString() }],
        {
          value: coverAsset === ETH_ASSET_ID ? expectedPremium : 0,
          gasPrice: 0,
        },
      );
    }

    // Buy Cover buyer 2 (DAI)
    {
      const coverAsset = DAI_ASSET_ID;
      await cover.connect(coverBuyer2).buyCover(
        {
          owner: coverBuyer2.address,
          coverId: MaxUint256,
          productId,
          coverAsset,
          amount,
          period,
          maxPremiumInAsset: expectedPremium,
          paymentAsset: coverAsset,
          commissionRatio: parseEther('0'),
          commissionDestination: AddressZero,
          ipfsData: '',
        },
        [{ poolId: '0', coverAmountInAsset: amount.toString() }],
        {
          value: coverAsset === ETH_ASSET_ID ? expectedPremium : 0,
        },
      );
    }

    // Submit claim
    const coverIdBuyer1 = 0;
    const coverIdBuyer2 = 1;

    const claimAmount = amount;
    const [depositEth] = await ic.getAssessmentDepositAndReward(claimAmount, period, ETH_ASSET_ID);
    const [depositDai] = await ic.getAssessmentDepositAndReward(claimAmount, period, DAI_ASSET_ID);

    await setNextBlockBaseFee('0');
    await ic.connect(coverBuyer1).submitClaim(coverIdBuyer1, 0, claimAmount, '', {
      value: depositEth,
      gasPrice: 0,
    });

    await ic.connect(coverBuyer2).submitClaim(coverIdBuyer2, 0, claimAmount, '', {
      value: depositDai,
    });

    const assessmentStakingAmount = parseEther('1000');
    await acceptClaim({ staker: staker2, assessmentStakingAmount, as });

    // Redeem payouts
    await ic.redeemClaimPayout(0);
    const { payoutRedeemed } = await ic.claims(0);
    expect(payoutRedeemed).to.be.equal(true);

    // TODO Check balances
    const buyer1BalanceAfter = await ethers.provider.getBalance(coverBuyer1.address);
    const buyer2BalanceAfter = await dai.balanceOf(coverBuyer2.address);

    expect(buyer1BalanceAfter).to.be.eq(buyer1BalanceBefore);
    expect(buyer2BalanceAfter).to.be.eq(buyer2BalanceBefore);
  });

  it.skip('submits partial ETH | DAI claim and rejects claim', async function () {
    /* TODO */
  });

  it.skip('multiple partial claims in a row approved on the same cover in USDC', async function () {
    /* TODO */
  });

  it.skip('multiple partial claims in a row approved on the same cover', async function () {
    /* TODO */
  });

  it.skip('multiple partial claims in a row on the same cover with combinations of approved / denied', async function () {
    /* TODO */
  });
});

const { ethers } = require('hardhat');
const { constants: { ZERO_ADDRESS } } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const { daysToSeconds } = require('../../unit/IndividualClaims/helpers');

const { mineNextBlock, setNextBlockTime } = require('../../utils/evm');
const { BigNumber } = require('ethers');

const { parseEther } = ethers.utils;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

const priceDenominator = '10000';

describe('submitClaim', function () {

  it('submits ETH claim and approves claim', async function () {
    const { DEFAULT_PRODUCT_INITIALIZATION } = this;
    const { ic, cover, stakingPool0, as, tk } = this.withEthers.contracts;
    const [ coverBuyer1, staker1, staker2 ] = this.accounts.members;

    const productId = 0;
    const payoutAsset = 0; // ETH
    const period = 3600 * 24 * 30; // 30 days

    const amount = parseEther('1');

    const assessmentStakingAmount = parseEther('1000');
    const stakingAmount = parseEther('100');
    await tk.connect(this.accounts.defaultSender).transfer(staker1.address, stakingAmount);
    await tk.connect(this.accounts.defaultSender).transfer(staker2.address, stakingAmount);

    const lastBlock = await ethers.provider.getBlock('latest');

    const firstTrancheId = Math.floor(lastBlock.timestamp / (91 * 24 * 3600));

    await stakingPool0.connect(staker1).depositTo([{
      amount: stakingAmount,
      trancheId: firstTrancheId,
      tokenId: 1, // new position
      destination: ZERO_ADDRESS
     }]);

    const expectedPremium = amount
      .mul(BigNumber.from(DEFAULT_PRODUCT_INITIALIZATION[0].targetPrice))
      .div(BigNumber.from(priceDenominator));


    await stakingPool0.setTargetWeight(productId, 10);

    const tx = await cover.connect(coverBuyer1).buyCover(
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
        commissionDestination: ZERO_ADDRESS,
        ipfsData: ''
      },
      [{ poolId: '0', coverAmountInAsset: amount.toString() }],
      {
        value: expectedPremium,
      },
    );

    await tx.wait();

    const coverId = 0;
    const claimAmount = amount.sub(1);

    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, payoutAsset);

    await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
        value: deposit.mul('2'),
    });

    const { payoutCooldownInDays } = await as.config();
    await as.connect(staker2).stake(assessmentStakingAmount);

    await as.connect(staker2).castVotes([0], [true], 0);

    const { poll } = await as.assessments(0);
    const futureTime = poll.end + daysToSeconds(payoutCooldownInDays);

    await setTime(futureTime);
    await ic.redeemClaimPayout(0);
    const { payoutRedeemed } = await ic.claims(0);
    expect(payoutRedeemed).to.be.equal(true);
  });

  it.only('submits DAI claim and approves claim', async function () {
    const { DEFAULT_PRODUCT_INITIALIZATION } = this;
    const { ic, cover, stakingPool0, as, tk, dai } = this.withEthers.contracts;
    const [ coverBuyer1, staker1, staker2 ] = this.accounts.members;

    const productId = 0;
    const payoutAsset = 1; // DAI
    const period = 3600 * 24 * 30; // 30 days

    const amount = parseEther('1');

    const assessmentStakingAmount = parseEther('1000');
    const stakingAmount = parseEther('100');
    await tk.connect(this.accounts.defaultSender).transfer(staker1.address, stakingAmount);
    await tk.connect(this.accounts.defaultSender).transfer(staker2.address, stakingAmount);

    const lastBlock = await ethers.provider.getBlock('latest');

    const firstTrancheId = Math.floor(lastBlock.timestamp / (91 * 24 * 3600));

    await stakingPool0.connect(staker1).depositTo([{
      amount: stakingAmount,
      trancheId: firstTrancheId,
      tokenId: 1, // new position
      destination: ZERO_ADDRESS
    }]);

    const expectedPremium = amount
      .mul(BigNumber.from(DEFAULT_PRODUCT_INITIALIZATION[0].targetPrice))
      .div(BigNumber.from(priceDenominator));

    await stakingPool0.setTargetWeight(productId, 10);

    await dai.connect(this.accounts.defaultSender).transfer(coverBuyer1.address, parseEther('1000000'));

    await dai.connect(coverBuyer1).approve(cover.address, expectedPremium);

    const tx = await cover.connect(coverBuyer1).buyCover(
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
        commissionDestination: ZERO_ADDRESS,
        ipfsData: ''
      },
      [{ poolId: '0', coverAmountInAsset: amount.toString() }],
      {
        value: expectedPremium,
      },
    );

    await tx.wait();

    const coverId = 0;

    // TODO: figure out why this higher precision error
    const claimAmount = amount.sub(20);

    const [deposit] = await ic.getAssessmentDepositAndReward(claimAmount, period, payoutAsset);

    await ic.connect(coverBuyer1).submitClaim(coverId, 0, claimAmount, '', {
      value: deposit.mul('2'),
    });

    const { payoutCooldownInDays } = await as.config();
    await as.connect(staker2).stake(assessmentStakingAmount);

    await as.connect(staker2).castVotes([0], [true], 0);

    const { poll } = await as.assessments(0);
    const futureTime = poll.end + daysToSeconds(payoutCooldownInDays);

    await setTime(futureTime);
    await ic.redeemClaimPayout(0);
    const { payoutRedeemed } = await ic.claims(0);
    expect(payoutRedeemed).to.be.equal(true);
  });
});

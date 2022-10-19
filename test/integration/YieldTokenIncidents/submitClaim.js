const { ethers } = require('hardhat');
const {
  constants: { ZERO_ADDRESS },
} = require('@openzeppelin/test-helpers');
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

describe.skip('submitClaim', function () {
  it('submits DAI claim and approves claim', async function () {
    const { DEFAULT_PRODUCT_INITIALIZATION } = this;
    const { cover, stakingPool0, as, tk, dai, yc } = this.contracts;
    const [coverBuyer1, staker1, staker2, member1] = this.accounts.members;
    const [nonMember1, nonMember2] = this.accounts.nonMembers;

    const productId = 0;
    const payoutAsset = 1; // DAI
    const period = 3600 * 24 * 30; // 30 days

    const amount = parseEther('1');

    const stakingAmount = parseEther('100');
    await tk.connect(this.accounts.defaultSender).transfer(staker1.address, stakingAmount);
    await tk.connect(this.accounts.defaultSender).transfer(staker2.address, stakingAmount);

    const lastBlock = await ethers.provider.getBlock('latest');

    const firstTrancheId = Math.floor(lastBlock.timestamp / (91 * 24 * 3600));

    await stakingPool0.connect(staker1).depositTo([
      {
        amount: stakingAmount,
        trancheId: firstTrancheId,
        tokenId: 1, // new position
        destination: ZERO_ADDRESS,
      },
    ]);

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
        ipfsData: '',
      },
      [{ poolId: '0', coverAmountInAsset: amount.toString() }],
      {
        value: expectedPremium,
      },
    );

    await tx.wait();

    const segmentPeriod = period;
    {
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await yc
        .connect(this.accounts.defaultSender)
        .submitIncident(2, parseEther('1.1'), currentTime + segmentPeriod / 2, parseEther('100'), '');
    }

    await as.connect(staker1).castVote(0, true, parseEther('100'));

    {
      const { payoutCooldownInDays } = await as.config();
      const { end } = await as.getPoll(0);
      await setTime(end + daysToSeconds(payoutCooldownInDays));
    }

    // await ybEth.connect(staker1).approve(yc.address, parseEther('10000'));

    // [warning] Cover mock does not subtract the covered amount
    {
      const ethBalanceBefore = await ethers.provider.getBalance(staker1.address);
      await yc.connect(staker1).redeemPayout(0, 0, 0, parseEther('100'), staker1.address, [], { gasPrice: 0 });
      const ethBalanceAfter = await ethers.provider.getBalance(staker1.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(parseEther('99')));
    }

    {
      const ethBalanceBefore = await ethers.provider.getBalance(nonMember1.address);
      await yc.connect(member1).redeemPayout(0, 0, 0, parseEther('111'), nonMember1.address, [], { gasPrice: 0 });
      const ethBalanceAfter = await ethers.provider.getBalance(nonMember1.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(parseEther('109.89')));
    }

    {
      const ethBalanceBefore = await ethers.provider.getBalance(nonMember2.address);
      await yc.connect(member1).redeemPayout(0, 0, 0, parseEther('3000'), nonMember2.address, [], { gasPrice: 0 });
      const ethBalanceAfter = await ethers.provider.getBalance(nonMember2.address);
      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(parseEther('2970')));
    }
  });

  it.skip('submits DAI claim and rejects claim', async function () {
    const { DEFAULT_PRODUCT_INITIALIZATION } = this;
    const { ic, cover, stakingPool0, as, tk, dai } = this.contracts;
    const [coverBuyer1, staker1, staker2, staker3] = this.accounts.members;

    const productId = 0;
    const payoutAsset = 1; // DAI
    const period = 3600 * 24 * 30; // 30 days

    const amount = parseEther('1');

    const assessmentStakingAmountForApproval = parseEther('1000');
    const assessmentStakingAmountForRejection = parseEther('2000');
    const stakingAmount = parseEther('100');
    await tk.connect(this.accounts.defaultSender).transfer(staker1.address, stakingAmount);
    await tk.connect(this.accounts.defaultSender).transfer(staker2.address, stakingAmount);
    await tk.connect(this.accounts.defaultSender).transfer(staker3.address, stakingAmount);

    const lastBlock = await ethers.provider.getBlock('latest');

    const firstTrancheId = Math.floor(lastBlock.timestamp / (91 * 24 * 3600));

    await stakingPool0.connect(staker1).depositTo([
      {
        amount: stakingAmount,
        trancheId: firstTrancheId,
        tokenId: 1, // new position
        destination: ZERO_ADDRESS,
      },
    ]);

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
        ipfsData: '',
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
    await as.connect(staker2).stake(assessmentStakingAmountForApproval);

    await as.connect(staker2).castVotes([0], [true], 0);

    await as.connect(staker3).stake(assessmentStakingAmountForRejection);
    await as.connect(staker3).castVotes([0], [false], 0);

    const { poll } = await as.assessments(0);
    const futureTime = poll.end + daysToSeconds(payoutCooldownInDays);

    await setTime(futureTime);
    await expect(ic.redeemClaimPayout(0)).to.be.revertedWith('The claim needs to be accepted');
    const { payoutRedeemed } = await ic.claims(0);
    expect(payoutRedeemed).to.be.equal(false);
  });
});

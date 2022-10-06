const { ethers } = require('hardhat');
const { expect } = require('chai');

const { submitClaim, ASSET } = require('./helpers');
const { mineNextBlock, setNextBlockTime } = require('../../utils/evm');

const { parseEther } = ethers.utils;
const daysToSeconds = days => days * 24 * 60 * 60;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

describe('redeemClaimPayout', function () {
  it('reverts if the claim is not accepted', async function () {
    const { individualClaims, cover, assessment } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const coverPeriod = daysToSeconds(30);
    const coverAmount = parseEther('100');

    const { timestamp } = await ethers.provider.getBlock('latest');
    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [[coverAmount, timestamp + 1, coverPeriod, 7, 0, false, 0]],
    );

    {
      await submitClaim(this)({ coverId: 0, sender: coverOwner });
      const { payoutCooldownInDays } = await assessment.config();
      const { poll } = await assessment.assessments(0);
      await setTime(poll.end + daysToSeconds(payoutCooldownInDays));
      await expect(individualClaims.redeemClaimPayout(0)).to.be.revertedWith('The claim needs to be accepted');
    }

    {
      await submitClaim(this)({ coverId: 0, sender: coverOwner });
      const { payoutCooldownInDays } = await assessment.config();
      const { poll } = await assessment.assessments(1);
      await assessment.castVote(1, true, parseEther('1'));
      await assessment.castVote(1, false, parseEther('2'));
      await setTime(poll.end + daysToSeconds(payoutCooldownInDays));
      await expect(individualClaims.redeemClaimPayout(1)).to.be.revertedWith('The claim needs to be accepted');
    }

    {
      await submitClaim(this)({ coverId: 0, sender: coverOwner });
      const { payoutCooldownInDays } = await assessment.config();
      const { poll } = await assessment.assessments(2);
      await assessment.castVote(2, true, parseEther('1'));
      await setTime(poll.end + daysToSeconds(payoutCooldownInDays));
      await expect(individualClaims.redeemClaimPayout(2)).not.to.be.revertedWith('The claim needs to be accepted');
    }
  });

  it('reverts while the claim is being assessed', async function () {
    const { individualClaims, cover, assessment } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const coverPeriod = daysToSeconds(30);
    const coverAmount = parseEther('100');
    const { timestamp } = await ethers.provider.getBlock('latest');
    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [[coverAmount, timestamp + 1, coverPeriod, 7, 0, false, 0]],
    );

    await submitClaim(this)({ coverId: 0, sender: coverOwner });

    {
      const { poll } = await assessment.assessments(0);
      await setTime(poll.end);
      await expect(individualClaims.redeemClaimPayout(0)).not.to.be.revertedWith('The claim is still being assessed');
    }

    {
      await assessment.castVote(0, true, parseEther('1'));
      const { poll } = await assessment.assessments(0);
      const latestBlock = await ethers.provider.getBlock('latest');
      await setTime(poll.end - (poll.end - latestBlock.timestamp) / 2);
      await expect(individualClaims.redeemClaimPayout(0)).to.be.revertedWith('The claim is still being assessed');
    }

    {
      const { poll } = await assessment.assessments(0);
      const latestBlock = await ethers.provider.getBlock('latest');
      await setTime(poll.end - parseInt((poll.end - latestBlock.timestamp) / 3));
      await expect(individualClaims.redeemClaimPayout(0)).to.be.revertedWith('The claim is still being assessed');
    }
  });

  it('reverts while the claim is in cooldown period', async function () {
    const { individualClaims, cover, assessment } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const coverPeriod = daysToSeconds(30);
    const coverAmount = parseEther('100');
    const { timestamp } = await ethers.provider.getBlock('latest');
    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [[coverAmount, timestamp + 1, coverPeriod, 7, 0, false, 0]],
    );

    await submitClaim(this)({ coverId: 0, sender: coverOwner });

    await assessment.castVote(0, true, parseEther('1'));
    const { poll } = await assessment.assessments(0);
    await setTime(poll.end);
    await expect(individualClaims.redeemClaimPayout(0)).to.be.revertedWith('The claim is in cooldown period');

    const { payoutCooldownInDays } = await assessment.config();
    await setTime(poll.end + daysToSeconds(payoutCooldownInDays));
    await expect(individualClaims.redeemClaimPayout(0)).not.to.be.revertedWith('The claim is in cooldown period');
  });

  it('reverts if the redemption period expired', async function () {
    const { individualClaims, cover, assessment } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const coverPeriod = daysToSeconds(30);
    const coverAmount = parseEther('100');
    const { timestamp } = await ethers.provider.getBlock('latest');
    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [[coverAmount, timestamp + 1, coverPeriod, 7, 0, false, 0]],
    );

    await submitClaim(this)({ coverId: 0, sender: coverOwner });
    await assessment.castVote(0, true, parseEther('1'));
    const { poll } = await assessment.assessments(0);
    const { payoutCooldownInDays } = await assessment.config();
    const { payoutRedemptionPeriodInDays } = await individualClaims.config();
    await setTime(poll.end + daysToSeconds(payoutCooldownInDays));
    await expect(individualClaims.redeemClaimPayout(0)).not.to.be.reverted;
    await setTime(poll.end + daysToSeconds(payoutCooldownInDays + payoutRedemptionPeriodInDays));
    await expect(individualClaims.redeemClaimPayout(0)).to.be.revertedWith('The redemption period has expired');
  });

  it('reverts if a payout has already been redeemed', async function () {
    const { individualClaims, cover, assessment } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const coverPeriod = daysToSeconds(30);
    const coverAmount = parseEther('100');
    const { timestamp } = await ethers.provider.getBlock('latest');
    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [[coverAmount, timestamp + 1, coverPeriod, 7, 0, false, 0]],
    );

    await submitClaim(this)({ coverId: 0, sender: coverOwner });
    await assessment.castVote(0, true, parseEther('1'));
    const { poll } = await assessment.assessments(0);
    const { payoutCooldownInDays } = await assessment.config();
    await setTime(poll.end + daysToSeconds(payoutCooldownInDays));
    await expect(individualClaims.redeemClaimPayout(0)).not.to.be.reverted;
    await expect(individualClaims.connect(coverOwner).redeemClaimPayout(0)).to.be.revertedWith(
      'Payout has already been redeemed',
    );
  });

  it("sets the claim's payoutRedeemed property to true", async function () {
    const { individualClaims, cover, assessment } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const coverPeriod = daysToSeconds(30);
    const coverAmount = parseEther('100');
    const { timestamp } = await ethers.provider.getBlock('latest');
    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [[coverAmount, timestamp + 1, coverPeriod, 7, 0, false, 0]],
    );
    await submitClaim(this)({ coverId: 0, sender: coverOwner });
    await assessment.castVote(0, true, parseEther('1'));
    const { poll } = await assessment.assessments(0);
    const { payoutCooldownInDays } = await assessment.config();
    await setTime(poll.end + daysToSeconds(payoutCooldownInDays));
    await individualClaims.redeemClaimPayout(0);
    const { payoutRedeemed } = await individualClaims.claims(0);
    expect(payoutRedeemed).to.be.equal(true);
  });

  it('sends the payout amount in ETH and the assessment deposit to the cover owner', async function () {
    // also check after NFT transfer
    const { individualClaims, cover, coverNFT, assessment } = this.contracts;
    const [originalOwner, newOwner, otherMember] = this.accounts.members;
    const coverPeriod = daysToSeconds(30);
    const coverAmount = parseEther('100');

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        originalOwner.address,
        0, // productId
        ASSET.ETH,
        [[coverAmount, timestamp + 1, coverPeriod, 7, 0, false, 0]],
        { gasPrice: 0 },
      );

      const ethBalanceBefore = await ethers.provider.getBalance(originalOwner.address);
      const coverId = 0;
      const assessmentId = 0;
      const claimId = 0;
      const [deposit] = await individualClaims.getAssessmentDepositAndReward(coverAmount, coverPeriod, ASSET.ETH);
      await individualClaims
        .connect(originalOwner)
        ['submitClaim(uint32,uint16,uint96,string)'](coverId, 0, coverAmount, '', {
          value: deposit,
          gasPrice: 0,
        });

      await assessment.connect(otherMember).castVote(assessmentId, true, parseEther('1'));
      const { poll } = await assessment.assessments(assessmentId);
      const { payoutCooldownInDays } = await assessment.config();
      await setTime(poll.end + daysToSeconds(payoutCooldownInDays));

      await individualClaims.connect(originalOwner).redeemClaimPayout(claimId, { gasPrice: 0 });
      const ethBalanceAfter = await ethers.provider.getBalance(originalOwner.address);

      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(coverAmount));
    }

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        originalOwner.address,
        0, // productId
        ASSET.ETH,
        [[coverAmount, timestamp + 1, coverPeriod, 7, 0, false, 0]],
        { gasPrice: 0 },
      );

      const coverId = 1;
      const assessmentId = 1;
      const claimId = 1;
      const [deposit] = await individualClaims.getAssessmentDepositAndReward(coverAmount, coverPeriod, ASSET.ETH);
      await individualClaims
        .connect(originalOwner)
        ['submitClaim(uint32,uint16,uint96,string)'](coverId, 0, coverAmount, '', {
          value: deposit,
          gasPrice: 0,
        });

      await assessment.connect(otherMember).castVote(assessmentId, true, parseEther('1'));
      const { poll } = await assessment.assessments(assessmentId);
      const { payoutCooldownInDays } = await assessment.config();
      await setTime(poll.end + daysToSeconds(payoutCooldownInDays));

      await coverNFT.connect(originalOwner).transferFrom(originalOwner.address, newOwner.address, coverId);
      const ethBalanceBefore = await ethers.provider.getBalance(newOwner.address);
      await individualClaims.connect(otherMember).redeemClaimPayout(claimId, { gasPrice: 0 }); // anyone can poke this
      const ethBalanceAfter = await ethers.provider.getBalance(newOwner.address);

      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(coverAmount).add(deposit));
    }
  });

  it('sends the payout amount in DAI and the assessment deposit to the cover owner', async function () {
    // also check after NFT transfer
    const { individualClaims, cover, coverNFT, assessment, dai } = this.contracts;
    const [originalOwner, newOwner, otherMember] = this.accounts.members;
    const coverPeriod = daysToSeconds(30);
    const coverAmount = parseEther('100');

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        originalOwner.address,
        0, // productId
        ASSET.DAI,
        [[coverAmount, timestamp + 1, coverPeriod, 7, 0, false, 0]],
        { gasPrice: 0 },
      );

      const ethBalanceBefore = await ethers.provider.getBalance(originalOwner.address);
      const daiBalanceBefore = await dai.balanceOf(originalOwner.address);
      const coverId = 0;
      const [deposit] = await individualClaims.getAssessmentDepositAndReward(coverAmount, coverPeriod, ASSET.DAI);
      await individualClaims
        .connect(originalOwner)
        ['submitClaim(uint32,uint16,uint96,string)'](coverId, 0, coverAmount, '', {
          value: deposit,
          gasPrice: 0,
        });

      await assessment.connect(otherMember).castVote(0, true, parseEther('1'));
      const { poll } = await assessment.assessments(0);
      const { payoutCooldownInDays } = await assessment.config();
      await setTime(poll.end + daysToSeconds(payoutCooldownInDays));

      await individualClaims.connect(originalOwner).redeemClaimPayout(0, { gasPrice: 0 });
      const ethBalanceAfter = await ethers.provider.getBalance(originalOwner.address);
      const daiBalanceAfter = await dai.balanceOf(originalOwner.address);

      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore);
      expect(daiBalanceAfter).to.be.equal(daiBalanceBefore.add(coverAmount));
    }

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        originalOwner.address,
        0, // productId
        ASSET.DAI,
        [[coverAmount, timestamp + 1, coverPeriod, 7, 0, false, 0]],
        { gasPrice: 0 },
      );

      const ethBalanceBefore = await ethers.provider.getBalance(newOwner.address);
      const daiBalanceBefore = await dai.balanceOf(newOwner.address);
      const coverId = 1;
      const segmentId = 0;
      const assessmentId = 1;
      const claimId = 1;
      const [deposit] = await individualClaims.getAssessmentDepositAndReward(coverAmount, coverPeriod, ASSET.DAI);
      await individualClaims
        .connect(originalOwner)
        ['submitClaim(uint32,uint16,uint96,string)'](coverId, segmentId, coverAmount, '', {
          value: deposit,
          gasPrice: 0,
        });

      await assessment.connect(otherMember).castVote(assessmentId, true, parseEther('1'));
      const { poll } = await assessment.assessments(assessmentId);
      const { payoutCooldownInDays } = await assessment.config();
      await setTime(poll.end + daysToSeconds(payoutCooldownInDays));

      await coverNFT.connect(originalOwner).transferFrom(originalOwner.address, newOwner.address, coverId);
      await individualClaims.connect(otherMember).redeemClaimPayout(claimId, { gasPrice: 0 }); // anyone can poke this
      const ethBalanceAfter = await ethers.provider.getBalance(newOwner.address);
      const daiBalanceAfter = await dai.balanceOf(newOwner.address);

      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(deposit));
      expect(daiBalanceAfter).to.be.equal(daiBalanceBefore.add(coverAmount));
    }
  });

  it('calls performStakeBurn from Cover.sol with the amount to be burned, cover and segment IDs', async function () {
    const { individualClaims, cover, assessment } = this.contracts;
    const [coverOwner, otherMember] = this.accounts.members;
    const coverPeriod = daysToSeconds(30);
    const coverAmount = parseEther('100');

    for (let i = 0; i <= 3; i++) {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        coverOwner.address,
        0, // productId
        ASSET.DAI,
        [
          [0, 0, 0, 0, 0, false, 0],
          [0, 0, 0, 0, 0, false, 0],
          [coverAmount, timestamp + 1, coverPeriod, 7, 0, false, 0],
        ],
        { gasPrice: 0 },
      );
    }

    {
      const [deposit] = await individualClaims.getAssessmentDepositAndReward(coverAmount, coverPeriod, ASSET.ETH);
      await individualClaims.connect(coverOwner)['submitClaim(uint32,uint16,uint96,string)'](3, 2, coverAmount, '', {
        value: deposit,
        gasPrice: 0,
      });

      await assessment.connect(otherMember).castVote(0, true, parseEther('1'));
      const { poll } = await assessment.assessments(0);
      const { payoutCooldownInDays } = await assessment.config();
      await setTime(poll.end + daysToSeconds(payoutCooldownInDays));

      await individualClaims.connect(coverOwner).redeemClaimPayout(0, { gasPrice: 0 });
      const { coverId, segmentId, amount } = await cover.performStakeBurnCalledWith();

      expect(coverId).to.be.equal(3);
      expect(segmentId).to.be.equal(2);
      expect(amount).to.be.equal(coverAmount);
    }

    {
      const [deposit] = await individualClaims.getAssessmentDepositAndReward(
        coverAmount.div(2),
        coverPeriod,
        ASSET.ETH,
      );
      await individualClaims
        .connect(coverOwner)
        ['submitClaim(uint32,uint16,uint96,string)'](2, 2, coverAmount.div(2), '', {
          value: deposit,
          gasPrice: 0,
        });

      await assessment.connect(otherMember).castVote(1, true, parseEther('1'));
      const { poll } = await assessment.assessments(1);
      const { payoutCooldownInDays } = await assessment.config();
      await setTime(poll.end + daysToSeconds(payoutCooldownInDays));

      await individualClaims.connect(coverOwner).redeemClaimPayout(1, { gasPrice: 0 });
      const { coverId, amount } = await cover.performStakeBurnCalledWith();

      expect(coverId).to.be.equal(2);
      expect(amount).to.be.equal(coverAmount.div(2));
    }
  });
});

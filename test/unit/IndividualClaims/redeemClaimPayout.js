const { ethers } = require('hardhat');
const { expect } = require('chai');

const { mineNextBlock, setNextBlockTime, setNextBlockBaseFee } = require('../utils').evm;
const { submitClaim, ASSET, getCoverSegment } = require('./helpers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

const { parseEther } = ethers.utils;
const daysToSeconds = days => days * 24 * 60 * 60;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

describe('redeemClaimPayout', function () {
  it('reverts if the claim is not accepted', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const segment = await getCoverSegment();

    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [segment],
    );

    {
      await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
      const { payoutCooldownInDays } = await assessment.config();
      const { poll } = await assessment.assessments(0);
      await setTime(poll.end + daysToSeconds(payoutCooldownInDays));
      await expect(individualClaims.redeemClaimPayout(0)).to.be.revertedWith('The claim needs to be accepted');
    }

    {
      await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
      const { payoutCooldownInDays } = await assessment.config();
      const { poll } = await assessment.assessments(1);
      await assessment.castVote(1, true, parseEther('1'));
      await assessment.castVote(1, false, parseEther('2'));
      await setTime(poll.end + daysToSeconds(payoutCooldownInDays));
      await expect(individualClaims.redeemClaimPayout(1)).to.be.revertedWith('The claim needs to be accepted');
    }

    {
      await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
      const { payoutCooldownInDays } = await assessment.config();
      const { poll } = await assessment.assessments(2);
      await assessment.castVote(2, true, parseEther('1'));
      await setTime(poll.end + daysToSeconds(payoutCooldownInDays));
      await expect(individualClaims.redeemClaimPayout(2)).not.to.be.revertedWith('The claim needs to be accepted');
    }
  });

  it('reverts while the claim is being assessed', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const segment = await getCoverSegment();

    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [segment],
    );

    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });

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
    const fixture = await loadFixture(setup);
    const { individualClaims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const segment = await getCoverSegment();

    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [segment],
    );

    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });

    await assessment.castVote(0, true, parseEther('1'));
    const { poll } = await assessment.assessments(0);
    await setTime(poll.end);
    await expect(individualClaims.redeemClaimPayout(0)).to.be.revertedWith('The claim is in cooldown period');

    const { payoutCooldownInDays } = await assessment.config();
    await setTime(poll.end + daysToSeconds(payoutCooldownInDays));
    await expect(individualClaims.redeemClaimPayout(0)).not.to.be.revertedWith('The claim is in cooldown period');
  });

  it('reverts if the redemption period expired', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const segment = await getCoverSegment();

    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [segment],
    );

    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
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
    const fixture = await loadFixture(setup);
    const { individualClaims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const segment = await getCoverSegment();

    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [segment],
    );

    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    await assessment.castVote(0, true, parseEther('1'));
    const { poll } = await assessment.assessments(0);
    const { payoutCooldownInDays } = await assessment.config();
    await setTime(poll.end + daysToSeconds(payoutCooldownInDays));
    await expect(individualClaims.redeemClaimPayout(0)).not.to.be.reverted;
    await expect(individualClaims.connect(coverOwner).redeemClaimPayout(0)).to.be.revertedWith(
      'Payout has already been redeemed',
    );
  });

  it('reverts if system is paused', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover, assessment, master } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const segment = await getCoverSegment();

    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [segment],
    );

    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    await assessment.castVote(0, true, parseEther('1'));
    const { poll } = await assessment.assessments(0);
    const { payoutCooldownInDays } = await assessment.config();
    await setTime(poll.end + daysToSeconds(payoutCooldownInDays));

    await master.pause();

    await expect(individualClaims.connect(coverOwner).redeemClaimPayout(0)).to.be.revertedWith('System is paused');
  });

  it('Should emit ClaimPayoutRedeemed event', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const segment = await getCoverSegment();

    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [segment],
    );

    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    await assessment.castVote(0, true, parseEther('1'));
    const { poll } = await assessment.assessments(0);
    const { payoutCooldownInDays } = await assessment.config();
    await setTime(poll.end + daysToSeconds(payoutCooldownInDays));

    await expect(individualClaims.connect(coverOwner).redeemClaimPayout(0))
      .to.emit(individualClaims, 'ClaimPayoutRedeemed')
      .withArgs(coverOwner.address, parseEther('1'), 0, 1);
  });

  it("sets the claim's payoutRedeemed property to true", async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const segment = await getCoverSegment();

    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [segment],
    );
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    await assessment.castVote(0, true, parseEther('1'));
    const { poll } = await assessment.assessments(0);
    const { payoutCooldownInDays } = await assessment.config();
    await setTime(poll.end + daysToSeconds(payoutCooldownInDays));
    await individualClaims.redeemClaimPayout(0);
    const { payoutRedeemed } = await individualClaims.claims(0);
    expect(payoutRedeemed).to.be.equal(true);
  });

  it('triggers twap update when fetching the token price', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover, assessment, pool } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const segment = await getCoverSegment();

    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [segment],
    );
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    await assessment.castVote(0, true, parseEther('1'));
    const { poll } = await assessment.assessments(0);
    const { payoutCooldownInDays } = await assessment.config();
    await setTime(poll.end + daysToSeconds(payoutCooldownInDays));

    const redeemTx = await individualClaims.redeemClaimPayout(0);
    expect(redeemTx).to.emit(pool, 'TwapUpdateTriggered');
  });

  it('sends the payout amount in ETH and the assessment deposit to the cover owner', async function () {
    const fixture = await loadFixture(setup);
    // also check after NFT transfer
    const { individualClaims, cover, coverNFT, assessment } = fixture.contracts;
    const [originalOwner, newOwner, otherMember] = fixture.accounts.members;
    const segment = await getCoverSegment();

    await cover.createMockCover(
      originalOwner.address,
      0, // productId
      ASSET.ETH,
      [segment],
    );

    const ethBalanceBefore = await ethers.provider.getBalance(originalOwner.address);
    const coverId = 1;
    const assessmentId = 0;
    const claimId = 0;
    const [deposit] = await individualClaims.getAssessmentDepositAndReward(segment.amount, segment.period, ASSET.ETH);

    await setNextBlockBaseFee('0');
    await individualClaims
      .connect(originalOwner)
      .submitClaim(coverId, 0, segment.amount, '', { value: deposit, gasPrice: 0 });

    await assessment.connect(otherMember).castVote(assessmentId, true, parseEther('1'));
    const { poll } = await assessment.assessments(assessmentId);
    const { payoutCooldownInDays } = await assessment.config();
    await setTime(poll.end + daysToSeconds(payoutCooldownInDays));

    await setNextBlockBaseFee('0');
    await individualClaims.connect(originalOwner).redeemClaimPayout(claimId, { gasPrice: 0 });
    const ethBalanceAfter = await ethers.provider.getBalance(originalOwner.address);

    expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(segment.amount));

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        originalOwner.address,
        0, // productId
        ASSET.ETH,
        [
          {
            amount: segment.amount,
            start: timestamp + 1,
            period: segment.period,
            gracePeriod: 7,
            priceRatio: 0,
            expired: false,
            globalRewardsRatio: 0,
            globalCapacityRatio: 20000,
          },
        ],
      );

      const coverId = 2;
      const assessmentId = 1;
      const claimId = 1;
      const [deposit] = await individualClaims.getAssessmentDepositAndReward(segment.amount, segment.period, ASSET.ETH);
      await individualClaims.connect(originalOwner).submitClaim(coverId, 0, segment.amount, '', { value: deposit });

      await assessment.connect(otherMember).castVote(assessmentId, true, parseEther('1'));
      const { poll } = await assessment.assessments(assessmentId);
      const { payoutCooldownInDays } = await assessment.config();
      await setTime(poll.end + daysToSeconds(payoutCooldownInDays));

      await coverNFT.connect(originalOwner).transferFrom(originalOwner.address, newOwner.address, coverId);
      const ethBalanceBefore = await ethers.provider.getBalance(newOwner.address);
      await individualClaims.connect(otherMember).redeemClaimPayout(claimId); // anyone can poke this
      const ethBalanceAfter = await ethers.provider.getBalance(newOwner.address);

      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(segment.amount).add(deposit));
    }
  });

  it('sends the payout amount in DAI and the assessment deposit to the cover owner', async function () {
    const fixture = await loadFixture(setup);
    // also check after NFT transfer
    const { individualClaims, cover, coverNFT, assessment, dai } = fixture.contracts;
    const [originalOwner, newOwner, otherMember] = fixture.accounts.members;
    const segment = await getCoverSegment();

    await cover.createMockCover(originalOwner.address, 0 /* productId */, ASSET.DAI, [segment]);

    const ethBalanceBefore = await ethers.provider.getBalance(originalOwner.address);
    const daiBalanceBefore = await dai.balanceOf(originalOwner.address);
    const coverId = 1;
    const [deposit] = await individualClaims.getAssessmentDepositAndReward(segment.amount, segment.period, ASSET.DAI);
    await setNextBlockBaseFee('0');
    await individualClaims
      .connect(originalOwner)
      .submitClaim(coverId, 0, segment.amount, '', { value: deposit, gasPrice: 0 });

    await assessment.connect(otherMember).castVote(0, true, parseEther('1'));
    const { poll } = await assessment.assessments(0);
    const { payoutCooldownInDays } = await assessment.config();
    await setTime(poll.end + daysToSeconds(payoutCooldownInDays));

    await setNextBlockBaseFee('0');
    await individualClaims.connect(originalOwner).redeemClaimPayout(0, { gasPrice: 0 });
    const ethBalanceAfter = await ethers.provider.getBalance(originalOwner.address);
    const daiBalanceAfter = await dai.balanceOf(originalOwner.address);

    expect(ethBalanceAfter).to.be.equal(ethBalanceBefore);
    expect(daiBalanceAfter).to.be.equal(daiBalanceBefore.add(segment.amount));

    {
      await cover.createMockCover(originalOwner.address, 0 /* productId */, ASSET.DAI, [segment]);

      const ethBalanceBefore = await ethers.provider.getBalance(newOwner.address);
      const daiBalanceBefore = await dai.balanceOf(newOwner.address);
      const coverId = 2;
      const segmentId = 0;
      const assessmentId = 1;
      const claimId = 1;

      const [deposit] = await individualClaims.getAssessmentDepositAndReward(segment.amount, segment.period, ASSET.DAI);
      await setNextBlockBaseFee('0');
      await individualClaims
        .connect(originalOwner)
        .submitClaim(coverId, segmentId, segment.amount, '', { value: deposit, gasPrice: 0 });

      await assessment.connect(otherMember).castVote(assessmentId, true, parseEther('1'));
      const { poll } = await assessment.assessments(assessmentId);
      const { payoutCooldownInDays } = await assessment.config();
      await setTime(poll.end + daysToSeconds(payoutCooldownInDays));

      await coverNFT.connect(originalOwner).transferFrom(originalOwner.address, newOwner.address, coverId);
      await individualClaims.connect(otherMember).redeemClaimPayout(claimId); // anyone can poke this
      const ethBalanceAfter = await ethers.provider.getBalance(newOwner.address);
      const daiBalanceAfter = await dai.balanceOf(newOwner.address);

      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(deposit));
      expect(daiBalanceAfter).to.be.equal(daiBalanceBefore.add(segment.amount));
    }
  });

  it('calls burnStake from Cover.sol with the amount to be burned, cover and segment IDs', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover, assessment } = fixture.contracts;
    const [coverOwner, otherMember] = fixture.accounts.members;
    const segment = await getCoverSegment();

    for (let i = 0; i <= 3; i++) {
      await cover.createMockCover(coverOwner.address, 0 /* productId */, ASSET.DAI, [segment, segment, segment]);
    }

    {
      const [deposit] = await individualClaims.getAssessmentDepositAndReward(segment.amount, segment.period, ASSET.ETH);
      await setNextBlockBaseFee('0');
      await individualClaims.connect(coverOwner).submitClaim(3, 2, segment.amount, '', { value: deposit, gasPrice: 0 });

      await assessment.connect(otherMember).castVote(0, true, parseEther('1'));
      const { poll } = await assessment.assessments(0);
      const { payoutCooldownInDays } = await assessment.config();
      await setTime(poll.end + daysToSeconds(payoutCooldownInDays));

      await individualClaims.connect(coverOwner).redeemClaimPayout(0, { gasPrice: 0 });
      const burnStakeCalledWith = await cover.burnStakeCalledWith();
      expect(burnStakeCalledWith.amount).to.be.equal(segment.amount);
    }

    {
      const [deposit] = await individualClaims.getAssessmentDepositAndReward(
        segment.amount.div(2),
        segment.period,
        ASSET.ETH,
      );

      await setNextBlockBaseFee('0');
      await individualClaims
        .connect(coverOwner)
        .submitClaim(2, 2, segment.amount.div(2), '', { value: deposit, gasPrice: 0 });

      await assessment.connect(otherMember).castVote(1, true, parseEther('1'));
      const { poll } = await assessment.assessments(1);
      const { payoutCooldownInDays } = await assessment.config();
      await setTime(poll.end + daysToSeconds(payoutCooldownInDays));

      await setNextBlockBaseFee('0');
      await individualClaims.connect(coverOwner).redeemClaimPayout(1, { gasPrice: 0 });

      const burnStakeCalledWith = await cover.burnStakeCalledWith();
      expect(burnStakeCalledWith.amount).to.be.equal(segment.amount.div(2));
    }
  });
});

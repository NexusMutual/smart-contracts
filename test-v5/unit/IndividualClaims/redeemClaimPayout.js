const { ethers } = require('hardhat');
const { expect } = require('chai');

const { mineNextBlock, setNextBlockTime, setNextBlockBaseFee } = require('../utils').evm;
const { submitClaim, ASSET, createMockCover } = require('./helpers');
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

    const { payoutCooldown } = fixture.config;
    const period = daysToSeconds('30');
    const gracePeriod = daysToSeconds('180');

    await createMockCover(cover, { owner: coverOwner.address, period, gracePeriod });

    {
      await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
      const { poll } = await assessment.assessments(0);
      await setTime(poll.end + payoutCooldown);
      await expect(individualClaims.redeemClaimPayout(0)).to.be.revertedWithCustomError(
        individualClaims,
        'ClaimNotAccepted',
      );
    }

    {
      await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
      const { poll } = await assessment.assessments(1);
      await assessment.castVote(1, true, parseEther('1'));
      await assessment.castVote(1, false, parseEther('2'));
      await setTime(poll.end + payoutCooldown);
      await expect(individualClaims.redeemClaimPayout(1)).to.be.revertedWithCustomError(
        individualClaims,
        'ClaimNotAccepted',
      );
    }

    {
      await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
      const { poll } = await assessment.assessments(2);
      await assessment.castVote(2, true, parseEther('1'));
      await setTime(poll.end + payoutCooldown);
      await expect(individualClaims.redeemClaimPayout(2)).not.to.be.revertedWithCustomError(
        individualClaims,
        'ClaimNotAccepted',
      );
    }
  });

  it('reverts while the claim is being assessed', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });

    {
      const { poll } = await assessment.assessments(0);
      await setTime(poll.end);
      await expect(individualClaims.redeemClaimPayout(0)).not.to.be.revertedWithCustomError(
        individualClaims,
        'ClaimAssessmentNotFinished',
      );
    }

    {
      await assessment.castVote(0, true, parseEther('1'));
      const { poll } = await assessment.assessments(0);
      const latestBlock = await ethers.provider.getBlock('latest');
      await setTime(poll.end - (poll.end - latestBlock.timestamp) / 2);
      await expect(individualClaims.redeemClaimPayout(0)).to.be.revertedWithCustomError(
        individualClaims,
        'ClaimAssessmentNotFinished',
      );
    }

    {
      const { poll } = await assessment.assessments(0);
      const latestBlock = await ethers.provider.getBlock('latest');
      await setTime(poll.end - Math.floor((poll.end - latestBlock.timestamp) / 3));
      await expect(individualClaims.redeemClaimPayout(0)).to.be.revertedWithCustomError(
        individualClaims,
        'ClaimAssessmentNotFinished',
      );
    }
  });

  it('reverts while the claim is in cooldown period', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const { payoutCooldown } = fixture.config;

    await createMockCover(cover, { owner: coverOwner.address });

    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });

    await assessment.castVote(0, true, parseEther('1'));
    const { poll } = await assessment.assessments(0);
    await setTime(poll.end);
    await expect(individualClaims.redeemClaimPayout(0)).to.be.revertedWithCustomError(
      individualClaims,
      'CooldownPeriodNotPassed',
    );

    await setTime(poll.end + payoutCooldown);
    await expect(individualClaims.redeemClaimPayout(0)).not.to.be.revertedWithCustomError(
      individualClaims,
      'CooldownPeriodNotPassed',
    );
  });

  it('reverts if the redemption period expired', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const { payoutCooldown, payoutRedemptionPeriod } = fixture.config;

    await createMockCover(cover, { owner: coverOwner.address });

    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    await assessment.castVote(0, true, parseEther('1'));
    const { poll } = await assessment.assessments(0);
    await setTime(poll.end + payoutCooldown);
    await expect(individualClaims.redeemClaimPayout(0)).not.to.be.reverted;
    await setTime(poll.end + payoutCooldown + payoutRedemptionPeriod);
    await expect(individualClaims.redeemClaimPayout(0)).to.be.revertedWithCustomError(
      individualClaims,
      'RedemptionPeriodExpired',
    );
  });

  it('reverts if a payout has already been redeemed', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const { payoutCooldown } = fixture.config;

    await createMockCover(cover, { owner: coverOwner.address });

    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    await assessment.castVote(0, true, parseEther('1'));
    const { poll } = await assessment.assessments(0);
    await setTime(poll.end + payoutCooldown);
    await expect(individualClaims.redeemClaimPayout(0)).not.to.be.reverted;
    await expect(individualClaims.connect(coverOwner).redeemClaimPayout(0)).to.be.revertedWithCustomError(
      individualClaims,
      'PayoutAlreadyRedeemed',
    );
  });

  it('reverts if system is paused', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover, assessment, master } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const { payoutCooldown } = fixture.config;

    await createMockCover(cover, { owner: coverOwner.address });

    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    await assessment.castVote(0, true, parseEther('1'));
    const { poll } = await assessment.assessments(0);
    await setTime(poll.end + payoutCooldown);

    await master.pause();

    await expect(individualClaims.connect(coverOwner).redeemClaimPayout(0)).to.be.revertedWith('System is paused');
  });

  it('Should emit ClaimPayoutRedeemed event', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const { payoutCooldown } = fixture.config;

    await createMockCover(cover, { owner: coverOwner.address });

    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    await assessment.castVote(0, true, parseEther('1'));
    const { poll } = await assessment.assessments(0);
    await setTime(poll.end + payoutCooldown);

    await expect(individualClaims.connect(coverOwner).redeemClaimPayout(0))
      .to.emit(individualClaims, 'ClaimPayoutRedeemed')
      .withArgs(coverOwner.address, parseEther('1'), 0, 1);
  });

  it("sets the claim's payoutRedeemed property to true", async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const { payoutCooldown } = fixture.config;

    await createMockCover(cover, { owner: coverOwner.address });
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    await assessment.castVote(0, true, parseEther('1'));
    const { poll } = await assessment.assessments(0);
    await setTime(poll.end + payoutCooldown);
    await individualClaims.redeemClaimPayout(0);
    const { payoutRedeemed } = await individualClaims.claims(0);
    expect(payoutRedeemed).to.be.equal(true);
  });

  it('triggers twap update when fetching the token price', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover, assessment, pool } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const { payoutCooldown } = fixture.config;

    await createMockCover(cover, { owner: coverOwner.address });
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    await assessment.castVote(0, true, parseEther('1'));
    const { poll } = await assessment.assessments(0);
    await setTime(poll.end + payoutCooldown);

    const redeemTx = await individualClaims.redeemClaimPayout(0);
    expect(redeemTx).to.emit(pool, 'TwapUpdateTriggered');
  });

  it('sends the payout amount in ETH and the assessment deposit to the cover owner', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover, coverNFT, assessment } = fixture.contracts;
    const [originalOwner, newOwner, otherMember] = fixture.accounts.members;
    const { payoutCooldown } = fixture.config;

    await createMockCover(cover, { owner: originalOwner.address });

    const ethBalanceBefore = await ethers.provider.getBalance(originalOwner.address);
    const coverId = 1;
    const assessmentId = 0;
    const claimId = 0;
    const coverData = await cover.getCoverData(coverId);
    const [deposit] = await individualClaims.getAssessmentDepositAndReward(
      coverData.amount,
      coverData.period,
      ASSET.ETH,
    );

    await setNextBlockBaseFee('0');
    await individualClaims
      .connect(originalOwner)
      .submitClaim(coverId, coverData.amount, '', { value: deposit, gasPrice: 0 });

    await assessment.connect(otherMember).castVote(assessmentId, true, parseEther('1'));
    const { poll } = await assessment.assessments(assessmentId);
    await setTime(poll.end + payoutCooldown);

    await setNextBlockBaseFee('0');
    await individualClaims.connect(originalOwner).redeemClaimPayout(claimId, { gasPrice: 0 });
    const ethBalanceAfter = await ethers.provider.getBalance(originalOwner.address);

    expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(coverData.amount));

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await createMockCover(cover, {
        owner: originalOwner.address,
        start: timestamp + 1,
        period: coverData.period,
        gracePeriod: 7,
      });

      const coverId = 2;
      const assessmentId = 1;
      const claimId = 1;
      const newCoverData = await cover.getCoverData(coverId);
      const [deposit] = await individualClaims.getAssessmentDepositAndReward(
        newCoverData.amount,
        newCoverData.period,
        ASSET.ETH,
      );
      await individualClaims.connect(originalOwner).submitClaim(coverId, newCoverData.amount, '', { value: deposit });

      await assessment.connect(otherMember).castVote(assessmentId, true, parseEther('1'));
      const { poll } = await assessment.assessments(assessmentId);
      await setTime(poll.end + payoutCooldown);

      await coverNFT.connect(originalOwner).transferFrom(originalOwner.address, newOwner.address, coverId);
      const ethBalanceBefore = await ethers.provider.getBalance(newOwner.address);
      await individualClaims.connect(otherMember).redeemClaimPayout(claimId); // anyone can poke this
      const ethBalanceAfter = await ethers.provider.getBalance(newOwner.address);

      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(newCoverData.amount).add(deposit));
    }
  });

  it('sends the payout amount in DAI and the assessment deposit to the cover owner', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover, coverNFT, assessment, dai } = fixture.contracts;
    const [originalOwner, newOwner, otherMember] = fixture.accounts.members;
    const { payoutCooldown } = fixture.config;

    await createMockCover(cover, { owner: originalOwner.address, coverAsset: ASSET.DAI });
    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);

    const ethBalanceBefore = await ethers.provider.getBalance(originalOwner.address);
    const daiBalanceBefore = await dai.balanceOf(originalOwner.address);
    const [deposit] = await individualClaims.getAssessmentDepositAndReward(
      coverData.amount,
      coverData.period,
      ASSET.DAI,
    );
    await setNextBlockBaseFee('0');
    await individualClaims
      .connect(originalOwner)
      .submitClaim(coverId, coverData.amount, '', { value: deposit, gasPrice: 0 });

    await assessment.connect(otherMember).castVote(0, true, parseEther('1'));
    const { poll } = await assessment.assessments(0);
    await setTime(poll.end + payoutCooldown);

    await setNextBlockBaseFee('0');
    await individualClaims.connect(originalOwner).redeemClaimPayout(0, { gasPrice: 0 });
    const ethBalanceAfter = await ethers.provider.getBalance(originalOwner.address);
    const daiBalanceAfter = await dai.balanceOf(originalOwner.address);

    expect(ethBalanceAfter).to.be.equal(ethBalanceBefore);
    expect(daiBalanceAfter).to.be.equal(daiBalanceBefore.add(coverData.amount));

    {
      await createMockCover(cover, { owner: originalOwner.address, coverAsset: ASSET.DAI });

      const coverId = 2;
      const coverData = await cover.getCoverData(coverId);
      const ethBalanceBefore = await ethers.provider.getBalance(newOwner.address);
      const daiBalanceBefore = await dai.balanceOf(newOwner.address);
      const assessmentId = 1;
      const claimId = 1;

      const [deposit] = await individualClaims.getAssessmentDepositAndReward(
        coverData.amount,
        coverData.period,
        ASSET.DAI,
      );
      await setNextBlockBaseFee('0');
      await individualClaims
        .connect(originalOwner)
        .submitClaim(coverId, coverData.amount, '', { value: deposit, gasPrice: 0 });

      await assessment.connect(otherMember).castVote(assessmentId, true, parseEther('1'));
      const { poll } = await assessment.assessments(assessmentId);
      await setTime(poll.end + payoutCooldown);

      await coverNFT.connect(originalOwner).transferFrom(originalOwner.address, newOwner.address, coverId);
      await individualClaims.connect(otherMember).redeemClaimPayout(claimId); // anyone can poke this
      const ethBalanceAfter = await ethers.provider.getBalance(newOwner.address);
      const daiBalanceAfter = await dai.balanceOf(newOwner.address);

      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(deposit));
      expect(daiBalanceAfter).to.be.equal(daiBalanceBefore.add(coverData.amount));
    }
  });

  it('calls burnStake on the Cover contract with the cover id and the payout amount', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover, assessment } = fixture.contracts;
    const [coverOwner, otherMember] = fixture.accounts.members;
    const { payoutCooldown } = fixture.config;

    for (let i = 0; i <= 3; i++) {
      await createMockCover(cover, { owner: coverOwner.address, coverAsset: ASSET.DAI });
    }

    {
      const coverId = 3;
      const coverData = await cover.getCoverData(coverId);
      const [deposit] = await individualClaims.getAssessmentDepositAndReward(
        coverData.amount,
        coverData.period,
        ASSET.ETH,
      );
      await setNextBlockBaseFee('0');
      await individualClaims
        .connect(coverOwner)
        .submitClaim(coverId, coverData.amount, '', { value: deposit, gasPrice: 0 });

      await assessment.connect(otherMember).castVote(0, true, parseEther('1'));
      const { poll } = await assessment.assessments(0);
      await setTime(poll.end + payoutCooldown);

      await individualClaims.connect(coverOwner).redeemClaimPayout(0, { gasPrice: 0 });
      const burnStakeCalledWith = await cover.burnStakeCalledWith();
      expect(burnStakeCalledWith.amount).to.be.equal(coverData.amount);
    }

    {
      const coverId = 2;
      const coverData = await cover.getCoverData(coverId);
      const claimAmount = coverData.amount.div(2);
      const [deposit] = await individualClaims.getAssessmentDepositAndReward(claimAmount, coverData.period, ASSET.ETH);

      await setNextBlockBaseFee('0');
      await individualClaims.connect(coverOwner).submitClaim(coverId, claimAmount, '', { value: deposit, gasPrice: 0 });

      await assessment.connect(otherMember).castVote(1, true, parseEther('1'));
      const { poll } = await assessment.assessments(1);
      await setTime(poll.end + payoutCooldown);

      await setNextBlockBaseFee('0');
      await individualClaims.connect(coverOwner).redeemClaimPayout(1, { gasPrice: 0 });

      const burnStakeCalledWith = await cover.burnStakeCalledWith();
      expect(burnStakeCalledWith.amount).to.be.equal(claimAmount);
    }
  });
});

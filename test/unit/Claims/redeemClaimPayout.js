const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { parseEther } = ethers;

const { mineNextBlock, setNextBlockTime, setNextBlockBaseFee } = require('../../utils/evm');
const { PAUSE_CLAIMS_PAYOUT } = require('../../utils/registry');
const { ASSET, ASSESSMENT_STATUS, createMockCover, submitClaim, daysToSeconds } = require('./helpers');
const { setup } = require('./setup');

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

describe('redeemClaimPayout', function () {
  const ipfsHash = ethers.solidityPackedKeccak256(['string'], ['ipfs-hash']);

  it('reverts if the caller is not a member', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const [nonMember] = fixture.accounts.nonMembers;

    await createMockCover(cover, { owner: coverOwner.address });

    const claimId = (await claims.getClaimsCount()) + 1n;
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
    const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
    await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.ACCEPTED, payoutRedemptionEnd, cooldownEnd);

    const redeemClaimPayout = claims.connect(nonMember).redeemClaimPayout(claimId);
    await expect(redeemClaimPayout).to.be.revertedWithCustomError(claims, 'OnlyMember');
  });

  it('reverts if the caller is not the cover NFT owner', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment } = fixture.contracts;
    const [coverOwner, otherMember] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const claimId = (await claims.getClaimsCount()) + 1n;
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
    const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
    await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.ACCEPTED, payoutRedemptionEnd, cooldownEnd);

    const redeemClaimPayout = claims.connect(otherMember).redeemClaimPayout(claimId);
    await expect(redeemClaimPayout).to.be.revertedWithCustomError(claims, 'NotCoverOwner');
  });

  it('reverts if the claim is not accepted', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    const period = daysToSeconds('30');
    const gracePeriod = daysToSeconds('180');

    await createMockCover(cover, { owner: coverOwner.address, period, gracePeriod });

    const claimId = (await claims.getClaimsCount()) + 1n;
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
    const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);

    // denied
    await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.DENIED, payoutRedemptionEnd, cooldownEnd);
    const redeemClaimPayoutTx1 = claims.connect(coverOwner).redeemClaimPayout(claimId);
    await expect(redeemClaimPayoutTx1).to.be.revertedWithCustomError(claims, 'InvalidAssessmentStatus');

    // draw
    await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.DRAW, payoutRedemptionEnd, cooldownEnd);
    const redeemClaimPayoutTx2 = claims.connect(coverOwner).redeemClaimPayout(claimId);
    await expect(redeemClaimPayoutTx2).to.be.revertedWithCustomError(claims, 'InvalidAssessmentStatus');
  });

  it('reverts while the claim is being assessed or in cooldown period', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    const period = daysToSeconds('30');
    const gracePeriod = daysToSeconds('180');

    await createMockCover(cover, { owner: coverOwner.address, period, gracePeriod });

    const claimId = (await claims.getClaimsCount()) + 1n;
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
    const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);

    // still voting
    await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.VOTING, payoutRedemptionEnd, cooldownEnd);
    const redeemClaimPayoutTx1 = claims.connect(coverOwner).redeemClaimPayout(claimId);
    await expect(redeemClaimPayoutTx1).to.be.revertedWithCustomError(claims, 'InvalidAssessmentStatus');

    // cooldown
    await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.COOLDOWN, payoutRedemptionEnd, cooldownEnd);
    const redeemClaimPayoutTx2 = claims.connect(coverOwner).redeemClaimPayout(claimId);
    await expect(redeemClaimPayoutTx2).to.be.revertedWithCustomError(claims, 'InvalidAssessmentStatus');
  });

  it('reverts if the redemption period expired', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const claimId = (await claims.getClaimsCount()) + 1n;
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
    const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
    await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.ACCEPTED, payoutRedemptionEnd, cooldownEnd);

    await expect(claims.connect(coverOwner).redeemClaimPayout(claimId)).not.to.be.reverted;

    await setTime(payoutRedemptionEnd);
    const redeemClaimPayout = claims.connect(coverOwner).redeemClaimPayout(claimId);
    await expect(redeemClaimPayout).to.be.revertedWithCustomError(claims, 'RedemptionPeriodExpired');
  });

  it('reverts if a payout has already been redeemed', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const claimId = (await claims.getClaimsCount()) + 1n;
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
    const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
    await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.ACCEPTED, payoutRedemptionEnd, cooldownEnd);

    await expect(claims.connect(coverOwner).redeemClaimPayout(claimId)).not.to.be.reverted;
    const redeemClaimPayout = claims.connect(coverOwner).redeemClaimPayout(claimId);
    await expect(redeemClaimPayout).to.be.revertedWithCustomError(claims, 'PayoutAlreadyRedeemed');
  });

  it('Should emit ClaimPayoutRedeemed event', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const claimId = (await claims.getClaimsCount()) + 1n;
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
    const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
    await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.ACCEPTED, payoutRedemptionEnd, cooldownEnd);

    await expect(claims.connect(coverOwner).redeemClaimPayout(claimId))
      .to.emit(claims, 'ClaimPayoutRedeemed')
      .withArgs(coverOwner.address, parseEther('1'), 1, 1);
  });

  it('triggers twap update when fetching the token price', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment, pool } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });
    const claimId = (await claims.getClaimsCount()) + 1n;
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
    const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
    await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.ACCEPTED, payoutRedemptionEnd, cooldownEnd);

    expect(await claims.connect(coverOwner).redeemClaimPayout(claimId)).to.emit(pool, 'TwapUpdateTriggered');
  });

  it('sends the payout amount in ETH and the assessment deposit to the cover owner', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, coverNFT, assessment } = fixture.contracts;
    const { claimDepositInETH: deposit } = fixture.config;
    const [originalOwner, newOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: originalOwner.address });

    const ethBalanceBefore = await ethers.provider.getBalance(originalOwner.address);
    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);

    const claimId = (await claims.getClaimsCount()) + 1n;
    await setNextBlockBaseFee('0');
    await claims
      .connect(originalOwner)
      .submitClaim(coverId, coverData.amount, ipfsHash, { value: deposit, gasPrice: 0 });

    const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
    const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
    await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.ACCEPTED, payoutRedemptionEnd, cooldownEnd);

    await setNextBlockBaseFee('0');
    await claims.connect(originalOwner).redeemClaimPayout(claimId, { gasPrice: 0 });
    const ethBalanceAfter = await ethers.provider.getBalance(originalOwner.address);

    expect(ethBalanceAfter).to.be.equal(ethBalanceBefore + coverData.amount);

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await createMockCover(cover, {
        owner: originalOwner.address,
        start: timestamp + 1,
        period: coverData.period,
        gracePeriod: 7,
      });

      const coverId = 2;

      const newCoverData = await cover.getCoverData(coverId);
      const claimId = (await claims.getClaimsCount()) + 1n;
      await claims.connect(originalOwner).submitClaim(coverId, newCoverData.amount, ipfsHash, { value: deposit });

      const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
      const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
      await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.ACCEPTED, payoutRedemptionEnd, cooldownEnd);

      const newOwnerBalanceBefore = await ethers.provider.getBalance(newOwner.address);
      await coverNFT.connect(originalOwner).transferFrom(originalOwner.address, newOwner.address, coverId);

      await setNextBlockBaseFee('0');
      await claims.connect(newOwner).redeemClaimPayout(claimId, { gasPrice: 0 }); // only NFT owner can redeem
      const newOwnerBalanceAfter = await ethers.provider.getBalance(newOwner.address);

      expect(newOwnerBalanceAfter).to.be.equal(newOwnerBalanceBefore + newCoverData.amount + deposit);
    }
  });

  it('sends the payout amount in DAI and the assessment deposit to the cover owner', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, coverNFT, assessment, dai } = fixture.contracts;
    const { claimDepositInETH: deposit } = fixture.config;
    const [originalOwner, newOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: originalOwner.address, coverAsset: ASSET.DAI });
    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);

    const ethBalanceBefore = await ethers.provider.getBalance(originalOwner.address);
    const daiBalanceBefore = await dai.balanceOf(originalOwner.address);

    await setNextBlockBaseFee('0');
    const claimId = (await claims.getClaimsCount()) + 1n;
    await claims
      .connect(originalOwner)
      .submitClaim(coverId, coverData.amount, ipfsHash, { value: deposit, gasPrice: 0 });

    const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
    const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
    await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.ACCEPTED, payoutRedemptionEnd, cooldownEnd);

    await setNextBlockBaseFee('0');
    await claims.connect(originalOwner).redeemClaimPayout(claimId, { gasPrice: 0 });
    const ethBalanceAfter = await ethers.provider.getBalance(originalOwner.address);
    const daiBalanceAfter = await dai.balanceOf(originalOwner.address);

    expect(ethBalanceAfter).to.be.equal(ethBalanceBefore);
    expect(daiBalanceAfter).to.be.equal(daiBalanceBefore + coverData.amount);

    {
      await createMockCover(cover, { owner: originalOwner.address, coverAsset: ASSET.DAI });

      const coverId = 2;
      const coverData = await cover.getCoverData(coverId);
      const newOwnerEthBalanceBefore = await ethers.provider.getBalance(newOwner.address);
      const newOwnerDaiBalanceBefore = await dai.balanceOf(newOwner.address);
      const claimId = (await claims.getClaimsCount()) + 1n;

      await setNextBlockBaseFee('0');
      await claims
        .connect(originalOwner)
        .submitClaim(coverId, coverData.amount, ipfsHash, { value: deposit, gasPrice: 0 });

      const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
      const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
      await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.ACCEPTED, payoutRedemptionEnd, cooldownEnd);

      await coverNFT.connect(originalOwner).transferFrom(originalOwner.address, newOwner.address, coverId);

      await setNextBlockBaseFee('0');
      await claims.connect(newOwner).redeemClaimPayout(claimId, { gasPrice: 0 }); // onlyNFT owner can redeem
      const newOwnerEthBalanceAfter = await ethers.provider.getBalance(newOwner.address);
      const newOwnerDaiBalanceAfter = await dai.balanceOf(newOwner.address);

      expect(newOwnerEthBalanceAfter).to.be.equal(newOwnerEthBalanceBefore + deposit);
      expect(newOwnerDaiBalanceAfter).to.be.equal(newOwnerDaiBalanceBefore + coverData.amount);
    }
  });

  it('calls burnStake on the Cover contract with the cover id and the payout amount', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment } = fixture.contracts;
    const { claimDepositInETH: deposit } = fixture.config;
    const [coverOwner] = fixture.accounts.members;

    for (let i = 0; i <= 3; i++) {
      await createMockCover(cover, { owner: coverOwner.address, coverAsset: ASSET.DAI });
    }

    {
      const coverId = 3;
      const { amount: coverAmount } = await cover.getCoverData(coverId);
      await setNextBlockBaseFee('0');
      const claimId = (await claims.getClaimsCount()) + 1n;
      await claims.connect(coverOwner).submitClaim(coverId, coverAmount, ipfsHash, { value: deposit, gasPrice: 0 });

      const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
      const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
      await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.ACCEPTED, payoutRedemptionEnd, cooldownEnd);

      await claims.connect(coverOwner).redeemClaimPayout(claimId, { gasPrice: 0 });
      const burnStakeCalledWith = await cover.burnStakeCalledWith();
      expect(burnStakeCalledWith.amount).to.be.equal(coverAmount);
    }

    {
      const coverId = 2;
      const coverData = await cover.getCoverData(coverId);
      const claimAmount = coverData.amount / 2n;

      await setNextBlockBaseFee('0');
      const claimId = (await claims.getClaimsCount()) + 1n;
      await claims.connect(coverOwner).submitClaim(coverId, claimAmount, ipfsHash, { value: deposit, gasPrice: 0 });

      const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
      const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
      await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.ACCEPTED, payoutRedemptionEnd, cooldownEnd);

      await setNextBlockBaseFee('0');
      await claims.connect(coverOwner).redeemClaimPayout(claimId, { gasPrice: 0 });

      const burnStakeCalledWith = await cover.burnStakeCalledWith();
      expect(burnStakeCalledWith.amount).to.be.equal(claimAmount);
    }
  });

  it('redeem payout should revert if payout is paused', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment, registry } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const claimId = (await claims.getClaimsCount()) + 1n;
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
    const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
    await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.ACCEPTED, payoutRedemptionEnd, cooldownEnd);

    await registry.confirmPauseConfig(PAUSE_CLAIMS_PAYOUT);

    await expect(claims.connect(coverOwner).redeemClaimPayout(claimId)).to.be.revertedWithCustomError(claims, 'Paused');
  });
});

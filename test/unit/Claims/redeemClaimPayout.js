const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { parseEther, toBeHex } = ethers;

const { mineNextBlock, setNextBlockTime, setNextBlockBaseFee } = require('../../utils/evm');
const { PAUSE_CLAIMS_PAYOUT } = require('../../utils/registry');
const { ASSET, ASSESSMENT_STATUS, createMockCover, submitClaim } = require('./helpers');
const { setup } = require('./setup');

const daysToSeconds = days => days * 24 * 60 * 60;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

describe('redeemClaimPayout', function () {
  it('reverts if the claim is not accepted', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    const period = daysToSeconds('30');
    const gracePeriod = daysToSeconds('180');

    await createMockCover(cover, { owner: coverOwner.address, period, gracePeriod });

    const claimId = await claims.getClaimsCount() + 1n;
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    const { timestamp } = await ethers.provider.getBlock('latest');

    // denied
    await assessment.setAssessmentResult(claimId, timestamp, ASSESSMENT_STATUS.DENIED);
    await expect(claims.redeemClaimPayout(claimId)).to.be.revertedWithCustomError(
      claims,
      'InvalidAssessmentStatus',
    );

    // draw
    await assessment.setAssessmentResult(claimId, timestamp, ASSESSMENT_STATUS.DRAW);
    await expect(claims.redeemClaimPayout(claimId)).to.be.revertedWithCustomError(
      claims,
      'InvalidAssessmentStatus',
    );
  });

  it('reverts while the claim is being assessed or in cooldown period', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    const period = daysToSeconds('30');
    const gracePeriod = daysToSeconds('180');

    await createMockCover(cover, { owner: coverOwner.address, period, gracePeriod });

    const claimId = await claims.getClaimsCount() + 1n;
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    const { timestamp } = await ethers.provider.getBlock('latest');

    // still voting
    await assessment.setAssessmentResult(claimId, timestamp, ASSESSMENT_STATUS.VOTING);
    await expect(claims.redeemClaimPayout(claimId)).to.be.revertedWithCustomError(
      claims,
      'InvalidAssessmentStatus',
    );

    // cooldown
    await assessment.setAssessmentResult(claimId, timestamp, ASSESSMENT_STATUS.COOLDOWN);
    await expect(claims.redeemClaimPayout(claimId)).to.be.revertedWithCustomError(
      claims,
      'InvalidAssessmentStatus',
    );
  });

  it('reverts if the redemption period expired', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const { payoutRedemptionPeriod } = fixture.config;

    await createMockCover(cover, { owner: coverOwner.address });

    const claimId = await claims.getClaimsCount() + 1n;
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    const { timestamp } = await ethers.provider.getBlock('latest');
    await assessment.setAssessmentResult(claimId, timestamp, ASSESSMENT_STATUS.ACCEPTED);

    await expect(claims.redeemClaimPayout(claimId)).not.to.be.reverted;

    await setTime(timestamp + payoutRedemptionPeriod);
    await expect(claims.redeemClaimPayout(claimId)).to.be.revertedWithCustomError(
      claims,
      'RedemptionPeriodExpired',
    );
  });

  it('reverts if a payout has already been redeemed', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const claimId = await claims.getClaimsCount() + 1n;
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    const { timestamp } = await ethers.provider.getBlock('latest');
    await assessment.setAssessmentResult(claimId, timestamp, ASSESSMENT_STATUS.ACCEPTED);

    await expect(claims.redeemClaimPayout(claimId)).not.to.be.reverted;
    await expect(claims.redeemClaimPayout(claimId)).to.be.revertedWithCustomError(
      claims,
      'PayoutAlreadyRedeemed',
    );
  });

  it('Should emit ClaimPayoutRedeemed event', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const claimId = await claims.getClaimsCount() + 1n;
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    const { timestamp } = await ethers.provider.getBlock('latest');
    await assessment.setAssessmentResult(claimId, timestamp, ASSESSMENT_STATUS.ACCEPTED);

    await expect(claims.connect(coverOwner).redeemClaimPayout(claimId))
      .to.emit(claims, 'ClaimPayoutRedeemed')
      .withArgs(coverOwner.address, parseEther('1'), 1, 1);
  });

  it('triggers twap update when fetching the token price', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment, pool } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });
    const claimId = await claims.getClaimsCount() + 1n;
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    const { timestamp } = await ethers.provider.getBlock('latest');
    await assessment.setAssessmentResult(claimId, timestamp, ASSESSMENT_STATUS.ACCEPTED);

    const redeemTx = await claims.redeemClaimPayout(claimId);
    expect(redeemTx).to.emit(pool, 'TwapUpdateTriggered');
  });

  it('sends the payout amount in ETH and the assessment deposit to the cover owner', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, coverNFT, assessment } = fixture.contracts;
    const { claimDepositInETH: deposit } = fixture.config;
    const [originalOwner, newOwner, otherMember] = fixture.accounts.members;

    await createMockCover(cover, { owner: originalOwner.address });

    const ethBalanceBefore = await ethers.provider.getBalance(originalOwner.address);
    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);

    const claimId = await claims.getClaimsCount() + 1n;
    await setNextBlockBaseFee('0');
    await claims
      .connect(originalOwner)
      .submitClaim(coverId, coverData.amount, toBeHex(0,32), { value: deposit, gasPrice: 0 });

    const { timestamp } = await ethers.provider.getBlock('latest');
    await assessment.setAssessmentResult(claimId, timestamp, ASSESSMENT_STATUS.ACCEPTED);

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
      const claimId = await claims.getClaimsCount() + 1n;
      await claims.connect(originalOwner).submitClaim(coverId, newCoverData.amount, toBeHex(0,32), { value: deposit });

      await assessment.setAssessmentResult(claimId, timestamp, ASSESSMENT_STATUS.ACCEPTED);

      await coverNFT.connect(originalOwner).transferFrom(originalOwner.address, newOwner.address, coverId);
      const ethBalanceBefore = await ethers.provider.getBalance(newOwner.address);
      await claims.connect(otherMember).redeemClaimPayout(claimId); // anyone can poke this
      const ethBalanceAfter = await ethers.provider.getBalance(newOwner.address);

      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore + newCoverData.amount + deposit);
    }
  });

  it('sends the payout amount in DAI and the assessment deposit to the cover owner', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, coverNFT, assessment, dai } = fixture.contracts;
    const { claimDepositInETH: deposit } = fixture.config;
    const [originalOwner, newOwner, otherMember] = fixture.accounts.members;

    await createMockCover(cover, { owner: originalOwner.address, coverAsset: ASSET.DAI });
    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);

    const ethBalanceBefore = await ethers.provider.getBalance(originalOwner.address);
    const daiBalanceBefore = await dai.balanceOf(originalOwner.address);

    await setNextBlockBaseFee('0');
    const claimId = await claims.getClaimsCount() + 1n;
    await claims
      .connect(originalOwner)
      .submitClaim(coverId, coverData.amount, toBeHex(0,32), { value: deposit, gasPrice: 0 });

    const { timestamp } = await ethers.provider.getBlock('latest');
    await assessment.setAssessmentResult(claimId, timestamp, ASSESSMENT_STATUS.ACCEPTED);

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
      const ethBalanceBefore = await ethers.provider.getBalance(newOwner.address);
      const daiBalanceBefore = await dai.balanceOf(newOwner.address);
      const claimId = await claims.getClaimsCount() + 1n;

      await setNextBlockBaseFee('0');
      await claims
        .connect(originalOwner)
        .submitClaim(coverId, coverData.amount, toBeHex(0,32), { value: deposit, gasPrice: 0 });

      const { timestamp } = await ethers.provider.getBlock('latest');
      await assessment.setAssessmentResult(claimId, timestamp, ASSESSMENT_STATUS.ACCEPTED);

      await coverNFT.connect(originalOwner).transferFrom(originalOwner.address, newOwner.address, coverId);
      await claims.connect(otherMember).redeemClaimPayout(claimId); // anyone can poke this
      const ethBalanceAfter = await ethers.provider.getBalance(newOwner.address);
      const daiBalanceAfter = await dai.balanceOf(newOwner.address);

      expect(ethBalanceAfter).to.be.equal(ethBalanceBefore + deposit);
      expect(daiBalanceAfter).to.be.equal(daiBalanceBefore + coverData.amount);
    }
  });

  it('calls burnStake on the Cover contract with the cover id and the payout amount', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment } = fixture.contracts;
    const { claimDepositInETH: deposit } = fixture.config;
    const [coverOwner, otherMember] = fixture.accounts.members;
    const { payoutCooldown } = fixture.config;

    for (let i = 0; i <= 3; i++) {
      await createMockCover(cover, { owner: coverOwner.address, coverAsset: ASSET.DAI });
    }

    {
      const coverId = 3;
      const coverData = await cover.getCoverData(coverId);
      await setNextBlockBaseFee('0');
      const claimId = await claims.getClaimsCount() + 1n;
      await claims
        .connect(coverOwner)
        .submitClaim(coverId, coverData.amount, toBeHex(0, 32), { value: deposit, gasPrice: 0 });

      const { timestamp } = await ethers.provider.getBlock('latest');
      await assessment.setAssessmentResult(claimId, timestamp, ASSESSMENT_STATUS.ACCEPTED);

      await claims.connect(coverOwner).redeemClaimPayout(claimId, { gasPrice: 0 });
      const burnStakeCalledWith = await cover.burnStakeCalledWith();
      expect(burnStakeCalledWith.amount).to.be.equal(coverData.amount);
    }

    {
      const coverId = 2;
      const coverData = await cover.getCoverData(coverId);
      const claimAmount = coverData.amount / 2n;

      await setNextBlockBaseFee('0');
      const claimId = await claims.getClaimsCount() + 1n;
      await claims.connect(coverOwner).submitClaim(coverId, claimAmount, toBeHex(0, 32), { value: deposit, gasPrice: 0 });

      const { timestamp } = await ethers.provider.getBlock('latest');
      await assessment.setAssessmentResult(claimId, timestamp, ASSESSMENT_STATUS.ACCEPTED);

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

    const claimId = await claims.getClaimsCount() + 1n;
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    const { timestamp } = await ethers.provider.getBlock('latest');
    await assessment.setAssessmentResult(claimId, timestamp, ASSESSMENT_STATUS.ACCEPTED);

    await registry.confirmPauseConfig(PAUSE_CLAIMS_PAYOUT);

    await expect(claims.connect(coverOwner).redeemClaimPayout(claimId)).to.be.revertedWithCustomError(claims, 'Paused');
  });

  it('should retrive deposit in case of draw', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment } = fixture.contracts;
    const { claimDepositInETH: deposit } = fixture.config;
    const [originalOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: originalOwner.address });

    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);

    const claimId = await claims.getClaimsCount() + 1n;
    await setNextBlockBaseFee('0');
    await claims
      .connect(originalOwner)
      .submitClaim(coverId, coverData.amount, toBeHex(0,32), { value: deposit, gasPrice: 0 });

    const ethBalanceAfterSubmittingClaim = await ethers.provider.getBalance(originalOwner.address);

    const { timestamp } = await ethers.provider.getBlock('latest');
    await assessment.setAssessmentResult(claimId, timestamp, ASSESSMENT_STATUS.DRAW);

    await setNextBlockBaseFee('0');
    await claims.connect(originalOwner).retriveDeposit(claimId, { gasPrice: 0 });
    const ethBalanceAfter = await ethers.provider.getBalance(originalOwner.address);

    expect(ethBalanceAfter).to.be.equal(ethBalanceAfterSubmittingClaim + deposit);
  });

  it('should not be able to call retrive deposit of not a draw',  async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment } = fixture.contracts;
    const { claimDepositInETH: deposit } = fixture.config;
    const [originalOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: originalOwner.address });

    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);

    const claimId = await claims.getClaimsCount() + 1n;
    await setNextBlockBaseFee('0');
    await claims
      .connect(originalOwner)
      .submitClaim(coverId, coverData.amount, toBeHex(0,32), { value: deposit, gasPrice: 0 });

    const { timestamp } = await ethers.provider.getBlock('latest');

    await assessment.setAssessmentResult(claimId, timestamp, ASSESSMENT_STATUS.ACCEPTED);
    await expect(claims.connect(originalOwner).retriveDeposit(claimId, { gasPrice: 0 })).to.be.revertedWithCustomError(
      claims,
      'InvalidAssessmentStatus'
    );

    await assessment.setAssessmentResult(claimId, timestamp, ASSESSMENT_STATUS.DENIED);
    await expect(claims.connect(originalOwner).retriveDeposit(claimId, { gasPrice: 0 })).to.be.revertedWithCustomError(
      claims,
      'InvalidAssessmentStatus'
    );

    await assessment.setAssessmentResult(claimId, timestamp, ASSESSMENT_STATUS.VOTING);
    await expect(claims.connect(originalOwner).retriveDeposit(claimId, { gasPrice: 0 })).to.be.revertedWithCustomError(
      claims,
      'InvalidAssessmentStatus'
    );

    await assessment.setAssessmentResult(claimId, timestamp, ASSESSMENT_STATUS.COOLDOWN);
    await expect(claims.connect(originalOwner).retriveDeposit(claimId, { gasPrice: 0 })).to.be.revertedWithCustomError(
      claims,
      'InvalidAssessmentStatus'
    );
  });

  it('retrive deposit should revert if payout is paused', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment, registry } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const claimId = await claims.getClaimsCount() + 1n;
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    const { timestamp } = await ethers.provider.getBlock('latest');
    await assessment.setAssessmentResult(claimId, timestamp, ASSESSMENT_STATUS.DRAW);

    await registry.confirmPauseConfig(PAUSE_CLAIMS_PAYOUT);

    await expect(claims.connect(coverOwner).retriveDeposit(claimId)).to.be.revertedWithCustomError(claims, 'Paused');
  });
});

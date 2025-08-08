const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setNextBlockBaseFee } = require('../../utils/evm');
const { PAUSE_CLAIMS_PAYOUT } = require('../../utils/registry');
const { ASSET, ASSESSMENT_STATUS, createMockCover, submitClaim, daysToSeconds } = require('./helpers');
const { setup } = require('./setup');

describe('retrieveDeposit', function () {
  it('reverts if the claim does not exist', async function () {
    const fixture = await loadFixture(setup);
    const { claims } = fixture.contracts;

    const nonExistentClaimId = 999;
    await expect(claims.retrieveDeposit(nonExistentClaimId)).to.be.revertedWithCustomError(claims, 'InvalidClaimId');
  });

  it('reverts if the claim is not in DRAW status', async function () {
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

    // Test all non-DRAW statuses
    await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.VOTING, payoutRedemptionEnd, cooldownEnd);
    await expect(claims.retrieveDeposit(claimId)).to.be.revertedWithCustomError(claims, 'InvalidAssessmentStatus');

    await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.COOLDOWN, payoutRedemptionEnd, cooldownEnd);
    await expect(claims.retrieveDeposit(claimId)).to.be.revertedWithCustomError(claims, 'InvalidAssessmentStatus');

    await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.ACCEPTED, payoutRedemptionEnd, cooldownEnd);
    await expect(claims.retrieveDeposit(claimId)).to.be.revertedWithCustomError(claims, 'InvalidAssessmentStatus');

    await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.DENIED, payoutRedemptionEnd, cooldownEnd);
    await expect(claims.retrieveDeposit(claimId)).to.be.revertedWithCustomError(claims, 'InvalidAssessmentStatus');
  });

  it('reverts if the deposit has already been retrieved', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const claimId = (await claims.getClaimsCount()) + 1n;
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
    const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
    await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.DRAW, payoutRedemptionEnd, cooldownEnd);

    await expect(claims.retrieveDeposit(claimId)).not.to.be.reverted;
    await expect(claims.retrieveDeposit(claimId)).to.be.revertedWithCustomError(claims, 'DepositAlreadyRetrieved');
  });

  it('reverts if claims payout is paused', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment, registry } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const claimId = (await claims.getClaimsCount()) + 1n;
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
    const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
    await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.DRAW, payoutRedemptionEnd, cooldownEnd);

    await registry.confirmPauseConfig(PAUSE_CLAIMS_PAYOUT);

    await expect(claims.retrieveDeposit(claimId)).to.be.revertedWithCustomError(claims, 'Paused');
  });

  it('successfully retrieves deposit when claim status is DRAW', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment } = fixture.contracts;
    const { claimDepositInETH: deposit } = fixture.config;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);

    const claimId = (await claims.getClaimsCount()) + 1n;
    const ipfsHash = ethers.solidityPackedKeccak256(['string'], ['ipfs-hash']);

    await setNextBlockBaseFee('0');
    await claims.connect(coverOwner).submitClaim(coverId, coverData.amount, ipfsHash, { value: deposit, gasPrice: 0 });

    const ethBalanceAfterSubmittingClaim = await ethers.provider.getBalance(coverOwner.address);

    const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
    const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
    await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.DRAW, payoutRedemptionEnd, cooldownEnd);

    await setNextBlockBaseFee('0');
    await claims.connect(coverOwner).retrieveDeposit(claimId, { gasPrice: 0 });
    const ethBalanceAfter = await ethers.provider.getBalance(coverOwner.address);

    expect(ethBalanceAfter).to.be.equal(ethBalanceAfterSubmittingClaim + deposit);
  });

  it('emits ClaimDepositRetrieved event with correct parameters', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const claimId = (await claims.getClaimsCount()) + 1n;
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
    const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
    await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.DRAW, payoutRedemptionEnd, cooldownEnd);

    await expect(claims.retrieveDeposit(claimId))
      .to.emit(claims, 'ClaimDepositRetrieved')
      .withArgs(claimId, coverOwner.address);
  });

  it('sets depositRetrieved to true in the claim struct', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const claimId = (await claims.getClaimsCount()) + 1n;
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
    const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
    await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.DRAW, payoutRedemptionEnd, cooldownEnd);

    const claimBefore = await claims.getClaimInfo(claimId);
    expect(claimBefore.depositRetrieved).to.be.false;

    await claims.retrieveDeposit(claimId);

    const claimAfter = await claims.getClaimInfo(claimId);
    expect(claimAfter.depositRetrieved).to.be.true;
  });

  it('returns deposit to the current cover NFT owner', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, coverNFT, assessment } = fixture.contracts;
    const { claimDepositInETH: deposit } = fixture.config;
    const [originalOwner, newOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: originalOwner.address });

    const coverId = 1;
    const claimId = (await claims.getClaimsCount()) + 1n;
    await submitClaim(fixture)({ coverId, sender: originalOwner });
    const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
    const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
    await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.DRAW, payoutRedemptionEnd, cooldownEnd);

    // Transfer NFT to new owner before retrieving deposit
    await coverNFT.connect(originalOwner).transferFrom(originalOwner.address, newOwner.address, coverId);

    const newOwnerBalanceBefore = await ethers.provider.getBalance(newOwner.address);
    const originalOwnerBalanceBefore = await ethers.provider.getBalance(originalOwner.address);

    await setNextBlockBaseFee('0');
    await claims.connect(newOwner).retrieveDeposit(claimId, { gasPrice: 0 });

    const newOwnerBalanceAfter = await ethers.provider.getBalance(newOwner.address);
    const originalOwnerBalanceAfter = await ethers.provider.getBalance(originalOwner.address);

    // Deposit goes to current NFT owner (newOwner), not original claim submitter
    expect(newOwnerBalanceAfter).to.equal(newOwnerBalanceBefore + deposit);
    expect(originalOwnerBalanceAfter).to.equal(originalOwnerBalanceBefore);
  });

  it('can be called by anyone but deposit goes to cover owner', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment } = fixture.contracts;
    const { claimDepositInETH: deposit } = fixture.config;
    const [coverOwner, otherMember] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const claimId = (await claims.getClaimsCount()) + 1n;
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
    const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
    await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.DRAW, payoutRedemptionEnd, cooldownEnd);

    const coverOwnerBalanceBefore = await ethers.provider.getBalance(coverOwner.address);
    const otherMemberBalanceBefore = await ethers.provider.getBalance(otherMember.address);

    await setNextBlockBaseFee('0');
    await claims.connect(otherMember).retrieveDeposit(claimId, { gasPrice: 0 });

    const coverOwnerBalanceAfter = await ethers.provider.getBalance(coverOwner.address);
    const otherMemberBalanceAfter = await ethers.provider.getBalance(otherMember.address);

    // Deposit goes to cover owner, not the caller
    expect(coverOwnerBalanceAfter).to.equal(coverOwnerBalanceBefore + deposit);
    expect(otherMemberBalanceAfter).to.equal(otherMemberBalanceBefore);
  });

  it('allows multiple claims on same cover to have deposits retrieved independently', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    // Submit first claim and set to DRAW
    const firstClaimId = (await claims.getClaimsCount()) + 1n;
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    let { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
    let payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
    await assessment.setAssessmentResult(firstClaimId, ASSESSMENT_STATUS.DRAW, payoutRedemptionEnd, cooldownEnd);

    // Submit second claim and set to DRAW
    const secondClaimId = (await claims.getClaimsCount()) + 1n;
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    ({ timestamp: cooldownEnd } = await ethers.provider.getBlock('latest'));
    payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
    await assessment.setAssessmentResult(secondClaimId, ASSESSMENT_STATUS.DRAW, payoutRedemptionEnd, cooldownEnd);

    // Retrieve deposit from first claim
    await claims.retrieveDeposit(firstClaimId);

    const firstClaim = await claims.getClaimInfo(firstClaimId);
    const secondClaim = await claims.getClaimInfo(secondClaimId);

    expect(firstClaim.depositRetrieved).to.be.true;
    expect(secondClaim.depositRetrieved).to.be.false;

    // Should still be able to retrieve deposit from second claim
    await expect(claims.retrieveDeposit(secondClaimId)).not.to.be.reverted;

    const secondClaimAfter = await claims.getClaimInfo(secondClaimId);
    expect(secondClaimAfter.depositRetrieved).to.be.true;
  });

  it('calls pool.returnDeposit with correct parameters', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment, pool } = fixture.contracts;
    const { claimDepositInETH: deposit } = fixture.config;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const claimId = (await claims.getClaimsCount()) + 1n;
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
    const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
    await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.DRAW, payoutRedemptionEnd, cooldownEnd);

    const poolBalanceBefore = await ethers.provider.getBalance(await pool.getAddress());

    await claims.retrieveDeposit(claimId);

    const poolBalanceAfter = await ethers.provider.getBalance(await pool.getAddress());

    // Pool balance should decrease by the deposit amount
    expect(poolBalanceAfter).to.equal(poolBalanceBefore - deposit);
  });

  it('works correctly for non-ETH denominated cover', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment } = fixture.contracts;
    const { claimDepositInETH: deposit } = fixture.config;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address, coverAsset: ASSET.DAI });

    const claimId = (await claims.getClaimsCount()) + 1n;
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
    const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
    await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.DRAW, payoutRedemptionEnd, cooldownEnd);

    const balanceBefore = await ethers.provider.getBalance(coverOwner.address);

    await setNextBlockBaseFee('0');
    await claims.connect(coverOwner).retrieveDeposit(claimId, { gasPrice: 0 });

    const balanceAfter = await ethers.provider.getBalance(coverOwner.address);

    // Deposit is always returned in ETH regardless of cover asset
    expect(balanceAfter).to.equal(balanceBefore + deposit);
  });
});

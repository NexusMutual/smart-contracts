const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');
const { parseEther } = ethers;

const { setNextBlockTime, setCode } = require('../../utils/evm');

const { createMockCover, submitClaim, daysToSeconds } = require('./helpers');
const { setup } = require('./setup');

const { AssessmentStatus, AssessmentOutcome, PoolAsset } = nexus.constants;

describe('submitClaim', function () {
  const ipfsHash = ethers.solidityPackedKeccak256(['string'], ['ipfs-hash']);

  it('reverts if sender is not a member', async function () {
    const fixture = await loadFixture(setup);
    const { claims } = fixture.contracts;
    const [nonMember] = fixture.accounts.nonMembers;
    const submitClaim = claims.connect(nonMember).submitClaim(1, parseEther('100'), ipfsHash);
    await expect(submitClaim).to.be.revertedWithCustomError(claims, 'OnlyMember');
  });

  it('reverts if sender is not the cover owner', async function () {
    const fixture = await loadFixture(setup);
    const { cover, coverNFT, claims } = fixture.contracts;
    const [coverOwner, otherMember, approvedMember] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const coverId = 1;
    // Not owner fails
    const notOwnerSubmitClaim = submitClaim(fixture)({ coverId, sender: otherMember });
    await expect(notOwnerSubmitClaim).to.be.revertedWithCustomError(claims, 'NotCoverOwner');
    // Owner succeeds
    const ownerSubmitClaim = submitClaim(fixture)({ coverId, sender: coverOwner });
    await expect(ownerSubmitClaim).not.to.be.revertedWithCustomError(claims, 'NotCoverOwner');

    const { timestamp } = await ethers.provider.getBlock('latest');
    await createMockCover(cover, { owner: coverOwner.address, start: timestamp + 1 });

    const coverId2 = 2;
    // Approved also fails
    await coverNFT.connect(coverOwner).approve(approvedMember.address, coverId2);
    const approvedSubmitClaim = submitClaim(fixture)({ coverId: coverId2, sender: approvedMember });
    await expect(approvedSubmitClaim).to.be.revertedWithCustomError(claims, 'NotCoverOwner');
  });

  it('reverts if a claim on the same cover is already being assessed', async function () {
    const fixture = await loadFixture(setup);
    const { cover, assessment, claims } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const claimId = await claims.getClaimsCount();
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });

    await assessment.setAssessmentForStatus(claimId, AssessmentStatus.Voting);
    await expect(submitClaim(fixture)({ coverId: 1, sender: coverOwner })).to.be.revertedWithCustomError(
      claims,
      'ClaimIsBeingAssessed',
    );

    await assessment.setAssessmentForStatus(claimId, AssessmentStatus.Cooldown);
    await expect(submitClaim(fixture)({ coverId: 1, sender: coverOwner })).to.be.revertedWithCustomError(
      claims,
      'ClaimIsBeingAssessed',
    );
  });

  it('reverts if the submission deposit is not an exact amount', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover } = fixture.contracts;
    const { claimDepositInETH: deposit } = fixture.config;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });
    const coverId = 1;

    const amount = parseEther('100');

    // not sending deposit
    const submitClaimNoDeposit = submitClaim(fixture)({ coverId, amount, sender: coverOwner, value: 0n });
    await expect(submitClaimNoDeposit).to.be.revertedWithCustomError(claims, 'AssessmentDepositNotExact');

    // sending less than expected
    const submitClaimLess = submitClaim(fixture)({ coverId, amount, sender: coverOwner, value: deposit - 1n });
    await expect(submitClaimLess).to.be.revertedWithCustomError(claims, 'AssessmentDepositNotExact');

    // sending more than expected
    const submitClaimMore = submitClaim(fixture)({ coverId, amount, sender: coverOwner, value: deposit + 1n });
    await expect(submitClaimMore).to.be.revertedWithCustomError(claims, 'AssessmentDepositNotExact');
  });

  it('reverts if the requested amount exceeds cover amount', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover } = fixture.contracts;
    const { claimDepositInETH: deposit } = fixture.config;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address, amount: parseEther('100') });

    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);

    const amountExceeded = coverData.amount + 1n;
    const submitClaimExceeded = submitClaim(fixture)({ coverId, amount: amountExceeded, value: deposit });
    await expect(submitClaimExceeded).to.be.revertedWithCustomError(claims, 'CoveredAmountExceeded');
  });

  it('reverts if the claim submission is made in the same block as the cover purchase', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover } = fixture.contracts;
    const { claimDepositInETH: deposit } = fixture.config;
    const [coverOwner] = fixture.accounts.members;

    const { timestamp } = await ethers.provider.getBlock('latest');
    const start = timestamp + 10;

    await createMockCover(cover, { owner: coverOwner.address, start });

    const coverId = 1;
    const { amount } = await cover.getCoverData(coverId);

    await setNextBlockTime(start);
    const submitClaimSameBlock = submitClaim(fixture)({ coverId, amount, value: deposit, sender: coverOwner });
    await expect(submitClaimSameBlock).to.be.revertedWithCustomError(claims, 'CantBuyCoverAndClaimInTheSameBlock');
  });

  it('reverts if the cover is outside the grace period', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, coverProducts } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const { gracePeriod } = await coverProducts.getProductType(0);

    await createMockCover(cover, { owner: coverOwner.address, gracePeriod });

    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);

    // Advance time to grace period expiry
    await time.increase(Number(coverData.start) + Number(coverData.period) + Number(gracePeriod));

    await expect(submitClaim(fixture)({ coverId })).to.be.revertedWithCustomError(claims, 'GracePeriodPassed');
  });

  it('Assessment should use cover grace period and not product.gracePeriod', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, coverProducts } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const [boardMember] = fixture.accounts.advisoryBoardMembers;

    const productTypeData = await coverProducts.getProductType(0);
    const { claimMethod, gracePeriod, assessmentCooldownPeriod, payoutRedemptionPeriod } = productTypeData;

    // create a cover using the default grace period
    await createMockCover(cover, { owner: coverOwner.address, gracePeriod });

    // edit product type with longer grace period
    const longerGracePeriod = gracePeriod * 100n;
    const productTypeLongerGracePeriod = {
      claimMethod,
      gracePeriod: longerGracePeriod,
      assessmentCooldownPeriod,
      payoutRedemptionPeriod,
    };
    await coverProducts.connect(boardMember).editProductTypes([0], [productTypeLongerGracePeriod], ['ipfs hash']);

    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);

    // Advance time to grace period expiry
    await time.increase(Number(coverData.start) + Number(coverData.period) + Number(gracePeriod));

    await expect(submitClaim(fixture)({ coverId })).to.be.revertedWithCustomError(claims, 'GracePeriodPassed');
  });

  it('calls startAssessment with the right productTypeId', async function () {
    const fixture = await loadFixture(setup);
    const { assessment, claims, cover } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address, productId: 1 });

    const coverId = 1;

    const claimId = await claims.getClaimsCount();
    await submitClaim(fixture)({ coverId, sender: coverOwner });

    expect(await assessment._productTypeForClaimId(claimId)).to.equal(1n);
  });

  it('emits MetadataSubmitted event with the provided ipfsMetadata when it is not an empty bytes', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover } = fixture.contracts;
    const ipfsMetadata = ipfsHash;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const coverId = 1;
    const submitClaimTx = submitClaim(fixture)({ coverId, ipfsMetadata, sender: coverOwner });

    const claimId = await claims.getClaimsCount();
    await submitClaimTx;
    await expect(submitClaimTx).to.emit(claims, 'MetadataSubmitted').withArgs(claimId, ipfsHash);

    await createMockCover(cover, { owner: coverOwner.address });

    // does not emit event if ipfsMetadata is empty
    await expect(submitClaim(fixture)({ coverId: 2, sender: coverOwner })).not.to.emit(claims, 'MetadataSubmitted');
  });

  it('stores the claimId in lastClaimSubmissionOnCover', async function () {
    const fixture = await loadFixture(setup);
    const { assessment, claims, cover } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    // Create 2 covers
    await Promise.all([
      createMockCover(cover, { owner: coverOwner.address }),
      createMockCover(cover, { owner: coverOwner.address }),
    ]);

    // First claim on cover 1
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    expect(await claims.lastClaimSubmissionOnCover(1)).to.equal(1n);
    expect(await claims.lastClaimSubmissionOnCover(2)).to.equal(0n);

    // Claim on cover 2
    await submitClaim(fixture)({ coverId: 2, sender: coverOwner });
    expect(await claims.lastClaimSubmissionOnCover(1)).to.equal(1n);
    expect(await claims.lastClaimSubmissionOnCover(2)).to.equal(2n);

    // Set cover 1 claim to DRAW to allow retry
    await assessment.setAssessmentForOutcome(1, AssessmentOutcome.Draw);

    // Second claim on cover 1 (retry after DRAW)
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    expect(await claims.lastClaimSubmissionOnCover(1)).to.equal(3n);
    expect(await claims.lastClaimSubmissionOnCover(2)).to.equal(2n);
  });

  it('should transfer assessment deposit to pool', async function () {
    const fixture = await loadFixture(setup);
    const { cover, pool } = fixture.contracts;
    const { claimDepositInETH: deposit } = fixture.config;
    const [coverOwner] = fixture.accounts.members;

    const poolAddress = await pool.getAddress();

    await createMockCover(cover, { owner: coverOwner.address });

    const balanceBefore = await ethers.provider.getBalance(poolAddress);

    const coverId = 1;
    await submitClaim(fixture)({ coverId, sender: coverOwner });
    expect(await ethers.provider.getBalance(poolAddress)).to.equal(balanceBefore + deposit);
  });

  it('should emit ClaimSubmitted event', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address, productId: 2 });

    const coverId = 1;

    const submitClaimTx = submitClaim(fixture)({ coverId, sender: coverOwner });
    await expect(submitClaimTx).to.emit(claims, 'ClaimSubmitted').withArgs(coverOwner.address, 1, coverId, 2);
  });

  it('creates claim struct with correct initial values', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    const claimAmount = parseEther('50');
    await createMockCover(cover, { owner: coverOwner.address, amount: parseEther('100'), coverAsset: PoolAsset.DAI });

    const coverId = 1;

    const claimId = await claims.getClaimsCount();
    await submitClaim(fixture)({ coverId, amount: claimAmount, sender: coverOwner });

    const claim = await claims.getClaim(claimId);

    expect(claim.coverId).to.equal(coverId);
    expect(claim.amount).to.equal(claimAmount);
    expect(claim.coverAsset).to.equal(PoolAsset.DAI);
    expect(claim.payoutRedeemed).to.be.false;
    expect(claim.depositRetrieved).to.be.false;
  });

  it('pushes claimId to memberClaims', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, registry } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    const claimAmount = parseEther('50');
    await createMockCover(cover, { owner: coverOwner.address, amount: parseEther('100'), coverAsset: PoolAsset.DAI });

    const coverId = 1;

    const claimId = await claims.getClaimsCount();
    await submitClaim(fixture)({ coverId, amount: claimAmount, sender: coverOwner });

    const memberId = await registry.getMemberId(coverOwner.address);
    const memberClaims = await claims.getMemberClaims(memberId);
    expect(memberClaims).to.deep.equal([claimId]);
  });

  it('correctly tracks payoutRedeemed and depositRetrieved through claim lifecycle', async function () {
    const fixture = await loadFixture(setup);
    const { cover, assessment, claims } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    // Submit claim
    const claimId = await claims.getClaimsCount();
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });

    // Both fields should be false
    let claim = await claims.getClaim(claimId);
    expect(claim.payoutRedeemed).to.be.false;
    expect(claim.depositRetrieved).to.be.false;

    // Accept the claim - set up Assessment struct to produce ACCEPTED outcome via AssessmentLib
    await assessment.setAssessmentForOutcome(claimId, AssessmentOutcome.Accepted);

    // State should still be false until payout is redeemed
    claim = await claims.getClaim(claimId);
    expect(claim.payoutRedeemed).to.be.false;
    expect(claim.depositRetrieved).to.be.false;

    // Redeem payout
    await claims.connect(coverOwner).redeemClaimPayout(claimId);

    // Both fields should become true
    claim = await claims.getClaim(claimId);
    expect(claim.payoutRedeemed).to.be.true;
    expect(claim.depositRetrieved).to.be.true;
  });

  it('should revert if assessment deposit to pool fails', async function () {
    const fixture = await loadFixture(setup);
    const { cover, pool, claims } = fixture.contracts;
    const { claimDepositInETH: deposit } = fixture.config;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const coverId = 1;
    const { amount } = await cover.getCoverData(coverId);

    const poolRejectingEth = await ethers.deployContract('PoolEtherRejecterMock', []);
    const bytecode = await ethers.provider.getCode(poolRejectingEth.target);
    await setCode(pool.target, bytecode);

    const ipfsHash = ethers.solidityPackedKeccak256(['string'], ['ipfs-hash']);
    const overrides = { value: deposit };
    const submitClaimTx = claims.connect(coverOwner).submitClaim(coverId, amount, ipfsHash, overrides);

    await expect(submitClaimTx).to.be.revertedWithCustomError(claims, 'AssessmentDepositTransferToPoolFailed');
  });

  it('reverts if a payout on the same cover can be redeemed', async function () {
    const fixture = await loadFixture(setup);
    const { cover, assessment, claims } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const claimId = await claims.getClaimsCount();
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });

    const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
    const payoutRedemptionPeriod = daysToSeconds(30);
    const payoutRedemptionEnd = cooldownEnd + payoutRedemptionPeriod;
    await assessment.setAssessmentForOutcome(claimId, AssessmentOutcome.Accepted);

    // Should block new claim during redemption period
    await time.increase(payoutRedemptionPeriod - daysToSeconds(1));
    const submitClaimTx = submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    await expect(submitClaimTx).to.be.revertedWithCustomError(claims, 'PayoutCanStillBeRedeemed');

    // Should allow new claim after redemption period expires
    await time.increaseTo(payoutRedemptionEnd);
    await expect(submitClaim(fixture)({ coverId: 1, sender: coverOwner })).not.to.be.reverted;
  });

  it('handles complex sequence: ACCEPTED/redeemed → new claim (DRAW) → retry claim (DENIED) → new claim', async () => {
    const fixture = await loadFixture(setup);
    const { cover, assessment, claims } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await Promise.all([
      createMockCover(cover, { owner: coverOwner.address }),
      createMockCover(cover, { owner: coverOwner.address }),
      createMockCover(cover, { owner: coverOwner.address }),
    ]);

    // First claim on cover 1: ACCEPTED and redeemed
    const firstClaimId = await claims.getClaimsCount();
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });

    await assessment.setAssessmentForOutcome(firstClaimId, AssessmentOutcome.Accepted);
    await claims.connect(coverOwner).redeemClaimPayout(firstClaimId);

    // Second claim on cover 2: set to DRAW
    const secondClaimId = await claims.getClaimsCount();
    await submitClaim(fixture)({ coverId: 2, sender: coverOwner });
    await assessment.setAssessmentForOutcome(secondClaimId, AssessmentOutcome.Draw);

    // Third claim on cover 2 again (retry for clear decision)
    const thirdClaimId = await claims.getClaimsCount();
    await submitClaim(fixture)({ coverId: 2, sender: coverOwner });
    await assessment.setAssessmentForOutcome(thirdClaimId, AssessmentOutcome.Denied);

    // Fourth claim on cover 3 (new cover)
    await expect(submitClaim(fixture)({ coverId: 3, sender: coverOwner })).not.to.be.reverted;
  });

  it('allows re-submission when the previous claim was redeemed', async function () {
    const fixture = await loadFixture(setup);
    const { cover, assessment, claims } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    // Submit and accept first claim
    const firstClaimId = await claims.getClaimsCount();
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });

    await assessment.setAssessmentForOutcome(firstClaimId, AssessmentOutcome.Accepted);

    // Redeem the payout
    await claims.connect(coverOwner).redeemClaimPayout(firstClaimId);

    // Should allow a second claim submission after payout redeemed
    const submitClaimTx = submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    await expect(submitClaimTx).to.not.be.reverted;
  });

  it('allows re-submission after DENIED claim and still', async function () {
    const fixture = await loadFixture(setup);
    const { cover, assessment, claims } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    // Submit and deny first claim
    const firstClaimId = await claims.getClaimsCount();
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });

    await assessment.setAssessmentForOutcome(firstClaimId, AssessmentOutcome.Denied);

    // Should allow re-submission after DENIED (edge case - maybe new evidence)
    await expect(submitClaim(fixture)({ coverId: 1, sender: coverOwner })).not.to.be.reverted;
  });

  it('allows re-submission before DRAW claim deposit has been retrieved', async function () {
    const fixture = await loadFixture(setup);
    const { cover, assessment, claims } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    // Submit first claim
    const firstClaimId = await claims.getClaimsCount();
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });

    // Set first claim result to DRAW
    await assessment.setAssessmentForOutcome(firstClaimId, AssessmentOutcome.Draw);

    // Should allow submitting a new claim before deposit retrieval
    await expect(submitClaim(fixture)({ coverId: 1, sender: coverOwner })).not.to.be.reverted;

    // Should allow deposit retrieval from first DRAW claim
    await expect(claims.retrieveDeposit(firstClaimId)).not.to.be.reverted;
  });

  it('allows re-submission after DRAW claim deposit has been retrieved', async function () {
    const fixture = await loadFixture(setup);
    const { cover, assessment, claims } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    // Submit first claim
    const firstClaimId = await claims.getClaimsCount();
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });

    // Set first claim result to DRAW
    await assessment.setAssessmentForOutcome(firstClaimId, AssessmentOutcome.Draw);

    // Retrieve deposit from DRAW claim
    await claims.retrieveDeposit(firstClaimId);

    // Should still allow new claims after deposit retrieval
    await expect(submitClaim(fixture)({ coverId: 1, sender: coverOwner })).not.to.be.reverted;
  });

  it('allows re-submission when user missed redeeming the payout', async function () {
    const fixture = await loadFixture(setup);
    const { cover, assessment, claims } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    // Submit and accept first claim
    const firstClaimId = await claims.getClaimsCount();
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });

    const payoutRedemptionPeriod = daysToSeconds(30);
    await assessment.setAssessmentForOutcome(firstClaimId, AssessmentOutcome.Accepted);

    // Move time past redemption period
    await time.increase(payoutRedemptionPeriod);

    // Should allow re-submission after redemption period expires (user missed deadline)
    await expect(submitClaim(fixture)({ coverId: 1, sender: coverOwner })).not.to.be.reverted;
  });
});

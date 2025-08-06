const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { parseEther } = ethers;

const { mineNextBlock, setNextBlockTime } = require('../../utils/evm');
const { ASSET, ASSESSMENT_STATUS, createMockCover, submitClaim, daysToSeconds } = require('./helpers');
const { setup } = require('./setup');

const { ContractIndexes } = nexus.constants;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

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

    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    const claimId = await claims.getClaimsCount();

    const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
    const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);

    await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.VOTING, payoutRedemptionEnd, cooldownEnd);
    await expect(submitClaim(fixture)({ coverId: 1, sender: coverOwner })).to.be.revertedWithCustomError(
      claims,
      'ClaimIsBeingAssessed',
    );

    await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.COOLDOWN, payoutRedemptionEnd, cooldownEnd);
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

    const { timestamp } = await ethers.provider.getBlock('latest');

    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);

    // Advance time to grace period expiry
    await setTime(timestamp + Number(coverData.start) + Number(coverData.period) + Number(gracePeriod));

    await expect(submitClaim(fixture)({ coverId })).to.be.revertedWithCustomError(claims, 'GracePeriodPassed');
  });

  it('Assessment should use cover grace period and not product.gracePeriod', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, coverProducts } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const [boardMember] = fixture.accounts.advisoryBoardMembers;
    const { gracePeriod } = await coverProducts.getProductType(0);

    // create a cover using the default grace period
    await createMockCover(cover, { owner: coverOwner.address, gracePeriod });

    const longerGracePeriod = gracePeriod * 100n;
    await coverProducts.connect(boardMember).editProductTypes([0], [longerGracePeriod], ['ipfs hash']);

    const { timestamp } = await ethers.provider.getBlock('latest');
    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);

    // Advance time to grace period expiry
    await setTime(timestamp + Number(coverData.start) + Number(coverData.period) + Number(gracePeriod));

    await expect(submitClaim(fixture)({ coverId })).to.be.revertedWithCustomError(claims, 'GracePeriodPassed');
  });

  it('calls startAssessment with the right productTypeId', async function () {
    const fixture = await loadFixture(setup);
    const { assessment, claims, cover } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address, productId: 1 });

    const coverId = 1;

    await submitClaim(fixture)({ coverId, sender: coverOwner });
    const claimId = await claims.getClaimsCount();

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

    const claimId = (await claims.getClaimsCount()) + 1n;
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
    const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
    const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
    await assessment.setAssessmentResult(1, ASSESSMENT_STATUS.DRAW, payoutRedemptionEnd, cooldownEnd);

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
    await createMockCover(cover, { owner: coverOwner.address, amount: parseEther('100'), coverAsset: ASSET.DAI });

    const coverId = 1;
    const claimId = (await claims.getClaimsCount()) + 1n;

    await submitClaim(fixture)({ coverId, amount: claimAmount, sender: coverOwner });

    const claim = await claims.getClaimInfo(claimId);

    expect(claim.coverId).to.equal(coverId);
    expect(claim.amount).to.equal(claimAmount);
    expect(claim.coverAsset).to.equal(ASSET.DAI);
    expect(claim.payoutRedeemed).to.be.false;
    expect(claim.depositRetrieved).to.be.false;
  });

  it('correctly tracks payoutRedeemed and depositRetrieved through claim lifecycle', async function () {
    const fixture = await loadFixture(setup);
    const { cover, assessment, claims } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    // Submit claim
    const claimId = (await claims.getClaimsCount()) + 1n;
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });

    // Both fields should be false
    let claim = await claims.getClaimInfo(claimId);
    expect(claim.payoutRedeemed).to.be.false;
    expect(claim.depositRetrieved).to.be.false;

    // Accept the claim
    const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
    const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
    await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.ACCEPTED, payoutRedemptionEnd, cooldownEnd);

    // State should still be false until payout is redeemed
    claim = await claims.getClaimInfo(claimId);
    expect(claim.payoutRedeemed).to.be.false;
    expect(claim.depositRetrieved).to.be.false;

    // Redeem payout
    await claims.connect(coverOwner).redeemClaimPayout(claimId);

    // Both fields should become true
    claim = await claims.getClaimInfo(claimId);
    expect(claim.payoutRedeemed).to.be.true;
    expect(claim.depositRetrieved).to.be.true;
  });

  it('should revert if assessment deposit to pool fails', async function () {
    const fixture = await loadFixture(setup);
    const { cover, registry } = fixture.contracts;
    const { claimDepositInETH: deposit } = fixture.config;
    const [coverOwner] = fixture.accounts.members;
    const [governanceAccount] = fixture.accounts.governanceContracts;

    await createMockCover(cover, { owner: coverOwner.address });

    const coverId = 1;
    const { amount } = await cover.getCoverData(coverId);

    const failingPool = await ethers.deployContract('PoolEtherRejecterMock', []);

    await registry.addContract(ContractIndexes.C_POOL, await failingPool.getAddress(), true);

    // Deploy new Claims contract with Pool ETH reject
    const claimsRejectEth = await ethers.deployContract('Claims', [await registry.getAddress()]);
    await claimsRejectEth.connect(governanceAccount).initialize(0);

    const ipfsHash = ethers.solidityPackedKeccak256(['string'], ['ipfs-hash']);
    const overrides = { value: deposit };
    const submitClaimTx = claimsRejectEth.connect(coverOwner).submitClaim(coverId, amount, ipfsHash, overrides);

    await expect(submitClaimTx).to.be.revertedWithCustomError(claimsRejectEth, 'AssessmentDepositTransferToPoolFailed');
  });

  it('reverts if a payout on the same cover can be redeemed', async function () {
    const fixture = await loadFixture(setup);
    const { cover, assessment, claims } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    const claimId = await claims.getClaimsCount();

    const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
    const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
    await assessment.setAssessmentResult(claimId, ASSESSMENT_STATUS.ACCEPTED, payoutRedemptionEnd, cooldownEnd);

    // Should block new claim during redemption period
    await setTime(payoutRedemptionEnd - daysToSeconds(1));
    const submitClaimTx = submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    await expect(submitClaimTx).to.be.revertedWithCustomError(claims, 'PayoutCanStillBeRedeemed');

    // Should allow new claim after redemption period expires
    await setTime(payoutRedemptionEnd);
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
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    const firstClaimId = await claims.getClaimsCount();

    let { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
    let payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
    await assessment.setAssessmentResult(firstClaimId, ASSESSMENT_STATUS.ACCEPTED, payoutRedemptionEnd, cooldownEnd);
    await claims.connect(coverOwner).redeemClaimPayout(firstClaimId);

    // Second claim on cover 2: set to DRAW
    await submitClaim(fixture)({ coverId: 2, sender: coverOwner });
    const secondClaimId = await claims.getClaimsCount();
    ({ timestamp: cooldownEnd } = await ethers.provider.getBlock('latest'));
    payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
    await assessment.setAssessmentResult(secondClaimId, ASSESSMENT_STATUS.DRAW, payoutRedemptionEnd, cooldownEnd);

    // Third claim on cover 2 again (retry for clear decision)
    await submitClaim(fixture)({ coverId: 2, sender: coverOwner });
    const thirdClaimId = await claims.getClaimsCount();
    ({ timestamp: cooldownEnd } = await ethers.provider.getBlock('latest'));
    payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
    await assessment.setAssessmentResult(thirdClaimId, ASSESSMENT_STATUS.DENIED, payoutRedemptionEnd, cooldownEnd);

    // Fourth claim on cover 3 (new cover)
    await expect(submitClaim(fixture)({ coverId: 3, sender: coverOwner })).not.to.be.reverted;
  });

  describe('ACCEPTED claim re-submission prevention', function () {
    it('prevents re-submission when payout already redeemed', async function () {
      const fixture = await loadFixture(setup);
      const { cover, assessment, claims } = fixture.contracts;
      const [coverOwner] = fixture.accounts.members;

      await createMockCover(cover, { owner: coverOwner.address });

      // Submit and accept first claim
      await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
      const firstClaimId = await claims.getClaimsCount();

      const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
      const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
      await assessment.setAssessmentResult(firstClaimId, ASSESSMENT_STATUS.ACCEPTED, payoutRedemptionEnd, cooldownEnd);

      // Redeem the payout
      await claims.connect(coverOwner).redeemClaimPayout(firstClaimId);

      // Should prevent re-submission after payout redeemed
      const submitClaimTx = submitClaim(fixture)({ coverId: 1, sender: coverOwner });
      await expect(submitClaimTx).to.be.revertedWithCustomError(claims, 'ClaimAlreadyPaidOut');
    });
  });

  describe('Allowed re-submission scenarios within grace period', function () {
    it('allows re-submission after DENIED claim and still', async function () {
      const fixture = await loadFixture(setup);
      const { cover, assessment, claims } = fixture.contracts;
      const [coverOwner] = fixture.accounts.members;

      await createMockCover(cover, { owner: coverOwner.address });

      // Submit and deny first claim
      await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
      const firstClaimId = await claims.getClaimsCount();

      const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
      const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
      await assessment.setAssessmentResult(firstClaimId, ASSESSMENT_STATUS.DENIED, payoutRedemptionEnd, cooldownEnd);

      // Should allow re-submission after DENIED (edge case - maybe new evidence)
      await expect(submitClaim(fixture)({ coverId: 1, sender: coverOwner })).not.to.be.reverted;
    });

    it('allows re-submission before DRAW claim deposit has been retrieved', async function () {
      const fixture = await loadFixture(setup);
      const { cover, assessment, claims } = fixture.contracts;
      const [coverOwner] = fixture.accounts.members;

      await createMockCover(cover, { owner: coverOwner.address });

      // Submit first claim
      await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
      const firstClaimId = await claims.getClaimsCount();

      // Set first claim result to DRAW
      const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
      const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
      await assessment.setAssessmentResult(firstClaimId, ASSESSMENT_STATUS.DRAW, payoutRedemptionEnd, cooldownEnd);

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
      await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
      const firstClaimId = await claims.getClaimsCount();

      // Set first claim result to DRAW
      const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
      const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
      await assessment.setAssessmentResult(firstClaimId, ASSESSMENT_STATUS.DRAW, payoutRedemptionEnd, cooldownEnd);

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
      await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
      const firstClaimId = await claims.getClaimsCount();

      const { timestamp: cooldownEnd } = await ethers.provider.getBlock('latest');
      const payoutRedemptionEnd = cooldownEnd + daysToSeconds(30);
      await assessment.setAssessmentResult(firstClaimId, ASSESSMENT_STATUS.ACCEPTED, payoutRedemptionEnd, cooldownEnd);

      // Move time past redemption period
      await setTime(payoutRedemptionEnd);

      // Should allow re-submission after redemption period expires (user missed deadline)
      await expect(submitClaim(fixture)({ coverId: 1, sender: coverOwner })).not.to.be.reverted;
    });
  });
});

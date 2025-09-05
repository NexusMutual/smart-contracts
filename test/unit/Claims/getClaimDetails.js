const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');
const { parseEther } = ethers;

const { createMockCover, submitClaim, daysToSeconds } = require('./helpers');
const { setup } = require('./setup');

const { AssessmentStatus, AssessmentOutcome, PoolAsset } = nexus.constants;

describe('getClaimDetails', function () {
  const ipfsHash = ethers.solidityPackedKeccak256(['string'], ['ipfs-hash']);

  it('reverts if claim does not exist', async function () {
    const fixture = await loadFixture(setup);
    const { claims } = fixture.contracts;

    const nonExistentClaimId = 999;
    await expect(claims.getClaimDetails(nonExistentClaimId)).to.be.revertedWithCustomError(claims, 'InvalidClaimId');
  });

  it('returns correct claim details for a newly submitted claim', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const coverId = 1;

    const claimAmount = parseEther('50');
    const coverAmount = parseEther('100');
    await createMockCover(cover, {
      owner: coverOwner.address,
      amount: coverAmount,
      coverAsset: PoolAsset.USDC,
      productId: 0,
    });

    const claimId = await claims.getClaimsCount();
    await submitClaim(fixture)({ coverId, amount: claimAmount, sender: coverOwner, ipfsMetadata: ipfsHash });

    const claimDetails = await claims.getClaimDetails(claimId);
    expect(claimDetails.claimId).to.equal(claimId);

    // claim
    expect(claimDetails.claim.coverId).to.equal(coverId);
    expect(claimDetails.claim.amount).to.equal(claimAmount);
    expect(claimDetails.claim.coverAsset).to.equal(PoolAsset.USDC);
    expect(claimDetails.claim.payoutRedeemed).to.be.false;
    expect(claimDetails.claim.depositRetrieved).to.be.false;

    // cover
    expect(claimDetails.cover.productId).to.equal(0);
    expect(claimDetails.cover.amount).to.equal(coverAmount);
    expect(claimDetails.cover.coverAsset).to.equal(PoolAsset.USDC);

    // assessment
    expect(claimDetails.assessment).to.not.be.undefined;
    expect(Number(claimDetails.assessment.assessingGroupId)).to.equal(1);
    expect(Number(claimDetails.assessment.cooldownPeriod)).to.be.greaterThan(0);
    expect(Number(claimDetails.assessment.start)).to.be.greaterThan(0);
    expect(Number(claimDetails.assessment.votingEnd)).to.be.greaterThan(0);
    expect(Number(claimDetails.assessment.acceptVotes)).to.equal(0);
    expect(Number(claimDetails.assessment.denyVotes)).to.equal(0);

    expect(Number(claimDetails.status)).to.equal(AssessmentStatus.Voting);
    expect(Number(claimDetails.outcome)).to.equal(AssessmentOutcome.Pending);

    expect(claimDetails.redeemable).to.be.false;
    expect(claimDetails.ipfsMetadata).to.equal(ipfsHash);
  });

  it('returns correct details for ACCEPTED claim that is redeemable', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const coverId = 1;

    const claimAmount = parseEther('50');
    const coverAmount = parseEther('100');
    await createMockCover(cover, { owner: coverOwner.address, amount: coverAmount });

    const claimId = await claims.getClaimsCount();
    await submitClaim(fixture)({ coverId, sender: coverOwner, amount: claimAmount });

    // ACCEPTED outcome
    await assessment.setAssessmentForOutcome(claimId, AssessmentOutcome.Accepted);

    // increase time to past cooldown
    await time.increase(daysToSeconds(1));

    const claimDetails = await claims.getClaimDetails(claimId);
    expect(claimDetails.claimId).to.equal(claimId);

    // claim
    expect(claimDetails.claim.coverId).to.equal(coverId);
    expect(claimDetails.claim.amount).to.equal(claimAmount);
    expect(claimDetails.claim.coverAsset).to.equal(PoolAsset.ETH);
    expect(claimDetails.claim.payoutRedeemed).to.be.false;
    expect(claimDetails.claim.depositRetrieved).to.be.false;

    // cover
    expect(claimDetails.cover.productId).to.equal(0);
    expect(claimDetails.cover.amount).to.equal(coverAmount);
    expect(claimDetails.cover.coverAsset).to.equal(PoolAsset.ETH);

    // assessment
    expect(Number(claimDetails.assessment.assessingGroupId)).to.equal(1);
    expect(Number(claimDetails.assessment.cooldownPeriod)).to.be.greaterThan(0);
    expect(Number(claimDetails.assessment.start)).to.be.greaterThan(0);
    expect(Number(claimDetails.assessment.votingEnd)).to.be.greaterThan(0);
    expect(Number(claimDetails.assessment.acceptVotes)).to.equal(3);
    expect(Number(claimDetails.assessment.denyVotes)).to.equal(2);

    expect(Number(claimDetails.status)).to.equal(AssessmentStatus.Finalized);
    expect(Number(claimDetails.outcome)).to.equal(AssessmentOutcome.Accepted);
    expect(claimDetails.redeemable).to.be.true;
    expect(claimDetails.claim.payoutRedeemed).to.be.false;
    expect(claimDetails.claim.depositRetrieved).to.be.false;
  });

  it('returns correct details for DENIED claim', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const coverId = 1;

    const claimAmount = parseEther('100');
    const coverAmount = parseEther('100');
    await createMockCover(cover, { owner: coverOwner.address, amount: coverAmount });

    const claimId = await claims.getClaimsCount();
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner, amount: claimAmount });

    // DENIED outcome
    await assessment.setAssessmentForOutcome(claimId, AssessmentOutcome.Denied);

    // increase time to past cooldown
    await time.increase(daysToSeconds(1));

    const claimDetails = await claims.getClaimDetails(claimId);

    expect(claimDetails.claimId).to.equal(claimId);

    // claim
    expect(claimDetails.claim.coverId).to.equal(coverId);
    expect(claimDetails.claim.amount).to.equal(claimAmount);
    expect(claimDetails.claim.coverAsset).to.equal(PoolAsset.ETH);
    expect(claimDetails.claim.payoutRedeemed).to.be.false;
    expect(claimDetails.claim.depositRetrieved).to.be.false;

    // cover
    expect(claimDetails.cover.productId).to.equal(0);
    expect(claimDetails.cover.amount).to.equal(coverAmount);
    expect(claimDetails.cover.coverAsset).to.equal(PoolAsset.ETH);

    // assessment
    expect(Number(claimDetails.assessment.assessingGroupId)).to.equal(1);
    expect(Number(claimDetails.assessment.cooldownPeriod)).to.be.greaterThan(0);
    expect(Number(claimDetails.assessment.start)).to.be.greaterThan(0);
    expect(Number(claimDetails.assessment.votingEnd)).to.be.greaterThan(0);
    expect(Number(claimDetails.assessment.acceptVotes)).to.equal(2);
    expect(Number(claimDetails.assessment.denyVotes)).to.equal(3);

    expect(claimDetails.redeemable).to.be.false;
    expect(claimDetails.cover.coverAsset).to.equal(PoolAsset.ETH);
    expect(Number(claimDetails.status)).to.equal(AssessmentStatus.Finalized);
    expect(Number(claimDetails.outcome)).to.equal(AssessmentOutcome.Denied);
  });

  it('returns correct details for DRAW claim', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const coverId = 1;

    const claimAmount = parseEther('50');
    const coverAmount = parseEther('100');
    await createMockCover(cover, { owner: coverOwner.address, amount: coverAmount });

    const claimId = await claims.getClaimsCount();
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner, amount: claimAmount });

    // DRAW outcome
    await assessment.setAssessmentForOutcome(claimId, AssessmentOutcome.Draw);

    // increase time to past cooldown
    await time.increase(10);

    const claimDetails = await claims.getClaimDetails(claimId);
    expect(claimDetails.claimId).to.equal(claimId);

    // claim
    expect(claimDetails.claim.coverId).to.equal(coverId);
    expect(claimDetails.claim.amount).to.equal(claimAmount);
    expect(claimDetails.claim.coverAsset).to.equal(PoolAsset.ETH);
    expect(claimDetails.claim.payoutRedeemed).to.be.false;
    expect(claimDetails.claim.depositRetrieved).to.be.false;

    // cover
    expect(claimDetails.cover.productId).to.equal(0);
    expect(claimDetails.cover.amount).to.equal(coverAmount);
    expect(claimDetails.cover.coverAsset).to.equal(PoolAsset.ETH);

    // assessment
    expect(Number(claimDetails.assessment.assessingGroupId)).to.equal(1);
    expect(Number(claimDetails.assessment.cooldownPeriod)).to.be.greaterThan(0);
    expect(Number(claimDetails.assessment.start)).to.be.greaterThan(0);
    expect(Number(claimDetails.assessment.votingEnd)).to.be.greaterThan(0);
    expect(Number(claimDetails.assessment.acceptVotes)).to.equal(2);
    expect(Number(claimDetails.assessment.denyVotes)).to.equal(2);

    expect(Number(claimDetails.status)).to.equal(AssessmentStatus.Finalized);
    expect(Number(claimDetails.outcome)).to.equal(AssessmentOutcome.Draw);
    expect(claimDetails.redeemable).to.be.false;
  });

  it('returns correct details for claim in VOTING status', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const coverId = 1;

    const claimAmount = parseEther('50');
    const coverAmount = parseEther('100');
    await createMockCover(cover, { owner: coverOwner.address, amount: coverAmount });

    const claimId = await claims.getClaimsCount();
    await submitClaim(fixture)({ coverId, sender: coverOwner, amount: claimAmount });

    // VOTING status
    await assessment.setAssessmentForStatus(claimId, AssessmentStatus.Voting);

    const claimDetails = await claims.getClaimDetails(claimId);
    expect(claimDetails.claimId).to.equal(claimId);

    // claim
    expect(claimDetails.claim.coverId).to.equal(coverId);
    expect(claimDetails.claim.amount).to.equal(claimAmount);
    expect(claimDetails.claim.coverAsset).to.equal(PoolAsset.ETH);
    expect(claimDetails.claim.payoutRedeemed).to.be.false;
    expect(claimDetails.claim.depositRetrieved).to.be.false;

    // cover
    expect(claimDetails.cover.productId).to.equal(0);
    expect(claimDetails.cover.amount).to.equal(coverAmount);
    expect(claimDetails.cover.coverAsset).to.equal(PoolAsset.ETH);

    // assessment
    expect(Number(claimDetails.assessment.assessingGroupId)).to.be.greaterThanOrEqual(0);
    expect(Number(claimDetails.assessment.cooldownPeriod)).to.be.greaterThan(0);
    expect(Number(claimDetails.assessment.start)).to.be.greaterThan(0);
    expect(Number(claimDetails.assessment.votingEnd)).to.be.greaterThan(0);
    expect(Number(claimDetails.assessment.acceptVotes)).to.be.greaterThanOrEqual(0);
    expect(Number(claimDetails.assessment.denyVotes)).to.be.greaterThanOrEqual(0);

    expect(Number(claimDetails.status)).to.equal(AssessmentStatus.Voting);
    expect(Number(claimDetails.outcome)).to.equal(AssessmentOutcome.Pending);
    expect(claimDetails.redeemable).to.be.false;
    expect(claimDetails.claim.payoutRedeemed).to.be.false;
    expect(claimDetails.claim.depositRetrieved).to.be.false;
  });

  it('returns correct details for claim in COOLDOWN status', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const coverId = 1;

    const claimAmount = parseEther('50');
    const coverAmount = parseEther('100');
    await createMockCover(cover, { owner: coverOwner.address, amount: coverAmount });

    const claimId = await claims.getClaimsCount();
    await submitClaim(fixture)({ coverId, sender: coverOwner, amount: claimAmount });

    // COOLDOWN status
    await assessment.setAssessmentForStatus(claimId, AssessmentStatus.Cooldown);

    const claimDetails = await claims.getClaimDetails(claimId);
    expect(claimDetails.claimId).to.equal(claimId);

    // claim
    expect(claimDetails.claim.coverId).to.equal(coverId);
    expect(claimDetails.claim.amount).to.equal(claimAmount);
    expect(claimDetails.claim.coverAsset).to.equal(PoolAsset.ETH);
    expect(claimDetails.claim.payoutRedeemed).to.be.false;
    expect(claimDetails.claim.depositRetrieved).to.be.false;

    // cover
    expect(claimDetails.cover.productId).to.equal(0);
    expect(claimDetails.cover.amount).to.equal(coverAmount);
    expect(claimDetails.cover.coverAsset).to.equal(PoolAsset.ETH);

    // assessment
    expect(Number(claimDetails.assessment.assessingGroupId)).to.be.equal(1);
    expect(Number(claimDetails.assessment.cooldownPeriod)).to.be.greaterThan(0);
    expect(Number(claimDetails.assessment.start)).to.be.greaterThan(0);
    expect(Number(claimDetails.assessment.votingEnd)).to.be.greaterThan(0);
    expect(Number(claimDetails.assessment.acceptVotes)).to.be.equal(3);
    expect(Number(claimDetails.assessment.denyVotes)).to.be.equal(2);

    expect(Number(claimDetails.status)).to.equal(AssessmentStatus.Cooldown);
    expect(Number(claimDetails.outcome)).to.equal(AssessmentOutcome.Pending);
    expect(claimDetails.redeemable).to.be.false;
    expect(claimDetails.claim.payoutRedeemed).to.be.false;
    expect(claimDetails.claim.depositRetrieved).to.be.false;
  });

  it('returns correct details after payout is redeemed', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const claimId = await claims.getClaimsCount();
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });

    // Set assessment to ACCEPTED and redeem payout
    await assessment.setAssessmentForOutcome(claimId, AssessmentOutcome.Accepted);
    await claims.connect(coverOwner).redeemClaimPayout(claimId);

    const claimDetails = await claims.getClaimDetails(claimId);

    expect(claimDetails.claimId).to.equal(claimId);
    expect(Number(claimDetails.status)).to.equal(AssessmentStatus.Finalized);
    expect(Number(claimDetails.outcome)).to.equal(AssessmentOutcome.Accepted);
    expect(claimDetails.redeemable).to.be.false; // no longer redeemable after redemption
    expect(claimDetails.claim.payoutRedeemed).to.be.true;
    expect(claimDetails.claim.depositRetrieved).to.be.true;
  });

  it('returns correct details after deposit is retrieved (DRAW claim)', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const claimId = await claims.getClaimsCount();
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });

    // Set assessment to DRAW and retrieve deposit
    await assessment.setAssessmentForOutcome(claimId, AssessmentOutcome.Draw);
    await claims.retrieveDeposit(claimId);

    const claimDetails = await claims.getClaimDetails(claimId);

    expect(claimDetails.claimId).to.equal(claimId);
    expect(Number(claimDetails.status)).to.equal(AssessmentStatus.Finalized);
    expect(Number(claimDetails.outcome)).to.equal(AssessmentOutcome.Draw);
    expect(claimDetails.redeemable).to.be.false;
    expect(claimDetails.claim.payoutRedeemed).to.be.false;
    expect(claimDetails.claim.depositRetrieved).to.be.true;
  });
});

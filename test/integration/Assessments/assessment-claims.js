const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { time, setNextBlockBaseFeePerGas } = require('@nomicfoundation/hardhat-network-helpers');

const { setupAssessments } = require('./setup');
const { createCover } = require('../utils/cover');

const { AssessmentOutcome, AssessmentStatus, PoolAsset } = nexus.constants;

const daysToSeconds = days => BigInt(days) * 24n * 60n * 60n;

describe('Assessments / Claims', function () {
  let fixture;

  beforeEach(async function () {
    fixture = await setupAssessments();
    this.claims = fixture.contracts.claims;
    this.assessments = fixture.contracts.assessments;
    this.cover = fixture.contracts.cover;
    this.assessors = fixture.accounts.assessors;
    this.claimant = fixture.accounts.members[0];
  });

  it('Happy Path: ETH claim submission and ACCEPTED payout', async function () {
    const coverId = await createCover(this.cover, this.claimant, {
      coverAsset: PoolAsset.ETH,
      amount: ethers.parseEther('0.1'),
    });

    await setNextBlockBaseFeePerGas(0);
    const claimId = await this.claims.getClaimsCount();
    const claimDeposit = await this.claims.CLAIM_DEPOSIT_IN_ETH();
    const requestedAmount = ethers.parseEther('0.1');

    await this.claims
      .connect(this.claimant)
      .submitClaim(
        coverId,
        requestedAmount,
        ethers.solidityPackedKeccak256(['string'], ['Happy path ETH claim proof']),
        { value: claimDeposit, gasPrice: 0 },
      );

    // 3 accept, 1 deny
    const ipfsFor = ethers.solidityPackedKeccak256(['string'], ['accept']);
    const ipfsAgainst = ethers.solidityPackedKeccak256(['string'], ['deny']);

    await this.assessments.connect(this.assessors[0]).castVote(claimId, true, ipfsFor);
    await this.assessments.connect(this.assessors[1]).castVote(claimId, true, ipfsFor);
    await this.assessments.connect(this.assessors[2]).castVote(claimId, true, ipfsFor);
    await this.assessments.connect(this.assessors[3]).castVote(claimId, false, ipfsAgainst);

    // finalize claim
    const assessment = await this.assessments.getAssessment(claimId);
    await time.increaseTo(assessment.votingEnd + assessment.cooldownPeriod + daysToSeconds(1));

    const { status, outcome } = await this.claims.getClaimDetails(claimId);
    expect(status).to.equal(AssessmentStatus.Finalized);
    expect(outcome).to.equal(AssessmentOutcome.Accepted);

    const balanceBefore = await ethers.provider.getBalance(this.claimant.address);

    await expect(this.claims.connect(this.claimant).redeemClaimPayout(claimId, { gasPrice: 0 })).to.emit(
      this.claims,
      'ClaimPayoutRedeemed',
    );

    const balanceAfter = await ethers.provider.getBalance(this.claimant.address);
    expect(balanceAfter - balanceBefore).to.equal(requestedAmount + claimDeposit);
  });

  it('ETH claim submission validation and DENIED outcome', async function () {
    const coverId = await createCover(this.cover, this.claimant, {
      coverAsset: PoolAsset.ETH,
      amount: ethers.parseEther('0.1'),
    });

    const requestedAmount = ethers.parseEther('0.05');
    const claimDeposit = await this.claims.CLAIM_DEPOSIT_IN_ETH();

    // test access control
    await expect(
      this.claims
        .connect(this.assessors[3])
        .submitClaim(coverId, requestedAmount, ethers.solidityPackedKeccak256(['string'], ['test']), {
          value: claimDeposit,
        }),
    ).to.be.revertedWithCustomError(this.claims, 'NotCoverOwner');

    await setNextBlockBaseFeePerGas(0);
    const claimId = await this.claims.getClaimsCount();

    await this.claims
      .connect(this.claimant)
      .submitClaim(coverId, requestedAmount, ethers.solidityPackedKeccak256(['string'], ['ETH claim proof']), {
        value: claimDeposit,
        gasPrice: 0,
      });

    // cast majority deny votes
    const ipfsFor = ethers.solidityPackedKeccak256(['string'], ['accept']);
    const ipfsAgainst = ethers.solidityPackedKeccak256(['string'], ['deny']);

    await this.assessments.connect(this.assessors[0]).castVote(claimId, false, ipfsAgainst);
    await this.assessments.connect(this.assessors[1]).castVote(claimId, false, ipfsAgainst);
    await this.assessments.connect(this.assessors[2]).castVote(claimId, false, ipfsAgainst);
    await this.assessments.connect(this.assessors[3]).castVote(claimId, true, ipfsFor);

    // finalize claim
    const assessment = await this.assessments.getAssessment(claimId);
    await time.increaseTo(assessment.votingEnd + assessment.cooldownPeriod + daysToSeconds(1));

    const { status, outcome } = await this.claims.getClaimDetails(claimId);
    expect(status).to.equal(AssessmentStatus.Finalized);
    expect(outcome).to.equal(AssessmentOutcome.Denied);

    // denied claims cannot be redeemed or have deposits retrieved
    await expect(this.claims.connect(this.claimant).redeemClaimPayout(claimId)).to.be.revertedWithCustomError(
      this.claims,
      'ClaimNotRedeemable',
    );
    await expect(this.claims.connect(this.claimant).retrieveDeposit(claimId)).to.be.revertedWithCustomError(
      this.claims,
      'ClaimNotADraw',
    );
  });

  it('USDC claim with fraud detection and governance intervention', async function () {
    const { usdc } = fixture.contracts;
    await usdc.setBalance(this.claimant.address, ethers.parseUnits('10000', 6));
    await usdc.connect(this.claimant).approve(this.cover.target, ethers.MaxUint256);

    const coverId = await createCover(this.cover, this.claimant, {
      coverAsset: PoolAsset.USDC,
      amount: ethers.parseUnits('100', 6),
    });

    await setNextBlockBaseFeePerGas(0);
    const claimId = await this.claims.getClaimsCount();
    const claimDeposit = await this.claims.CLAIM_DEPOSIT_IN_ETH();

    await this.claims
      .connect(this.claimant)
      .submitClaim(
        coverId,
        ethers.parseUnits('75', 6),
        ethers.solidityPackedKeccak256(['string'], ['USDC fraud claim proof']),
        { value: claimDeposit, gasPrice: 0 },
      );

    // cast tied votes (2 accept, 2 deny)
    const ipfsFor = ethers.solidityPackedKeccak256(['string'], ['accept']);
    const ipfsAgainst = ethers.solidityPackedKeccak256(['string'], ['deny']);

    await this.assessments.connect(this.assessors[0]).castVote(claimId, true, ipfsFor);
    await this.assessments.connect(this.assessors[1]).castVote(claimId, true, ipfsFor);
    await this.assessments.connect(this.assessors[2]).castVote(claimId, false, ipfsAgainst);
    await this.assessments.connect(this.assessors[3]).castVote(claimId, false, ipfsAgainst);

    // advance to cooldown
    const assessment = await this.assessments.getAssessment(claimId);
    await time.increaseTo(Number(assessment.votingEnd) + 1);

    const { status, outcome } = await this.claims.getClaimDetails(claimId);
    expect(status).to.equal(AssessmentStatus.Cooldown);
    expect(outcome).to.equal(AssessmentOutcome.Pending);

    // test cooldown restrictions
    await expect(
      this.assessments.connect(this.assessors[0]).castVote(claimId, true, ipfsFor),
    ).to.be.revertedWithCustomError(this.assessments, 'VotingPeriodEnded');
    await expect(this.claims.connect(this.claimant).redeemClaimPayout(claimId)).to.be.revertedWithCustomError(
      this.claims,
      'ClaimNotRedeemable',
    );

    // governance fraud intervention
    const fraudulentAssessor = this.assessors[3];
    const newAssessor = fixture.accounts.members[1];
    const fraudulentId = await fixture.contracts.registry.getMemberId(fraudulentAssessor.address);
    const newAssessorId = await fixture.contracts.registry.getMemberId(newAssessor.address);
    const groupId = await this.assessments.getGroupsCount();

    // pause for intervention
    const pauseMask = 0b11;
    await fixture.contracts.registry.connect(fixture.accounts.emergencyAdmins[0]).proposePauseConfig(pauseMask);
    await fixture.contracts.registry.connect(fixture.accounts.emergencyAdmins[1]).confirmPauseConfig(pauseMask);

    // governor intervention
    await this.assessments.undoVotes(fraudulentId, [claimId]);
    await this.assessments.removeAssessorFromGroup(fraudulentId, groupId);
    await this.assessments.addAssessorsToGroup([newAssessorId], groupId);
    await this.assessments.extendVotingPeriod(claimId);

    // verify intervention effects
    const assessmentAfter = await this.assessments.getAssessment(claimId);
    expect(assessmentAfter.acceptVotes).to.equal(2);
    expect(assessmentAfter.denyVotes).to.equal(1);

    // unpause and new assessor votes accept
    await fixture.contracts.registry.connect(fixture.accounts.emergencyAdmins[0]).proposePauseConfig(0);
    await fixture.contracts.registry.connect(fixture.accounts.emergencyAdmins[1]).confirmPauseConfig(0);

    await this.assessments.connect(newAssessor).castVote(claimId, true, ipfsFor);

    // finalize as accepted
    const extendedAssessment = await this.assessments.getAssessment(claimId);
    await time.increaseTo(extendedAssessment.votingEnd + extendedAssessment.cooldownPeriod + daysToSeconds(1));

    const finalDetails = await this.claims.getClaimDetails(claimId);
    expect(finalDetails.status).to.equal(AssessmentStatus.Finalized);
    expect(finalDetails.outcome).to.equal(AssessmentOutcome.Accepted);

    // verify redemption
    const usdcBefore = await usdc.balanceOf(this.claimant.address);
    const ethBefore = await ethers.provider.getBalance(this.claimant.address);

    await this.claims.connect(this.claimant).redeemClaimPayout(claimId, { gasPrice: 0 });

    const usdcAfter = await usdc.balanceOf(this.claimant.address);
    const ethAfter = await ethers.provider.getBalance(this.claimant.address);

    expect(usdcAfter - usdcBefore).to.equal(ethers.parseUnits('75', 6));
    expect(ethAfter - ethBefore).to.equal(claimDeposit);
  });

  it('Post-cooldown fraud recovery - governance intervention after finalization', async function () {
    const coverId = await createCover(this.cover, this.claimant, {
      coverAsset: PoolAsset.ETH,
      amount: ethers.parseEther('0.3'),
    });

    await setNextBlockBaseFeePerGas(0);
    const claimId = await this.claims.getClaimsCount();
    const claimDeposit = await this.claims.CLAIM_DEPOSIT_IN_ETH();

    await this.claims
      .connect(this.claimant)
      .submitClaim(
        coverId,
        ethers.parseEther('0.2'),
        ethers.solidityPackedKeccak256(['string'], ['post-cooldown-claim']),
        { value: claimDeposit, gasPrice: 0 },
      );

    // cast votes including fraudulent one (3 accept, 1 deny)
    const ipfsFor = ethers.solidityPackedKeccak256(['string'], ['accept']);
    const ipfsAgainst = ethers.solidityPackedKeccak256(['string'], ['deny']);

    await this.assessments.connect(this.assessors[0]).castVote(claimId, true, ipfsFor);
    await this.assessments.connect(this.assessors[1]).castVote(claimId, true, ipfsFor);
    await this.assessments.connect(this.assessors[2]).castVote(claimId, true, ipfsFor); // fraudulent
    await this.assessments.connect(this.assessors[3]).castVote(claimId, false, ipfsAgainst);

    // finalize as accepted
    const assessment = await this.assessments.getAssessment(claimId);
    await time.increaseTo(assessment.votingEnd + assessment.cooldownPeriod + daysToSeconds(1));

    const { status, outcome } = await this.claims.getClaimDetails(claimId);
    expect(status).to.equal(AssessmentStatus.Finalized);
    expect(outcome).to.equal(AssessmentOutcome.Accepted);

    // governance fraud intervention after finalization
    const fraudulentAssessor = this.assessors[2];
    const replacementAssessor = fixture.accounts.members[2];
    const fraudulentId = await fixture.contracts.registry.getMemberId(fraudulentAssessor.address);
    const replacementId = await fixture.contracts.registry.getMemberId(replacementAssessor.address);
    const groupId = await this.assessments.getGroupsCount();

    // pause for intervention
    const pauseMask = 0b11;
    await fixture.contracts.registry.connect(fixture.accounts.emergencyAdmins[0]).proposePauseConfig(pauseMask);
    await fixture.contracts.registry.connect(fixture.accounts.emergencyAdmins[1]).confirmPauseConfig(pauseMask);

    // governor intervention
    await this.assessments.undoVotes(fraudulentId, [claimId]);
    await this.assessments.removeAssessorFromGroup(fraudulentId, groupId);
    await this.assessments.addAssessorsToGroup([replacementId], groupId);
    await this.assessments.extendVotingPeriod(claimId);

    // verify vote count changed
    const assessmentAfter = await this.assessments.getAssessment(claimId);
    expect(assessmentAfter.acceptVotes).to.equal(2); // fraud vote removed

    // unpause and replacement votes deny (creates draw)
    await fixture.contracts.registry.connect(fixture.accounts.emergencyAdmins[0]).proposePauseConfig(0);
    await fixture.contracts.registry.connect(fixture.accounts.emergencyAdmins[1]).confirmPauseConfig(0);

    await this.assessments.connect(replacementAssessor).castVote(claimId, false, ipfsAgainst);

    // finalize as draw
    const extendedAssessment = await this.assessments.getAssessment(claimId);
    await time.increaseTo(extendedAssessment.votingEnd + extendedAssessment.cooldownPeriod + daysToSeconds(1));

    const finalDetails = await this.claims.getClaimDetails(claimId);
    expect(finalDetails.status).to.equal(AssessmentStatus.Finalized);
    expect(finalDetails.outcome).to.equal(AssessmentOutcome.Draw);

    // draw allows deposit retrieval but not payout
    const balanceBefore = await ethers.provider.getBalance(this.claimant.address);
    await this.claims.connect(this.claimant).retrieveDeposit(claimId, { gasPrice: 0 });
    const balanceAfter = await ethers.provider.getBalance(this.claimant.address);
    expect(balanceAfter - balanceBefore).to.equal(claimDeposit);

    await expect(this.claims.connect(this.claimant).redeemClaimPayout(claimId)).to.be.revertedWithCustomError(
      this.claims,
      'ClaimNotRedeemable',
    );
  });

  it('Pause and payout functionality testing', async function () {
    const { assetAddress: usdcAddress } = await fixture.contracts.pool.getAsset(PoolAsset.USDC);
    const usdc = await ethers.getContractAt('ERC20Mock', usdcAddress);
    await usdc.setBalance(this.claimant.address, ethers.parseUnits('10000', 6));
    await usdc.connect(this.claimant).approve(this.cover.target, ethers.MaxUint256);

    const coverId = await createCover(this.cover, this.claimant, {
      coverAsset: PoolAsset.USDC,
      amount: ethers.parseUnits('1000', 6),
    });

    await setNextBlockBaseFeePerGas(0);
    const claimId = await this.claims.getClaimsCount();
    const claimDeposit = await this.claims.CLAIM_DEPOSIT_IN_ETH();

    await this.claims
      .connect(this.claimant)
      .submitClaim(
        coverId,
        ethers.parseUnits('750', 6),
        ethers.solidityPackedKeccak256(['string'], ['pause-test-claim']),
        { value: claimDeposit, gasPrice: 0 },
      );

    // cast accept votes
    const ipfsFor = ethers.solidityPackedKeccak256(['string'], ['accept']);
    await this.assessments.connect(this.assessors[0]).castVote(claimId, true, ipfsFor);
    await this.assessments.connect(this.assessors[1]).castVote(claimId, true, ipfsFor);
    await this.assessments.connect(this.assessors[2]).castVote(claimId, true, ipfsFor);

    // finalize as accepted
    const assessment = await this.assessments.getAssessment(claimId);
    await time.increaseTo(assessment.votingEnd + assessment.cooldownPeriod + daysToSeconds(1));

    const { status, outcome } = await this.claims.getClaimDetails(claimId);
    expect(status).to.equal(AssessmentStatus.Finalized);
    expect(outcome).to.equal(AssessmentOutcome.Accepted);

    // test pause functionality
    const pauseMask = 0b10;
    await fixture.contracts.registry.connect(fixture.accounts.emergencyAdmins[0]).proposePauseConfig(pauseMask);
    await fixture.contracts.registry.connect(fixture.accounts.emergencyAdmins[1]).confirmPauseConfig(pauseMask);

    await expect(this.claims.connect(this.claimant).redeemClaimPayout(claimId)).to.be.revertedWithCustomError(
      this.claims,
      'Paused',
    );

    // unpause and redeem
    await fixture.contracts.registry.connect(fixture.accounts.emergencyAdmins[0]).proposePauseConfig(0);
    await fixture.contracts.registry.connect(fixture.accounts.emergencyAdmins[1]).confirmPauseConfig(0);

    const usdcBefore = await usdc.balanceOf(this.claimant.address);
    const ethBefore = await ethers.provider.getBalance(this.claimant.address);

    await expect(this.claims.connect(this.claimant).redeemClaimPayout(claimId, { gasPrice: 0 })).to.emit(
      this.claims,
      'ClaimPayoutRedeemed',
    );

    const usdcAfter = await usdc.balanceOf(this.claimant.address);
    const ethAfter = await ethers.provider.getBalance(this.claimant.address);

    expect(usdcAfter - usdcBefore).to.equal(ethers.parseUnits('750', 6));
    expect(ethAfter - ethBefore).to.equal(claimDeposit);

    // verify double redemption protection
    await expect(this.claims.connect(this.claimant).redeemClaimPayout(claimId)).to.be.revertedWithCustomError(
      this.claims,
      'ClaimNotRedeemable',
    );
  });

  it('Post-redemption governance resilience - no double redeem after governor changes', async function () {
    const { assetAddress: usdcAddress } = await fixture.contracts.pool.getAsset(PoolAsset.USDC);
    const usdc = await ethers.getContractAt('ERC20Mock', usdcAddress);
    await usdc.setBalance(this.claimant.address, ethers.parseUnits('10000', 6));
    await usdc.connect(this.claimant).approve(this.cover.target, ethers.MaxUint256);

    const coverId = await createCover(this.cover, this.claimant, {
      coverAsset: PoolAsset.USDC,
      amount: ethers.parseUnits('1000', 6),
    });

    await setNextBlockBaseFeePerGas(0);
    const claimId = await this.claims.getClaimsCount();
    const claimDeposit = await this.claims.CLAIM_DEPOSIT_IN_ETH();

    await this.claims
      .connect(this.claimant)
      .submitClaim(
        coverId,
        ethers.parseUnits('750', 6),
        ethers.solidityPackedKeccak256(['string'], ['post-redemption-test']),
        { value: claimDeposit, gasPrice: 0 },
      );

    // cast accept votes and redeem
    const ipfsFor = ethers.solidityPackedKeccak256(['string'], ['accept']);
    await this.assessments.connect(this.assessors[0]).castVote(claimId, true, ipfsFor);
    await this.assessments.connect(this.assessors[1]).castVote(claimId, true, ipfsFor);
    await this.assessments.connect(this.assessors[2]).castVote(claimId, true, ipfsFor);

    const assessment = await this.assessments.getAssessment(claimId);
    await time.increaseTo(assessment.votingEnd + assessment.cooldownPeriod + daysToSeconds(1));

    await this.claims.connect(this.claimant).redeemClaimPayout(claimId, { gasPrice: 0 });

    // verify claim redeemed
    const claim = await this.claims.getClaim(claimId);
    expect(claim.payoutRedeemed).to.be.true;

    // governor attempts changes after redemption
    const assessorId = await fixture.contracts.registry.getMemberId(this.assessors[0].address);
    await this.assessments.undoVotes(assessorId, [claimId]);
    await this.assessments.extendVotingPeriod(claimId);

    // verify double redemption still fails
    await expect(this.claims.connect(this.claimant).redeemClaimPayout(claimId)).to.be.revertedWithCustomError(
      this.claims,
      'ClaimNotRedeemable',
    );
    await expect(this.claims.connect(this.claimant).retrieveDeposit(claimId)).to.be.revertedWithCustomError(
      this.claims,
      'ClaimNotADraw',
    );
  });

  it('ETH claim with DRAW outcome - deposit retrieval only', async function () {
    const coverId = await createCover(this.cover, this.claimant, {
      coverAsset: PoolAsset.ETH,
      amount: ethers.parseEther('0.8'),
    });

    await setNextBlockBaseFeePerGas(0);
    const claimId = await this.claims.getClaimsCount();
    const claimDeposit = await this.claims.CLAIM_DEPOSIT_IN_ETH();

    await this.claims
      .connect(this.claimant)
      .submitClaim(
        coverId,
        ethers.parseEther('0.3'),
        ethers.solidityPackedKeccak256(['string'], ['DRAW claim proof']),
        { value: claimDeposit, gasPrice: 0 },
      );

    // cast equal votes for draw (2 accept, 2 deny)
    const ipfsFor = ethers.solidityPackedKeccak256(['string'], ['accept']);
    const ipfsAgainst = ethers.solidityPackedKeccak256(['string'], ['deny']);

    await this.assessments.connect(this.assessors[0]).castVote(claimId, true, ipfsFor);
    await this.assessments.connect(this.assessors[1]).castVote(claimId, true, ipfsFor);
    await this.assessments.connect(this.assessors[2]).castVote(claimId, false, ipfsAgainst);
    await this.assessments.connect(this.assessors[3]).castVote(claimId, false, ipfsAgainst);

    // finalize as draw
    const assessment = await this.assessments.getAssessment(claimId);
    await time.increaseTo(assessment.votingEnd + assessment.cooldownPeriod + daysToSeconds(1));

    const { status, outcome } = await this.claims.getClaimDetails(claimId);
    expect(status).to.equal(AssessmentStatus.Finalized);
    expect(outcome).to.equal(AssessmentOutcome.Draw);

    // draw claims cannot be redeemed but can retrieve deposit
    await expect(this.claims.connect(this.claimant).redeemClaimPayout(claimId)).to.be.revertedWithCustomError(
      this.claims,
      'ClaimNotRedeemable',
    );

    const balanceBefore = await ethers.provider.getBalance(this.claimant.address);

    await expect(this.claims.connect(this.claimant).retrieveDeposit(claimId, { gasPrice: 0 }))
      .to.emit(this.claims, 'ClaimDepositRetrieved')
      .withArgs(claimId, this.claimant.address);

    const balanceAfter = await ethers.provider.getBalance(this.claimant.address);
    expect(balanceAfter - balanceBefore).to.equal(claimDeposit);
  });

  it('ETH claim with redemption period expiry - no redemption after deadline', async function () {
    const coverId = await createCover(this.cover, this.claimant, {
      coverAsset: PoolAsset.ETH,
      amount: ethers.parseEther('0.5'),
    });

    await setNextBlockBaseFeePerGas(0);
    const claimId = await this.claims.getClaimsCount();
    const claimDeposit = await this.claims.CLAIM_DEPOSIT_IN_ETH();

    await this.claims
      .connect(this.claimant)
      .submitClaim(
        coverId,
        ethers.parseEther('0.2'),
        ethers.solidityPackedKeccak256(['string'], ['Expiry test claim proof']),
        { value: claimDeposit, gasPrice: 0 },
      );

    // cast accept votes
    const ipfsFor = ethers.solidityPackedKeccak256(['string'], ['accept']);
    const ipfsAgainst = ethers.solidityPackedKeccak256(['string'], ['deny']);

    await this.assessments.connect(this.assessors[0]).castVote(claimId, true, ipfsFor);
    await this.assessments.connect(this.assessors[1]).castVote(claimId, true, ipfsFor);
    await this.assessments.connect(this.assessors[2]).castVote(claimId, true, ipfsFor);
    await this.assessments.connect(this.assessors[3]).castVote(claimId, false, ipfsAgainst);

    // finalize as accepted
    const assessment = await this.assessments.getAssessment(claimId);
    const cooldownEndTime = assessment.votingEnd + assessment.cooldownPeriod + daysToSeconds(1);
    await time.increaseTo(cooldownEndTime);

    const { status, outcome } = await this.claims.getClaimDetails(claimId);
    expect(status).to.equal(AssessmentStatus.Finalized);
    expect(outcome).to.equal(AssessmentOutcome.Accepted);

    // let redemption period expire
    const claim = await this.claims.getClaim(claimId);
    const expiryTime = cooldownEndTime + claim.payoutRedemptionPeriod + daysToSeconds(1);
    await time.increaseTo(expiryTime);

    // redemption should fail after expiry
    await expect(this.claims.connect(this.claimant).redeemClaimPayout(claimId)).to.be.revertedWithCustomError(
      this.claims,
      'ClaimNotRedeemable',
    );
    await expect(this.claims.connect(this.claimant).retrieveDeposit(claimId)).to.be.revertedWithCustomError(
      this.claims,
      'ClaimNotADraw',
    );
  });

  it('Re-submit claim on same cover after ACCEPTED claim expired', async function () {
    const coverId = await createCover(this.cover, this.claimant, {
      coverAsset: PoolAsset.ETH,
      amount: ethers.parseEther('1.0'),
    });

    await setNextBlockBaseFeePerGas(0);
    const firstClaimId = await this.claims.getClaimsCount();
    const claimDeposit = await this.claims.CLAIM_DEPOSIT_IN_ETH();

    // submit first claim and let it expire
    await this.claims
      .connect(this.claimant)
      .submitClaim(
        coverId,
        ethers.parseEther('0.3'),
        ethers.solidityPackedKeccak256(['string'], ['First claim to expire']),
        { value: claimDeposit, gasPrice: 0 },
      );

    const ipfsFor = ethers.solidityPackedKeccak256(['string'], ['accept']);
    await this.assessments.connect(this.assessors[0]).castVote(firstClaimId, true, ipfsFor);
    await this.assessments.connect(this.assessors[1]).castVote(firstClaimId, true, ipfsFor);
    await this.assessments.connect(this.assessors[2]).castVote(firstClaimId, true, ipfsFor);

    // finalize first claim and let it expire
    const firstAssessment = await this.assessments.getAssessment(firstClaimId);
    const firstCooldownEnd = firstAssessment.votingEnd + firstAssessment.cooldownPeriod + daysToSeconds(1);
    await time.increaseTo(firstCooldownEnd);

    const firstClaim = await this.claims.getClaim(firstClaimId);
    const firstExpiryTime = firstCooldownEnd + firstClaim.payoutRedemptionPeriod + daysToSeconds(1);
    await time.increaseTo(firstExpiryTime);

    // verify first claim expired
    await expect(this.claims.connect(this.claimant).redeemClaimPayout(firstClaimId)).to.be.revertedWithCustomError(
      this.claims,
      'ClaimNotRedeemable',
    );

    // resubmit new claim on same cover
    const secondClaimId = await this.claims.getClaimsCount();
    await this.claims
      .connect(this.claimant)
      .submitClaim(
        coverId,
        ethers.parseEther('0.15'),
        ethers.solidityPackedKeccak256(['string'], ['Re-submitted after expiry']),
        { value: claimDeposit, gasPrice: 0 },
      );

    // vote accept on second claim
    await this.assessments.connect(this.assessors[0]).castVote(secondClaimId, true, ipfsFor);
    await this.assessments.connect(this.assessors[1]).castVote(secondClaimId, true, ipfsFor);
    await this.assessments.connect(this.assessors[2]).castVote(secondClaimId, true, ipfsFor);

    // finalize and redeem second claim
    const secondAssessment = await this.assessments.getAssessment(secondClaimId);
    await time.increaseTo(secondAssessment.votingEnd + secondAssessment.cooldownPeriod + daysToSeconds(1));

    const balanceBefore = await ethers.provider.getBalance(this.claimant.address);

    await expect(this.claims.connect(this.claimant).redeemClaimPayout(secondClaimId, { gasPrice: 0 }))
      .to.emit(this.claims, 'ClaimPayoutRedeemed')
      .withArgs(this.claimant.address, ethers.parseEther('0.15'), secondClaimId, coverId);

    const balanceAfter = await ethers.provider.getBalance(this.claimant.address);
    expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther('0.15') + claimDeposit);
  });
});

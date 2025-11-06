const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { takeSnapshot, time, setNextBlockBaseFeePerGas } = require('@nomicfoundation/hardhat-network-helpers');

const { getFundedSigner, getSigner, setUSDCBalance, executeGovernorProposal } = require('./utils');

const { AssessmentOutcome, AssessmentStatus, PauseTypes, PoolAsset } = nexus.constants;
const { PAUSE_CLAIMS } = PauseTypes;
const { MaxUint256, ZeroAddress, parseEther } = ethers;

const CLAIM_DEPOSIT = parseEther('0.05');
const daysToSeconds = days => BigInt(days) * 24n * 60n * 60n;

const PRODUCT_ID = 247;

const createCover = async (
  cover,
  owner,
  { coverAsset = PoolAsset.ETH, amount = parseEther('0.1'), periodDays = 30 } = {},
) => {
  const paymentAsset = coverAsset; // Pay in same asset as cover
  const commissionRatio = 500; // 5% commission
  const commissionDestination = owner.address;
  const ipfsData = '';

  const maxPremiumInAsset = (amount * 260n) / 10000n; // 2.6% of coverage amount
  const value = coverAsset === PoolAsset.ETH ? maxPremiumInAsset : 0n;

  const coverTx = await cover.connect(owner).buyCover(
    {
      owner: owner.address,
      coverId: 0,
      productId: PRODUCT_ID,
      coverAsset,
      amount,
      period: daysToSeconds(periodDays),
      maxPremiumInAsset,
      paymentAsset,
      commissionRatio,
      commissionDestination,
      ipfsData,
    },
    [{ poolId: 2, coverAmountInAsset: amount }],
    { value },
  );

  const receipt = await coverTx.wait();
  const event = receipt.logs.find(event => event.fragment?.name === 'CoverBought');
  const coverId = event?.args.coverId;

  if (!coverId) {
    throw new Error('CoverCreated event not found');
  }

  return coverId;
};

describe('claim assessment', function () {
  this.beforeEach(async function () {
    const { snapshotId } = await takeSnapshot();
    console.info('snapshotId: ', snapshotId);
  });

  it('should run setup - add assessors and configure assessment', async function () {
    const members = [];

    for (let id = 0; id < 100; id++) {
      const address = await this.registry.getMemberAddress(id).catch(() => ZeroAddress);

      if (address === ZeroAddress) {
        continue;
      }

      const signer = await getFundedSigner(address);
      members.push(signer);

      if (members.length === 6) {
        break;
      }
    }

    const [claimant, assessor1, assessor2, assessor3, assessor4, nonAssessor] = members;
    this.assessors = [assessor1, assessor2, assessor3, assessor4];
    this.claimant = claimant;
    this.nonAssessor = nonAssessor;

    // fund with USDC and approve the cover contract
    const { assetAddress: usdcAddress } = await this.pool.getAsset(PoolAsset.USDC);
    await setUSDCBalance(usdcAddress, this.claimant.address, ethers.parseUnits('10000', 6));
    const usdc = await ethers.getContractAt('ERC20Mock', usdcAddress);
    await usdc.connect(this.claimant).approve(this.cover, MaxUint256);

    const assessorIds = [];

    for (const assessor of this.assessors) {
      const assessorId = await this.registry.getMemberId(assessor);
      assessorIds.push(assessorId);
    }
    const assessmentGroupId = (await this.assessments.getGroupsCount()) + 1n;

    const txs = [
      // add assessors to a new group (groupId 0 creates new group)
      {
        target: this.assessments.target,
        value: 0n,
        data: this.assessments.interface.encodeFunctionData('addAssessorsToGroup', [assessorIds, 0]),
      },
      // set assessment groupId for product types
      {
        target: this.assessments.target,
        value: 0n,
        data: this.assessments.interface.encodeFunctionData('setAssessingGroupIdForProductTypes', [
          [1, 19],
          assessmentGroupId,
        ]),
      },
    ];
    await executeGovernorProposal(this.governor, this.abMembers, txs);

    this.emergencyAdmin1 = await ethers.getSigner(this.admins[0]);
    this.emergencyAdmin2 = await ethers.getSigner(this.admins[1]);

    const groupId = await this.assessments.getGroupsCount();
    console.log(`Setup complete: ${assessorIds.length} assessors added to group ${groupId}`);
  });

  it('Happy Path: ETH claim submission and ACCEPTED payout', async function () {
    // create ETH cover
    const coverId = await createCover(this.cover, this.claimant, {
      coverAsset: PoolAsset.ETH,
      amount: parseEther('0.1'),
    });

    // submit claim
    const ipfsMetaData = ethers.solidityPackedKeccak256(['string'], ['Happy path ETH claim proof']);
    const requestedAmount = parseEther('0.1');

    await setNextBlockBaseFeePerGas(0).catch(e => e); // swallow the error if tenderly freaks out
    const claimId = await this.claims.getClaimsCount();
    const claimTx = await this.claims.connect(this.claimant).submitClaim(coverId, requestedAmount, ipfsMetaData, {
      value: CLAIM_DEPOSIT,
      gasPrice: 0,
    });
    await claimTx.wait();

    // cast votes (3 accept, 1 deny)
    const ipfsHashFor = ethers.solidityPackedKeccak256(['string'], ['happy-path-accept']);
    const ipfsHashAgainst = ethers.solidityPackedKeccak256(['string'], ['happy-path-deny']);

    await this.assessments.connect(this.assessors[0]).castVote(claimId, true, ipfsHashFor); // accept
    await this.assessments.connect(this.assessors[1]).castVote(claimId, true, ipfsHashFor); // accept
    await this.assessments.connect(this.assessors[2]).castVote(claimId, true, ipfsHashFor); // accept
    await this.assessments.connect(this.assessors[3]).castVote(claimId, false, ipfsHashAgainst); // deny

    // advance time past voting and cooldown periods
    const assessment = await this.assessments.getAssessment(claimId);
    const cooldownEndTime = assessment.votingEnd + assessment.cooldownPeriod + daysToSeconds(1);
    await time.increaseTo(cooldownEndTime);

    // claim ACCEPTED
    const { status, outcome } = await this.claims.getClaimDetails(claimId);
    expect(status).to.equal(AssessmentStatus.Finalized);
    expect(outcome).to.equal(AssessmentOutcome.Accepted);

    const claimDepositAmount = await this.claims.CLAIM_DEPOSIT_IN_ETH();
    const claimantEthBalanceBefore = await ethers.provider.getBalance(this.claimant.address);

    // redeem claim payout
    const redeemTx = this.claims.connect(this.claimant).redeemClaimPayout(claimId, { gasPrice: 0 });
    await expect(redeemTx).to.emit(this.claims, 'ClaimPayoutRedeemed');

    // Verify balances after redemption
    const claimantEthBalanceAfter = await ethers.provider.getBalance(this.claimant.address);

    // Expected increase: claim amount (0.05 ETH) + deposit returned (0.05 ETH) = 0.1 ETH
    const expectedEthIncrease = requestedAmount + claimDepositAmount;
    const actualEthIncrease = claimantEthBalanceAfter - claimantEthBalanceBefore;

    expect(actualEthIncrease).to.equal(expectedEthIncrease);
    console.log(`Happy Path ETH test complete: Claim ${claimId} ACCEPTED and paid out successfully`);
  });

  it('Step 1: ETH claim submission validation and DENIED outcome', async function () {
    // Create ETH cover for claimant
    const coverId = await createCover(this.cover, this.claimant, {
      coverAsset: PoolAsset.ETH,
      amount: parseEther('0.1'),
    });

    const ipfsMetaData = ethers.solidityPackedKeccak256(['string'], ['ETH claim proof']);
    // Test: non-owner member should not be able to submit claim
    const nonOwner = this.assessors[3];
    const nonOwnerSubmitClaim = this.claims
      .connect(nonOwner)
      .submitClaim(coverId, parseEther('0.05'), ipfsMetaData, { value: parseEther('0.05') });
    await expect(nonOwnerSubmitClaim).to.be.revertedWithCustomError(this.claims, 'NotCoverOwner');

    // Owner should succeed in submitting claim
    const claimId = await this.claims.getClaimsCount();
    const claimTx = await this.claims.connect(this.claimant).submitClaim(coverId, parseEther('0.05'), ipfsMetaData, {
      value: CLAIM_DEPOSIT,
      gasPrice: 0,
    });
    await claimTx.wait();

    // Cast majority DENY votes (3 deny, 1 accept)
    const ipfsHashFor = ethers.solidityPackedKeccak256(['string'], ['accept-reasoning']);
    const ipfsHashAgainst = ethers.solidityPackedKeccak256(['string'], ['deny-reasoning']);

    // 3 deny, 1 accept
    await this.assessments.connect(this.assessors[0]).castVote(claimId, false, ipfsHashAgainst); // deny
    await this.assessments.connect(this.assessors[1]).castVote(claimId, false, ipfsHashAgainst); // deny
    await this.assessments.connect(this.assessors[2]).castVote(claimId, false, ipfsHashAgainst); // deny
    await this.assessments.connect(this.assessors[3]).castVote(claimId, true, ipfsHashFor); // accept

    // Advance time past cooldown period
    const assessment = await this.assessments.getAssessment(claimId);
    const cooldownEndTime = assessment.votingEnd + assessment.cooldownPeriod + 1n;
    await time.increaseTo(cooldownEndTime);

    // DENIED
    const { status, outcome } = await this.claims.getClaimDetails(claimId);
    expect(status).to.equal(AssessmentStatus.Finalized);
    expect(outcome).to.equal(AssessmentOutcome.Denied);

    // redeemClaimPayout throws error
    const redeemClaimPayout = this.claims.connect(this.claimant).redeemClaimPayout(claimId);
    await expect(redeemClaimPayout).to.be.revertedWithCustomError(this.claims, 'ClaimNotRedeemable');

    // retrieveDeposit throw errors
    const retrieveDeposit = this.claims.connect(this.claimant).retrieveDeposit(claimId);
    await expect(retrieveDeposit).to.be.revertedWithCustomError(this.claims, 'ClaimNotADraw');

    // Store for next step
    this.ethCoverId = coverId;
    this.firstClaimId = claimId;

    console.log(`Step 1 complete: Claim ${claimId} DENIED`);
  });

  it('Step 2: USDC claim with fraud detection and governor intervention', async function () {
    const { snapshotId } = await takeSnapshot();
    console.info('Snapshot ID Assessment/Claims Step 2 start: ', snapshotId);

    // Create USDC cover (immediate re-submission after DENIED should work)
    const usdcCoverId = await createCover(this.cover, this.claimant, {
      coverAsset: PoolAsset.USDC,
      amount: ethers.parseUnits('1000', 6),
    });

    // Submit USDC claim
    const usdcClaimId = await this.claims.getClaimsCount();
    const usdcClaimTx = await this.claims.connect(this.claimant).submitClaim(
      usdcCoverId,
      ethers.parseUnits('750', 6), // Claim 750 USDC (proportionally reduced)
      ethers.solidityPackedKeccak256(['string'], ['USDC claim proof']),
      { value: CLAIM_DEPOSIT, gasPrice: 0 },
    );
    await usdcClaimTx.wait();

    // Cast inconclusive votes initially (2 for, 2 against)
    const ipfsHashFor = ethers.solidityPackedKeccak256(['string'], ['accept-reasoning']);
    const ipfsHashAgainst = ethers.solidityPackedKeccak256(['string'], ['deny-reasoning']);

    // 2 acceptVotes and 2 denyVotes
    await this.assessments.connect(this.assessors[0]).castVote(usdcClaimId, true, ipfsHashFor); // accept
    await this.assessments.connect(this.assessors[1]).castVote(usdcClaimId, true, ipfsHashFor); // accept
    await this.assessments.connect(this.assessors[2]).castVote(usdcClaimId, false, ipfsHashAgainst); // deny
    await this.assessments.connect(this.assessors[3]).castVote(usdcClaimId, false, ipfsHashAgainst); // deny

    // Advance time to end of voting period (enters cooldown)
    let assessment = await this.assessments.getAssessment(usdcClaimId);
    await time.increaseTo(Number(assessment.votingEnd) + 1);

    // Verify we're in cooldown
    const { status, outcome } = await this.claims.getClaimDetails(usdcClaimId);
    expect(status).to.equal(AssessmentStatus.Cooldown);
    expect(outcome).to.equal(AssessmentOutcome.Pending);

    // Test that assessors can't vote during cooldown
    const lateVoteHash = ethers.solidityPackedKeccak256(['string'], ['late-vote']);
    await expect(
      this.assessments.connect(this.assessors[0]).castVote(usdcClaimId, true, lateVoteHash),
    ).to.be.revertedWithCustomError(this.assessments, 'VotingPeriodEnded');

    // Test that claim can't be redeemed during cooldown
    const redeemClaimPayout = this.claims.connect(this.claimant).redeemClaimPayout(usdcClaimId);
    await expect(redeemClaimPayout).to.be.revertedWithCustomError(this.claims, 'ClaimNotRedeemable');

    // Simulate fraud discovery - governor intervenes

    const fraudulentAssessorId = await this.registry.getMemberId(this.assessors[3]);

    // 2 acceptVotes and 2 denyVotes
    const assessmentBefore = await this.assessments.getAssessment(usdcClaimId);
    expect(assessmentBefore.acceptVotes).to.equal(2);
    expect(assessmentBefore.denyVotes).to.equal(2);

    // verify fraudulent assessor is in group
    const groupId = await this.assessments.getGroupsCount();
    const isAssessorInGroupBefore = await this.assessments.isAssessorInGroup(fraudulentAssessorId, groupId);
    expect(isAssessorInGroupBefore).to.be.true;

    // verify new assessor is not in group
    const newAssessor = await getSigner(this.nonAssessor.address);
    const newAssessorMemberId = await this.registry.getMemberId(newAssessor);
    const isNewAssessorInGroupBefore = await this.assessments.isAssessorInGroup(newAssessorMemberId, groupId);
    expect(isNewAssessorInGroupBefore).to.be.false;

    // pause Claims and Assessments contracts
    const { PAUSE_CLAIMS, PAUSE_ASSESSMENTS } = PauseTypes;
    await this.registry.connect(this.emergencyAdmin1).proposePauseConfig(PAUSE_CLAIMS | PAUSE_ASSESSMENTS);
    await this.registry.connect(this.emergencyAdmin2).confirmPauseConfig(PAUSE_CLAIMS | PAUSE_ASSESSMENTS);

    const txs = [
      // undo fraudulent assessor vote
      {
        target: this.assessments.target,
        value: 0n,
        data: this.assessments.interface.encodeFunctionData('undoVotes', [fraudulentAssessorId, [usdcClaimId]]),
      },
      // remove fraudulent assessor from group
      {
        target: this.assessments.target,
        value: 0n,
        data: this.assessments.interface.encodeFunctionData('removeAssessorFromGroup', [fraudulentAssessorId, groupId]),
      },
      // add new assessor to group
      {
        target: this.assessments.target,
        value: 0n,
        data: this.assessments.interface.encodeFunctionData('addAssessorsToGroup', [[newAssessorMemberId], groupId]),
      },
      // extend voting period
      {
        target: this.assessments.target,
        value: 0n,
        data: this.assessments.interface.encodeFunctionData('extendVotingPeriod', [usdcClaimId]),
      },
    ];
    await executeGovernorProposal(this.governor, this.abMembers, txs);

    // verify fraudulent votes is undone (2 acceptVotes and 1 denyVotes after)
    const assessmentAfter = await this.assessments.getAssessment(usdcClaimId);
    expect(assessmentAfter.acceptVotes).to.equal(2);
    expect(assessmentAfter.denyVotes).to.equal(1);

    // verify fraudulent assessor is removed from group
    const isAssessorInGroupAfter = await this.assessments.isAssessorInGroup(fraudulentAssessorId, groupId);
    expect(isAssessorInGroupAfter).to.be.false;

    // verify new assessor is added to group
    const isNewAssessorInGroupAfter = await this.assessments.isAssessorInGroup(newAssessorMemberId, groupId);
    expect(isNewAssessorInGroupAfter).to.be.true;

    // unpause Claims and Assessments contracts
    await this.registry.connect(this.emergencyAdmin1).proposePauseConfig(0); // 0 = no pause
    await this.registry.connect(this.emergencyAdmin2).confirmPauseConfig(0);

    // new assessors vote (now majority for - 3 accept, 1 deny after fraud removal)
    await this.assessments.connect(newAssessor).castVote(usdcClaimId, true, ipfsHashFor); // accept

    // Advance time through voting and cooldown periods
    assessment = await this.assessments.getAssessment(usdcClaimId);
    const newCooldownEndTime = assessment.votingEnd + assessment.cooldownPeriod + 1n;
    await time.increaseTo(newCooldownEndTime);

    // Store for next step
    this.usdcCoverId = usdcCoverId;
    this.usdcClaimId = usdcClaimId;
    this.newAssessor = newAssessor;

    console.log(`Step 2 complete: USDC claim ${usdcClaimId} ready for payout after governor intervention`);
  });

  it('Step 2.5: post-cooldown fraud recovery - governor intervention past cooldown period', async function () {
    const coverId = await createCover(this.cover, this.claimant, {
      coverAsset: PoolAsset.ETH,
      amount: parseEther('0.3'),
    });

    const claimId = await this.claims.getClaimsCount();
    const submitClaimTx = await this.claims
      .connect(this.claimant)
      .submitClaim(coverId, parseEther('0.2'), ethers.solidityPackedKeccak256(['string'], ['post-cooldown-claim']), {
        value: CLAIM_DEPOSIT,
        gasPrice: 0,
      });
    await submitClaimTx.wait();

    // cast votes (3 accept, 1 deny)
    const ipfsHashFor = ethers.solidityPackedKeccak256(['string'], ['post-cooldown-accept']);
    const ipfsHashAgainst = ethers.solidityPackedKeccak256(['string'], ['post-cooldown-deny']);

    await this.assessments.connect(this.assessors[0]).castVote(claimId, true, ipfsHashFor); // accept
    await this.assessments.connect(this.assessors[1]).castVote(claimId, true, ipfsHashFor); // accept
    await this.assessments.connect(this.assessors[2]).castVote(claimId, true, ipfsHashAgainst); // accept (fraud)
    await this.assessments.connect(this.newAssessor).castVote(claimId, false, ipfsHashAgainst); // deny

    // advance time past cooldown period
    const assessment = await this.assessments.getAssessment(claimId);
    const finalizedTime = assessment.votingEnd + assessment.cooldownPeriod + daysToSeconds(1);
    await time.increaseTo(finalizedTime);

    // verify claim is actually finalized but not yet redeemed
    const { status, outcome, claim } = await this.claims.getClaimDetails(claimId);
    expect(status).to.equal(AssessmentStatus.Finalized);
    expect(outcome).to.equal(AssessmentOutcome.Accepted);
    expect(claim.payoutRedeemed).to.be.false;
    expect(claim.depositRetrieved).to.be.false;

    const fraudAssessor = await this.registry.getMemberId(this.assessors[2]);

    const assessmentBeforeIntervention = await this.assessments.getAssessment(claimId);
    expect(assessmentBeforeIntervention.acceptVotes).to.equal(3);
    expect(assessmentBeforeIntervention.denyVotes).to.equal(1);

    // pause contracts for governor intervention
    const { PAUSE_CLAIMS, PAUSE_ASSESSMENTS } = PauseTypes;
    await this.registry.connect(this.emergencyAdmin1).proposePauseConfig(PAUSE_CLAIMS | PAUSE_ASSESSMENTS);
    await this.registry.connect(this.emergencyAdmin2).confirmPauseConfig(PAUSE_CLAIMS | PAUSE_ASSESSMENTS);

    const replacementAssessor = this.assessors[3];
    const replacementAssessorMemberId = await this.registry.getMemberId(replacementAssessor);
    const groupId = await this.assessments.getGroupsCount();

    // execute governor proposal AFTER finalization
    const postCooldownTxs = [
      // undo fraudulent vote after finalization
      {
        target: this.assessments.target,
        value: 0n,
        data: this.assessments.interface.encodeFunctionData('undoVotes', [fraudAssessor, [claimId]]),
      },
      // remove fraudulent assessor from group
      {
        target: this.assessments.target,
        value: 0n,
        data: this.assessments.interface.encodeFunctionData('removeAssessorFromGroup', [fraudAssessor, groupId]),
      },
      // add replacement assessor to group
      {
        target: this.assessments.target,
        value: 0n,
        data: this.assessments.interface.encodeFunctionData('addAssessorsToGroup', [
          [replacementAssessorMemberId],
          groupId,
        ]),
      },
      // extend voting period after finalization
      {
        target: this.assessments.target,
        value: 0n,
        data: this.assessments.interface.encodeFunctionData('extendVotingPeriod', [claimId]),
      },
    ];
    await executeGovernorProposal(this.governor, this.abMembers, postCooldownTxs);

    // verify governor intervention worked
    const assessmentAfterIntervention = await this.assessments.getAssessment(claimId);
    expect(assessmentAfterIntervention.acceptVotes).to.equal(2); // reduced by 1 (fraudulent vote removed)
    expect(assessmentAfterIntervention.denyVotes).to.equal(1); // unchanged

    // verify assessor group changes
    const isFraudAssessorRemoved = await this.assessments.isAssessorInGroup(fraudAssessor, groupId);
    expect(isFraudAssessorRemoved).to.be.false;

    const isNewAssessorAdded = await this.assessments.isAssessorInGroup(replacementAssessorMemberId, groupId);
    expect(isNewAssessorAdded).to.be.true;

    // verify voting period was extended (should have new votingEnd time)
    const extendedAssessment = await this.assessments.getAssessment(claimId);
    expect(extendedAssessment.votingEnd).to.be.greaterThan(assessmentBeforeIntervention.votingEnd);

    // unpause contracts
    await this.registry.connect(this.emergencyAdmin1).proposePauseConfig(0);
    await this.registry.connect(this.emergencyAdmin2).confirmPauseConfig(0);

    // replacement assessor votes (now majority accept - 2 accept, 2 deny)
    await this.assessments.connect(replacementAssessor).castVote(claimId, false, ipfsHashFor); // deny

    // advance time through new voting and cooldown periods
    const finalAssessment = await this.assessments.getAssessment(claimId);
    const newCooldownEndTime = finalAssessment.votingEnd + finalAssessment.cooldownPeriod + daysToSeconds(1);
    await time.increaseTo(newCooldownEndTime);

    // verify final outcome is now a DRAW (2 accept, 2 deny)
    const finalClaimDetails = await this.claims.getClaimDetails(claimId);
    expect(finalClaimDetails.status).to.equal(AssessmentStatus.Finalized);
    expect(finalClaimDetails.outcome).to.equal(AssessmentOutcome.Draw);

    console.log(`Step 2.5 complete: post-cooldown fraud recovery successfully changed ACCEPTED to DRAW`);
  });

  it('Step 3: Pause and payout functionality testing', async function () {
    // Get USDC token contract address from pool
    const usdcAsset = await this.pool.getAsset(PoolAsset.USDC);
    this.usdcToken = await ethers.getContractAt('ERC20Mock', usdcAsset.assetAddress);

    // Get claim deposit amount from contract
    const claimDepositAmount = await this.claims.CLAIM_DEPOSIT_IN_ETH();

    // Test pause claims payout - should fail when paused
    await this.registry.connect(this.emergencyAdmin1).proposePauseConfig(PAUSE_CLAIMS);
    await this.registry.connect(this.emergencyAdmin2).confirmPauseConfig(PAUSE_CLAIMS);

    const redeemClaimPayoutPaused = this.claims.connect(this.claimant).redeemClaimPayout(this.usdcClaimId);
    await expect(redeemClaimPayoutPaused).to.be.revertedWithCustomError(this.claims, 'Paused');

    // Unpause claims payout
    await this.registry.connect(this.emergencyAdmin1).proposePauseConfig(0); // 0 = no pause
    await this.registry.connect(this.emergencyAdmin2).confirmPauseConfig(0);

    // Record balances before redemption
    const claimantEthBalanceBefore = await ethers.provider.getBalance(this.claimant.address);
    const claimantUsdcBalanceBefore = await this.usdcToken.balanceOf(this.claimant.address);

    // Now redemption should succeed (USDC payout + ETH deposit returned)
    const redeemClaimPayout = this.claims.connect(this.claimant).redeemClaimPayout(this.usdcClaimId, { gasPrice: 0 });
    await expect(redeemClaimPayout).to.emit(this.claims, 'ClaimPayoutRedeemed');

    // Record balances after redemption
    const claimantEthBalanceAfter = await ethers.provider.getBalance(this.claimant.address);
    const claimantUsdcBalanceAfter = await this.usdcToken.balanceOf(this.claimant.address);

    // Verify USDC balance increased by 750 USDC (with 6 decimals)
    const expectedUsdcIncrease = ethers.parseUnits('750', 6);
    expect(claimantUsdcBalanceAfter - claimantUsdcBalanceBefore).to.equal(expectedUsdcIncrease);

    // Verify ETH balance increased by exactly the claim deposit amount (gas-free transaction)
    expect(claimantEthBalanceAfter - claimantEthBalanceBefore).to.equal(claimDepositAmount);

    console.log(`Step 3 complete: Pause/unpause functionality tested, USDC claim paid out`);
    console.log(`   - USDC balance increased by: ${ethers.formatUnits(expectedUsdcIncrease, 6)} USDC`);
    console.log(`   - ETH deposit returned: ${ethers.formatEther(claimDepositAmount)} ETH`);
  });

  it('Step 3.5: no double redeem after governor changes post-redemption', async function () {
    const redeemedClaimId = this.usdcClaimId;

    // verify claim was already redeemed in Step 3
    const claimBefore = await this.claims.getClaim(redeemedClaimId);
    expect(claimBefore.payoutRedeemed).to.be.true;
    expect(claimBefore.depositRetrieved).to.be.true;

    // record current balances (should remain unchanged after governor attempts)
    const ethBalanceBefore = await ethers.provider.getBalance(this.claimant.address);
    const usdcBalanceBefore = await this.usdcToken.balanceOf(this.claimant.address);

    const assessorWhoVotedId = await this.registry.getMemberId(this.assessors[0]);
    const assessmentBefore = await this.assessments.getAssessment(redeemedClaimId);

    // governor attempts undoVotes and extendVotingPeriod on already-redeemed claim
    // these should NOT revert (governor functions work regardless of redemption state)
    const postRedemptionTxs = [
      // attempt to undo vote on redeemed claim
      {
        target: this.assessments.target,
        value: 0n,
        data: this.assessments.interface.encodeFunctionData('undoVotes', [assessorWhoVotedId, [redeemedClaimId]]),
      },
      // attempt to extend voting period on redeemed claim
      {
        target: this.assessments.target,
        value: 0n,
        data: this.assessments.interface.encodeFunctionData('extendVotingPeriod', [redeemedClaimId]),
      },
    ];

    // governor functions should succeed even on redeemed claims
    await executeGovernorProposal(this.governor, this.abMembers, postRedemptionTxs);

    await setNextBlockBaseFeePerGas(0);

    // verify claim redemption state is unchanged (still redeemed)
    const claimAfter = await this.claims.getClaim(redeemedClaimId);
    expect(claimAfter.payoutRedeemed).to.be.true;
    expect(claimAfter.depositRetrieved).to.be.true;

    // verify governor changes took effect on assessment state (but don't matter for redeemed claim)
    const ballotAfterUndo = await this.assessments.ballotOf(redeemedClaimId, assessorWhoVotedId);
    expect(ballotAfterUndo.timestamp).to.equal(0); // vote was undone

    const assessmentAfter = await this.assessments.getAssessment(redeemedClaimId);
    expect(assessmentAfter.votingEnd).to.be.greaterThan(assessmentBefore.votingEnd); // voting period was extended

    // second redemption should fail
    const redeemClaimPayout = this.claims.connect(this.claimant).redeemClaimPayout(redeemedClaimId);
    await expect(redeemClaimPayout).to.be.revertedWithCustomError(this.claims, 'ClaimNotRedeemable');

    // deposit retrieval should fail
    const retrieveDeposit = this.claims.connect(this.claimant).retrieveDeposit(redeemedClaimId);
    await expect(retrieveDeposit).to.be.revertedWithCustomError(this.claims, 'ClaimNotADraw');

    // verify balances remain exactly the same (no double redemption occurred)
    const ethBalanceAfter = await ethers.provider.getBalance(this.claimant.address);
    const usdcBalanceAfter = await this.usdcToken.balanceOf(this.claimant.address);

    expect(ethBalanceAfter).to.be.lessThanOrEqual(ethBalanceBefore);
    expect(usdcBalanceAfter).to.be.lessThanOrEqual(usdcBalanceBefore);

    console.log(`Step 3.5 complete: governor changes on redeemed claim had no effect on redemption protection`);
  });

  it('Step 4: ETH claim with DRAW outcome', async function () {
    // Create new ETH cover for DRAW test (separate from Step 1 DENIED cover)
    const drawCoverId = await createCover(this.cover, this.claimant, {
      coverAsset: PoolAsset.ETH,
      amount: parseEther('0.8'), // Reduced from 8 ETH
    });

    // Submit DRAW claim on new cover
    const drawClaimId = await this.claims.getClaimsCount();
    const drawClaimTx = await this.claims
      .connect(this.claimant)
      .submitClaim(drawCoverId, parseEther('0.3'), ethers.solidityPackedKeccak256(['string'], ['DRAW claim proof']), {
        value: CLAIM_DEPOSIT,
        gasPrice: 0,
      });
    await drawClaimTx.wait();

    // Cast equal votes (2 for, 2 against = DRAW)
    const ipfsHashFor = ethers.solidityPackedKeccak256(['string'], ['draw-accept']);
    const ipfsHashAgainst = ethers.solidityPackedKeccak256(['string'], ['draw-deny']);

    await this.assessments.connect(this.assessors[0]).castVote(drawClaimId, true, ipfsHashFor); // accept
    await this.assessments.connect(this.assessors[1]).castVote(drawClaimId, true, ipfsHashFor); // accept
    await this.assessments.connect(this.assessors[3]).castVote(drawClaimId, false, ipfsHashAgainst); // deny
    await this.assessments.connect(this.newAssessor).castVote(drawClaimId, false, ipfsHashAgainst); // deny

    // Advance time past voting and cooldown periods
    const assessment = await this.assessments.getAssessment(drawClaimId);
    const cooldownEndTime = assessment.votingEnd + assessment.cooldownPeriod + 1n;
    await time.increaseTo(cooldownEndTime);

    // Verify status is DRAW
    const { status, outcome } = await this.claims.getClaimDetails(drawClaimId);
    expect(status).to.equal(AssessmentStatus.Finalized);
    expect(outcome).to.equal(AssessmentOutcome.Draw);

    // redeemClaimPayout throws error for DRAW claims
    const redeemClaimPayout = this.claims.connect(this.claimant).redeemClaimPayout(drawClaimId);
    await expect(redeemClaimPayout).to.be.revertedWithCustomError(this.claims, 'ClaimNotRedeemable');

    // Get claim deposit amount and balance
    const claimDepositAmount = await this.claims.CLAIM_DEPOSIT_IN_ETH();
    const claimantEthBalanceBefore = await ethers.provider.getBalance(this.claimant.address);

    // Should be able to retrieve deposit for DRAW claims
    await setNextBlockBaseFeePerGas('0').catch(e => e);
    const retrieveDeposit = this.claims.connect(this.claimant).retrieveDeposit(drawClaimId, { gasPrice: 0 });
    await expect(retrieveDeposit)
      .to.emit(this.claims, 'ClaimDepositRetrieved')
      .withArgs(drawClaimId, this.claimant.address);

    // Record balance after deposit retrieval
    const claimantEthBalanceAfter = await ethers.provider.getBalance(this.claimant);

    // Verify ETH balance increased by exactly the claim deposit amount (gas-free transaction)
    expect(claimantEthBalanceAfter - claimantEthBalanceBefore).to.equal(claimDepositAmount);

    console.log(`Step 4 complete: DRAW claim ${drawClaimId} deposit retrieved`);
    console.log(`   - ETH deposit returned: ${ethers.formatEther(claimDepositAmount)} ETH`);
  });

  it('Step 5: ETH claim with redemption period expiry', async function () {
    // Create new ETH cover for redemption expiry test
    const newEthCoverId = await createCover(this.cover, this.claimant, {
      coverAsset: PoolAsset.ETH,
      amount: parseEther('0.5'), // Reduced from 5 ETH
    });

    // Submit new ETH claim
    const newEthClaimId = await this.claims.getClaimsCount();
    await setNextBlockBaseFeePerGas('0').catch(e => e);
    await this.claims.connect(this.claimant).submitClaim(
      newEthCoverId,
      parseEther('0.2'), // Reduced from 2 ETH
      ethers.solidityPackedKeccak256(['string'], ['Expiry test claim proof']),
      { value: CLAIM_DEPOSIT, gasPrice: 0 },
    );

    // Cast majority FOR votes (3 accept, 1 deny)
    const ipfsHashFor = ethers.solidityPackedKeccak256(['string'], ['accept-reasoning-expiry']);
    const ipfsHashAgainst = ethers.solidityPackedKeccak256(['string'], ['deny-reasoning-expiry']);

    await this.assessments.connect(this.assessors[0]).castVote(newEthClaimId, true, ipfsHashFor); // accept
    await this.assessments.connect(this.assessors[1]).castVote(newEthClaimId, true, ipfsHashFor); // accept
    await this.assessments.connect(this.assessors[3]).castVote(newEthClaimId, true, ipfsHashFor); // accept
    await this.assessments.connect(this.newAssessor).castVote(newEthClaimId, false, ipfsHashAgainst); // deny

    // Advance time past voting and cooldown periods
    const assessment = await this.assessments.getAssessment(newEthClaimId);
    const cooldownEndTime = assessment.votingEnd + assessment.cooldownPeriod + 1n;
    await time.increaseTo(cooldownEndTime);

    // Verify status is ACCEPTED
    const { status, outcome } = await this.claims.getClaimDetails(newEthClaimId);
    expect(status).to.equal(AssessmentStatus.Finalized);
    expect(outcome).to.equal(AssessmentOutcome.Accepted);

    // Advance time past redemption period without redeeming
    const { payoutRedemptionPeriod } = await this.claims.getClaim(newEthClaimId);
    await time.increaseTo(cooldownEndTime + payoutRedemptionPeriod + 1n);

    // Attempt to redeem - should fail (redemption period expired)
    await expect(this.claims.connect(this.claimant).redeemClaimPayout(newEthClaimId)) //
      .to.be.revertedWithCustomError(this.claims, 'ClaimNotRedeemable');

    // Store for Step 6
    this.expiredClaimCoverId = newEthCoverId;
    this.expiredClaimId = newEthClaimId;

    console.log(`Step 5 complete: Claim ${newEthClaimId} expired without redemption`);
  });

  it('Step 6: Re-submit claim on same cover after ACCEPTED claim expired', async function () {
    // Re-submit claim on the same ETH cover from Step 5 (which was ACCEPTED but redemption expired)
    // This should work since the redemption period has passed for the previous ACCEPTED claim
    const resubmitClaimId = await this.claims.getClaimsCount();
    await this.claims.connect(this.claimant).submitClaim(
      this.expiredClaimCoverId, // Same cover from Step 5
      parseEther('0.15'), // Reduced from 1.5 ETH
      ethers.solidityPackedKeccak256(['string'], ['Re-submitted after expiry claim proof']),
      { value: CLAIM_DEPOSIT, gasPrice: 0 },
    );

    // Vote to pass (3 accept, 1 deny)
    const ipfsHashFor = ethers.solidityPackedKeccak256(['string'], ['resubmit-after-expiry-accept']);
    const ipfsHashAgainst = ethers.solidityPackedKeccak256(['string'], ['resubmit-after-expiry-deny']);

    await this.assessments.connect(this.assessors[0]).castVote(resubmitClaimId, true, ipfsHashFor); // accept
    await this.assessments.connect(this.assessors[1]).castVote(resubmitClaimId, true, ipfsHashFor); // accept
    await this.assessments.connect(this.assessors[3]).castVote(resubmitClaimId, true, ipfsHashFor); // accept
    await this.assessments.connect(this.newAssessor).castVote(resubmitClaimId, false, ipfsHashAgainst); // deny

    // Advance time past voting and cooldown periods
    const assessment = await this.assessments.getAssessment(resubmitClaimId);
    const cooldownEndTime = assessment.votingEnd + assessment.cooldownPeriod + 1n;
    await time.increaseTo(cooldownEndTime);

    // Verify status is ACCEPTED
    const { status, outcome } = await this.claims.getClaimDetails(resubmitClaimId);
    expect(status).to.equal(AssessmentStatus.Finalized);
    expect(outcome).to.equal(AssessmentOutcome.Accepted);

    // Get claim deposit amount from contract
    const claimDepositAmount = await this.claims.CLAIM_DEPOSIT_IN_ETH();

    // Record balances before redemption
    const claimantEthBalanceBefore = await ethers.provider.getBalance(this.claimant.address);

    // Verify payout - should succeed (ETH payout + ETH deposit returned)
    const redeemClaimPayout = this.claims.connect(this.claimant).redeemClaimPayout(resubmitClaimId, { gasPrice: 0 });
    await expect(redeemClaimPayout)
      .to.emit(this.claims, 'ClaimPayoutRedeemed')
      .withArgs(this.claimant.address, parseEther('0.15'), resubmitClaimId, this.expiredClaimCoverId)
      .to.emit(this.claims, 'ClaimDepositRetrieved')
      .withArgs(resubmitClaimId, this.claimant.address);

    // Record balances after redemption
    const claimantEthBalanceAfter = await ethers.provider.getBalance(this.claimant.address);

    // Verify ETH balance increased by payout amount (0.15 ETH) + deposit (0.05 ETH)
    const expectedEthIncrease = parseEther('0.15') + claimDepositAmount; // 0.2 ETH total
    expect(claimantEthBalanceAfter - claimantEthBalanceBefore).to.equal(expectedEthIncrease);

    console.log(
      `Step 6 complete: Re-submitted claim ${resubmitClaimId} after expired redemption successfully paid out`,
    );
  });
});

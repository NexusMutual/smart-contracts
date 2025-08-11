const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { parseEther } = ethers;

const { getSigner } = require('./utils');
const { PAUSE_CLAIMS_PAYOUT } = require('../utils/registry');

const { ContractIndexes } = nexus.constants;

// Constants for assessment status
const ASSESSMENT_STATUS = {
  VOTING: 0,
  COOLDOWN: 1,
  ACCEPTED: 2,
  DENIED: 3,
  DRAW: 4,
};

// Pool assets
const ASSET = {
  ETH: 0,
  DAI: 1, // To be deprecated
  stETH: 2,
  NXMTY: 3,
  rETH: 4,
  SafeTracker: 5,
  USDC: 6,
  cbBTC: 7,
};

// Helper functions
const setTime = async timestamp => {
  await ethers.provider.send('evm_setNextBlockTimestamp', [Number(timestamp)]);
  await ethers.provider.send('evm_mine');
};

const daysToSeconds = days => days * 24 * 60 * 60;

const createCover = async (
  coverBroker,
  owner,
  { coverAsset = ASSET.ETH, amount = parseEther('10'), period = 365 } = {},
) => {
  // Create a basic cover using the CoverBroker
  const productId = 0; // Use default product
  const paymentAsset = ASSET.ETH; // Always pay in ETH
  const commissionRatio = 0;
  const commissionDestination = owner.address;
  const ipfsData = '0x';

  return coverBroker.connect(owner).buyCover(
    {
      owner: owner.address,
      coverId: 0,
      productId,
      coverAsset,
      amount,
      period,
      maxPremiumInAsset: parseEther('1'),
      paymentAsset,
      commissionRatio,
      commissionDestination,
      ipfsData,
    },
    [{ poolId: 1, coverAmountInAsset: amount }],
    { value: parseEther('1') },
  );
};

const setupContractsForSkipping = async thisParam => {
  thisParam.registry = await ethers.getContractAt('Registry', '0xC3E28A37EEF2674175Fc37f28C4f33f9D8aF7E43');

  const governanceAddress = await thisParam.registry.getContractAddressByIndex(ContractIndexes.C_GOVERNANCE || 1);
  thisParam.tempGovernance = await ethers.getContractAt('TemporaryGovernance', governanceAddress);
  console.log('governanceAddress: ', governanceAddress);

  const assessmentAddress = await thisParam.registry.getContractAddressByIndex(ContractIndexes.C_ASSESSMENT);
  thisParam.assessment = await ethers.getContractAt('Assessment', assessmentAddress);
  console.log('assessmentAddress: ', assessmentAddress);

  const claimsAddress = await thisParam.registry.getContractAddressByIndex(ContractIndexes.C_CLAIMS);
  thisParam.claims = await ethers.getContractAt('Claims', claimsAddress);
  console.log('claimsAddress: ', claimsAddress);

  const coverAddress = await thisParam.registry.getContractAddressByIndex(ContractIndexes.C_COVER);
  thisParam.cover = await ethers.getContractAt('Cover', coverAddress);
  console.log('coverAddress: ', coverAddress);

  const governorAddress = await thisParam.registry.getContractAddressByIndex(ContractIndexes.C_GOVERNOR);
  thisParam.governor = await ethers.getContractAt('Governor', governorAddress);
  console.log('governorAddress: ', governorAddress);
};

it('should run setup - add assessors and configure assessment', async function () {
  // uncomment when reverting state to after phase 3
  // await setupContractsForSkipping(this);

  console.info('Snapshot assessment/claims setup start: ', await this.evm.snapshot());
  const [claimant, assessor1, assessor2, assessor3, assessor4] = await Promise.all([
    getSigner('0x5fa07227d05774c2ff11c2425919d14225a38dbb'),
    getSigner('0x5929cc4d10b6a1acc5bf5d221889f10251c628a1'),
    getSigner('0xf3bfac9e828bc904112e7bb516d4cd4e6468f785'),
    getSigner('0xfec65468cf9ab04cea40b113bf679e82973bdb58'),
    getSigner('0xa8c320bc7581ca1a24521a9e56a46553ad67e4b0'),
  ]);

  // Get assessor member IDs
  this.assessorMemberIds = await Promise.all([
    this.registry.getMemberId(assessor1.address),
    this.registry.getMemberId(assessor2.address),
    this.registry.getMemberId(assessor3.address),
    this.registry.getMemberId(assessor4.address),
  ]);
  console.log('this.assessorMemberIds: ', this.assessorMemberIds);

  // Debug: Check what governor address the Assessment contract expects
  // Since this.assessment.registry() is reverting, we'll assume it uses the same registry
  const assessmentRegistryAddress = '0xC3E28A37EEF2674175Fc37f28C4f33f9D8aF7E43'; // Same as this.registry
  console.log('Assessment registry address (assumed):', assessmentRegistryAddress);

  const assessmentRegistry = await ethers.getContractAt('Registry', assessmentRegistryAddress);
  const assessmentRegistryGovernorAddress = await assessmentRegistry.getContractAddressByIndex(
    ContractIndexes.C_GOVERNOR,
  );

  console.log('Assessment registry governor address:', assessmentRegistryGovernorAddress);
  console.log('Our governor address:', this.governor.target);
  console.log('Governor addresses match:', assessmentRegistryGovernorAddress === this.governor.target);

  // use governor signer for assessment contract
  const governorSigner = await getSigner(assessmentRegistryGovernorAddress);
  this.assessment = this.assessment.connect(governorSigner);

  // add assessors to a new group (groupId 0 creates new group)
  console.log('adding assessors to group');
  const tx = await this.assessment.addAssessorsToGroup(this.assessorMemberIds, 0, { gasLimit: 21e6 });
  await tx.wait();

  // set assessment data for product types - 1 day cooldown, 30 days redemption period
  const cooldownPeriod = daysToSeconds(1);
  const payoutRedemptionPeriod = daysToSeconds(30);
  console.log('setting assessment data for product types');
  await this.assessment.setAssessmentDataForProductTypes([0, 1], cooldownPeriod, payoutRedemptionPeriod, groupId, {
    gasLimit: 21e6,
  });

  this.assessors = [assessor1, assessor2, assessor3, assessor4];
  this.claimant = claimant;

  console.log(`✅ Setup complete: ${this.assessorMemberIds.length} assessors added to group ${groupId}`);
});

it.skip('Phase 1: ETH claim submission validation and DENIED outcome', async function () {
  console.info('Snapshot ID Assessment/Claims Phase 1 start: ', await this.evm.snapshot());
  const nonMember = await getSigner('0x0000000000000000000000000000000000000001');

  // Test: non-member should not be able to submit claim
  const nonMemberSubmitClaim = this.claims
    .connect(nonMember)
    .submitClaim(1, parseEther('1'), ethers.ZeroHash, { value: parseEther('0.05') });
  await expect(nonMemberSubmitClaim).to.be.revertedWithCustomError(this.claims, 'OnlyMember');

  // Create ETH cover for claimant
  const coverTx = await createCover(this.coverBroker, this.claimant, {
    coverAsset: ASSET.ETH,
    amount: parseEther('10'),
  });
  const coverReceipt = await coverTx.wait();

  // Find CoverCreated event to get coverId
  const coverEvent = coverReceipt.logs.find(log => {
    try {
      const parsed = this.cover.interface.parseLog(log);
      return parsed && parsed.name === 'CoverCreated';
    } catch {
      return false;
    }
  });

  if (!coverEvent) {
    throw new Error('CoverCreated event not found');
  }

  const coverId = this.cover.interface.parseLog(coverEvent).args.coverId;

  // Test: non-owner member should not be able to submit claim
  const nonOwnerSubmitClaim = this.claims
    .connect(this.assessors[1])
    .submitClaim(coverId, parseEther('5'), ethers.ZeroHash, { value: parseEther('0.05') });
  await expect(nonOwnerSubmitClaim).to.be.revertedWithCustomError(this.claims, 'NotCoverOwner');

  // Owner should succeed in submitting claim
  const ipfsMetaData = ethers.solidityPackedKeccak256(['string'], ['ETH claim proof']);
  const claimTx = await this.claims
    .connect(this.claimant)
    .submitClaim(coverId, parseEther('5'), ipfsMetaData, { value: parseEther('0.05'), gasPrice: 0 });
  await claimTx.wait();

  const claimId = await this.claims.getClaimsCount();

  // Cast majority DENY votes (3 deny, 2 accept)
  const ipfsHashFor = ethers.solidityPackedKeccak256(['string'], ['accept-reasoning']);
  const ipfsHashAgainst = ethers.solidityPackedKeccak256(['string'], ['deny-reasoning']);

  // 3 deny, 2 accept
  await Promise.all([
    this.assessment.connect(this.assessors[0]).castVote(claimId, false, ipfsHashAgainst), // deny
    this.assessment.connect(this.assessors[1]).castVote(claimId, false, ipfsHashAgainst), // deny
    this.assessment.connect(this.assessors[2]).castVote(claimId, false, ipfsHashAgainst), // deny
    this.assessment.connect(this.assessors[3]).castVote(claimId, true, ipfsHashFor), // accept
  ]);

  // Advance time past cooldown period
  const assessment = await this.assessment.getAssessment(claimId);
  const cooldownEndTime = assessment.votingEnd + assessment.cooldownPeriod + 1n;
  await setTime(cooldownEndTime);

  // DENIED
  const [, status] = await this.assessment.getAssessmentResult(claimId);
  expect(status).to.equal(ASSESSMENT_STATUS.DENIED);

  // redeemClaimPayout throws error
  const redeemClaimPayout = this.claims.connect(this.claimant).redeemClaimPayout(claimId);
  await expect(redeemClaimPayout).to.be.revertedWithCustomError(this.claims, 'InvalidAssessmentStatus');

  // retrieveDeposit throw errors
  const retrieveDeposit = this.claims.connect(this.claimant).retrieveDeposit(claimId);
  await expect(retrieveDeposit).to.be.revertedWithCustomError(this.claims, 'InvalidAssessmentStatus');

  // Store for next phase
  this.ethCoverId = coverId;
  this.firstClaimId = claimId;

  console.log(`✅ Phase 1 complete: Claim ${claimId} DENIED`);
});

it.skip('Phase2: USDC claim with fraud detection and governance intervention', async function () {
  // Create USDC cover (immediate re-submission after DENIED should work)
  const usdcCoverTx = await createCover(this.coverBroker, this.claimant, {
    coverAsset: ASSET.USDC,
    amount: ethers.parseUnits('100000', 6), // 100,000 USDC (6 decimals)
  });
  const usdcCoverReceipt = await usdcCoverTx.wait();

  // Extract coverId from events
  const usdcCoverEvent = usdcCoverReceipt.logs.find(log => {
    try {
      const parsed = this.cover.interface.parseLog(log);
      return parsed && parsed.name === 'CoverCreated';
    } catch {
      return false;
    }
  });

  const usdcCoverId = this.cover.interface.parseLog(usdcCoverEvent).args.coverId;

  // Submit USDC claim
  const usdcClaimTx = await this.claims.connect(this.claimant).submitClaim(
    usdcCoverId,
    ethers.parseUnits('75000', 6), // Claim 75,000 USDC
    ethers.solidityPackedKeccak256(['string'], ['USDC claim proof']),
    { value: parseEther('0.05'), gasPrice: 0 },
  );
  await usdcClaimTx.wait();

  const usdcClaimId = await this.claims.getClaimsCount();

  // Cast inconclusive votes initially (2 for, 2 against)
  const ipfsHashFor = ethers.solidityPackedKeccak256(['string'], ['accept-reasoning']);
  const ipfsHashAgainst = ethers.solidityPackedKeccak256(['string'], ['deny-reasoning']);

  // 2 acceptVotes and 2 denyVotes
  await Promise.all([
    this.assessment.connect(this.assessors[0]).castVote(usdcClaimId, true, ipfsHashFor), // accept
    this.assessment.connect(this.assessors[1]).castVote(usdcClaimId, true, ipfsHashFor), // accept
    this.assessment.connect(this.assessors[2]).castVote(usdcClaimId, false, ipfsHashAgainst), // deny
    this.assessment.connect(this.assessors[3]).castVote(usdcClaimId, false, ipfsHashAgainst), // deny
  ]);

  // Advance time to end of voting period (enters cooldown)
  let assessment = await this.assessment.getAssessment(usdcClaimId);
  await setTime(Number(assessment.votingEnd) + 1);

  // Verify we're in cooldown
  const [, cooldownStatus] = await this.assessment.getAssessmentResult(usdcClaimId);
  expect(cooldownStatus).to.equal(ASSESSMENT_STATUS.COOLDOWN);

  // Test that assessors can't vote during cooldown
  const lateVoteHash = ethers.solidityPackedKeccak256(['string'], ['late-vote']);
  await expect(
    this.assessment.connect(this.assessors[0]).castVote(usdcClaimId, true, lateVoteHash),
  ).to.be.revertedWithCustomError(this.assessment, 'VotingPeriodEnded');

  // Test that claim can't be redeemed during cooldown
  await expect(this.claims.connect(this.claimant).redeemClaimPayout(usdcClaimId)).to.be.revertedWithCustomError(
    this.claims,
    'InvalidAssessmentStatus',
  );

  // Simulate fraud discovery - governance intervenes
  // 1. Undo fraudulent votes from assessors 2 and 3
  const fraudulentAssessorId = await this.memberRoles.getMemberId(this.assessors[3].address);

  // 2 acceptVotes and 2 denyVotes
  const assessmentBefore = await this.assessment.getAssessment(usdcClaimId);
  expect(assessmentBefore.acceptVotes).to.equal(2);
  expect(assessmentBefore.denyVotes).to.equal(2);

  // 1. Undo fraudulent votes (2 acceptVotes and 1 denyVotes after)
  const governanceSigner = getSigner(this.tempGovernance.target);
  await this.assessment.connect(governanceSigner).undoVotes(fraudulentAssessorId, [usdcClaimId]);

  const assessmentAfter = await this.assessment.getAssessment(usdcClaimId);
  expect(assessmentAfter.acceptVotes).to.equal(2);
  expect(assessmentAfter.denyVotes).to.equal(1);

  // 2. Remove fraudulent assessor from group
  const groupId = await this.assessment.getGroupsCount();
  const isAssessorInGroupBefore = await this.assessment.isAssessorInGroup(fraudulentAssessorId, groupId);
  expect(isAssessorInGroupBefore).to.be.true;

  await this.assessment.connect(governanceSigner).removeAssessorFromGroup(fraudulentAssessorId, groupId);

  const isAssessorInGroupAfter = await this.assessment.isAssessorInGroup(fraudulentAssessorId, groupId);
  expect(isAssessorInGroupAfter).to.be.false;

  // 3. Add new assessor to group
  const [newAssessor] = await Promise.all([getSigner('0x2a156b05ae6ab6ea14b4b113bf679e82973bdb58')]);

  const newAssessorMemberId = await this.memberRoles.getMemberId(newAssessor.address);

  const isNewAssessorInGroupBefore = await this.assessment.isAssessorInGroup(newAssessorMemberId, groupId);
  expect(isNewAssessorInGroupBefore).to.be.false;

  await this.assessment.connect(governanceSigner).addAssessorsToGroup([newAssessorMemberId], groupId);

  const isNewAssessorInGroupAfter = await this.assessment.isAssessorInGroup(newAssessorMemberId, groupId);
  expect(isNewAssessorInGroupAfter).to.be.true;

  // 4. Extend voting period to allow new assessor to vote
  await this.assessment.connect(governanceSigner).extendVotingPeriod(usdcClaimId);

  // 5. New assessors vote (now majority for - 3 accept, 1 deny after fraud removal)
  await this.assessment.connect(newAssessor).castVote(usdcClaimId, true, ipfsHashFor); // accept

  // Advance time through voting and cooldown periods
  assessment = await this.assessment.getAssessment(usdcClaimId);
  const newCooldownEndTime = assessment.votingEnd + assessment.cooldownPeriod + 1n;
  await setTime(newCooldownEndTime);

  // Store for next phase
  this.usdcCoverId = usdcCoverId;
  this.usdcClaimId = usdcClaimId;
  this.newAssessor = newAssessor;

  console.log(`✅ Phase 2 complete: USDC claim ${usdcClaimId} ready for payout after governance intervention`);
});

it.skip('Phase 3: Pause and payout functionality testing', async function () {
  // Get USDC token contract address from pool
  const usdcAsset = await this.pool.getAsset(ASSET.USDC);
  const usdcToken = await ethers.getContractAt('ERC20Mock', usdcAsset.assetAddress);

  // Get claim deposit amount from contract
  const claimDepositAmount = await this.claims.CLAIM_DEPOSIT_IN_ETH();

  // Test pause claims payout - should fail when paused
  await this.registry.connect(this.EMERGENCY_ADMIN).proposePauseConfig(PAUSE_CLAIMS_PAYOUT);
  await this.registry.connect(this.EMERGENCY_ADMIN).confirmPauseConfig(PAUSE_CLAIMS_PAYOUT);

  const redeemClaimPayoutPaused = this.claims.connect(this.claimant).redeemClaimPayout(this.usdcClaimId);
  await expect(redeemClaimPayoutPaused).to.be.revertedWithCustomError(this.claims, 'Paused');

  // Unpause claims payout
  await this.registry.connect(this.EMERGENCY_ADMIN).proposePauseConfig(0); // 0 = no pause
  await this.registry.connect(this.EMERGENCY_ADMIN).confirmPauseConfig(0);

  // Record balances before redemption
  const claimantEthBalanceBefore = await ethers.provider.getBalance(this.claimant.address);
  const claimantUsdcBalanceBefore = await usdcToken.balanceOf(this.claimant.address);

  // Now redemption should succeed (USDC payout + ETH deposit returned)
  const redeemClaimPayout = this.claims.connect(this.claimant).redeemClaimPayout(this.usdcClaimId, { gasPrice: 0 });
  await expect(redeemClaimPayout).to.emit(this.claims, 'ClaimPayoutRedeemed');

  // Record balances after redemption
  const claimantEthBalanceAfter = await ethers.provider.getBalance(this.claimant.address);
  const claimantUsdcBalanceAfter = await usdcToken.balanceOf(this.claimant.address);

  // Verify USDC balance increased by 75,000 USDC (with 6 decimals)
  const expectedUsdcIncrease = ethers.parseUnits('75000', 6);
  expect(claimantUsdcBalanceAfter - claimantUsdcBalanceBefore).to.equal(expectedUsdcIncrease);

  // Verify ETH balance increased by exactly the claim deposit amount (gas-free transaction)
  expect(claimantEthBalanceAfter - claimantEthBalanceBefore).to.equal(claimDepositAmount);

  console.log(`✅ Phase 3 complete: Pause/unpause functionality tested, USDC claim paid out`);
  console.log(`   - USDC balance increased by: ${ethers.formatUnits(expectedUsdcIncrease, 6)} USDC`);
  console.log(`   - ETH deposit returned: ${ethers.formatEther(claimDepositAmount)} ETH`);
});

it.skip('Phase 4: ETH claim with DRAW outcome', async function () {
  // Create new ETH cover for DRAW test (separate from Phase 1 DENIED cover)
  const drawCoverTx = await createCover(this.coverBroker, this.claimant, {
    coverAsset: ASSET.ETH,
    amount: parseEther('8'),
  });
  const drawCoverReceipt = await drawCoverTx.wait();

  // Extract coverId from events
  const drawCoverEvent = drawCoverReceipt.logs.find(log => {
    try {
      const parsed = this.cover.interface.parseLog(log);
      return parsed && parsed.name === 'CoverCreated';
    } catch {
      return false;
    }
  });

  const drawCoverId = this.cover.interface.parseLog(drawCoverEvent).args.coverId;

  // Submit DRAW claim on new cover
  const drawClaimTx = await this.claims
    .connect(this.claimant)
    .submitClaim(drawCoverId, parseEther('3'), ethers.solidityPackedKeccak256(['string'], ['DRAW claim proof']), {
      value: parseEther('0.05'),
      gasPrice: 0,
    });
  await drawClaimTx.wait();

  const drawClaimId = await this.claims.getClaimsCount();

  // Cast equal votes (2 for, 2 against = DRAW)
  const ipfsHashFor = ethers.solidityPackedKeccak256(['string'], ['draw-accept']);
  const ipfsHashAgainst = ethers.solidityPackedKeccak256(['string'], ['draw-deny']);

  await Promise.all([
    this.assessment.connect(this.assessors[0]).castVote(drawClaimId, true, ipfsHashFor), // accept
    this.assessment.connect(this.assessors[1]).castVote(drawClaimId, true, ipfsHashFor), // accept
    this.assessment.connect(this.assessors[2]).castVote(drawClaimId, false, ipfsHashAgainst), // deny
    this.assessment.connect(this.newAssessor).castVote(drawClaimId, false, ipfsHashAgainst), // deny
  ]);

  // Advance time past voting and cooldown periods
  const assessment = await this.assessment.getAssessment(drawClaimId);
  const cooldownEndTime = assessment.votingEnd + assessment.cooldownPeriod + 1n;
  await setTime(cooldownEndTime);

  // Verify status is DRAW
  const [, status] = await this.assessment.getAssessmentResult(drawClaimId);
  expect(status).to.equal(ASSESSMENT_STATUS.DRAW);

  // redeemClaimPayout throws error for DRAW claims
  const redeemClaimPayout = this.claims.connect(this.claimant).redeemClaimPayout(drawClaimId);
  await expect(redeemClaimPayout).to.be.revertedWithCustomError(this.claims, 'InvalidAssessmentStatus');

  // Get claim deposit amount and balance
  const claimDepositAmount = await this.claims.CLAIM_DEPOSIT_IN_ETH();
  const claimantEthBalanceBefore = await ethers.provider.getBalance(this.claimant.address);

  // Should be able to retrieve deposit for DRAW claims
  const retrieveDeposit = this.claims.connect(this.claimant).retrieveDeposit(drawClaimId);
  await expect(retrieveDeposit)
    .to.emit(this.claims, 'ClaimDepositRetrieved')
    .withArgs(drawClaimId, this.claimant.address);

  // Record balance after deposit retrieval
  const claimantEthBalanceAfter = await ethers.provider.getBalance(this.claimant.address);

  // Verify ETH balance increased by exactly the claim deposit amount (gas-free transaction)
  expect(claimantEthBalanceAfter - claimantEthBalanceBefore).to.equal(claimDepositAmount);

  console.log(`✅ Phase 4 complete: DRAW claim ${drawClaimId} deposit retrieved`);
  console.log(`   - ETH deposit returned: ${ethers.formatEther(claimDepositAmount)} ETH`);
});

it.skip('Phase 5: ETH claim with redemption period expiry', async function () {
  // Create new ETH cover for redemption expiry test
  const newEthCoverTx = await createCover(this.coverBroker, this.claimant, {
    coverAsset: ASSET.ETH,
    amount: parseEther('5'),
  });
  const newEthCoverReceipt = await newEthCoverTx.wait();

  const newEthCoverEvent = newEthCoverReceipt.logs.find(log => {
    try {
      const parsed = this.cover.interface.parseLog(log);
      return parsed && parsed.name === 'CoverCreated';
    } catch {
      return false;
    }
  });

  const newEthCoverId = this.cover.interface.parseLog(newEthCoverEvent).args.coverId;

  // Submit new ETH claim
  const newEthClaimTx = await this.claims
    .connect(this.claimant)
    .submitClaim(
      newEthCoverId,
      parseEther('2'),
      ethers.solidityPackedKeccak256(['string'], ['Expiry test claim proof']),
      { value: parseEther('0.05'), gasPrice: 0 },
    );
  await newEthClaimTx.wait();

  const newEthClaimId = await this.claims.getClaimsCount();

  // Cast majority FOR votes (3 accept, 1 deny)
  const ipfsHashFor = ethers.solidityPackedKeccak256(['string'], ['accept-reasoning-expiry']);
  const ipfsHashAgainst = ethers.solidityPackedKeccak256(['string'], ['deny-reasoning-expiry']);

  await Promise.all([
    this.assessment.connect(this.assessors[0]).castVote(newEthClaimId, true, ipfsHashFor), // accept
    this.assessment.connect(this.assessors[1]).castVote(newEthClaimId, true, ipfsHashFor), // accept
    this.assessment.connect(this.assessors[2]).castVote(newEthClaimId, true, ipfsHashFor), // accept
    this.assessment.connect(this.newAssessor).castVote(newEthClaimId, false, ipfsHashAgainst), // deny
  ]);

  // Advance time past voting and cooldown periods
  const assessment = await this.assessment.getAssessment(newEthClaimId);
  const cooldownEndTime = assessment.votingEnd + assessment.cooldownPeriod + 1n;
  await setTime(cooldownEndTime);

  // Verify status is ACCEPTED
  const [payoutRedemptionEnd, status] = await this.assessment.getAssessmentResult(newEthClaimId);
  expect(status).to.equal(ASSESSMENT_STATUS.ACCEPTED);

  // Advance time past redemption period without redeeming
  await setTime(payoutRedemptionEnd + 1n);

  // Attempt to redeem - should fail (redemption period expired)
  await expect(this.claims.connect(this.claimant).redeemClaimPayout(newEthClaimId)).to.be.revertedWithCustomError(
    this.claims,
    'RedemptionPeriodExpired',
  );

  // Store for Phase 6
  this.expiredClaimCoverId = newEthCoverId;
  this.expiredClaimId = newEthClaimId;

  console.log(`✅ Phase 5 complete: Claim ${newEthClaimId} expired without redemption`);
});

it.skip('Phase 6: Re-submit claim on same cover after ACCEPTED claim expired', async function () {
  // Re-submit claim on the same ETH cover from Phase 5 (which was ACCEPTED but redemption expired)
  // This should work since the redemption period has passed for the previous ACCEPTED claim
  const resubmitClaimTx = await this.claims.connect(this.claimant).submitClaim(
    this.expiredClaimCoverId, // Same cover from Phase 5
    parseEther('1.5'),
    ethers.solidityPackedKeccak256(['string'], ['Re-submitted after expiry claim proof']),
    { value: parseEther('0.05'), gasPrice: 0 },
  );
  await resubmitClaimTx.wait();

  const resubmitClaimId = await this.claims.getClaimsCount();

  // Vote to pass (3 accept, 1 deny)
  const ipfsHashFor = ethers.solidityPackedKeccak256(['string'], ['resubmit-after-expiry-accept']);
  const ipfsHashAgainst = ethers.solidityPackedKeccak256(['string'], ['resubmit-after-expiry-deny']);

  await Promise.all([
    this.assessment.connect(this.assessors[0]).castVote(resubmitClaimId, true, ipfsHashFor), // accept
    this.assessment.connect(this.assessors[1]).castVote(resubmitClaimId, true, ipfsHashFor), // accept
    this.assessment.connect(this.assessors[2]).castVote(resubmitClaimId, true, ipfsHashFor), // accept
    this.assessment.connect(this.newAssessor).castVote(resubmitClaimId, false, ipfsHashAgainst), // deny
  ]);

  // Advance time past voting and cooldown periods
  const assessment = await this.assessment.getAssessment(resubmitClaimId);
  const cooldownEndTime = assessment.votingEnd + assessment.cooldownPeriod + 1n;
  await setTime(cooldownEndTime);

  // Verify status is ACCEPTED
  const [, status] = await this.assessment.getAssessmentResult(resubmitClaimId);
  expect(status).to.equal(ASSESSMENT_STATUS.ACCEPTED);

  // Get claim deposit amount from contract
  const claimDepositAmount = await this.claims.CLAIM_DEPOSIT_IN_ETH();

  // Record balances before redemption
  const claimantEthBalanceBefore = await ethers.provider.getBalance(this.claimant.address);

  // Verify payout - should succeed (ETH payout + ETH deposit returned)
  const redeemClaimPayout = this.claims.connect(this.claimant).redeemClaimPayout(resubmitClaimId, { gasPrice: 0 });
  await expect(redeemClaimPayout).to.emit(this.claims, 'ClaimPayoutRedeemed');

  // Record balances after redemption
  const claimantEthBalanceAfter = await ethers.provider.getBalance(this.claimant.address);

  // Verify ETH balance increased by payout amount (1.5 ETH) + deposit (0.05 ETH)
  const expectedEthIncrease = parseEther('1.5') + claimDepositAmount; // 1.55 ETH total
  expect(claimantEthBalanceAfter - claimantEthBalanceBefore).to.equal(expectedEthIncrease);

  console.log(
    `✅ Phase 6 complete: Re-submitted claim ${resubmitClaimId} after expired redemption successfully paid out`,
  );
  console.log(`   - ETH payout: ${ethers.formatEther(parseEther('1.5'))} ETH`);
  console.log(`   - ETH deposit returned: ${ethers.formatEther(claimDepositAmount)} ETH`);
  console.log(`   - Total ETH received: ${ethers.formatEther(expectedEthIncrease)} ETH`);
});

const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

const { getSigner, setUSDCBalance, Address } = require('./utils');

const { ContractIndexes, PauseTypes } = nexus.constants;

const { parseEther } = ethers;
const { PAUSE_CLAIMS } = PauseTypes;
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

const daysToSeconds = days => BigInt(days) * 24n * 60n * 60n;

const PRODUCT_ID = 247; // Elite Cover (Protocol cover)

const setupContractsForSkipping = () => {
  // TODO: Rocky, fix me
  throw new Error("No idea what's this supposed to be");
};

const createCover = async (
  cover,
  owner,
  { coverAsset = ASSET.ETH, amount = parseEther('0.1'), periodDays = 30 } = {},
) => {
  const maxPremiumInAsset = (amount * 260n) / 10000n; // 2.6% of coverage amount
  const coverTx = await cover.connect(owner).buyCover(
    {
      coverId: 0,
      owner: owner.address,
      productId: PRODUCT_ID,
      coverAsset,
      amount,
      period: daysToSeconds(periodDays),
      maxPremiumInAsset,
      paymentAsset: coverAsset, // pay in same asset as cover
      commissionRatio: 500, // 5% commission
      commissionDestination: owner.address,
      ipfsData: '',
    },
    [{ poolId: 2, coverAmountInAsset: amount }],
    { value: coverAsset === ASSET.ETH ? maxPremiumInAsset : 0n },
  );

  const coverReceipt = await coverTx.wait();

  // get coverId from CoverBought event
  let coverId = null;
  coverReceipt.logs.some(log => {
    const parsed = cover.interface.parseLog(log);
    if (parsed && parsed.name === 'CoverBought') {
      coverId = parsed.args.coverId;
      return true;
    }
    return false;
  });

  if (!coverId) {
    throw new Error('CoverCreated event not found');
  }

  return coverId;
};

// simple member migrate for dev testing
it('should migrate members', async function () {
  const membersToMigrate = [
    '0x87b2a7559d85f4653f13e6546a14189cd5455d45',
    '0x5929cc4d10b6a1acc5bf5d221889f10251c628a1',
    '0xf3bfac9e828bc904112e7bb516d4cd4e6468f785',
    '0xfec65468cf9ab04cea40b113bf679e82973bdb58',
    '0xa8c320bc7581ca1a24521a9e56a46553ad67e4b0',
  ];

  const memberCountBefore = await this.registry.getMemberCount();
  console.log('Member count before migration:', memberCountBefore.toString());

  await Promise.all([
    this.evm.impersonate(this.memberRoles.target),
    this.evm.setBalance(this.memberRoles.target, parseEther('1000')),
  ]);
  const memberRolesSigner = await getSigner(this.memberRoles.target);
  await this.registry.connect(memberRolesSigner).migrateMembers(membersToMigrate);

  const memberCountAfter = await this.registry.getMemberCount();
  console.log('Member count after migration:', memberCountAfter.toString());
});

it('should run setup - add assessors and configure assessment', async function () {
  const assessmentAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_ASSESSMENT);
  this.assessment = await ethers.getContractAt('Assessment', assessmentAddress);

  const addresses = [
    '0x87b2a7559d85f4653f13e6546a14189cd5455d45', // claimant
    '0x5929cc4d10b6a1acc5bf5d221889f10251c628a1', // assessor1
    '0xf3bfac9e828bc904112e7bb516d4cd4e6468f785', // assessor2
    '0xfec65468cf9ab04cea40b113bf679e82973bdb58', // assessor3
    '0xa8c320bc7581ca1a24521a9e56a46553ad67e4b0', // assessor4
  ];
  const [claimant, assessor1, assessor2, assessor3, assessor4] = await Promise.all(
    addresses.map(async address => {
      await Promise.all([this.evm.impersonate(address), this.evm.setBalance(address, parseEther('1000'))]);
      return getSigner(address);
    }),
  );

  await setUSDCBalance(this.usdc.target, claimant.address, ethers.parseUnits('100000', 6));

  // Get assessor member IDs
  this.assessorMemberIds = await Promise.all([
    this.registry.getMemberId(assessor1.address),
    this.registry.getMemberId(assessor2.address),
    this.registry.getMemberId(assessor3.address),
    this.registry.getMemberId(assessor4.address),
  ]);

  const cooldownPeriod = daysToSeconds(1); // 1 day cooldown
  const payoutRedemptionPeriod = daysToSeconds(30); // 30 days redemption period

  // use governor signer for assessment contract
  const governorAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_GOVERNOR);
  const governorSigner = await getSigner(governorAddress);
  this.assessment = this.assessment.connect(governorSigner);

  // add assessors to a new group (groupId 0 creates new group)
  await this.assessment.addAssessorsToGroup(this.assessorMemberIds, 0);

  const groupId = await this.assessment.getGroupsCount();

  // set assessment data for product types - 1 day cooldown, 30 days redemption period
  const nexusMutualCoverProductType = 19;
  await this.assessment.setAssessmentDataForProductTypes(
    [1, nexusMutualCoverProductType],
    cooldownPeriod,
    payoutRedemptionPeriod,
    groupId,
  );

  // update cover dependent contract addresses
  await this.cover.changeDependentContractAddress();

  this.assessors = [assessor1, assessor2, assessor3, assessor4];
  this.claimant = claimant;

  console.log(`setup complete: ${this.assessorMemberIds.length} assessors added to group ${groupId}`);
});

it('submit ETH claim with DENIED outcome', async function () {
  // create ETH cover
  const coverId = await createCover(this.cover, this.claimant, {
    coverAsset: ASSET.ETH,
    amount: parseEther('0.1'),
  });

  const ipfsMetaData = ethers.solidityPackedKeccak256(['string'], ['ETH claim proof']);

  // non-owner member should not be able to submit claim
  const nonOwnerAddress = await this.registry.getMemberAddress(10);
  const nonOwnerSigner = await getSigner(nonOwnerAddress);
  const nonOwnerSubmitClaim = this.claims
    .connect(nonOwnerSigner)
    .submitClaim(coverId, parseEther('0.05'), ipfsMetaData, { value: parseEther('0.05') });

  // TODO: Fix custom error assertion
  // await expect(nonOwnerSubmitClaim).to.be.revertedWithCustomError(this.claims, 'NotCoverOwner');
  await expect(nonOwnerSubmitClaim).to.be.reverted;

  // owner should succeed in submitting claim
  // const claimTx = await this.claims
  await this.claims
    .connect(this.claimant)
    .submitClaim(coverId, parseEther('0.05'), ipfsMetaData, { value: parseEther('0.05'), gasPrice: 0 });
  // await claimTx.wait();

  const claimId = await this.claims.getClaimsCount();

  const ipfsHashFor = ethers.solidityPackedKeccak256(['string'], ['accept-reasoning']);
  const ipfsHashAgainst = ethers.solidityPackedKeccak256(['string'], ['deny-reasoning']);

  // DENIED (3 deny, 1 accept)
  await Promise.all([
    this.assessment.connect(this.assessors[0]).castVote(claimId, false, ipfsHashAgainst), // deny
    this.assessment.connect(this.assessors[1]).castVote(claimId, false, ipfsHashAgainst), // deny
    this.assessment.connect(this.assessors[2]).castVote(claimId, false, ipfsHashAgainst), // deny
    this.assessment.connect(this.assessors[3]).castVote(claimId, true, ipfsHashFor), // accept
  ]);

  // advance time past cooldown period
  const assessment = await this.assessment.getAssessment(claimId);
  const cooldownEndTime = assessment.votingEnd + assessment.cooldownPeriod + 1n;

  await time.increaseTo(cooldownEndTime);

  // DENIED
  const [status] = await this.assessment.getAssessmentResult(claimId);
  expect(status).to.equal(ASSESSMENT_STATUS.DENIED);

  // redeemClaimPayout throws error
  const redeemClaimPayout = this.claims.connect(this.claimant).redeemClaimPayout(claimId);
  await expect(redeemClaimPayout).to.be.revertedWithCustomError(this.claims, 'InvalidAssessmentStatus');

  // retrieveDeposit throw errors
  const retrieveDeposit = this.claims.connect(this.claimant).retrieveDeposit(claimId);
  await expect(retrieveDeposit).to.be.revertedWithCustomError(this.claims, 'InvalidAssessmentStatus');

  this.ethCoverId = coverId;
  this.firstClaimId = claimId;

  console.log(`claimId ${claimId} DENIED`);
});

it('submit USDC claim with fraud detection and governance intervention', async function () {
  // approve USDC
  const usdcCoverAsset = await this.pool.getAssetId(Address.USDC_ADDRESS);
  const amount = ethers.parseUnits('1000', 6);
  await this.usdc.connect(this.claimant).approve(this.cover.target, amount);

  // create cover
  this.usdcCoverId = await createCover(this.cover, this.claimant, { coverAsset: usdcCoverAsset, amount });

  // submit USDC claim
  await this.claims.connect(this.claimant).submitClaim(
    this.usdcCoverId,
    ethers.parseUnits('750', 6), // Claim 750 USDC (proportionally reduced)
    ethers.solidityPackedKeccak256(['string'], ['USDC claim proof']),
    { value: parseEther('0.05'), gasPrice: 0 },
  );

  this.usdcClaimId = await this.claims.getClaimsCount();

  const ipfsHashFor = ethers.solidityPackedKeccak256(['string'], ['accept-reasoning']);
  const ipfsHashAgainst = ethers.solidityPackedKeccak256(['string'], ['deny-reasoning']);

  // DRAW (2 accept, 2 deny)
  await Promise.all([
    this.assessment.connect(this.assessors[0]).castVote(this.usdcClaimId, true, ipfsHashFor), // accept
    this.assessment.connect(this.assessors[1]).castVote(this.usdcClaimId, true, ipfsHashFor), // accept
    this.assessment.connect(this.assessors[2]).castVote(this.usdcClaimId, false, ipfsHashAgainst), // deny
    this.assessment.connect(this.assessors[3]).castVote(this.usdcClaimId, false, ipfsHashAgainst), // deny
  ]);

  // advance time to within cooldown period
  let assessment = await this.assessment.getAssessment(this.usdcClaimId);
  await time.increaseTo(assessment.votingEnd + 1n);

  // Verify assessment is in cooldown
  const [cooldownStatus] = await this.assessment.getAssessmentResult(this.usdcClaimId);
  expect(cooldownStatus).to.equal(ASSESSMENT_STATUS.COOLDOWN);

  // Test that assessors can't vote during cooldown
  const lateVoteHash = ethers.solidityPackedKeccak256(['string'], ['late-vote']);
  await expect(
    this.assessment.connect(this.assessors[0]).castVote(this.usdcClaimId, true, lateVoteHash),
  ).to.be.revertedWithCustomError(this.assessment, 'VotingPeriodEnded');

  // Test that claim can't be redeemed during cooldown
  await expect(this.claims.connect(this.claimant).redeemClaimPayout(this.usdcClaimId)).to.be.revertedWithCustomError(
    this.claims,
    'InvalidAssessmentStatus',
  );

  // simulate fraud discovery - governance intervenes

  // before undoVotes (2 accept, 2 deny)
  const assessmentBefore = await this.assessment.getAssessment(this.usdcClaimId);
  expect(assessmentBefore.acceptVotes).to.equal(2);
  expect(assessmentBefore.denyVotes).to.equal(2);

  // undo fraudulent deny vote from assessors[3]
  const fraudulentAssessorId = await this.registry.getMemberId(this.assessors[3].address);
  const governorAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_GOVERNOR);
  this.governorSigner = await getSigner(governorAddress);
  await this.assessment.connect(this.governorSigner).undoVotes(fraudulentAssessorId, [this.usdcClaimId]);
  console.log('undoVotes done');

  // after undoVotes (2 accept, 1 deny)
  const assessmentAfter = await this.assessment.getAssessment(this.usdcClaimId);
  expect(assessmentAfter.acceptVotes).to.equal(2);
  expect(assessmentAfter.denyVotes).to.equal(1);

  // remove fraudulent assessor from group
  const groupId = await this.assessment.getGroupsCount();
  const isAssessorInGroupBefore = await this.assessment.isAssessorInGroup(fraudulentAssessorId, groupId);
  expect(isAssessorInGroupBefore).to.be.true;

  await this.assessment.connect(this.governorSigner).removeAssessorFromGroup(fraudulentAssessorId, groupId);
  console.log('removed assessor from group');

  const newAssessorAddress = await this.registry.getMemberAddress(13);
  this.newAssessor = await getSigner(newAssessorAddress);
  const newAssessorMemberId = await this.registry.getMemberId(this.newAssessor.address);

  const isNewAssessorInGroupBefore = await this.assessment.isAssessorInGroup(newAssessorMemberId, groupId);
  expect(isNewAssessorInGroupBefore).to.be.false;

  // add new assessor to group
  await this.assessment.connect(this.governorSigner).addAssessorsToGroup([newAssessorMemberId], groupId);

  // extend voting period to allow new assessor to vote
  await this.assessment.connect(this.governorSigner).extendVotingPeriod(this.usdcClaimId);
  console.log('voting period extended');

  // newAssessor vote accept
  await this.assessment.connect(this.newAssessor).castVote(this.usdcClaimId, true, ipfsHashFor); // accept

  const assessmentNewAssessor = await this.assessment.getAssessment(this.usdcClaimId);
  expect(assessmentNewAssessor.acceptVotes).to.equal(3);
  expect(assessmentNewAssessor.denyVotes).to.equal(1);

  // advance time past new cooldown period
  assessment = await this.assessment.getAssessment(this.usdcClaimId);
  const newCooldownEndTime = assessment.votingEnd + assessment.cooldownPeriod + 1n;
  await time.increaseTo(newCooldownEndTime);

  console.log(`USDC claimId ${this.usdcClaimId} ready for payout after governance intervention`);
});

it('pause and payout functionality testing', async function () {
  const usdcAsset = await this.pool.getAsset(ASSET.USDC);
  const usdcToken = await ethers.getContractAt('ERC20Mock', usdcAsset.assetAddress);

  const claimDepositAmount = await this.claims.CLAIM_DEPOSIT_IN_ETH();

  const [emergencyAdminSigner, emergencyAdminSigner2] = await Promise.all([
    getSigner(this.EMERGENCY_ADMIN),
    getSigner(this.EMERGENCY_ADMIN_2),
  ]);

  await this.registry.connect(emergencyAdminSigner).proposePauseConfig(PAUSE_CLAIMS);
  await this.registry.connect(emergencyAdminSigner2).confirmPauseConfig(PAUSE_CLAIMS);

  this.usdcClaimId = await this.claims.getClaimsCount(); // TODO: re
  const redeemClaimPayoutPaused = this.claims.connect(this.claimant).redeemClaimPayout(this.usdcClaimId);
  await expect(redeemClaimPayoutPaused).to.be.revertedWithCustomError(this.claims, 'Paused');

  // unpause claims payout (0 = no pause)
  await this.registry.connect(emergencyAdminSigner).proposePauseConfig(0);
  await this.registry.connect(emergencyAdminSigner2).confirmPauseConfig(0);

  const claimantEthBalanceBefore = await ethers.provider.getBalance(this.claimant.address);
  const claimantUsdcBalanceBefore = await usdcToken.balanceOf(this.claimant.address);

  // redeemClaimPayout
  const redeemClaimPayout = this.claims.connect(this.claimant).redeemClaimPayout(this.usdcClaimId, { gasPrice: 0 });
  await expect(redeemClaimPayout).to.emit(this.claims, 'ClaimPayoutRedeemed');

  const claimantEthBalanceAfter = await ethers.provider.getBalance(this.claimant.address);
  const claimantUsdcBalanceAfter = await usdcToken.balanceOf(this.claimant.address);

  const expectedUsdcIncrease = ethers.parseUnits('750', 6);
  expect(claimantUsdcBalanceAfter - claimantUsdcBalanceBefore).to.equal(expectedUsdcIncrease);

  expect(claimantEthBalanceAfter - claimantEthBalanceBefore).to.equal(claimDepositAmount);

  console.log(`pause/unpause functionality tested, USDC claim paid out`);
});

it('submit ETH claim with DRAW outcome', async function () {
  const drawCoverId = await createCover(this.cover, this.claimant, {
    coverAsset: ASSET.ETH,
    amount: parseEther('0.8'), // Reduced from 8 ETH
  });

  await this.claims
    .connect(this.claimant)
    .submitClaim(drawCoverId, parseEther('0.3'), ethers.solidityPackedKeccak256(['string'], ['DRAW claim proof']), {
      value: parseEther('0.05'),
      gasPrice: 0,
    });

  const drawClaimId = await this.claims.getClaimsCount();

  // cast equal votes (2 for, 2 against = DRAW)
  const ipfsHashFor = ethers.solidityPackedKeccak256(['string'], ['draw-accept']);
  const ipfsHashAgainst = ethers.solidityPackedKeccak256(['string'], ['draw-deny']);

  await Promise.all([
    this.assessment.connect(this.assessors[0]).castVote(drawClaimId, true, ipfsHashFor), // accept
    this.assessment.connect(this.assessors[1]).castVote(drawClaimId, true, ipfsHashFor), // accept
    this.assessment.connect(this.assessors[2]).castVote(drawClaimId, false, ipfsHashAgainst), // deny
    this.assessment.connect(this.newAssessor).castVote(drawClaimId, false, ipfsHashAgainst), // deny
  ]);

  // advance time past cooldown periods
  const assessment = await this.assessment.getAssessment(drawClaimId);
  const cooldownEndTime = assessment.votingEnd + assessment.cooldownPeriod + 1n;
  await time.increaseTo(cooldownEndTime);

  // DRAW
  const [status] = await this.assessment.getAssessmentResult(drawClaimId);
  expect(status).to.equal(ASSESSMENT_STATUS.DRAW);

  // redeemClaimPayout throws error for DRAW
  const redeemClaimPayout = this.claims.connect(this.claimant).redeemClaimPayout(drawClaimId);
  await expect(redeemClaimPayout).to.be.revertedWithCustomError(this.claims, 'InvalidAssessmentStatus');
  console.log('redeemClaimPayout failed due to DRAW status');

  const claimDepositAmount = await this.claims.CLAIM_DEPOSIT_IN_ETH();
  const claimantEthBalanceBefore = await ethers.provider.getBalance(this.claimant.address);

  // retrieveDeposit for DRAW
  const retrieveDeposit = this.claims.connect(this.claimant).retrieveDeposit(drawClaimId);
  await expect(retrieveDeposit)
    .to.emit(this.claims, 'ClaimDepositRetrieved')
    .withArgs(drawClaimId, this.claimant.address);

  const claimantEthBalanceAfter = await ethers.provider.getBalance(this.claimant.address);
  expect(claimantEthBalanceAfter - claimantEthBalanceBefore).to.equal(claimDepositAmount);

  console.log(`DRAW claimId ${drawClaimId} deposit retrieved`);
});

it('submit ETH claim with redemption period expired', async function () {
  const newEthCoverId = await createCover(this.cover, this.claimant, {
    coverAsset: ASSET.ETH,
    amount: parseEther('0.5'), // Reduced from 5 ETH
  });

  await this.claims.connect(this.claimant).submitClaim(
    newEthCoverId,
    parseEther('0.2'), // Reduced from 2 ETH
    ethers.solidityPackedKeccak256(['string'], ['Expiry test claim proof']),
    { value: parseEther('0.05'), gasPrice: 0 },
  );

  const newEthClaimId = await this.claims.getClaimsCount();

  const ipfsHashFor = ethers.solidityPackedKeccak256(['string'], ['accept-reasoning-expiry']);
  const ipfsHashAgainst = ethers.solidityPackedKeccak256(['string'], ['deny-reasoning-expiry']);

  // ACCEPTED (3 accept, 1 deny)
  await Promise.all([
    this.assessment.connect(this.assessors[0]).castVote(newEthClaimId, true, ipfsHashFor), // accept
    this.assessment.connect(this.assessors[1]).castVote(newEthClaimId, true, ipfsHashFor), // accept
    this.assessment.connect(this.assessors[2]).castVote(newEthClaimId, true, ipfsHashFor), // accept
    this.assessment.connect(this.newAssessor).castVote(newEthClaimId, false, ipfsHashAgainst), // deny
  ]);

  // advance time past cooldown periods
  const assessment = await this.assessment.getAssessment(newEthClaimId);
  const cooldownEndTime = assessment.votingEnd + assessment.cooldownPeriod + 1n;
  await time.increaseTo(cooldownEndTime);

  // ACCEPTED
  const [status, payoutRedemptionEnd] = await this.assessment.getAssessmentResult(newEthClaimId);
  expect(status).to.equal(ASSESSMENT_STATUS.ACCEPTED);

  // advance time past redemption period without redeeming
  await time.increaseTo(payoutRedemptionEnd + 1n);

  // redeemClaimPayout should fail (redemption period expired)
  await expect(this.claims.connect(this.claimant).redeemClaimPayout(newEthClaimId)).to.be.revertedWithCustomError(
    this.claims,
    'RedemptionPeriodExpired',
  );

  this.expiredClaimCoverId = newEthCoverId;
  this.expiredClaimId = newEthClaimId;

  console.log(`claimId ${newEthClaimId} expired without redemption`);
});

it('re-submit claim on same ETH cover after ACCEPTED claim expired', async function () {
  await this.claims.connect(this.claimant).submitClaim(
    this.expiredClaimCoverId, // Same cover that had the expired claim
    parseEther('0.15'), // Reduced from 1.5 ETH
    ethers.solidityPackedKeccak256(['string'], ['Re-submitted after expiry claim proof']),
    { value: parseEther('0.05'), gasPrice: 0 },
  );

  const resubmitClaimId = await this.claims.getClaimsCount();

  // ACCEPTED (3 accept, 1 deny)
  const ipfsHashFor2 = ethers.solidityPackedKeccak256(['string'], ['resubmit-after-expiry-accept']);
  const ipfsHashAgainst2 = ethers.solidityPackedKeccak256(['string'], ['resubmit-after-expiry-deny']);

  await Promise.all([
    this.assessment.connect(this.assessors[0]).castVote(resubmitClaimId, true, ipfsHashFor2), // accept
    this.assessment.connect(this.assessors[1]).castVote(resubmitClaimId, true, ipfsHashFor2), // accept
    this.assessment.connect(this.assessors[2]).castVote(resubmitClaimId, true, ipfsHashFor2), // accept
    this.assessment.connect(this.newAssessor).castVote(resubmitClaimId, false, ipfsHashAgainst2), // deny
  ]);

  // advance time past cooldown period
  const assessment = await this.assessment.getAssessment(resubmitClaimId);
  const cooldownEndTime = assessment.votingEnd + assessment.cooldownPeriod + 1n;
  await time.increaseTo(cooldownEndTime);

  // ACCEPTED
  const [resubmitStatus] = await this.assessment.getAssessmentResult(resubmitClaimId);
  expect(resubmitStatus).to.equal(ASSESSMENT_STATUS.ACCEPTED);

  const claimDepositAmount = await this.claims.CLAIM_DEPOSIT_IN_ETH();
  const claimantEthBalanceBefore = await ethers.provider.getBalance(this.claimant.address);

  const redeemClaimPayout = this.claims.connect(this.claimant).redeemClaimPayout(resubmitClaimId, { gasPrice: 0 });
  await expect(redeemClaimPayout).to.emit(this.claims, 'ClaimPayoutRedeemed');

  const claimantEthBalanceAfter = await ethers.provider.getBalance(this.claimant.address);

  const expectedEthIncrease = parseEther('0.15') + claimDepositAmount; // 0.2 ETH total
  expect(claimantEthBalanceAfter - claimantEthBalanceBefore).to.equal(expectedEthIncrease);

  console.log(`re-submitted claimId ${resubmitClaimId} after expired redemption successfully paid out`);
});

it('Happy Path: ETH claim submission and ACCEPTED payout', async function () {
  const coverId = await createCover(this.cover, this.claimant, {
    coverAsset: ASSET.ETH,
    amount: parseEther('0.1'),
  });

  // submit claim
  const ipfsMetaData = ethers.solidityPackedKeccak256(['string'], ['Happy path ETH claim proof']);
  const requestedAmount = parseEther('0.1');

  await this.claims.connect(this.claimant).submitClaim(coverId, requestedAmount, ipfsMetaData, {
    value: parseEther('0.05'), // claim deposit
    gasPrice: 0,
  });
  const claimId = await this.claims.getClaimsCount();

  // cast votes (3 accept, 1 deny)
  const ipfsHashFor = ethers.solidityPackedKeccak256(['string'], ['happy-path-accept']);
  const ipfsHashAgainst = ethers.solidityPackedKeccak256(['string'], ['happy-path-deny']);

  // ACCEPTED (3 accept, 1 deny)
  await Promise.all([
    this.assessment.connect(this.assessors[0]).castVote(claimId, true, ipfsHashFor), // accept
    this.assessment.connect(this.assessors[1]).castVote(claimId, true, ipfsHashFor), // accept
    this.assessment.connect(this.assessors[2]).castVote(claimId, true, ipfsHashFor), // accept
    this.assessment.connect(this.assessors[3]).castVote(claimId, false, ipfsHashAgainst), // deny
  ]);

  // advance time past voting and cooldown periods
  const assessment = await this.assessment.getAssessment(claimId);
  const cooldownEndTime = assessment.votingEnd + assessment.cooldownPeriod + daysToSeconds(1);
  await time.increaseTo(cooldownEndTime);
  console.log('time.increaseTo past cooldown period');

  // ACCEPTED
  const [status] = await this.assessment.getAssessmentResult(claimId);
  expect(status).to.equal(ASSESSMENT_STATUS.ACCEPTED);

  const claimDepositAmount = await this.claims.CLAIM_DEPOSIT_IN_ETH();
  const claimantEthBalanceBefore = await ethers.provider.getBalance(this.claimant.address);

  // redeem claim payout
  const redeemTx = this.claims.connect(this.claimant).redeemClaimPayout(claimId, { gasPrice: 0 });
  await expect(redeemTx).to.emit(this.claims, 'ClaimPayoutRedeemed');

  const claimantEthBalanceAfter = await ethers.provider.getBalance(this.claimant.address);
  const expectedEthIncrease = requestedAmount + claimDepositAmount;
  const actualEthIncrease = claimantEthBalanceAfter - claimantEthBalanceBefore;

  expect(actualEthIncrease).to.equal(expectedEthIncrease);
  console.log(`happy path ETH claim ${claimId} ACCEPTED and paid out successfully`);
});

const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

const { PAUSE_ASSESSMENTS, PAUSE_CLAIMS } = nexus.constants.PauseTypes;

describe('undoVotes', function () {
  it('should revert when called by non-governor contract', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { CLAIM_ID } = constants;
    const [assessor] = accounts.assessors;

    const assessorMemberId = await registry.getMemberId(assessor);
    const undoVotes = assessment.connect(assessor).undoVotes(assessorMemberId, [CLAIM_ID]);

    await expect(undoVotes).to.be.revertedWithCustomError(assessment, 'Unauthorized');
  });

  it('should revert when assessor has not voted on claim', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { CLAIM_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;
    const [assessor] = accounts.assessors;

    const assessorMemberId = await registry.getMemberId(assessor);
    const undoVotes = assessment.connect(governanceAccount).undoVotes(assessorMemberId, [CLAIM_ID]);

    await expect(undoVotes).to.be.revertedWithCustomError(assessment, 'HasNotVoted').withArgs(CLAIM_ID);
  });

  it('should successfully undo a vote', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { CLAIM_ID, IPFS_HASH } = constants;
    const [governanceAccount] = accounts.governanceContracts;
    const [assessor] = accounts.assessors;

    for (const vote of [true, false]) {
      // Cast vote
      await assessment.connect(assessor).castVote(CLAIM_ID, vote, IPFS_HASH);

      // Get the block timestamp after casting the vote
      const block = await ethers.provider.getBlock('latest');

      // Verify vote was recorded
      const assessmentBefore = await assessment.getAssessment(CLAIM_ID);
      const expectedAcceptVotes = vote ? 1 : 0;
      const expectedDenyVotes = vote ? 0 : 1;
      expect(assessmentBefore.acceptVotes).to.equal(expectedAcceptVotes);
      expect(assessmentBefore.denyVotes).to.equal(expectedDenyVotes);

      const assessorMemberId = await registry.getMemberId(assessor);
      const ballotBefore = await assessment.ballotOf(CLAIM_ID, assessorMemberId);
      expect(ballotBefore.support).to.equal(vote);
      expect(ballotBefore.timestamp).to.equal(block?.timestamp);

      // Verify metadata is stored
      const metadataBefore = await assessment.getBallotsMetadata(CLAIM_ID, assessorMemberId);
      expect(metadataBefore).to.equal(IPFS_HASH);

      // Undo the vote
      const undoTx = assessment.connect(governanceAccount).undoVotes(assessorMemberId, [CLAIM_ID]);

      // Check that VoteUndone event is emitted
      await expect(undoTx).to.emit(assessment, 'VoteUndone').withArgs(CLAIM_ID, assessorMemberId);

      // Verify vote was undone
      const assessmentAfter = await assessment.getAssessment(CLAIM_ID);
      expect(assessmentAfter.acceptVotes).to.equal(0);
      expect(assessmentAfter.denyVotes).to.equal(0);

      const ballotAfter = await assessment.ballotOf(CLAIM_ID, assessorMemberId);
      expect(ballotAfter.support).to.equal(false);
      expect(ballotAfter.timestamp).to.equal(0);

      // Verify metadata is removed
      const metadataAfter = await assessment.getBallotsMetadata(CLAIM_ID, assessorMemberId);
      expect(metadataAfter).to.equal(ethers.ZeroHash);
    }
  });

  it('should successfully undo multiple votes for same assessor', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry, claims } = contracts;
    const { IPFS_HASH } = constants;
    const [governanceAccount] = accounts.governanceContracts;
    const [assessor] = accounts.assessors;

    // Create additional claims using member account
    const claimIds = [2, 3, 4];
    const coverIds = [2, 3, 4];
    const [memberAccount] = accounts.members;

    const claimAmount = ethers.parseEther('1');
    await Promise.all(coverIds.map(c => claims.connect(memberAccount).submitClaim(c, claimAmount, IPFS_HASH)));

    // Cast votes on multiple claims
    await Promise.all([
      assessment.connect(assessor).castVote(claimIds[0], true, IPFS_HASH),
      assessment.connect(assessor).castVote(claimIds[1], false, IPFS_HASH),
      assessment.connect(assessor).castVote(claimIds[2], true, IPFS_HASH),
    ]);

    // Verify votes were recorded
    const [assessment0Before, assessment1Before, assessment2Before] = await Promise.all([
      assessment.getAssessment(claimIds[0]),
      assessment.getAssessment(claimIds[1]),
      assessment.getAssessment(claimIds[2]),
    ]);

    expect(assessment0Before.acceptVotes).to.equal(1);
    expect(assessment1Before.denyVotes).to.equal(1);
    expect(assessment2Before.acceptVotes).to.equal(1);

    const assessorMemberId = await registry.getMemberId(assessor);
    // Verify metadata is stored for all claims
    const [metadata0Before, metadata1Before, metadata2Before] = await Promise.all([
      assessment.getBallotsMetadata(claimIds[0], assessorMemberId),
      assessment.getBallotsMetadata(claimIds[1], assessorMemberId),
      assessment.getBallotsMetadata(claimIds[2], assessorMemberId),
    ]);
    expect(metadata0Before).to.equal(IPFS_HASH);
    expect(metadata1Before).to.equal(IPFS_HASH);
    expect(metadata2Before).to.equal(IPFS_HASH);

    // Undo all votes
    const undoTx = assessment.connect(governanceAccount).undoVotes(assessorMemberId, claimIds);

    // Check that VoteUndone events are emitted for each claim
    await expect(undoTx)
      .to.emit(assessment, 'VoteUndone')
      .withArgs(claimIds[0], assessorMemberId)
      .to.emit(assessment, 'VoteUndone')
      .withArgs(claimIds[1], assessorMemberId)
      .to.emit(assessment, 'VoteUndone')
      .withArgs(claimIds[2], assessorMemberId);

    // Verify all votes were undone
    const [assessment0After, assessment1After, assessment2After] = await Promise.all([
      assessment.getAssessment(claimIds[0]),
      assessment.getAssessment(claimIds[1]),
      assessment.getAssessment(claimIds[2]),
    ]);

    expect(assessment0After.acceptVotes).to.equal(0);
    expect(assessment1After.denyVotes).to.equal(0);
    expect(assessment2After.acceptVotes).to.equal(0);

    // Verify all metadata is removed
    const [metadata0After, metadata1After, metadata2After] = await Promise.all([
      assessment.getBallotsMetadata(claimIds[0], assessorMemberId),
      assessment.getBallotsMetadata(claimIds[1], assessorMemberId),
      assessment.getBallotsMetadata(claimIds[2], assessorMemberId),
    ]);
    expect(metadata0After).to.equal(ethers.ZeroHash);
    expect(metadata1After).to.equal(ethers.ZeroHash);
    expect(metadata2After).to.equal(ethers.ZeroHash);
  });

  it('should allow assessor to vote again after vote is undone', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { CLAIM_ID, IPFS_HASH } = constants;
    const [governanceAccount] = accounts.governanceContracts;
    const [assessor] = accounts.assessors;

    // Cast initial vote
    await assessment.connect(assessor).castVote(CLAIM_ID, true, IPFS_HASH);

    // Undo the vote
    const assessorMemberId = await registry.getMemberId(assessor);
    const undoTx = assessment.connect(governanceAccount).undoVotes(assessorMemberId, [CLAIM_ID]);

    // Check that VoteUndone event is emitted
    await expect(undoTx).to.emit(assessment, 'VoteUndone').withArgs(CLAIM_ID, assessorMemberId);

    // Should be able to vote again
    const newIpfsHash = ethers.solidityPackedKeccak256(['string'], ['new-vote-metadata']);
    await assessment.connect(assessor).castVote(CLAIM_ID, false, newIpfsHash);

    // Get the block timestamp after casting the new vote
    const block = await ethers.provider.getBlock('latest');
    if (!block) {
      throw new Error('Block not found');
    }
    const expectedTimestamp = block.timestamp;

    // Verify new vote was recorded
    const assessmentAfter = await assessment.getAssessment(CLAIM_ID);
    expect(assessmentAfter.acceptVotes).to.equal(0);
    expect(assessmentAfter.denyVotes).to.equal(1);

    const ballotAfter = await assessment.ballotOf(CLAIM_ID, assessorMemberId);
    expect(ballotAfter.support).to.equal(false);
    expect(ballotAfter.timestamp).to.equal(expectedTimestamp);
  });

  it('should handle mixed success and failure cases in batch', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry, claims } = contracts;
    const { CLAIM_ID, IPFS_HASH } = constants;
    const [governanceAccount] = accounts.governanceContracts;
    const [assessor] = accounts.assessors;

    // Create additional claim using member account
    const newClaimId = 2;
    const coverId = 2;
    const [memberAccount] = accounts.members;
    await claims.connect(memberAccount).submitClaim(coverId, ethers.parseEther('1'), IPFS_HASH);

    // Cast vote on only one claim (no votes on newClaimId)
    await assessment.connect(assessor).castVote(CLAIM_ID, true, IPFS_HASH);

    // Try to undo votes on both claims (should fail because no vote on newClaimId)
    const assessorMemberId = await registry.getMemberId(assessor);
    const undoVotes = assessment.connect(governanceAccount).undoVotes(assessorMemberId, [CLAIM_ID, newClaimId]);
    await expect(undoVotes).to.be.revertedWithCustomError(assessment, 'HasNotVoted').withArgs(newClaimId);
  });

  it('should undo votes during voting period', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { CLAIM_ID, IPFS_HASH } = constants;
    const [governanceAccount] = accounts.governanceContracts;
    const [assessor] = accounts.assessors;

    // Cast a vote
    await assessment.connect(assessor).castVote(CLAIM_ID, true, IPFS_HASH);

    // Undo vote during voting period (should work)
    const assessorMemberId = await registry.getMemberId(assessor);
    const undoTx = assessment.connect(governanceAccount).undoVotes(assessorMemberId, [CLAIM_ID]);

    // Check that VoteUndone event is emitted
    await expect(undoTx).to.emit(assessment, 'VoteUndone').withArgs(CLAIM_ID, assessorMemberId);

    // Verify vote was undone
    const assessmentAfter = await assessment.getAssessment(CLAIM_ID);
    expect(assessmentAfter.acceptVotes).to.equal(0);
  });

  it('should undo votes during cooldown period', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { CLAIM_ID, IPFS_HASH } = constants;
    const [governanceAccount] = accounts.governanceContracts;
    const [assessor] = accounts.assessors;

    // Cast a vote
    await assessment.connect(assessor).castVote(CLAIM_ID, true, IPFS_HASH);

    // Set time to just after voting ends, but before cooldown ends
    const votingPeriod = await assessment.minVotingPeriod();
    await time.increase(votingPeriod + 1n);

    // Undo vote during cooldown period (should work)
    const assessorMemberId = await registry.getMemberId(assessor);
    const undoTx = assessment.connect(governanceAccount).undoVotes(assessorMemberId, [CLAIM_ID]);

    // Check that VoteUndone event is emitted
    await expect(undoTx).to.emit(assessment, 'VoteUndone').withArgs(CLAIM_ID, assessorMemberId);

    // Verify vote was undone
    const assessmentAfter = await assessment.getAssessment(CLAIM_ID);
    expect(assessmentAfter.acceptVotes).to.equal(0);
  });

  it('should undo votes after cooldown has passed', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { CLAIM_ID, IPFS_HASH } = constants;
    const [governanceAccount] = accounts.governanceContracts;
    const [assessor] = accounts.assessors;

    const assessorMemberId = await registry.getMemberId(assessor);

    // Test both true and false votes
    for (const vote of [true, false]) {
      const castVoteTx = await assessment.connect(assessor).castVote(CLAIM_ID, vote, IPFS_HASH);
      const castVoteBlock = await ethers.provider.getBlock(castVoteTx.blockNumber);

      // verify vote was recorded
      const assessmentBefore = await assessment.getAssessment(CLAIM_ID);
      const expectedAcceptVotes = vote ? 1 : 0;
      const expectedDenyVotes = vote ? 0 : 1;
      expect(assessmentBefore.acceptVotes).to.equal(expectedAcceptVotes);
      expect(assessmentBefore.denyVotes).to.equal(expectedDenyVotes);

      const ballotBefore = await assessment.ballotOf(CLAIM_ID, assessorMemberId);
      expect(ballotBefore.support).to.equal(vote);
      expect(ballotBefore.timestamp).to.equal(castVoteBlock.timestamp);

      const metadataBefore = await assessment.getBallotsMetadata(CLAIM_ID, assessorMemberId);
      expect(metadataBefore).to.equal(IPFS_HASH);

      // increase time past cooldown period
      const votingPeriod = await assessment.minVotingPeriod();
      const { cooldownPeriod } = await assessment.getAssessment(CLAIM_ID);
      await time.increase(votingPeriod + cooldownPeriod + 1n);

      // undoVote after cooldown has passed
      const undoTx = assessment.connect(governanceAccount).undoVotes(assessorMemberId, [CLAIM_ID]);
      await expect(undoTx).to.emit(assessment, 'VoteUndone').withArgs(CLAIM_ID, assessorMemberId);

      // verify vote was undone
      const assessmentAfter = await assessment.getAssessment(CLAIM_ID);
      expect(assessmentAfter.acceptVotes).to.equal(0);
      expect(assessmentAfter.denyVotes).to.equal(0);

      const ballotAfter = await assessment.ballotOf(CLAIM_ID, assessorMemberId);
      expect(ballotAfter.support).to.equal(false);
      expect(ballotAfter.timestamp).to.equal(0);

      // verify metadata is zeroed
      const metadataAfter = await assessment.getBallotsMetadata(CLAIM_ID, assessorMemberId);
      expect(metadataAfter).to.equal(ethers.ZeroHash);

      // extend voting period for next vote iteration
      if (vote === true) {
        await assessment.connect(governanceAccount).extendVotingPeriod(CLAIM_ID);
      }
    }
  });

  it('should work while contracts are paused', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { CLAIM_ID, IPFS_HASH } = constants;
    const [governanceAccount] = accounts.governanceContracts;
    const [assessor] = accounts.assessors;

    // cast vote
    await assessment.connect(assessor).castVote(CLAIM_ID, true, IPFS_HASH);

    // increase time past cooldown period
    const votingPeriod = await assessment.minVotingPeriod();
    const { cooldownPeriod } = await assessment.getAssessment(CLAIM_ID);
    await time.increase(votingPeriod + cooldownPeriod + 1n);

    // pause Assessment and Claims contracts
    await registry.confirmPauseConfig(PAUSE_ASSESSMENTS | PAUSE_CLAIMS);

    // undoVotes should work even when paused
    const assessorMemberId = await registry.getMemberId(assessor);
    const undoTx = assessment.connect(governanceAccount).undoVotes(assessorMemberId, [CLAIM_ID]);
    await expect(undoTx).to.emit(assessment, 'VoteUndone').withArgs(CLAIM_ID, assessorMemberId);

    // verify vote was undone
    const assessmentAfterUndo = await assessment.getAssessment(CLAIM_ID);
    expect(assessmentAfterUndo.acceptVotes).to.equal(0);
    expect(assessmentAfterUndo.denyVotes).to.equal(0);

    // castVote should still be blocked by pause
    const castVote = assessment.connect(assessor).castVote(CLAIM_ID, true, IPFS_HASH);
    await expect(castVote).to.be.revertedWithCustomError(assessment, 'Paused');

    // unpause and extend voting period
    await registry.confirmPauseConfig(0);
    await assessment.connect(governanceAccount).extendVotingPeriod(CLAIM_ID);

    // castVote should work again
    await assessment.connect(assessor).castVote(CLAIM_ID, false, IPFS_HASH);

    const ballotFinal = await assessment.ballotOf(CLAIM_ID, assessorMemberId);
    expect(ballotFinal.support).to.equal(false);

    const assessmentFinal = await assessment.getAssessment(CLAIM_ID);
    expect(assessmentFinal.acceptVotes).to.equal(0);
    expect(assessmentFinal.denyVotes).to.equal(1);
  });
});

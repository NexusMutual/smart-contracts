const { ethers } = require('hardhat');
const { expect } = require('chai');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

describe('castVote', function () {
  it('should revert if called with a non-existent claim', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { IPFS_HASH } = constants;
    const [assessor] = accounts.assessors;

    const castVote = assessment.connect(assessor).castVote(9999, true, IPFS_HASH);
    await expect(castVote).to.be.revertedWithCustomError(assessment, 'InvalidClaimId');
  });

  it('should revert when called by non-member', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID } = constants;

    const [nonMember] = accounts.nonMembers;

    const castVote = assessment.connect(nonMember).castVote(CLAIM_ID, true, constants.IPFS_HASH);
    await expect(castVote).to.be.revertedWithCustomError(assessment, 'OnlyMember');
  });

  it('should revert when called by member but not an assessor', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID } = constants;

    const [member] = accounts.members;

    const castVote = assessment.connect(member).castVote(CLAIM_ID, true, constants.IPFS_HASH);
    await expect(castVote).to.be.revertedWithCustomError(assessment, 'InvalidAssessor');
  });

  it('should revert when called after poll has closed', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID, IPFS_HASH } = constants;
    const [assessor] = accounts.assessors;

    // Set time past the voting period
    const block = await ethers.provider.getBlock('latest');
    const votingPeriod = await assessment.minVotingPeriod();
    if (!block) {
      throw new Error('Block not found');
    }
    await time.increase(BigInt(block.timestamp) + votingPeriod + 1n);

    // Try to vote after the period has ended - should fail
    const castVote = assessment.connect(assessor).castVote(CLAIM_ID, true, IPFS_HASH);
    await expect(castVote).to.be.revertedWithCustomError(assessment, 'VotingPeriodEnded');
  });

  it('should correctly handle voteSupport=true with proper vote counting and ballot storage', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { CLAIM_ID, IPFS_HASH } = constants;
    const [assessor] = accounts.assessors;

    const assessorAddress = await assessor.getAddress();
    const assessorMemberId = await registry.getMemberId(assessorAddress);
    const assessmentDataBefore = await assessment.getAssessment(CLAIM_ID);

    const tx = await assessment.connect(assessor).castVote(CLAIM_ID, true, IPFS_HASH);
    const { blockNumber } = await tx.wait();
    const block = await ethers.provider.getBlock(blockNumber);

    // Verify vote counting
    const assessmentDataAfter = await assessment.getAssessment(CLAIM_ID);
    expect(assessmentDataAfter.acceptVotes).to.equal(assessmentDataBefore.acceptVotes + 1n);
    expect(assessmentDataAfter.denyVotes).to.equal(assessmentDataBefore.denyVotes);

    // Verify ballot data
    const ballot = await assessment.ballotOf(CLAIM_ID, assessorMemberId);
    expect(ballot.support).to.be.true;
    expect(ballot.timestamp).to.equal(block?.timestamp);

    // Verify metadata
    const storedMetadata = await assessment.getBallotsMetadata(CLAIM_ID, assessorMemberId);
    expect(storedMetadata).to.equal(IPFS_HASH);

    // Verify event
    await expect(tx)
      .to.emit(assessment, 'VoteCast')
      .withArgs(CLAIM_ID, assessorAddress, assessorMemberId, true, IPFS_HASH);
  });

  it('should correctly handle voteSupport=false with proper vote counting and ballot storage', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { CLAIM_ID, IPFS_HASH } = constants;
    const [assessor] = accounts.assessors;

    const assessorAddress = await assessor.getAddress();
    const assessorMemberId = await registry.getMemberId(assessorAddress);
    const assessmentDataBefore = await assessment.getAssessment(CLAIM_ID);

    const tx = await assessment.connect(assessor).castVote(CLAIM_ID, false, IPFS_HASH);
    const { blockNumber } = await tx.wait();
    const block = await ethers.provider.getBlock(blockNumber);

    // Verify vote counting
    const assessmentDataAfter = await assessment.getAssessment(CLAIM_ID);
    expect(assessmentDataAfter.acceptVotes).to.equal(assessmentDataBefore.acceptVotes);
    expect(assessmentDataAfter.denyVotes).to.equal(assessmentDataBefore.denyVotes + 1n);

    // Verify ballot data
    const ballot = await assessment.ballotOf(CLAIM_ID, assessorMemberId);
    expect(ballot.support).to.be.false;
    expect(ballot.timestamp).to.equal(block?.timestamp);

    // Verify metadata
    const storedMetadata = await assessment.getBallotsMetadata(CLAIM_ID, assessorMemberId);
    expect(storedMetadata).to.equal(IPFS_HASH);

    // Verify event
    await expect(tx)
      .to.emit(assessment, 'VoteCast')
      .withArgs(CLAIM_ID, assessorAddress, assessorMemberId, false, IPFS_HASH);
  });

  it('should accurately track multiple votes from different assessors', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { CLAIM_ID } = constants;
    const [assessor1, assessor2, assessor3, assessor4] = accounts.assessors;

    // Define votes as single source of truth
    const votes = [
      {
        assessor: assessor1,
        voteSupport: true,
        ipfsHash: ethers.solidityPackedKeccak256(['string'], ['assessor1-vote-reasoning']),
      },
      {
        assessor: assessor2,
        voteSupport: false,
        ipfsHash: ethers.solidityPackedKeccak256(['string'], ['assessor2-vote-reasoning']),
      },
      {
        assessor: assessor3,
        voteSupport: true,
        ipfsHash: ethers.solidityPackedKeccak256(['string'], ['assessor3-vote-reasoning']),
      },
      {
        assessor: assessor4,
        voteSupport: false,
        ipfsHash: ethers.solidityPackedKeccak256(['string'], ['assessor4-vote-reasoning']),
      },
    ];

    // Get member IDs for all assessors
    const memberIds = await Promise.all(
      votes.map(async vote => {
        const assessorAddress = await vote.assessor.getAddress();
        return registry.getMemberId(assessorAddress);
      }),
    );

    const assessmentDataInitial = await assessment.getAssessment(CLAIM_ID);
    expect(assessmentDataInitial.acceptVotes).to.equal(0);
    expect(assessmentDataInitial.denyVotes).to.equal(0);

    // Cast first 3 votes in parallel
    const firstThreeVotes = votes.slice(0, 3);
    const [tx1, tx2, tx3] = await Promise.all(
      firstThreeVotes.map(vote =>
        assessment.connect(vote.assessor).castVote(CLAIM_ID, vote.voteSupport, vote.ipfsHash),
      ),
    );

    const [block1, block2, block3] = await Promise.all([
      tx1.wait().then(receipt => ethers.provider.getBlock(receipt.blockNumber)),
      tx2.wait().then(receipt => ethers.provider.getBlock(receipt.blockNumber)),
      tx3.wait().then(receipt => ethers.provider.getBlock(receipt.blockNumber)),
    ]);

    // Verify vote progress
    const assessmentDataAfter3Votes = await assessment.getAssessment(CLAIM_ID);
    const expectedAcceptVotes = firstThreeVotes.filter(vote => vote.voteSupport).length;
    const expectedDenyVotes = firstThreeVotes.filter(vote => !vote.voteSupport).length;
    expect(assessmentDataAfter3Votes.acceptVotes).to.equal(expectedAcceptVotes);
    expect(assessmentDataAfter3Votes.denyVotes).to.equal(expectedDenyVotes);

    // Cast the 4th vote
    const fourthVote = votes[3];
    const tx4 = await assessment
      .connect(fourthVote.assessor)
      .castVote(CLAIM_ID, fourthVote.voteSupport, fourthVote.ipfsHash);
    const tx4Receipt = await tx4.wait();
    const block4 = await ethers.provider.getBlock(tx4Receipt.blockNumber);

    // Verify final vote counting
    const assessmentDataFinal = await assessment.getAssessment(CLAIM_ID);
    const finalExpectedAcceptVotes = votes.filter(vote => vote.voteSupport).length;
    const finalExpectedDenyVotes = votes.filter(vote => !vote.voteSupport).length;
    expect(assessmentDataFinal.acceptVotes).to.equal(finalExpectedAcceptVotes);
    expect(assessmentDataFinal.denyVotes).to.equal(finalExpectedDenyVotes);

    // Get all ballots
    const ballots = await Promise.all(memberIds.map(memberId => assessment.ballotOf(CLAIM_ID, memberId)));

    // Verify ballot support matches expected votes
    ballots.forEach((ballot, index) => {
      expect(ballot.support).to.equal(votes[index].voteSupport);
    });

    // Verify ballot timestamps match actual block timestamps
    const blocks = [block1, block2, block3, block4];
    ballots.forEach((ballot, index) => {
      expect(ballot.timestamp).to.equal(blocks[index].timestamp);
    });

    // Get all metadata
    const metadata = await Promise.all(memberIds.map(memberId => assessment.getBallotsMetadata(CLAIM_ID, memberId)));

    // Verify each assessor's unique metadata was stored correctly
    metadata.forEach((hash, index) => {
      expect(hash).to.equal(votes[index].ipfsHash);
    });
  });

  it('should emit VoteCast event when vote is successful', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { CLAIM_ID, IPFS_HASH } = constants;
    const [assessor] = accounts.assessors;

    // Get assessor member ID
    const assessorAddress = await assessor.getAddress();
    const assessorMemberId = await registry.getMemberId(assessorAddress);

    const castVote = assessment.connect(assessor).castVote(CLAIM_ID, true, IPFS_HASH);
    await expect(castVote)
      .to.emit(assessment, 'VoteCast')
      .withArgs(CLAIM_ID, assessorAddress, assessorMemberId, true, IPFS_HASH);
  });

  it('should revert when assessor tries to vote twice', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { CLAIM_ID, IPFS_HASH } = constants;
    const [assessor] = accounts.assessors;

    const assessorAddress = await assessor.getAddress();
    const assessorMemberId = await registry.getMemberId(assessorAddress);

    // Cast initial deny vote
    const firstVoteTx = await assessment.connect(assessor).castVote(CLAIM_ID, false, IPFS_HASH);
    await expect(firstVoteTx).to.emit(assessment, 'VoteCast');
    const { blockNumber } = await firstVoteTx.wait();
    const block = await ethers.provider.getBlock(blockNumber);

    // Try to vote again - should revert with AlreadyVoted
    const secondVote = assessment.connect(assessor).castVote(CLAIM_ID, true, IPFS_HASH);
    await expect(secondVote).to.be.revertedWithCustomError(assessment, 'AlreadyVoted');

    // Check ballot still reflects the first vote
    const ballot = await assessment.ballotOf(CLAIM_ID, assessorMemberId);
    expect(ballot.support).to.equal(false);
    expect(ballot.timestamp).to.equal(block?.timestamp);

    // Check vote counts reflect only the first vote
    const assessmentData = await assessment.getAssessment(CLAIM_ID);
    expect(assessmentData.acceptVotes).to.equal(0);
    expect(assessmentData.denyVotes).to.equal(1);
  });
});

const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

const { solidityPackedKeccak256 } = ethers;

describe('ballotOf', function () {
  const ipfsHash = solidityPackedKeccak256(['string'], ['test-vote-metadata']);

  it('returns default ballot for non-existent assessor member ID', async function () {
    const { contracts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID } = constants;

    const nonExistentMemberId = 999;
    const ballot = await assessment.ballotOf(CLAIM_ID, nonExistentMemberId);
    expect(ballot.support).to.equal(false);
    expect(ballot.timestamp).to.equal(0);
  });

  it('returns default ballot for an assessor before any votes', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { CLAIM_ID } = constants;
    const [assessor] = accounts.assessors;

    // Default ballot should have zero timestamp and no support
    const assessorAddress = await assessor.getAddress();
    const assessorMemberId = await registry.getMemberId(assessorAddress);
    const ballot = await assessment.ballotOf(CLAIM_ID, assessorMemberId);
    expect(ballot.support).to.equal(false);
    expect(ballot.timestamp).to.equal(0);
  });

  it('returns correct ballot for accept vote', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { CLAIM_ID } = constants;
    const [assessor] = accounts.assessors;

    const assessorAddress = await assessor.getAddress();
    const assessorMemberId = await registry.getMemberId(assessorAddress);
    const voteSupport = true;
    const tx = await assessment.connect(assessor).castVote(CLAIM_ID, voteSupport, ipfsHash);
    const { blockNumber } = await tx.wait();
    const block = await ethers.provider.getBlock(blockNumber);

    // Get the ballot
    const ballot = await assessment.ballotOf(CLAIM_ID, assessorMemberId);

    // Verify ballot matches the vote cast
    expect(ballot.support).to.equal(voteSupport);
    expect(ballot.timestamp).to.equal(block?.timestamp);
  });

  it('returns correct ballot for deny vote', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { CLAIM_ID } = constants;
    const [assessor] = accounts.assessors;

    // Cast a deny vote
    const assessorAddress = await assessor.getAddress();
    const assessorMemberId = await registry.getMemberId(assessorAddress);
    const voteSupport = false;
    const tx = await assessment.connect(assessor).castVote(CLAIM_ID, voteSupport, ipfsHash);
    const { blockNumber } = await tx.wait();
    const block = await ethers.provider.getBlock(blockNumber);

    // Get the ballot
    const ballot = await assessment.ballotOf(CLAIM_ID, assessorMemberId);

    // Verify ballot matches the deny vote cast
    expect(ballot.support).to.equal(voteSupport);
    expect(ballot.timestamp).to.equal(block?.timestamp);
  });
});

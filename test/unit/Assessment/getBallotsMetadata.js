const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');
const { setEtherBalance } = require('../../utils/evm');

describe('getBallotsMetadata', function () {
  it('should return zero hash for non-existent assessor member ID', async function () {
    const { contracts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID } = constants;

    const nonExistentMemberId = 999;
    const metadata = await assessment.getBallotsMetadata(CLAIM_ID, nonExistentMemberId);
    expect(metadata).to.equal(ethers.ZeroHash);
  });

  it('should return zero hash for assessor with no votes', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { CLAIM_ID } = constants;
    const [assessor] = accounts.assessors;

    const assessorAddress = await assessor.getAddress();
    const assessorMemberId = await registry.getMemberId(assessorAddress);
    const metadata = await assessment.getBallotsMetadata(CLAIM_ID, assessorMemberId);
    expect(metadata).to.equal(ethers.ZeroHash);
  });

  it('should handle invalid claim ID', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const [assessor] = accounts.assessors;

    // Call with invalid claim ID
    const assessorAddress = await assessor.getAddress();
    const assessorMemberId = await registry.getMemberId(assessorAddress);
    const invalidClaimId = 999;
    const metadata = await assessment.getBallotsMetadata(invalidClaimId, assessorMemberId);
    expect(metadata).to.equal(ethers.ZeroHash);
  });

  it('should return correct metadata hash after vote is cast', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { CLAIM_ID, IPFS_HASH } = constants;
    const [assessor] = accounts.assessors;

    // Cast vote
    const assessorAddress = await assessor.getAddress();
    const assessorMemberId = await registry.getMemberId(assessorAddress);
    await assessment.connect(assessor).castVote(CLAIM_ID, true, IPFS_HASH);

    const metadata = await assessment.getBallotsMetadata(CLAIM_ID, assessorMemberId);
    expect(metadata).to.equal(IPFS_HASH);
  });

  it('should handle different metadata for different claims', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment, claims, registry } = contracts;
    const [assessor1, assessor2] = accounts.assessors;
    const [memberAccount] = accounts.members;

    const [assessorAddress1, assessorAddress2, memberAddress] = await Promise.all([
      assessor1.getAddress(),
      assessor2.getAddress(),
      memberAccount.getAddress(),
    ]);
    const [assessorMemberId1, assessorMemberId2] = await Promise.all([
      registry.getMemberId(assessorAddress1),
      registry.getMemberId(assessorAddress2),
    ]);
    const expectedClaimId1 = 2;
    const expectedClaimId2 = 3;
    const coverIds = [1, 2];
    await setEtherBalance(memberAddress, ethers.parseEther('10'));

    for (const coverId of coverIds) {
      await claims
        .connect(memberAccount)
        .submitClaim(coverId, ethers.parseEther('1'), ethers.solidityPackedKeccak256(['string'], [memberAddress]));
    }

    // Cast votes with different metadata
    const ipfsHash1 = ethers.solidityPackedKeccak256(['string'], ['claim-300-metadata']);
    const ipfsHash2 = ethers.solidityPackedKeccak256(['string'], ['claim-301-metadata']);

    await assessment.connect(assessor1).castVote(expectedClaimId1, true, ipfsHash1);
    await assessment.connect(assessor2).castVote(expectedClaimId2, false, ipfsHash2);

    const [metadata1Retrieved, metadata2Retrieved] = await Promise.all([
      assessment.getBallotsMetadata(expectedClaimId1, assessorMemberId1),
      assessment.getBallotsMetadata(expectedClaimId2, assessorMemberId2),
    ]);

    expect(metadata1Retrieved).to.equal(ipfsHash1);
    expect(metadata2Retrieved).to.equal(ipfsHash2);
    expect(metadata1Retrieved).to.not.equal(metadata2Retrieved);
  });

  it('should handle different assessors for same claim', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { CLAIM_ID } = constants;
    const [assessor1, assessor2] = accounts.assessors;

    const [assessorAddress1, assessorAddress2] = await Promise.all([assessor1.getAddress(), assessor2.getAddress()]);
    const [assessorMemberId1, assessorMemberId2] = await Promise.all([
      registry.getMemberId(assessorAddress1),
      registry.getMemberId(assessorAddress2),
    ]);
    const ipfsHash1 = ethers.solidityPackedKeccak256(['string'], ['assessor1-metadata']);
    const ipfsHash2 = ethers.solidityPackedKeccak256(['string'], ['assessor2-metadata']);

    await assessment.connect(assessor1).castVote(CLAIM_ID, true, ipfsHash1);
    await assessment.connect(assessor2).castVote(CLAIM_ID, false, ipfsHash2);

    const [metadata1Retrieved, metadata2Retrieved] = await Promise.all([
      assessment.getBallotsMetadata(CLAIM_ID, assessorMemberId1),
      assessment.getBallotsMetadata(CLAIM_ID, assessorMemberId2),
    ]);

    expect(metadata1Retrieved).to.equal(ipfsHash1);
    expect(metadata2Retrieved).to.equal(ipfsHash2);
    expect(metadata1Retrieved).to.not.equal(metadata2Retrieved);
  });
});

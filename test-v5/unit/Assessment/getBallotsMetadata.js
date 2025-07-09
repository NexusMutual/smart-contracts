const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');
const { setEtherBalance } = require('../../utils/evm');

const { solidityKeccak256 } = ethers.utils;

describe('getBallotsMetadata', function () {
  it('should return zero hash for non-existent assessor member ID', async function () {
    const { contracts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID } = constants;

    const nonExistentMemberId = 999;
    const metadata = await assessment.getBallotsMetadata(CLAIM_ID, nonExistentMemberId);
    expect(metadata).to.equal(ethers.constants.HashZero);
  });

  it('should return zero hash for assessor with no votes', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { CLAIM_ID } = constants;
    const [assessor] = accounts.assessors;

    const assessorMemberId = await registry.getMemberId(assessor.address);
    const metadata = await assessment.getBallotsMetadata(CLAIM_ID, assessorMemberId);
    expect(metadata).to.equal(ethers.constants.HashZero);
  });

  it('should handle invalid claim ID', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const [assessor] = accounts.assessors;

    // Call with invalid claim ID
    const assessorMemberId = await registry.getMemberId(assessor.address);
    const invalidClaimId = 999;
    const metadata = await assessment.getBallotsMetadata(invalidClaimId, assessorMemberId);
    expect(metadata).to.equal(ethers.constants.HashZero);
  });

  it('should return correct metadata hash after vote is cast', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { CLAIM_ID, IPFS_HASH } = constants;
    const [assessor] = accounts.assessors;

    // Cast vote
    const assessorMemberId = await registry.getMemberId(assessor.address);
    await assessment.connect(assessor).castVote(CLAIM_ID, true, IPFS_HASH);

    const metadata = await assessment.getBallotsMetadata(CLAIM_ID, assessorMemberId);
    expect(metadata).to.equal(IPFS_HASH);
  });

  it('should handle different metadata for different claims', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment, claims, registry } = contracts;
    const [assessor1, assessor2] = accounts.assessors;

    const assessorMemberId1 = await registry.getMemberId(assessor1.address);
    const assessorMemberId2 = await registry.getMemberId(assessor2.address);
    const expectedClaimId1 = 2;
    const expectedClaimId2 = 3;
    const coverIds = [300, 301];
    const [memberAccount] = accounts.members;
    await setEtherBalance(memberAccount.address, ethers.utils.parseEther('10'));

    for (const coverId of coverIds) {
      await claims
        .connect(memberAccount)
        .submitClaim(coverId, ethers.utils.parseEther('1'), ethers.utils.solidityKeccak256(['string'], ['test']));
    }

    // Cast votes with different metadata
    const ipfsHash1 = solidityKeccak256(['string'], ['claim-300-metadata']);
    const ipfsHash2 = solidityKeccak256(['string'], ['claim-301-metadata']);

    await assessment.connect(assessor1).castVote(expectedClaimId1, true, ipfsHash1);
    await assessment.connect(assessor2).castVote(expectedClaimId2, false, ipfsHash2);

    const metadata1Retrieved = await assessment.getBallotsMetadata(expectedClaimId1, assessorMemberId1);
    const metadata2Retrieved = await assessment.getBallotsMetadata(expectedClaimId2, assessorMemberId2);

    expect(metadata1Retrieved).to.equal(ipfsHash1);
    expect(metadata2Retrieved).to.equal(ipfsHash2);
    expect(metadata1Retrieved).to.not.equal(metadata2Retrieved);
  });

  it('should handle different assessors for same claim', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { CLAIM_ID } = constants;
    const [assessor1, assessor2] = accounts.assessors;

    const assessorMemberId1 = await registry.getMemberId(assessor1.address);
    const assessorMemberId2 = await registry.getMemberId(assessor2.address);
    const ipfsHash1 = solidityKeccak256(['string'], ['assessor1-metadata']);
    const ipfsHash2 = solidityKeccak256(['string'], ['assessor2-metadata']);

    await assessment.connect(assessor1).castVote(CLAIM_ID, true, ipfsHash1);
    await assessment.connect(assessor2).castVote(CLAIM_ID, false, ipfsHash2);

    const metadata1Retrieved = await assessment.getBallotsMetadata(CLAIM_ID, assessorMemberId1);
    const metadata2Retrieved = await assessment.getBallotsMetadata(CLAIM_ID, assessorMemberId2);

    expect(metadata1Retrieved).to.equal(ipfsHash1);
    expect(metadata2Retrieved).to.equal(ipfsHash2);
    expect(metadata1Retrieved).to.not.equal(metadata2Retrieved);
  });
});

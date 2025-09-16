const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

describe('setGroupMetadata', function () {
  it('should revert if not called by governor', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID, IPFS_HASH } = constants;
    const [nonGovernor] = accounts.nonMembers;

    const setGroupMetadata = assessment.connect(nonGovernor).setGroupMetadata(ASSESSOR_GROUP_ID, IPFS_HASH);
    await expect(setGroupMetadata).to.be.revertedWithCustomError(assessment, 'Unauthorized');
  });

  it('should revert for invalid group IDs', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { IPFS_HASH } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    const groupsCount = await assessment.getGroupsCount();
    const invalidGroupIds = [0n, groupsCount + 1n];

    for (const invalidGroupId of invalidGroupIds) {
      const setGroupMetadata = assessment.connect(governanceAccount).setGroupMetadata(invalidGroupId, IPFS_HASH);
      await expect(setGroupMetadata).to.be.revertedWithCustomError(assessment, 'InvalidGroupId');
    }
  });

  it('should set metadata for existing group', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID, IPFS_HASH } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    // Set metadata for existing group
    const tx = await assessment.connect(governanceAccount).setGroupMetadata(ASSESSOR_GROUP_ID, IPFS_HASH);

    // Verify metadata is set by checking getGroupsData
    const groupsData = await assessment.getGroupsData([ASSESSOR_GROUP_ID]);
    expect(groupsData[0].ipfsMetadata).to.equal(IPFS_HASH);

    // Verify event emission
    await expect(tx).to.emit(assessment, 'GroupMetadataSet').withArgs(ASSESSOR_GROUP_ID, IPFS_HASH);
  });

  it('should update existing metadata', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID, IPFS_HASH } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    const newMetadata = ethers.solidityPackedKeccak256(['string'], ['updated-metadata']);

    // Set initial metadata
    await assessment.connect(governanceAccount).setGroupMetadata(ASSESSOR_GROUP_ID, IPFS_HASH);

    // Verify initial metadata is set
    let groupsData = await assessment.getGroupsData([ASSESSOR_GROUP_ID]);
    expect(groupsData[0].ipfsMetadata).to.equal(IPFS_HASH);

    // Update metadata
    const tx = await assessment.connect(governanceAccount).setGroupMetadata(ASSESSOR_GROUP_ID, newMetadata);

    // Verify metadata is updated
    groupsData = await assessment.getGroupsData([ASSESSOR_GROUP_ID]);
    expect(groupsData[0].ipfsMetadata).to.equal(newMetadata);

    // Verify event emission for update
    await expect(tx).to.emit(assessment, 'GroupMetadataSet').withArgs(ASSESSOR_GROUP_ID, newMetadata);
  });

  it('should handle zero metadata (clearing metadata)', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID, IPFS_HASH } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    const zeroMetadata = ethers.ZeroHash;

    // Set initial metadata
    await assessment.connect(governanceAccount).setGroupMetadata(ASSESSOR_GROUP_ID, IPFS_HASH);

    // Clear metadata by setting to zero
    const tx = await assessment.connect(governanceAccount).setGroupMetadata(ASSESSOR_GROUP_ID, zeroMetadata);

    // Verify metadata is cleared
    const groupsData = await assessment.getGroupsData([ASSESSOR_GROUP_ID]);
    expect(groupsData[0].ipfsMetadata).to.equal(zeroMetadata);

    // Verify event emission for clearing
    await expect(tx).to.emit(assessment, 'GroupMetadataSet').withArgs(ASSESSOR_GROUP_ID, zeroMetadata);
  });

  it('should not affect other groups when setting metadata', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { ASSESSOR_GROUP_ID, IPFS_HASH } = constants;
    const [governanceAccount] = accounts.governanceContracts;
    const [member] = accounts.members;

    const memberId = await registry.getMemberId(member.address);
    const newMetadata = ethers.solidityPackedKeccak256(['string'], ['new-group-metadata']);

    // Create second group
    await assessment.connect(governanceAccount).addAssessorsToGroup([memberId], 0);
    const secondGroupId = await assessment.getGroupsCount();

    // Set metadata for first group
    await assessment.connect(governanceAccount).setGroupMetadata(ASSESSOR_GROUP_ID, IPFS_HASH);

    // Set metadata for second group
    await assessment.connect(governanceAccount).setGroupMetadata(secondGroupId, newMetadata);

    // Verify both groups have correct metadata
    const [group1Data, group2Data] = await assessment.getGroupsData([ASSESSOR_GROUP_ID, secondGroupId]);
    expect(group1Data.ipfsMetadata).to.equal(IPFS_HASH);
    expect(group2Data.ipfsMetadata).to.equal(newMetadata);
  });

  it('should maintain metadata when group membership changes', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { ASSESSOR_GROUP_ID, IPFS_HASH } = constants;
    const [governanceAccount] = accounts.governanceContracts;
    const [member] = accounts.members;

    const memberId = await registry.getMemberId(member.address);

    // Set metadata for group
    await assessment.connect(governanceAccount).setGroupMetadata(ASSESSOR_GROUP_ID, IPFS_HASH);

    // Add new member to group
    await assessment.connect(governanceAccount).addAssessorsToGroup([memberId], ASSESSOR_GROUP_ID);

    // Verify metadata is still set after adding member
    let groupsData = await assessment.getGroupsData([ASSESSOR_GROUP_ID]);
    expect(groupsData[0].ipfsMetadata).to.equal(IPFS_HASH);

    // Remove member from group
    await assessment.connect(governanceAccount).removeAssessorFromGroup(memberId, ASSESSOR_GROUP_ID);

    // Verify metadata is still set after removing member
    groupsData = await assessment.getGroupsData([ASSESSOR_GROUP_ID]);
    expect(groupsData[0].ipfsMetadata).to.equal(IPFS_HASH);
  });
});

const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

describe('getGroupsData', function () {
  it('should return empty array for empty input', async function () {
    const { contracts } = await loadFixture(setup);
    const { assessment } = contracts;

    const groupsData = await assessment.getGroupsData([]);

    expect(groupsData.length).to.equal(0);
  });

  it('should return correct data for an existing group', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;

    const groupsData = await assessment.getGroupsData([ASSESSOR_GROUP_ID]);
    const [groupData] = groupsData;

    expect(groupsData.length).to.equal(1);
    expect(groupData.id).to.equal(ASSESSOR_GROUP_ID);
    expect(groupData.ipfsMetadata).to.equal(ethers.ZeroHash);
    expect(groupData.assessors).to.have.lengthOf(accounts.assessors.length);
  });

  it('should return data for non-existent group with empty assessors', async function () {
    const { contracts } = await loadFixture(setup);
    const { assessment } = contracts;

    const nonExistentGroupId = 999;
    const groupsData = await assessment.getGroupsData([nonExistentGroupId]);
    const [groupData] = groupsData;

    expect(groupsData.length).to.equal(1);
    expect(groupData.id).to.equal(nonExistentGroupId);
    expect(groupData.ipfsMetadata).to.equal(ethers.ZeroHash);
    expect(groupData.assessors.length).to.equal(0);
  });

  it('should return correct data for single group', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;

    const groupsData = await assessment.getGroupsData([ASSESSOR_GROUP_ID]);
    const [groupData] = groupsData;

    expect(groupsData).to.have.length(1);
    expect(groupData.id).to.equal(ASSESSOR_GROUP_ID);
    expect(groupData.assessors.length).to.equal(accounts.assessors.length);
    expect(groupData.ipfsMetadata).to.equal(ethers.ZeroHash); // No metadata set initially
  });

  it('should return correct data for multiple groups', async function () {
    const { contracts, constants, accounts } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;
    const [member] = accounts.members;

    const memberId = await registry.getMemberId(member.address);

    // Create second group
    await assessment.connect(governanceAccount).addAssessorsToGroup([memberId], 0);
    const secondGroupId = await assessment.getGroupsCount();

    const groupsData = await assessment.getGroupsData([ASSESSOR_GROUP_ID, secondGroupId]);
    const [groupData1, groupData2] = groupsData;

    expect(groupsData).to.have.length(2);

    // First group (from setup)
    expect(groupData1.id).to.equal(ASSESSOR_GROUP_ID);
    expect(groupData1.assessors).to.have.lengthOf(accounts.assessors.length);
    expect(groupData1.ipfsMetadata).to.equal(ethers.ZeroHash);

    // Second group (newly created)
    expect(groupData2.id).to.equal(secondGroupId);
    expect(groupData2.assessors.length).to.equal(1); // 1 member added
    expect(groupData2.ipfsMetadata).to.equal(ethers.ZeroHash);
  });

  it('should handle mixed existing and non-existing groups', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    const newGroupAssessorIds = [300n, 301n];
    const nonExistentGroupId = 999;

    // Create new group
    await assessment.connect(governanceAccount).addAssessorsToGroup(newGroupAssessorIds, 0);
    const newGroupId = await assessment.getGroupsCount();

    const groupsData = await assessment.getGroupsData([ASSESSOR_GROUP_ID, nonExistentGroupId, newGroupId]);
    const [existingGroupData, nonExistentGroupData, newGroupData] = groupsData;

    expect(groupsData.length).to.equal(3);

    // Check existing group
    expect(existingGroupData.id).to.equal(ASSESSOR_GROUP_ID);
    expect(existingGroupData.assessors).to.have.lengthOf(accounts.assessors.length);

    // Check non-existent group
    expect(nonExistentGroupData.id).to.equal(nonExistentGroupId);
    expect(nonExistentGroupData.assessors.length).to.equal(0);

    // Check new group
    expect(newGroupData.id).to.equal(newGroupId);
    expect(newGroupData.assessors.length).to.equal(newGroupAssessorIds.length);
  });

  it('should handle duplicate group IDs in input', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    const assessorIds = [500n, 501n];

    // Create new group
    await assessment.connect(governanceAccount).addAssessorsToGroup(assessorIds, 0);
    const groupId = await assessment.getGroupsCount();

    // Request same group multiple times
    const groupsData = await assessment.getGroupsData([groupId, groupId, groupId]);
    expect(groupsData.length).to.equal(3);

    // All entries should be identical
    for (let i = 0; i < 3; i++) {
      expect(groupsData[i].id).to.equal(groupId);
      expect(groupsData[i].assessors.length).to.equal(assessorIds.length);
    }
  });

  it('should return correct structure for empty group', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    // Create empty group
    await assessment.connect(governanceAccount).addAssessorsToGroup([], 0);
    const emptyGroupId = await assessment.getGroupsCount();

    const groupsData = await assessment.getGroupsData([emptyGroupId]);
    const [groupData] = groupsData;

    expect(groupsData.length).to.equal(1);
    expect(groupData.id).to.equal(emptyGroupId);
    expect(groupData.ipfsMetadata).to.equal(ethers.ZeroHash);
    expect(groupData.assessors.length).to.equal(0);
  });

  it('should reflect changes after assessor removal', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    const assessorIds = [600n, 601n, 602n];

    // Create group with assessors
    await assessment.connect(governanceAccount).addAssessorsToGroup(assessorIds, 0);
    const groupId = await assessment.getGroupsCount();

    // Get initial data
    const initialData = await assessment.getGroupsData([groupId]);
    expect(initialData[0].assessors.length).to.equal(3);

    // Remove one assessor
    const [assessor1, assessorIdToRemove, assessor3] = assessorIds;
    await assessment.connect(governanceAccount).removeAssessorFromGroup(assessorIdToRemove, groupId);

    // Get updated data
    const [updatedData] = await assessment.getGroupsData([groupId]);
    expect(updatedData.assessors.length).to.equal(2);
    const updatedDataAssessorIds = new Set(updatedData.assessors);
    expect(updatedDataAssessorIds.has(assessorIdToRemove)).to.be.false;
    expect(updatedDataAssessorIds.has(assessor1)).to.be.true;
    expect(updatedDataAssessorIds.has(assessor3)).to.be.true;
  });

  it('should handle groups with metadata', async function () {
    const { contracts, constants, accounts } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { ASSESSOR_GROUP_ID, IPFS_HASH } = constants;
    const [governanceAccount] = accounts.governanceContracts;
    const [member] = accounts.members;

    const memberId = await registry.getMemberId(member.address);
    const group2IpfsHash = ethers.solidityPackedKeccak256(['string'], ['custom-metadata']);

    // Set metadata for existing group
    await assessment.connect(governanceAccount).setGroupMetadata(ASSESSOR_GROUP_ID, IPFS_HASH);

    // Create new group with different metadata
    await assessment.connect(governanceAccount).addAssessorsToGroup([memberId], 0);
    const newGroupId = await assessment.getGroupsCount();
    await assessment.connect(governanceAccount).setGroupMetadata(newGroupId, group2IpfsHash);

    const groupsData = await assessment.getGroupsData([ASSESSOR_GROUP_ID, newGroupId]);
    const [groupData1, groupData2] = groupsData;

    expect(groupsData).to.have.lengthOf(2);

    // First group
    expect(groupData1.id).to.equal(ASSESSOR_GROUP_ID);
    expect(groupData1.assessors).to.have.lengthOf(accounts.assessors.length);
    expect(groupData1.ipfsMetadata).to.equal(IPFS_HASH);

    // Second group
    expect(groupData2.id).to.equal(newGroupId);
    expect(groupData2.assessors).to.have.lengthOf(1); // 1 member added
    expect(groupData2.ipfsMetadata).to.equal(group2IpfsHash);
  });
});

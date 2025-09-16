const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

describe('removeAssessorFromGroup', function () {
  it('should revert if not called by governor', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [nonGovernor] = accounts.nonMembers;
    const [assessor] = accounts.assessors;

    const assessorId = await registry.getMemberId(assessor.address);
    const removeAssessor = assessment.connect(nonGovernor).removeAssessorFromGroup(assessorId, ASSESSOR_GROUP_ID);

    await expect(removeAssessor).to.be.revertedWithCustomError(assessment, 'Unauthorized');
  });

  it('should revert for invalid member ID (zero)', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    const removeAssessorFromGroup = assessment
      .connect(governanceAccount)
      .removeAssessorFromGroup(0n, ASSESSOR_GROUP_ID);

    await expect(removeAssessorFromGroup).to.be.revertedWithCustomError(assessment, 'InvalidMemberId');
  });

  it('should revert for invalid group ID (zero)', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const [governanceAccount] = accounts.governanceContracts;
    const [member] = accounts.members;

    const memberId = await registry.getMemberId(member.address);
    const invalidGroupId = 0n;
    const removeAssessor = assessment.connect(governanceAccount).removeAssessorFromGroup(memberId, invalidGroupId);

    await expect(removeAssessor).to.be.revertedWithCustomError(assessment, 'InvalidGroupId');
  });

  it('should revert for invalid group ID (too high)', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const [governanceAccount] = accounts.governanceContracts;
    const [member] = accounts.members;

    const memberId = await registry.getMemberId(member.address);
    const groupsCount = await assessment.getGroupsCount();
    const invalidGroupId = groupsCount + 1n;
    const removeAssessor = assessment.connect(governanceAccount).removeAssessorFromGroup(memberId, invalidGroupId);

    await expect(removeAssessor).to.be.revertedWithCustomError(assessment, 'InvalidGroupId');
  });

  it('should remove assessor from group successfully', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const [governanceAccount] = accounts.governanceContracts;
    const [member1, member2, member3] = accounts.members;

    const [memberId1, memberId2, memberId3] = await Promise.all([
      registry.getMemberId(member1.address),
      registry.getMemberId(member2.address),
      registry.getMemberId(member3.address),
    ]);

    // Create new group with multiple members
    await assessment.connect(governanceAccount).addAssessorsToGroup([memberId1, memberId2, memberId3], 0n);
    const groupId = await assessment.getGroupsCount();

    // Verify all members are in group
    expect(await assessment.isAssessorInGroup(memberId1, groupId)).to.be.true;
    expect(await assessment.isAssessorInGroup(memberId2, groupId)).to.be.true;
    expect(await assessment.isAssessorInGroup(memberId3, groupId)).to.be.true;

    // Get initial group size
    const initialGroupAssessors = await assessment.getGroupAssessors(groupId);
    const initialSize = initialGroupAssessors.length;
    expect(initialSize).to.equal(3);

    // Remove single member first
    const tx1 = await assessment.connect(governanceAccount).removeAssessorFromGroup(memberId1, groupId);

    // Verify member1 is removed from group
    expect(await assessment.isAssessorInGroup(memberId1, groupId)).to.be.false;
    expect(await assessment.isAssessorInGroup(memberId2, groupId)).to.be.true;
    expect(await assessment.isAssessorInGroup(memberId3, groupId)).to.be.true;

    // Verify member1 no longer has this group in their list
    const member1Groups = await assessment.getGroupsForAssessor(memberId1);
    const member1GroupSet = new Set(member1Groups);
    expect(member1GroupSet.has(groupId)).to.be.false;

    // Verify group size decreased
    const currentGroupAssessors = await assessment.getGroupAssessors(groupId);
    expect(currentGroupAssessors.length).to.equal(initialSize - 1);

    // Verify member1 is not in the group's assessor list but others are
    const currentGroupAssessorSet = new Set(currentGroupAssessors);
    expect(currentGroupAssessorSet.has(memberId1)).to.be.false;
    expect(currentGroupAssessorSet.has(memberId2)).to.be.true;
    expect(currentGroupAssessorSet.has(memberId3)).to.be.true;

    // Verify event emission
    await expect(tx1).to.emit(assessment, 'AssessorRemovedFromGroup').withArgs(groupId, memberId1);

    // Continue with sequential removals
    const tx2 = await assessment.connect(governanceAccount).removeAssessorFromGroup(memberId2, groupId);
    const tx3 = await assessment.connect(governanceAccount).removeAssessorFromGroup(memberId3, groupId);

    // Verify all members are removed
    expect(await assessment.isAssessorInGroup(memberId1, groupId)).to.be.false;
    expect(await assessment.isAssessorInGroup(memberId2, groupId)).to.be.false;
    expect(await assessment.isAssessorInGroup(memberId3, groupId)).to.be.false;

    // Verify group is empty
    const finalGroupAssessors = await assessment.getGroupAssessors(groupId);
    expect(finalGroupAssessors).to.deep.equal([]);

    // Verify all event emissions
    await expect(tx2).to.emit(assessment, 'AssessorRemovedFromGroup').withArgs(groupId, memberId2);
    await expect(tx3).to.emit(assessment, 'AssessorRemovedFromGroup').withArgs(groupId, memberId3);
  });

  it('should handle removing assessor not in group gracefully', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;
    const [nonAssessorInGroup] = accounts.members;

    const nonAssessorMemberId = await registry.getMemberId(nonAssessorInGroup.address);

    // Verify member is not in the assessor group (from setup)
    expect(await assessment.isAssessorInGroup(nonAssessorMemberId, ASSESSOR_GROUP_ID)).to.be.false;

    // Try to remove member that's not in the group (should not revert but no effect)
    const tx = await assessment
      .connect(governanceAccount)
      .removeAssessorFromGroup(nonAssessorMemberId, ASSESSOR_GROUP_ID);

    // Verify still not in group
    expect(await assessment.isAssessorInGroup(nonAssessorMemberId, ASSESSOR_GROUP_ID)).to.be.false;

    // Event should still be emitted (EnumerableSet.remove returns false but doesn't revert)
    await expect(tx).to.emit(assessment, 'AssessorRemovedFromGroup').withArgs(ASSESSOR_GROUP_ID, nonAssessorMemberId);
  });

  it('should not affect other assessors in same group', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;
    const [assessor1, assessor2] = accounts.assessors;

    const [assessorId1, assessorId2] = await Promise.all([
      registry.getMemberId(assessor1.address),
      registry.getMemberId(assessor2.address),
    ]);

    // Verify both assessors are initially in group (from setup)
    expect(await assessment.isAssessorInGroup(assessorId1, ASSESSOR_GROUP_ID)).to.be.true;
    expect(await assessment.isAssessorInGroup(assessorId2, ASSESSOR_GROUP_ID)).to.be.true;

    // Remove only assessor1
    await assessment.connect(governanceAccount).removeAssessorFromGroup(assessorId1, ASSESSOR_GROUP_ID);

    // Verify assessor1 is removed but assessor2 remains
    expect(await assessment.isAssessorInGroup(assessorId1, ASSESSOR_GROUP_ID)).to.be.false;
    expect(await assessment.isAssessorInGroup(assessorId2, ASSESSOR_GROUP_ID)).to.be.true;

    // Verify group still contains assessor2 but not assessor1
    const groupAssessors = await assessment.getGroupAssessors(ASSESSOR_GROUP_ID);
    const groupAssessorSet = new Set(groupAssessors);
    expect(groupAssessorSet.has(assessorId2)).to.be.true;
    expect(groupAssessorSet.has(assessorId1)).to.be.false;
  });

  it('should not affect other groups when removing from specific group', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const [governanceAccount] = accounts.governanceContracts;
    const [member] = accounts.members;

    const memberId = await registry.getMemberId(member.address);

    // Get initial groups for member (might include ASSESSOR_GROUP_ID from setup)
    const initialGroups = await assessment.getGroupsForAssessor(memberId);

    // Create two new groups and add member to both
    await assessment.connect(governanceAccount).addAssessorsToGroup([memberId], 0n);
    const groupId1 = await assessment.getGroupsCount();

    await assessment.connect(governanceAccount).addAssessorsToGroup([memberId], 0n);
    const groupId2 = await assessment.getGroupsCount();

    // Verify member is in both new groups
    expect(await assessment.isAssessorInGroup(memberId, groupId1)).to.be.true;
    expect(await assessment.isAssessorInGroup(memberId, groupId2)).to.be.true;

    // Remove member from only group1
    const tx = await assessment.connect(governanceAccount).removeAssessorFromGroup(memberId, groupId1);

    // Verify member is removed from group1 but still in group2
    expect(await assessment.isAssessorInGroup(memberId, groupId1)).to.be.false;
    expect(await assessment.isAssessorInGroup(memberId, groupId2)).to.be.true;

    // Verify member's groups list contains initial groups plus group2 (but not group1)
    const finalGroups = await assessment.getGroupsForAssessor(memberId);
    const expectedGroups = [...initialGroups, groupId2].sort();
    expect([...finalGroups].sort()).to.deep.equal(expectedGroups);

    // Verify event emission only for group1
    await expect(tx).to.emit(assessment, 'AssessorRemovedFromGroup').withArgs(groupId1, memberId);
  });

  it('should handle removing last assessor from group', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const [governanceAccount] = accounts.governanceContracts;
    const [member] = accounts.members;

    const memberId = await registry.getMemberId(member.address);

    // Create new group with single member
    await assessment.connect(governanceAccount).addAssessorsToGroup([memberId], 0n);
    const groupId = await assessment.getGroupsCount();

    // Verify member is in group and group has 1 assessor
    expect(await assessment.isAssessorInGroup(memberId, groupId)).to.be.true;
    const initialGroupAssessors = await assessment.getGroupAssessors(groupId);
    expect(initialGroupAssessors.length).to.equal(1);

    // Remove the only assessor from group
    const tx = await assessment.connect(governanceAccount).removeAssessorFromGroup(memberId, groupId);

    // Verify member is removed and group is empty
    expect(await assessment.isAssessorInGroup(memberId, groupId)).to.be.false;
    const finalGroupAssessors = await assessment.getGroupAssessors(groupId);
    expect(finalGroupAssessors).to.deep.equal([]);

    // Verify event emission
    await expect(tx).to.emit(assessment, 'AssessorRemovedFromGroup').withArgs(groupId, memberId);
  });

  it('should maintain group metadata when removing assessors', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { ASSESSOR_GROUP_ID, IPFS_HASH } = constants;
    const [governanceAccount] = accounts.governanceContracts;
    const [assessor] = accounts.assessors;

    const assessorId = await registry.getMemberId(assessor.address);

    // Set metadata for group
    await assessment.connect(governanceAccount).setGroupMetadata(ASSESSOR_GROUP_ID, IPFS_HASH);

    // Verify metadata is set
    const [groupsDataBefore] = await assessment.getGroupsData([ASSESSOR_GROUP_ID]);
    expect(groupsDataBefore.ipfsMetadata).to.equal(IPFS_HASH);

    // Remove assessor from group
    await assessment.connect(governanceAccount).removeAssessorFromGroup(assessorId, ASSESSOR_GROUP_ID);

    // Verify metadata is still set after removing assessor
    const [groupsDataAfter] = await assessment.getGroupsData([ASSESSOR_GROUP_ID]);
    expect(groupsDataAfter.ipfsMetadata).to.equal(IPFS_HASH);
  });
});

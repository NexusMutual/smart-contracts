const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

describe('addAssessorsToGroup', function () {
  it('should revert when called by non-governor contract', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [assessor] = accounts.assessors;

    const addAssessorsToGroup = assessment.connect(assessor).addAssessorsToGroup([1, 2], 1);
    await expect(addAssessorsToGroup).to.be.revertedWithCustomError(assessment, 'Unauthorized');
  });

  it('should revert when assessor member ID is zero', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    const addAssessorsToGroup = assessment.connect(governanceAccount).addAssessorsToGroup([0], 1);
    await expect(addAssessorsToGroup).to.be.revertedWithCustomError(assessment, 'InvalidMemberId');
  });

  it('should create new group when groupId is 0', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    const beforeGroupsCount = await assessment.getGroupsCount();
    const newAssessorIds = [10, 11, 12];

    const tx = await assessment.connect(governanceAccount).addAssessorsToGroup(newAssessorIds, 0);

    // Verify new group was created
    const afterGroupsCount = await assessment.getGroupsCount();
    expect(afterGroupsCount.toNumber()).to.equal(beforeGroupsCount.toNumber() + 1);

    const newGroupId = afterGroupsCount;

    // Verify assessors were added to the new group
    const groupAssessors = await assessment.getGroupAssessors(newGroupId);
    expect(groupAssessors.length).to.equal(newAssessorIds.length);

    const groupAssessorsSet = new Set(groupAssessors.map(id => id.toNumber()));
    for (let i = 0; i < newAssessorIds.length; i++) {
      const assessorId = newAssessorIds[i];
      expect(groupAssessorsSet.has(assessorId)).to.be.true;
      const isInGroup = await assessment.isAssessorInGroup(assessorId, newGroupId);
      expect(isInGroup).to.be.true;
    }

    // Verify events were emitted
    for (const assessorId of newAssessorIds) {
      await expect(tx).to.emit(assessment, 'AssessorAddedToGroup').withArgs(newGroupId, assessorId);
    }
  });

  it('should add assessors to existing group', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    const beforeAssessors = await assessment.getGroupAssessors(ASSESSOR_GROUP_ID);
    const initialCount = beforeAssessors.length;
    const newAssessorIds = [20, 21];

    const tx = await assessment.connect(governanceAccount).addAssessorsToGroup(newAssessorIds, ASSESSOR_GROUP_ID);

    // Verify assessors were added to existing group
    const afterAssessors = await assessment.getGroupAssessors(ASSESSOR_GROUP_ID);
    expect(afterAssessors.length).to.equal(initialCount + newAssessorIds.length);

    const afterAssessorsSet = new Set(afterAssessors.map(id => id.toNumber()));
    for (const assessorId of newAssessorIds) {
      expect(afterAssessorsSet.has(assessorId)).to.be.true;
      expect(await assessment.isAssessorInGroup(assessorId, ASSESSOR_GROUP_ID)).to.be.true;
      await expect(tx).to.emit(assessment, 'AssessorAddedToGroup').withArgs(ASSESSOR_GROUP_ID, assessorId);
    }

    // Verify original assessors are still there
    const beforeAssessorsSet = new Set(beforeAssessors.map(id => id.toNumber()));
    for (const originalAssessorId of beforeAssessorsSet) {
      expect(afterAssessorsSet.has(originalAssessorId)).to.be.true;
    }
  });

  it('should handle single assessor addition', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    const singleAssessorId = [25];
    const initialCount = await assessment.getGroupAssessorCount(ASSESSOR_GROUP_ID);

    const tx = await assessment.connect(governanceAccount).addAssessorsToGroup(singleAssessorId, ASSESSOR_GROUP_ID);

    // Verify single assessor was added
    const finalCount = await assessment.getGroupAssessorCount(ASSESSOR_GROUP_ID);
    expect(finalCount.toNumber()).to.equal(initialCount.toNumber() + 1);
    expect(await assessment.isAssessorInGroup(singleAssessorId[0], ASSESSOR_GROUP_ID)).to.be.true;

    await expect(tx).to.emit(assessment, 'AssessorAddedToGroup').withArgs(ASSESSOR_GROUP_ID, singleAssessorId[0]);
  });

  it('should handle empty assessor array', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    const initialCount = await assessment.getGroupAssessorCount(ASSESSOR_GROUP_ID);

    // Adding empty array should not change anything
    await assessment.connect(governanceAccount).addAssessorsToGroup([], ASSESSOR_GROUP_ID);

    const finalCount = await assessment.getGroupAssessorCount(ASSESSOR_GROUP_ID);
    expect(finalCount).to.equal(initialCount);
  });

  it('should handle duplicate assessor IDs in same call', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    const duplicateAssessorIds = [30, 31, 30]; // 30 appears twice

    const tx = await assessment.connect(governanceAccount).addAssessorsToGroup(duplicateAssessorIds, 0);

    const newGroupId = await assessment.getGroupsCount();
    const groupAssessors = await assessment.getGroupAssessors(newGroupId);

    // Should only contain unique assessors (EnumerableSet handles duplicates)
    expect(groupAssessors.length).to.equal(2);
    const groupAssessorsSet = new Set(groupAssessors.map(id => id.toNumber()));
    expect(groupAssessorsSet.has(30)).to.be.true;
    expect(groupAssessorsSet.has(31)).to.be.true;

    // Events should still be emitted for each attempt
    await expect(tx).to.emit(assessment, 'AssessorAddedToGroup').withArgs(newGroupId, 30);
    await expect(tx).to.emit(assessment, 'AssessorAddedToGroup').withArgs(newGroupId, 31);
  });

  it('should handle adding same assessor to same group twice', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    const assessorId = 35;
    const initialCount = await assessment.getGroupAssessorCount(ASSESSOR_GROUP_ID);

    // Add assessor first time
    await assessment.connect(governanceAccount).addAssessorsToGroup([assessorId], ASSESSOR_GROUP_ID);

    const countAfterFirst = await assessment.getGroupAssessorCount(ASSESSOR_GROUP_ID);
    expect(countAfterFirst.toNumber()).to.equal(initialCount.toNumber() + 1);
    expect(await assessment.isAssessorInGroup(assessorId, ASSESSOR_GROUP_ID)).to.be.true;

    // Add same assessor again - should not increase count (EnumerableSet handles duplicates)
    const tx = await assessment.connect(governanceAccount).addAssessorsToGroup([assessorId], ASSESSOR_GROUP_ID);

    const finalCount = await assessment.getGroupAssessorCount(ASSESSOR_GROUP_ID);
    expect(finalCount.toNumber()).to.equal(countAfterFirst.toNumber()); // No change
    expect(await assessment.isAssessorInGroup(assessorId, ASSESSOR_GROUP_ID)).to.be.true;

    // Event should still be emitted
    await expect(tx).to.emit(assessment, 'AssessorAddedToGroup').withArgs(ASSESSOR_GROUP_ID, assessorId);
  });

  it('should update groupsForAssessor mapping correctly', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    const assessorId = 40;

    // Add assessor to first group
    await assessment.connect(governanceAccount).addAssessorsToGroup([assessorId], 0);
    const firstGroupId = await assessment.getGroupsCount();

    // Add same assessor to second group
    await assessment.connect(governanceAccount).addAssessorsToGroup([assessorId], 0);
    const secondGroupId = await assessment.getGroupsCount();

    // Verify assessor is in both groups
    const assessorGroups = await assessment.getGroupsForAssessor(assessorId);
    expect(assessorGroups.length).to.equal(2);
    const assessorGroupsSet = new Set(assessorGroups.map(id => id.toNumber()));
    expect(assessorGroupsSet.has(firstGroupId.toNumber())).to.be.true;
    expect(assessorGroupsSet.has(secondGroupId.toNumber())).to.be.true;

    expect(await assessment.isAssessorInGroup(assessorId, firstGroupId)).to.be.true;
    expect(await assessment.isAssessorInGroup(assessorId, secondGroupId)).to.be.true;
  });

  it('should handle large batch of assessors', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    // Create array of 50 assessor IDs
    const largeAssessorBatch = Array.from({ length: 50 }, (_, i) => i + 100);

    const tx = await assessment.connect(governanceAccount).addAssessorsToGroup(largeAssessorBatch, 0);

    const newGroupId = await assessment.getGroupsCount();
    const groupAssessors = await assessment.getGroupAssessors(newGroupId);

    expect(groupAssessors.length).to.equal(largeAssessorBatch.length);

    // Verify all assessors were added and events emitted
    const groupAssessorsSet = new Set(groupAssessors.map(id => id.toNumber()));
    for (const assessorId of largeAssessorBatch) {
      expect(groupAssessorsSet.has(assessorId)).to.be.true;
      expect(await assessment.isAssessorInGroup(assessorId, newGroupId)).to.be.true;
      await expect(tx).to.emit(assessment, 'AssessorAddedToGroup').withArgs(newGroupId, assessorId);
    }
  });
});
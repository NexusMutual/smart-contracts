const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

describe('getGroupAssessorCount', function () {
  it('should return zero for non-existent group', async function () {
    const { contracts } = await loadFixture(setup);
    const { assessment } = contracts;

    const nonExistentGroupId = 999;
    const count = await assessment.getGroupAssessorCount(nonExistentGroupId);

    expect(count).to.equal(0);
  });

  it('should return zero for group ID zero', async function () {
    const { contracts } = await loadFixture(setup);
    const { assessment } = contracts;

    const count = await assessment.getGroupAssessorCount(0);

    expect(count).to.equal(0);
  });

  it('should return correct count after adding assessors to new group', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    const newAssessorIds = [100n, 101n, 102n];

    // Add assessors to new group
    await assessment.connect(governanceAccount).addAssessorsToGroup(newAssessorIds, 0);
    const newGroupId = await assessment.getGroupsCount();

    const count = await assessment.getGroupAssessorCount(newGroupId);

    expect(count).to.equal(newAssessorIds.length);
  });

  it('should return correct count for existing group', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;

    const count = await assessment.getGroupAssessorCount(ASSESSOR_GROUP_ID);
    expect(count).to.equal(accounts.assessors.length);
  });

  it('should update count correctly after removing assessor', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;
    const [assessor] = accounts.assessors;

    const assessorAddress = await assessor.getAddress();
    const assessorMemberId = await registry.getMemberId(assessorAddress);
    const initialCount = await assessment.getGroupAssessorCount(ASSESSOR_GROUP_ID);

    // Remove assessor
    await assessment.connect(governanceAccount).removeAssessorFromGroup(assessorMemberId, ASSESSOR_GROUP_ID);

    const finalCount = await assessment.getGroupAssessorCount(ASSESSOR_GROUP_ID);
    expect(finalCount).to.equal(initialCount - 1n);
  });

  it('should handle empty group', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    // Create empty group
    await assessment.connect(governanceAccount).addAssessorsToGroup([], 0);
    const emptyGroupId = await assessment.getGroupsCount();

    const count = await assessment.getGroupAssessorCount(emptyGroupId);

    expect(count).to.equal(0);
  });

  it('should handle duplicate assessor additions correctly', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    const assessorId = 200n;

    // Add assessor to new group
    await assessment.connect(governanceAccount).addAssessorsToGroup([assessorId], 0);
    const groupId = await assessment.getGroupsCount();

    const countAfterFirst = await assessment.getGroupAssessorCount(groupId);
    expect(countAfterFirst).to.equal(1);

    // Add same assessor again
    await assessment.connect(governanceAccount).addAssessorsToGroup([assessorId], groupId);

    const countAfterSecond = await assessment.getGroupAssessorCount(groupId);
    expect(countAfterSecond).to.equal(1); // Should still be 1
  });

  it('should return correct count for large group', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    // Create array of 50 assessor IDs
    const largeAssessorBatch = Array.from({ length: 50 }, (_, i) => i + 300);

    await assessment.connect(governanceAccount).addAssessorsToGroup(largeAssessorBatch, 0);
    const largeGroupId = await assessment.getGroupsCount();

    const count = await assessment.getGroupAssessorCount(largeGroupId);

    expect(count).to.equal(largeAssessorBatch.length);
  });

  it('should handle adding assessor to multiple groups', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    const assessorId = 200n;

    await Promise.all([
      assessment.connect(governanceAccount).addAssessorsToGroup([assessorId], 0),
      assessment.connect(governanceAccount).addAssessorsToGroup([assessorId], 0),
    ]);
    // Get both group IDs in parallel
    const [firstGroupId, secondGroupId] = await Promise.all([assessment.getGroupsCount(), assessment.getGroupsCount()]);

    const [firstGroupCount, secondGroupCount] = await Promise.all([
      assessment.getGroupAssessorCount(firstGroupId),
      assessment.getGroupAssessorCount(secondGroupId),
    ]);

    expect(firstGroupCount).to.equal(1);
    expect(secondGroupCount).to.equal(1);
  });
});

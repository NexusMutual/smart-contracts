const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

describe('addAssessorsToGroup', function () {
  it('should revert when called by non-governor contract', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [assessor] = accounts.assessors;

    const addAssessorsToGroup = assessment.connect(assessor).addAssessorsToGroup([1n, 2n], 1n);
    await expect(addAssessorsToGroup).to.be.revertedWithCustomError(assessment, 'Unauthorized');
  });

  it('should revert when assessor member ID is zero', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    const addAssessorsToGroup = assessment.connect(governanceAccount).addAssessorsToGroup([0n], 1n);
    await expect(addAssessorsToGroup).to.be.revertedWithCustomError(assessment, 'InvalidMemberId');
  });

  it('should revert when groupId is invalid (greater than group count)', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    const currentGroupCount = await assessment.getGroupsCount();
    const invalidGroupId = currentGroupCount + 1n;

    const addAssessorsToGroup = assessment.connect(governanceAccount).addAssessorsToGroup([1n, 2n], invalidGroupId);
    await expect(addAssessorsToGroup).to.be.revertedWithCustomError(assessment, 'InvalidGroupId');
  });

  it('should add assessors to a new group', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    const newAssessorIds = [10n, 11n, 12n];

    // Add assessors to new group (groupId = 0 creates new group)
    await assessment.connect(governanceAccount).addAssessorsToGroup(newAssessorIds, 0n);
    const newGroupId = await assessment.getGroupsCount();

    // Verify group was created
    expect(newGroupId).to.be.greaterThan(0);

    // Verify assessors were added
    const groupAssessors = await assessment.getGroupAssessors(newGroupId);
    expect(groupAssessors.length).to.equal(newAssessorIds.length);
    const groupAssessorSet = new Set(groupAssessors);
    for (const assessorId of newAssessorIds) {
      expect(groupAssessorSet.has(assessorId)).to.be.true;
    }

    // Verify assessors are in the group
    await Promise.all(
      newAssessorIds.map(async assessorId => {
        expect(await assessment.isAssessorInGroup(assessorId, newGroupId)).to.be.true;
      }),
    );
  });

  it('should add assessors to an existing group', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    const newAssessorIds = [20n, 21n];

    // Get initial group size
    const initialAssessors = await assessment.getGroupAssessors(ASSESSOR_GROUP_ID);
    const initialCount = initialAssessors.length;

    // Add assessors to existing group
    await assessment.connect(governanceAccount).addAssessorsToGroup(newAssessorIds, ASSESSOR_GROUP_ID);

    // Verify assessors were added
    const finalAssessors = await assessment.getGroupAssessors(ASSESSOR_GROUP_ID);
    expect(finalAssessors.length).to.equal(initialCount + newAssessorIds.length);

    // Verify new assessors are in the group
    const finalAssessorSet = new Set(finalAssessors);
    await Promise.all(
      newAssessorIds.map(async assessorId => {
        expect(finalAssessorSet.has(assessorId)).to.be.true;
        expect(await assessment.isAssessorInGroup(assessorId, ASSESSOR_GROUP_ID)).to.be.true;
      }),
    );
  });

  it('should handle single assessor addition', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    const singleAssessorId = [25n];

    // Add single assessor to new group
    await assessment.connect(governanceAccount).addAssessorsToGroup(singleAssessorId, 0n);
    const newGroupId = await assessment.getGroupsCount();

    const groupAssessors = await assessment.getGroupAssessors(newGroupId);
    expect(groupAssessors.length).to.equal(1);
    expect(groupAssessors[0]).to.equal(singleAssessorId[0]);
    expect(await assessment.isAssessorInGroup(singleAssessorId[0], newGroupId)).to.be.true;
  });

  it('should handle duplicate assessor IDs by adding each once', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    const duplicateAssessorIds = [30n, 31n, 30n]; // 30 appears twice

    // Add assessors with duplicates to new group
    await assessment.connect(governanceAccount).addAssessorsToGroup(duplicateAssessorIds, 0n);
    const newGroupId = await assessment.getGroupsCount();

    const groupAssessors = await assessment.getGroupAssessors(newGroupId);
    expect(groupAssessors.length).to.equal(2); // Should only have 2 unique assessors

    const groupAssessorSet = new Set(groupAssessors);
    expect(groupAssessorSet.has(30n)).to.be.true;
    expect(groupAssessorSet.has(31n)).to.be.true;
  });

  it('should handle adding assessor that is already in the group', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    const assessorId = 35n;

    // Add assessor to new group
    await assessment.connect(governanceAccount).addAssessorsToGroup([assessorId], 0n);
    const newGroupId = await assessment.getGroupsCount();

    // Verify assessor is in group
    let groupAssessors = await assessment.getGroupAssessors(newGroupId);
    expect(groupAssessors.length).to.equal(1);
    expect(groupAssessors[0]).to.equal(assessorId);

    // Add same assessor again
    await assessment.connect(governanceAccount).addAssessorsToGroup([assessorId], newGroupId);

    // Verify assessor is still only in group once
    groupAssessors = await assessment.getGroupAssessors(newGroupId);
    expect(groupAssessors.length).to.equal(1);
    expect(groupAssessors[0]).to.equal(assessorId);
  });

  it('should handle adding assessor to multiple groups', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    const assessorId = 40n;

    // Add assessor to first group
    await assessment.connect(governanceAccount).addAssessorsToGroup([assessorId], 0n);
    const firstGroupId = await assessment.getGroupsCount();

    // Add assessor to second group
    await assessment.connect(governanceAccount).addAssessorsToGroup([assessorId], 0n);
    const secondGroupId = await assessment.getGroupsCount();

    // Verify assessor is in both groups
    await Promise.all([
      expect(await assessment.isAssessorInGroup(assessorId, firstGroupId)).to.be.true,
      expect(await assessment.isAssessorInGroup(assessorId, secondGroupId)).to.be.true,
    ]);

    // Verify assessor's groups
    const assessorGroups = await assessment.getGroupsForAssessor(assessorId);
    expect(assessorGroups.length).to.equal(2);
    const assessorGroupSet = new Set(assessorGroups);
    expect(assessorGroupSet.has(firstGroupId)).to.be.true;
    expect(assessorGroupSet.has(secondGroupId)).to.be.true;
  });

  it('should handle large batch of assessors', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    // Create array of 50 assessor IDs
    const largeAssessorBatch = Array.from({ length: 50 }, (_, i) => BigInt(i) + 100n);

    const tx = await assessment.connect(governanceAccount).addAssessorsToGroup(largeAssessorBatch, 0n);

    const newGroupId = await assessment.getGroupsCount();
    const groupAssessors = await assessment.getGroupAssessors(newGroupId);

    expect(groupAssessors.length).to.equal(largeAssessorBatch.length);

    // Verify all assessors were added and events emitted
    const groupAssessorsSet = new Set(groupAssessors.map(id => id.toString()));
    await Promise.all(
      largeAssessorBatch.map(async assessorId => {
        expect(groupAssessorsSet.has(assessorId.toString())).to.be.true;
        expect(await assessment.isAssessorInGroup(assessorId, newGroupId)).to.be.true;
        await expect(tx).to.emit(assessment, 'AssessorAddedToGroup').withArgs(newGroupId, assessorId);
      }),
    );
  });
});

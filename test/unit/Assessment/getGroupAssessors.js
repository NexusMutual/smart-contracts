const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

describe('getGroupAssessors', function () {
  it('should return assessors for existing group', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;

    const assessors = await assessment.getGroupAssessors(ASSESSOR_GROUP_ID);
    expect(assessors).to.have.lengthOf(accounts.assessors.length);

    // Verify all assessors memberId are valid (non-zero)
    for (const assessor of assessors) {
      expect(assessor).to.be.gt(0);
    }
  });

  it('should return empty array for non-existent group IDs', async function () {
    const { contracts } = await loadFixture(setup);
    const { assessment } = contracts;

    const nonExistentGroupIds = [0, 999];

    for (const groupId of nonExistentGroupIds) {
      const assessors = await assessment.getGroupAssessors(groupId);
      expect(assessors.length).to.equal(0);
    }
  });

  it('should return correct assessors after adding to new group', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    const newAssessorIds = [100, 101, 102];

    // Create new group and add assessors
    await assessment.connect(governanceAccount).addAssessorsToGroup(newAssessorIds, 0);
    const newGroupId = await assessment.getGroupsCount();

    const assessors = await assessment.getGroupAssessors(newGroupId);
    const assessorNumbers = new Set(assessors.map(id => id.toNumber()));

    expect(assessors).to.have.lengthOf(newAssessorIds.length);
    for (const assessorId of newAssessorIds) {
      expect(assessorNumbers.has(assessorId)).to.be.true;
    }
  });

  it('should return updated assessors after removal', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;
    const [assessor] = accounts.assessors;

    const assessorMemberId = await registry.getMemberId(assessor.address);
    const initialAssessors = await assessment.getGroupAssessors(ASSESSOR_GROUP_ID);

    // Remove assessor
    await assessment.connect(governanceAccount).removeAssessorFromGroup(assessorMemberId, ASSESSOR_GROUP_ID);

    const finalAssessors = await assessment.getGroupAssessors(ASSESSOR_GROUP_ID);
    const finalAssessorNumbers = new Set(finalAssessors.map(id => id.toNumber()));

    expect(finalAssessors).to.have.lengthOf(initialAssessors.length - 1);
    expect(finalAssessorNumbers.has(assessorMemberId.toNumber())).to.be.false;
  });

  it('should handle empty group correctly', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    // Create empty group
    await assessment.connect(governanceAccount).addAssessorsToGroup([], 0);
    const emptyGroupId = await assessment.getGroupsCount();

    const assessors = await assessment.getGroupAssessors(emptyGroupId);

    expect(assessors.length).to.equal(0);
  });

  it('should handle duplicate assessor additions correctly', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    const assessorId = 200;

    // Add assessor to new group
    await assessment.connect(governanceAccount).addAssessorsToGroup([assessorId], 0);
    const groupId = await assessment.getGroupsCount();

    const assessorsAfterFirst = await assessment.getGroupAssessors(groupId);
    const assessorsAfterFirstNumbers = new Set(assessorsAfterFirst.map(id => id.toNumber()));

    expect(assessorsAfterFirst).to.have.lengthOf(1);
    expect(assessorsAfterFirstNumbers.has(assessorId)).to.be.true;

    // Add same assessor again (EnumerableSet handles duplicates)
    await assessment.connect(governanceAccount).addAssessorsToGroup([assessorId], groupId);

    const assessorsAfterSecond = await assessment.getGroupAssessors(groupId);
    const assessorsAfterSecondNumbers = new Set(assessorsAfterSecond.map(id => id.toNumber()));

    expect(assessorsAfterSecond).to.have.lengthOf(1); // Should still be 1
    expect(assessorsAfterSecondNumbers.has(assessorId)).to.be.true;
  });

  it('should handle large group correctly', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    // Create array of 50 assessor IDs
    const largeAssessorBatch = Array.from({ length: 50 }, (_, i) => i + 400);

    await assessment.connect(governanceAccount).addAssessorsToGroup(largeAssessorBatch, 0);
    const largeGroupId = await assessment.getGroupsCount();

    const assessors = await assessment.getGroupAssessors(largeGroupId);
    const assessorNumbers = new Set(assessors.map(id => id.toNumber()));

    expect(assessors.length).to.equal(largeAssessorBatch.length);
    for (const assessorId of largeAssessorBatch) {
      expect(assessorNumbers.has(assessorId)).to.be.true;
    }
  });

  it('should work correctly with multiple groups', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    const group1Assessors = [500, 501];
    const group2Assessors = [502, 503];
    const sharedAssessor = 504;

    // Create first and second group
    await Promise.all([
      assessment.connect(governanceAccount).addAssessorsToGroup(group1Assessors, 0),
      assessment.connect(governanceAccount).addAssessorsToGroup(group2Assessors, 0),
    ]);

    const group1Id = (await assessment.getGroupsCount()) - 1; // Second to last group
    const group2Id = await assessment.getGroupsCount(); // Last group

    // Add shared assessor to both groups
    await Promise.all([
      assessment.connect(governanceAccount).addAssessorsToGroup([sharedAssessor], group1Id),
      assessment.connect(governanceAccount).addAssessorsToGroup([sharedAssessor], group2Id),
    ]);

    // Verify group 1 assessors
    const group1Result = await assessment.getGroupAssessors(group1Id);
    const group1Numbers = new Set(group1Result.map(id => id.toNumber()));

    expect(group1Result.length).to.equal(group1Assessors.length + 1);
    for (const assessorId of group1Assessors) {
      expect(group1Numbers.has(assessorId)).to.be.true;
    }
    expect(group1Numbers.has(sharedAssessor)).to.be.true;

    // Verify group 2 assessors
    const group2Result = await assessment.getGroupAssessors(group2Id);
    const group2Numbers = new Set(group2Result.map(id => id.toNumber()));

    expect(group2Result.length).to.equal(group2Assessors.length + 1);
    for (const assessorId of group2Assessors) {
      expect(group2Numbers.has(assessorId)).to.be.true;
    }
    expect(group2Numbers.has(sharedAssessor)).to.be.true;
  });
});
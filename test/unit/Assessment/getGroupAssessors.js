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

    const newAssessorIds = [100n, 101n, 102n];

    // Create new group and add assessors
    await assessment.connect(governanceAccount).addAssessorsToGroup(newAssessorIds, 0);
    const newGroupId = await assessment.getGroupsCount();

    const assessors = await assessment.getGroupAssessors(newGroupId);
    const assessorSet = new Set(assessors);

    expect(assessors).to.have.lengthOf(newAssessorIds.length);
    for (const assessorId of newAssessorIds) {
      expect(assessorSet.has(assessorId)).to.be.true;
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
    const finalAssessorSet = new Set(finalAssessors);

    expect(finalAssessors).to.have.lengthOf(initialAssessors.length - 1);
    expect(finalAssessorSet.has(assessorMemberId)).to.be.false;
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

    const assessorId = 200n;

    // Add assessor to new group
    await assessment.connect(governanceAccount).addAssessorsToGroup([assessorId], 0);
    const groupId = await assessment.getGroupsCount();

    const assessorsAfterFirst = await assessment.getGroupAssessors(groupId);
    const assessorsAfterFirstSet = new Set(assessorsAfterFirst);

    expect(assessorsAfterFirst).to.have.lengthOf(1);
    expect(assessorsAfterFirstSet.has(assessorId)).to.be.true;

    // Add same assessor again (EnumerableSet handles duplicates)
    await assessment.connect(governanceAccount).addAssessorsToGroup([assessorId], groupId);

    const assessorsAfterSecond = await assessment.getGroupAssessors(groupId);
    const assessorsAfterSecondSet = new Set(assessorsAfterSecond);

    expect(assessorsAfterSecond).to.have.lengthOf(1); // Should still be 1
    expect(assessorsAfterSecondSet.has(assessorId)).to.be.true;
  });

  it('should handle large group correctly', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    // Create array of 50 assessor IDs
    const largeAssessorBatch = Array.from({ length: 50 }, (_, i) => BigInt(i + 400));

    await assessment.connect(governanceAccount).addAssessorsToGroup(largeAssessorBatch, 0);
    const largeGroupId = await assessment.getGroupsCount();

    const assessors = await assessment.getGroupAssessors(largeGroupId);
    const assessorSet = new Set(assessors);

    expect(assessors.length).to.equal(largeAssessorBatch.length);
    for (const assessorId of largeAssessorBatch) {
      expect(assessorSet.has(assessorId)).to.be.true;
    }
  });

  it('should work correctly with multiple groups', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    const group1Assessors = [500n, 501n];
    const group2Assessors = [502n, 503n];
    const sharedAssessor = 504n;

    // create first group
    await assessment.connect(governanceAccount).addAssessorsToGroup(group1Assessors, 0n);
    const group1Id = await assessment.getGroupsCount();

    // create second group
    await assessment.connect(governanceAccount).addAssessorsToGroup(group2Assessors, 0n);
    const group2Id = await assessment.getGroupsCount();

    // add shared assessor to both groups
    await assessment.connect(governanceAccount).addAssessorsToGroup([sharedAssessor], group1Id);
    await assessment.connect(governanceAccount).addAssessorsToGroup([sharedAssessor], group2Id);

    // Verify group 1 assessors
    const group1Result = await assessment.getGroupAssessors(group1Id);
    const group1Set = new Set(group1Result);

    const group1WithSharedAssessor = [...group1Assessors, sharedAssessor];
    expect(group1Result).to.have.lengthOf(group1WithSharedAssessor.length);
    group1WithSharedAssessor.forEach(assessorId => expect(group1Set.has(assessorId)).to.be.true);

    // Verify group 2 assessors
    const group2Result = await assessment.getGroupAssessors(group2Id);
    const group2Set = new Set(group2Result);

    const group2WithSharedAssessor = [...group2Assessors, sharedAssessor];
    expect(group2Result).to.have.lengthOf(group2WithSharedAssessor.length);
    group2WithSharedAssessor.forEach(assessorId => expect(group2Set.has(assessorId)).to.be.true);
  });
});

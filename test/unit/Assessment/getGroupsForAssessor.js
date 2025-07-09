const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

describe('getGroupsForAssessor', function () {
  it('should return empty array for assessor not in any group', async function () {
    const { contracts } = await loadFixture(setup);
    const { assessment } = contracts;

    const nonExistentAssessorId = 999;
    const groups = await assessment.getGroupsForAssessor(nonExistentAssessorId);

    expect(groups.length).to.equal(0);
  });

  it('should return empty array for zero member ID', async function () {
    const { contracts } = await loadFixture(setup);
    const { assessment } = contracts;

    const groups = await assessment.getGroupsForAssessor(0);

    expect(groups.length).to.equal(0);
  });

  it('should return groups for assessor', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [assessor] = accounts.assessors;

    const assessorMemberId = await registry.getMemberId(assessor.address);
    const groups = await assessment.getGroupsForAssessor(assessorMemberId);

    expect(groups.length).to.equal(1);
    expect(groups[0]).to.equal(ASSESSOR_GROUP_ID);
  });

  it('should return multiple groups for assessor in multiple groups', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    const assessorId = 200;

    // Add assessor to first group
    await assessment.connect(governanceAccount).addAssessorsToGroup([assessorId], 0);
    const firstGroupId = await assessment.getGroupsCount();

    // Add assessor to second group
    await assessment.connect(governanceAccount).addAssessorsToGroup([assessorId], 0);
    const secondGroupId = await assessment.getGroupsCount();

    // Add assessor to third group
    await assessment.connect(governanceAccount).addAssessorsToGroup([assessorId], 0);
    const thirdGroupId = await assessment.getGroupsCount();

    const groups = await assessment.getGroupsForAssessor(assessorId);

    expect(groups.length).to.equal(3);
    expect(groups.map(id => id.toNumber())).to.include(firstGroupId.toNumber());
    expect(groups.map(id => id.toNumber())).to.include(secondGroupId.toNumber());
    expect(groups.map(id => id.toNumber())).to.include(thirdGroupId.toNumber());
  });

  it('should return correct groups after adding to existing group', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    const assessorId = 201;

    // Initially not in any groups
    const initialGroups = await assessment.getGroupsForAssessor(assessorId);
    expect(initialGroups.length).to.equal(0);

    // Add to existing group
    await assessment.connect(governanceAccount).addAssessorsToGroup([assessorId], ASSESSOR_GROUP_ID);

    const updatedGroups = await assessment.getGroupsForAssessor(assessorId);
    expect(updatedGroups.length).to.equal(1);
    expect(updatedGroups[0]).to.equal(ASSESSOR_GROUP_ID);
  });

  it('should handle assessor added to same group multiple times', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    const assessorId = 202;

    // Add to new group
    await assessment.connect(governanceAccount).addAssessorsToGroup([assessorId], 0);
    const groupId = await assessment.getGroupsCount();

    // Add to same group again (should not duplicate)
    await assessment.connect(governanceAccount).addAssessorsToGroup([assessorId], groupId);

    const groups = await assessment.getGroupsForAssessor(assessorId);
    expect(groups.length).to.equal(1);
    expect(groups[0]).to.equal(groupId);
  });

  it('should work correctly with different assessors', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    const assessor1Id = 204;
    const assessor2Id = 205;

    // Add assessor1 to group A
    await assessment.connect(governanceAccount).addAssessorsToGroup([assessor1Id], 0);
    const groupA = await assessment.getGroupsCount();

    // Add assessor2 to group B
    await assessment.connect(governanceAccount).addAssessorsToGroup([assessor2Id], 0);
    const groupB = await assessment.getGroupsCount();

    // Add both assessors to group C
    await assessment.connect(governanceAccount).addAssessorsToGroup([assessor1Id, assessor2Id], 0);
    const groupC = await assessment.getGroupsCount();

    // Verify assessor1's groups
    const groups1 = await assessment.getGroupsForAssessor(assessor1Id);
    const groups1Numbers = new Set(groups1.map(id => id.toNumber()));

    expect(groups1.length).to.equal(2);
    expect(groups1Numbers.has(groupA.toNumber())).to.be.true;
    expect(groups1Numbers.has(groupC.toNumber())).to.be.true;
    expect(groups1Numbers.has(groupB.toNumber())).to.be.false;

    // Verify assessor2's groups
    const groups2 = await assessment.getGroupsForAssessor(assessor2Id);
    const groups2Numbers = new Set(groups2.map(id => id.toNumber()));

    expect(groups2.length).to.equal(2);
    expect(groups2Numbers.has(groupB.toNumber())).to.be.true;
    expect(groups2Numbers.has(groupC.toNumber())).to.be.true;
    expect(groups2Numbers.has(groupA.toNumber())).to.be.false;
  });
});

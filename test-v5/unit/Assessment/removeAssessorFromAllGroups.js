const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

describe('removeAssessorFromAllGroups', function () {
  it('should revert if not called by governor', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [nonGovernor] = accounts.nonMembers;

    const removeAssessorFromAllGroups = assessment.connect(nonGovernor).removeAssessorFromAllGroups(1);
    await expect(removeAssessorFromAllGroups).to.be.revertedWithCustomError(assessment, 'Unauthorized');
  });

  it('should revert for invalid member ID (zero)', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [govAccount] = accounts.governanceContracts;

    const invalidMemberId = 0;
    const removeAssessorFromAllGroups = assessment.connect(govAccount).removeAssessorFromAllGroups(invalidMemberId);
    await expect(removeAssessorFromAllGroups).to.be.revertedWithCustomError(assessment, 'InvalidMemberId');
  });

  it('should handle assessor not in any groups gracefully', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const [governanceAccount] = accounts.governanceContracts;
    const [nonAssessor] = accounts.members;

    const memberId = await registry.getMemberId(nonAssessor.address);

    // Should not revert even if assessor is not in any groups
    await expect(assessment.connect(governanceAccount).removeAssessorFromAllGroups(memberId)).to.not.be.reverted;

    // Verify assessor still has no groups
    const groups = await assessment.getGroupsForAssessor(memberId);
    expect(groups).to.deep.equal([]);
  });

  it('should remove assessor from single and multiple groups', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const [governanceAccount] = accounts.governanceContracts;
    const [assessor] = accounts.members;

    const assessorId = await registry.getMemberId(assessor.address);

    const testCases = [
      { description: 'single group', groupIds: [1] },
      { description: 'multiple groups', groupIds: [1, 2, 3] },
    ];

    for (const testCase of testCases) {
      const { groupIds } = testCase;

      // Add assessor to groups
      for (const groupId of groupIds) {
        await assessment.connect(governanceAccount).addAssessorsToGroup([assessorId], groupId);
      }

      // Verify assessor is in all groups
      for (const groupId of groupIds) {
        expect(await assessment.isAssessorInGroup(assessorId, groupId)).to.be.true;
      }
      const assessorGroups = await assessment.getGroupsForAssessor(assessorId);
      expect(assessorGroups.map(g => g.toNumber()).sort()).to.deep.equal(groupIds);

      // Remove assessor from all groups
      const tx = await assessment.connect(governanceAccount).removeAssessorFromAllGroups(assessorId);

      // Verify assessor is removed from all groups
      for (const groupId of groupIds) {
        expect(await assessment.isAssessorInGroup(assessorId, groupId)).to.be.false;
      }
      expect(await assessment.getGroupsForAssessor(assessorId)).to.deep.equal([]);

      // Verify groups no longer contain assessor
      for (const groupId of groupIds) {
        const groupAssessors = await assessment.getGroupAssessors(groupId);
        expect(groupAssessors).to.not.include(assessorId);
      }

      // Verify events emitted for each group
      for (const groupId of groupIds) {
        await expect(tx).to.emit(assessment, 'AssessorRemovedFromGroup').withArgs(groupId, assessorId);
      }
    }
  });

  it('should not affect other assessors in the same groups', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const [governanceAccount] = accounts.governanceContracts;
    const [assessor1, assessor2, assessor3] = accounts.members;

    const [assessorId1, assessorId2, assessorId3] = await Promise.all([
      registry.getMemberId(assessor1.address),
      registry.getMemberId(assessor2.address),
      registry.getMemberId(assessor3.address),
    ]);

    const groupIds = [1, 2];

    // Add all assessors to both groups
    for (const groupId of groupIds) {
      await assessment.connect(governanceAccount).addAssessorsToGroup([assessorId1, assessorId2, assessorId3], groupId);
    }

    // Remove only assessor1 from all groups
    await assessment.connect(governanceAccount).removeAssessorFromAllGroups(assessorId1);

    // Verify assessor1 is removed from all groups
    for (const groupId of groupIds) {
      expect(await assessment.isAssessorInGroup(assessorId1, groupId)).to.be.false;
    }
    expect(await assessment.getGroupsForAssessor(assessorId1)).to.deep.equal([]);

    // Verify other assessors remain in groups
    for (const groupId of groupIds) {
      expect(await assessment.isAssessorInGroup(assessorId2, groupId)).to.be.true;
      expect(await assessment.isAssessorInGroup(assessorId3, groupId)).to.be.true;

      const groupAssessors = await assessment.getGroupAssessors(groupId);
      const groupAssessorNumbers = new Set(groupAssessors.map(id => id.toNumber()));

      expect(groupAssessorNumbers.has(assessorId1.toNumber())).to.be.false;
      expect(groupAssessorNumbers.has(assessorId2.toNumber())).to.be.true;
      expect(groupAssessorNumbers.has(assessorId3.toNumber())).to.be.true;
    }

    // Verify other assessors' group memberships are intact
    const assessor2Groups = await assessment.getGroupsForAssessor(assessorId2);
    const assessor3Groups = await assessment.getGroupsForAssessor(assessorId3);
    expect(assessor2Groups.map(g => g.toNumber()).sort()).to.deep.equal(groupIds);
    expect(assessor3Groups.map(g => g.toNumber()).sort()).to.deep.equal(groupIds);
  });
});

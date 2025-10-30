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
      { description: 'single group', groupIds: [1n] },
      { description: 'multiple groups', groupIds: [1n, 2n, 3n] },
    ];

    for (const testCase of testCases) {
      const { groupIds } = testCase;

      // Add assessor to groups
      await Promise.all(
        groupIds.map(groupId => {
          groupId = groupId > 1 ? 0 : groupId; // groupId 2 and 3 does not exist yet so use groupId 0 to create new one
          return assessment.connect(governanceAccount).addAssessorsToGroup([assessorId], groupId);
        }),
      );

      // Verify assessor is in all groups
      await Promise.all(
        groupIds.map(async groupId => {
          const isInGroup = await assessment.isAssessorInGroup(assessorId, groupId);
          expect(isInGroup).to.be.true;
        }),
      );

      const assessorGroups = await assessment.getGroupsForAssessor(assessorId);
      expect([...assessorGroups].sort()).to.deep.equal(groupIds);
      // Remove assessor from all groups
      const tx = await assessment.connect(governanceAccount).removeAssessorFromAllGroups(assessorId);

      // Verify assessor is removed from all groups
      await Promise.all(
        groupIds.map(async groupId => {
          const isInGroup = await assessment.isAssessorInGroup(assessorId, groupId);
          expect(isInGroup).to.be.false;
        }),
      );
      expect(await assessment.getGroupsForAssessor(assessorId)).to.deep.equal([]);

      // Verify groups no longer contain assessor
      await Promise.all(
        groupIds.map(async groupId => {
          const groupAssessors = await assessment.getGroupAssessors(groupId);
          expect(groupAssessors).to.not.include(assessorId);
        }),
      );

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

    const assessorIds = await Promise.all([
      registry.getMemberId(assessor1.address),
      registry.getMemberId(assessor2.address),
      registry.getMemberId(assessor3.address),
    ]);
    const [assessorId1, assessorId2, assessorId3] = assessorIds;

    const groupIds = [1n, 2n];

    // Add all assessors to both groups
    await Promise.all(
      groupIds.map(groupId => {
        groupId = groupId > 1 ? 0 : groupId; // groupId 2 and 3 does not exist yet so use groupId 0 to create new one
        return assessment.connect(governanceAccount).addAssessorsToGroup(assessorIds, groupId);
      }),
    );

    // Remove only assessor1 from all groups
    await assessment.connect(governanceAccount).removeAssessorFromAllGroups(assessorId1);

    // Verify assessor1 is removed from all groups
    await Promise.all(
      groupIds.map(async groupId => {
        const isInGroup = await assessment.isAssessorInGroup(assessorId1, groupId);
        expect(isInGroup).to.be.false;
      }),
    );
    expect(await assessment.getGroupsForAssessor(assessorId1)).to.deep.equal([]);

    // Verify other assessors remain in groups
    await Promise.all(
      groupIds.map(async groupId => {
        const isAssessor2InGroup = await assessment.isAssessorInGroup(assessorId2, groupId);
        const isAssessor3InGroup = await assessment.isAssessorInGroup(assessorId3, groupId);
        expect(isAssessor2InGroup).to.be.true;
        expect(isAssessor3InGroup).to.be.true;

        const groupAssessors = await assessment.getGroupAssessors(groupId);
        const groupAssessorNumbers = new Set(groupAssessors);
        expect(groupAssessorNumbers.has(assessorId1)).to.be.false;
        expect(groupAssessorNumbers.has(assessorId2)).to.be.true;
        expect(groupAssessorNumbers.has(assessorId3)).to.be.true;
      }),
    );

    // Verify other assessors' group memberships are intact
    const assessor2Groups = await assessment.getGroupsForAssessor(assessorId2);
    const assessor3Groups = await assessment.getGroupsForAssessor(assessorId3);
    expect([...assessor2Groups].sort()).to.deep.equal([...groupIds].sort());
    expect([...assessor3Groups].sort()).to.deep.equal([...groupIds].sort());
  });
});

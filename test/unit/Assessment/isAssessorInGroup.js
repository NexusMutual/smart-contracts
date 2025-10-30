const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

describe('isAssessorInGroup', function () {
  it('should return true for assessor in group', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [assessor] = accounts.assessors;

    const assessorAddress = await assessor.getAddress();
    const assessorMemberId = await registry.getMemberId(assessorAddress);
    const isInGroup = await assessment.isAssessorInGroup(assessorMemberId, ASSESSOR_GROUP_ID);

    expect(isInGroup).to.be.true;
  });

  it('should return false for non-existent assessor IDs', async function () {
    const { contracts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;

    const nonExistentAssessorIds = [0n, 999n];

    await Promise.all(
      nonExistentAssessorIds.map(async assessorId => {
        expect(await assessment.isAssessorInGroup(assessorId, ASSESSOR_GROUP_ID)).to.be.false;
      }),
    );
  });

  it('should return false for non-existent group IDs', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const [assessor] = accounts.assessors;

    const assessorAddress = await assessor.getAddress();
    const assessorMemberId = await registry.getMemberId(assessorAddress);
    const nonExistentGroupIds = [0, 999];

    await Promise.all(
      nonExistentGroupIds.map(async groupId => {
        expect(await assessment.isAssessorInGroup(assessorMemberId, groupId)).to.be.false;
      }),
    );
  });

  it('should return true after adding assessor to group', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    const newAssessorId = 100n;

    // Initially not in any group
    const isInGroupBefore = await assessment.isAssessorInGroup(newAssessorId, 1);
    expect(isInGroupBefore).to.be.false;

    // Add to new group
    await assessment.connect(governanceAccount).addAssessorsToGroup([newAssessorId], 0);
    const newGroupId = await assessment.getGroupsCount();

    // Now should be in the group
    const isInGroupAfter = await assessment.isAssessorInGroup(newAssessorId, newGroupId);
    expect(isInGroupAfter).to.be.true;

    // But still not in other groups
    const isInOtherGroup = await assessment.isAssessorInGroup(newAssessorId, 1);
    expect(isInOtherGroup).to.be.false;
  });

  it('should work correctly after removing assessor from group', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, registry } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;
    const [assessor] = accounts.assessors;

    const assessorAddress = await assessor.getAddress();
    const assessorMemberId = await registry.getMemberId(assessorAddress);

    // Initially should be in the group
    const isInGroupBefore = await assessment.isAssessorInGroup(assessorMemberId, ASSESSOR_GROUP_ID);
    expect(isInGroupBefore).to.be.true;

    // Remove from the group
    await assessment.connect(governanceAccount).removeAssessorFromGroup(assessorMemberId, ASSESSOR_GROUP_ID);

    // Now should not be in the group
    const isInGroupAfter = await assessment.isAssessorInGroup(assessorMemberId, ASSESSOR_GROUP_ID);
    expect(isInGroupAfter).to.be.false;
  });
});

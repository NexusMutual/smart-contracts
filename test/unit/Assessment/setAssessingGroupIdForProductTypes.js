const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

/**
 * Helper function to verify AssessingGroupForProductTypeSet events
 */
async function verifyAssessingGroupEvents(tx, assessment, productTypeIds, groupId) {
  const { logs } = await tx.wait();

  const events = logs.filter(log => {
    try {
      const { name } = assessment.interface.parseLog(log);
      return name === 'AssessingGroupForProductTypeSet';
    } catch {
      return false;
    }
  });

  expect(events).to.have.length(productTypeIds.length);

  // each productType should have its own event
  productTypeIds.forEach((productTypeId, i) => {
    const parsedEvent = assessment.interface.parseLog(events[i]);
    expect(parsedEvent.args[0]).to.equal(productTypeId);
    expect(parsedEvent.args[1]).to.equal(groupId);
  });
}

describe('setAssessingGroupIdForProductTypes', function () {
  it('should revert if not called by governor', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [nonGovernor] = accounts.nonMembers;

    const productTypeIds = [1, 2, 3];

    const setAssessingGroupIdForProductTypes = assessment
      .connect(nonGovernor)
      .setAssessingGroupIdForProductTypes(productTypeIds, ASSESSOR_GROUP_ID);

    await expect(setAssessingGroupIdForProductTypes).to.be.revertedWithCustomError(assessment, 'Unauthorized');
  });

  it('should revert when groupId is invalid (zero)', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    const productTypeIds = [70, 71];
    const invalidGroupId = 0;

    const setAssessingGroupIdForProductTypes = assessment
      .connect(governanceAccount)
      .setAssessingGroupIdForProductTypes(productTypeIds, invalidGroupId);

    await expect(setAssessingGroupIdForProductTypes).to.be.revertedWithCustomError(assessment, 'InvalidGroupId');
  });

  it('should revert when groupId exceeds group count', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    const productTypeIds = [72, 73];
    const currentGroupCount = await assessment.getGroupsCount();
    const invalidGroupId = currentGroupCount + 1n; // Exceeds current group count

    const setAssessingGroupIdForProductTypes = assessment
      .connect(governanceAccount)
      .setAssessingGroupIdForProductTypes(productTypeIds, invalidGroupId);

    await expect(setAssessingGroupIdForProductTypes).to.be.revertedWithCustomError(assessment, 'InvalidGroupId');
  });

  it('should set assessing group for multiple product types', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    const productTypeIds = [10, 11, 12, 13];

    const tx = await assessment
      .connect(governanceAccount)
      .setAssessingGroupIdForProductTypes(productTypeIds, ASSESSOR_GROUP_ID);

    // verify assessing group is set for all product types
    for (const productTypeId of productTypeIds) {
      const assignedGroupId = await assessment.getAssessingGroupIdForProductType(productTypeId);
      expect(assignedGroupId).to.equal(ASSESSOR_GROUP_ID);
    }

    await verifyAssessingGroupEvents(tx, assessment, productTypeIds, ASSESSOR_GROUP_ID);
  });

  it('should handle duplicate product type IDs in same call', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    const productTypeIds = [1, 2, 3, 2, 3]; // 2 and 3 are duplicates

    const tx = await assessment
      .connect(governanceAccount)
      .setAssessingGroupIdForProductTypes(productTypeIds, ASSESSOR_GROUP_ID);

    // verify assessing group is set for all product types
    for (const productTypeId of productTypeIds) {
      const assignedGroupId = await assessment.getAssessingGroupIdForProductType(productTypeId);
      expect(assignedGroupId).to.equal(ASSESSOR_GROUP_ID);
    }

    // should emit for each productTypeId, including duplicates
    await verifyAssessingGroupEvents(tx, assessment, productTypeIds, ASSESSOR_GROUP_ID);
  });

  it('should handle sequential updates to same product types', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    const productTypeIds = [1, 2, 3];
    const initialGroupId = ASSESSOR_GROUP_ID;

    // 2nd assessor group
    const assessorMemberIds = await Promise.all(
      accounts.assessors.slice(0, 3).map(a => contracts.registry.getMemberId(a.address)),
    );
    await assessment.connect(governanceAccount).addAssessorsToGroup(assessorMemberIds, 0); // 0 = new group
    const secondGroupId = await assessment.getGroupsCount();

    // set initial group
    await assessment.connect(governanceAccount).setAssessingGroupIdForProductTypes(productTypeIds, initialGroupId);

    for (const productTypeId of productTypeIds) {
      const assignedGroupId = await assessment.getAssessingGroupIdForProductType(productTypeId);
      expect(assignedGroupId).to.equal(initialGroupId);
    }

    // update to second group
    const tx = await assessment
      .connect(governanceAccount)
      .setAssessingGroupIdForProductTypes(productTypeIds, secondGroupId);

    for (const productTypeId of productTypeIds) {
      const assignedGroupId = await assessment.getAssessingGroupIdForProductType(productTypeId);
      expect(assignedGroupId).to.equal(secondGroupId);
    }

    await verifyAssessingGroupEvents(tx, assessment, productTypeIds, secondGroupId);
  });

  it('should set different groups for different product types', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    // create additional group 2 and 3
    const assessorMemberIds = await Promise.all(
      accounts.assessors.slice(0, 3).map(a => contracts.registry.getMemberId(a.address)),
    );

    await assessment.connect(governanceAccount).addAssessorsToGroup(assessorMemberIds, 0);
    await assessment.connect(governanceAccount).addAssessorsToGroup(assessorMemberIds, 0);

    const group1 = ASSESSOR_GROUP_ID;
    const group2 = group1 + 1n;
    const group3 = group1 + 2n;

    // set different groups for different product types
    await assessment.connect(governanceAccount).setAssessingGroupIdForProductTypes([1], group1);
    await assessment.connect(governanceAccount).setAssessingGroupIdForProductTypes([2], group2);
    await assessment.connect(governanceAccount).setAssessingGroupIdForProductTypes([3], group3);

    // Verify each product type has correct group
    expect(await assessment.getAssessingGroupIdForProductType(1)).to.equal(group1);
    expect(await assessment.getAssessingGroupIdForProductType(2)).to.equal(group2);
    expect(await assessment.getAssessingGroupIdForProductType(3)).to.equal(group3);
  });

  it('should handle empty product type array', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    const emptyProductTypeIds = [];

    // should not revert, no-op
    const tx = await assessment
      .connect(governanceAccount)
      .setAssessingGroupIdForProductTypes(emptyProductTypeIds, ASSESSOR_GROUP_ID);

    // should not emit any events
    const { logs } = await tx.wait();
    const events = logs.filter(log => assessment.interface.parseLog(log).name === 'AssessingGroupForProductTypeSet');
    expect(events).to.have.length(0);
  });
});

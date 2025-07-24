const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

describe('setAssessmentDataForProductTypes', function () {
  it('should revert if not called by governor', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [nonGovernor] = accounts.nonMembers;

    const productTypeIds = [1, 2, 3];
    const cooldownPeriod = 24 * 60 * 60; // 1 day

    const setAssessmentDataForProductTypes = assessment
      .connect(nonGovernor)
      .setAssessmentDataForProductTypes(productTypeIds, cooldownPeriod, ASSESSOR_GROUP_ID);

    await expect(setAssessmentDataForProductTypes).to.be.revertedWithCustomError(assessment, 'Unauthorized');
  });

  it('should set assessment data for multiple product types', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    const productTypeIds = [10, 11, 12, 13];
    const cooldownPeriod = 72 * 60 * 60; // 3 days

    const tx = await assessment
      .connect(governanceAccount)
      .setAssessmentDataForProductTypes(productTypeIds, cooldownPeriod, ASSESSOR_GROUP_ID);

    // Verify assessment data is set for all product types
    for (const productTypeId of productTypeIds) {
      const assessmentDataCooldown = await assessment.payoutCooldown(productTypeId);
      expect(assessmentDataCooldown).to.equal(cooldownPeriod);
    }

    // Verify event emission
    await expect(tx)
      .to.emit(assessment, 'AssessmentDataForProductTypesSet')
      .withArgs(productTypeIds, cooldownPeriod, ASSESSOR_GROUP_ID);
  });

  it('should handle zero cooldown period', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    const productTypeIds = [30];
    const cooldownPeriod = 0;

    const tx = await assessment
      .connect(governanceAccount)
      .setAssessmentDataForProductTypes(productTypeIds, cooldownPeriod, ASSESSOR_GROUP_ID);

    // Verify assessment data is set with zero cooldown
    const assessmentDataCooldown = await assessment.payoutCooldown(productTypeIds[0]);
    expect(assessmentDataCooldown).to.equal(cooldownPeriod);

    // Verify event emission
    await expect(tx)
      .to.emit(assessment, 'AssessmentDataForProductTypesSet')
      .withArgs(productTypeIds, cooldownPeriod, ASSESSOR_GROUP_ID);
  });

  it('should handle maximum cooldown period', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    const productTypeIds = [31];
    const maxCooldownPeriod = 2n ** 32n - 1n; // Max uint32

    const tx = await assessment
      .connect(governanceAccount)
      .setAssessmentDataForProductTypes(productTypeIds, maxCooldownPeriod, ASSESSOR_GROUP_ID);

    // Verify assessment data is set with max cooldown
    const assessmentDataCooldown = await assessment.payoutCooldown(productTypeIds[0]);
    expect(assessmentDataCooldown).to.equal(maxCooldownPeriod);

    // Verify event emission
    await expect(tx)
      .to.emit(assessment, 'AssessmentDataForProductTypesSet')
      .withArgs(productTypeIds, maxCooldownPeriod, ASSESSOR_GROUP_ID);
  });

  it('should handle duplicate product type IDs in same call', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    const productTypeIds = [40, 41, 40, 42, 41]; // Duplicates: 40, 41
    const cooldownPeriod = 24 * 60 * 60;

    const tx = await assessment
      .connect(governanceAccount)
      .setAssessmentDataForProductTypes(productTypeIds, cooldownPeriod, ASSESSOR_GROUP_ID);

    // Verify assessment data is set for all IDs (including duplicates)
    for (const productTypeId of productTypeIds) {
      const assessmentDataCooldown = await assessment.payoutCooldown(productTypeId);
      expect(assessmentDataCooldown).to.equal(cooldownPeriod);
    }

    // Verify event emission (with original array including duplicates)
    await expect(tx)
      .to.emit(assessment, 'AssessmentDataForProductTypesSet')
      .withArgs(productTypeIds, cooldownPeriod, ASSESSOR_GROUP_ID);
  });

  it('should handle sequential updates to same product types', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    const productTypeIds = [60, 61, 62];
    const initialCooldown = 24 * 60 * 60; // 1 day
    const updatedCooldown = 72 * 60 * 60; // 3 days

    // Set initial data
    await assessment
      .connect(governanceAccount)
      .setAssessmentDataForProductTypes(productTypeIds, initialCooldown, ASSESSOR_GROUP_ID);

    // Verify initial data
    for (const productTypeId of productTypeIds) {
      const assessmentDataCooldown = await assessment.payoutCooldown(productTypeId);
      expect(assessmentDataCooldown).to.equal(initialCooldown);
    }

    // Update data
    const tx = await assessment
      .connect(governanceAccount)
      .setAssessmentDataForProductTypes(productTypeIds, updatedCooldown, ASSESSOR_GROUP_ID);

    // Verify updated data
    for (const productTypeId of productTypeIds) {
      const assessmentDataCooldown = await assessment.payoutCooldown(productTypeId);
      expect(assessmentDataCooldown).to.equal(updatedCooldown);
    }

    // Verify event emission for update
    await expect(tx)
      .to.emit(assessment, 'AssessmentDataForProductTypesSet')
      .withArgs(productTypeIds, updatedCooldown, ASSESSOR_GROUP_ID);
  });

  it('should revert when groupId is invalid', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    const productTypeIds = [70, 71];
    const cooldownPeriod = 24 * 60 * 60; // 1 day

    // Get current group count and create array of invalid IDs
    const currentGroupCount = await assessment.getGroupsCount();
    const invalidGroupIds = [0n, currentGroupCount + 1n];

    for (const invalidGroupId of invalidGroupIds) {
      const setAssessmentDataForProductTypes = assessment
        .connect(governanceAccount)
        .setAssessmentDataForProductTypes(productTypeIds, cooldownPeriod, invalidGroupId);

      await expect(setAssessmentDataForProductTypes).to.be.revertedWithCustomError(assessment, 'InvalidGroupId');
    }
  });
});

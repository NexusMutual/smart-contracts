const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

const ONE_DAY = 24 * 60 * 60;

/**
 * Helper function to verify AssessmentDataForProductTypeSet events
 */
async function verifyAssessmentDataEvents(
  tx,
  assessment,
  productTypeIds,
  cooldownPeriod,
  payoutRedemptionPeriod,
  groupId,
) {
  const { logs } = await tx.wait();

  const events = logs.filter(log => {
    try {
      const { name } = assessment.interface.parseLog(log);
      return name === 'AssessmentDataForProductTypeSet';
    } catch {
      return false;
    }
  });

  expect(events).to.have.length(productTypeIds.length);

  // Verify each productType has its own event
  productTypeIds.forEach((productTypeId, i) => {
    const parsedEvent = assessment.interface.parseLog(events[i]);
    expect(parsedEvent.args[0]).to.equal(productTypeId);
    expect(parsedEvent.args[1]).to.equal(groupId);
    expect(parsedEvent.args[2]).to.equal(cooldownPeriod);
    expect(parsedEvent.args[3]).to.equal(payoutRedemptionPeriod);
  });
}

describe('setAssessmentDataForProductTypes', function () {
  it('should revert if not called by governor', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [nonGovernor] = accounts.nonMembers;

    const productTypeIds = [1, 2, 3];
    const cooldownPeriod = ONE_DAY;
    const payoutRedemptionPeriod = 7 * ONE_DAY;

    const setAssessmentDataForProductTypes = assessment
      .connect(nonGovernor)
      .setAssessmentDataForProductTypes(productTypeIds, cooldownPeriod, payoutRedemptionPeriod, ASSESSOR_GROUP_ID);

    await expect(setAssessmentDataForProductTypes).to.be.revertedWithCustomError(assessment, 'Unauthorized');
  });

  it('should set assessment data for multiple product types', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    const productTypeIds = [10, 11, 12, 13];
    const cooldownPeriod = 3 * ONE_DAY;
    const payoutRedemptionPeriod = 14 * ONE_DAY;

    const tx = await assessment
      .connect(governanceAccount)
      .setAssessmentDataForProductTypes(productTypeIds, cooldownPeriod, payoutRedemptionPeriod, ASSESSOR_GROUP_ID);

    // Verify assessment data is set for all product types
    for (const productTypeId of productTypeIds) {
      const assessmentData = await assessment.getAssessmentDataForProductType(productTypeId);
      expect(assessmentData.cooldownPeriod).to.equal(cooldownPeriod);
      expect(assessmentData.payoutRedemptionPeriod).to.equal(payoutRedemptionPeriod);
      expect(assessmentData.assessingGroupId).to.equal(ASSESSOR_GROUP_ID);
    }

    // Verify event emission
    await verifyAssessmentDataEvents(
      tx,
      assessment,
      productTypeIds,
      cooldownPeriod,
      payoutRedemptionPeriod,
      ASSESSOR_GROUP_ID,
    );
  });

  it('should handle zero cooldown and payout redemption periods', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    const productTypeIds = [30];
    const cooldownPeriod = 0;
    const payoutRedemptionPeriod = 0;

    const tx = await assessment
      .connect(governanceAccount)
      .setAssessmentDataForProductTypes(productTypeIds, cooldownPeriod, payoutRedemptionPeriod, ASSESSOR_GROUP_ID);

    // Verify assessment data is set with zero cooldown
    const assessmentData = await assessment.getAssessmentDataForProductType(productTypeIds[0]);
    expect(assessmentData.cooldownPeriod).to.equal(cooldownPeriod);
    expect(assessmentData.payoutRedemptionPeriod).to.equal(payoutRedemptionPeriod);
    expect(assessmentData.assessingGroupId).to.equal(ASSESSOR_GROUP_ID);

    // Verify event emission
    await verifyAssessmentDataEvents(
      tx,
      assessment,
      productTypeIds,
      cooldownPeriod,
      payoutRedemptionPeriod,
      ASSESSOR_GROUP_ID,
    );
  });

  it('should handle maximum cooldown period and payout redemption period', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    const productTypeIds = [31];
    const maxCooldownPeriod = 2n ** 32n - 1n; // Max uint32
    const payoutRedemptionPeriod = 2n ** 32n - 1n; // Max uint32

    const tx = await assessment
      .connect(governanceAccount)
      .setAssessmentDataForProductTypes(productTypeIds, maxCooldownPeriod, payoutRedemptionPeriod, ASSESSOR_GROUP_ID);

    // Verify assessment data is set with max cooldown
    const assessmentData = await assessment.getAssessmentDataForProductType(productTypeIds[0]);
    expect(assessmentData.cooldownPeriod).to.equal(maxCooldownPeriod);
    expect(assessmentData.payoutRedemptionPeriod).to.equal(payoutRedemptionPeriod);
    expect(assessmentData.assessingGroupId).to.equal(ASSESSOR_GROUP_ID);

    // Verify event emission
    await verifyAssessmentDataEvents(
      tx,
      assessment,
      productTypeIds,
      maxCooldownPeriod,
      payoutRedemptionPeriod,
      ASSESSOR_GROUP_ID,
    );
  });

  it('should handle duplicate product type IDs in same call', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    const productTypeIds = [40, 41, 40, 42, 41]; // Duplicates: 40, 41
    const cooldownPeriod = 3 * ONE_DAY;
    const payoutRedemptionPeriod = 30 * ONE_DAY;

    const tx = await assessment
      .connect(governanceAccount)
      .setAssessmentDataForProductTypes(productTypeIds, cooldownPeriod, payoutRedemptionPeriod, ASSESSOR_GROUP_ID);

    // Verify assessment data is set for all IDs (including duplicates)
    for (const productTypeId of productTypeIds) {
      const assessmentData = await assessment.getAssessmentDataForProductType(productTypeId);
      expect(assessmentData.cooldownPeriod).to.equal(cooldownPeriod);
      expect(assessmentData.payoutRedemptionPeriod).to.equal(payoutRedemptionPeriod);
      expect(assessmentData.assessingGroupId).to.equal(ASSESSOR_GROUP_ID);
    }

    // Verify event emission
    await verifyAssessmentDataEvents(
      tx,
      assessment,
      productTypeIds,
      cooldownPeriod,
      payoutRedemptionPeriod,
      ASSESSOR_GROUP_ID,
    );
  });

  it('should handle sequential updates to same product types', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    const productTypeIds = [60, 61, 62];
    const initialCooldown = ONE_DAY;
    const updatedCooldown = 3 * ONE_DAY;
    const initialPayoutRedemptionPeriod = 7 * ONE_DAY;
    const updatedPayoutRedemptionPeriod = 14 * ONE_DAY;

    // Set initial data
    await assessment
      .connect(governanceAccount)
      .setAssessmentDataForProductTypes(
        productTypeIds,
        initialCooldown,
        initialPayoutRedemptionPeriod,
        ASSESSOR_GROUP_ID,
      );

    // Verify initial data
    for (const productTypeId of productTypeIds) {
      const assessmentData = await assessment.getAssessmentDataForProductType(productTypeId);
      expect(assessmentData.assessingGroupId).to.equal(ASSESSOR_GROUP_ID);
      expect(assessmentData.cooldownPeriod).to.equal(initialCooldown);
      expect(assessmentData.payoutRedemptionPeriod).to.equal(initialPayoutRedemptionPeriod);
    }

    // Update data
    const tx = await assessment
      .connect(governanceAccount)
      .setAssessmentDataForProductTypes(
        productTypeIds,
        updatedCooldown,
        updatedPayoutRedemptionPeriod,
        ASSESSOR_GROUP_ID,
      );

    // Verify updated data
    for (const productTypeId of productTypeIds) {
      const assessmentData = await assessment.getAssessmentDataForProductType(productTypeId);
      expect(assessmentData.cooldownPeriod).to.equal(updatedCooldown);
      expect(assessmentData.payoutRedemptionPeriod).to.equal(updatedPayoutRedemptionPeriod);
      expect(assessmentData.assessingGroupId).to.equal(ASSESSOR_GROUP_ID);
    }

    // Verify event emission for update
    await verifyAssessmentDataEvents(
      tx,
      assessment,
      productTypeIds,
      updatedCooldown,
      updatedPayoutRedemptionPeriod,
      ASSESSOR_GROUP_ID,
    );
  });

  it('should revert when groupId is invalid', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [governanceAccount] = accounts.governanceContracts;

    const productTypeIds = [70, 71];
    const cooldownPeriod = 3 * ONE_DAY;
    const payoutRedemptionPeriod = 30 * ONE_DAY;

    // Get current group count and create array of invalid IDs
    const currentGroupCount = await assessment.getGroupsCount();
    const invalidGroupIds = [0n, currentGroupCount + 1n];

    for (const invalidGroupId of invalidGroupIds) {
      const setAssessmentDataForProductTypes = assessment
        .connect(governanceAccount)
        .setAssessmentDataForProductTypes(productTypeIds, cooldownPeriod, payoutRedemptionPeriod, invalidGroupId);

      await expect(setAssessmentDataForProductTypes).to.be.revertedWithCustomError(assessment, 'InvalidGroupId');
    }
  });

  it('should set different cooldown and payout redemption periods for different product types', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    // Define different periods for different product types
    const productType0CooldownPeriod = ONE_DAY;
    const productType0PayoutRedemptionPeriod = 10 * ONE_DAY;

    const productType1CooldownPeriod = 2 * ONE_DAY;
    const productType1PayoutRedemptionPeriod = 20 * ONE_DAY;

    const productType2CooldownPeriod = 3 * ONE_DAY;
    const productType2PayoutRedemptionPeriod = 30 * ONE_DAY;

    // Set assessment data for different product types
    await assessment
      .connect(governanceAccount)
      .setAssessmentDataForProductTypes(
        [0],
        productType0CooldownPeriod,
        productType0PayoutRedemptionPeriod,
        ASSESSOR_GROUP_ID,
      );

    await assessment
      .connect(governanceAccount)
      .setAssessmentDataForProductTypes(
        [1],
        productType1CooldownPeriod,
        productType1PayoutRedemptionPeriod,
        ASSESSOR_GROUP_ID,
      );

    await assessment
      .connect(governanceAccount)
      .setAssessmentDataForProductTypes(
        [2],
        productType2CooldownPeriod,
        productType2PayoutRedemptionPeriod,
        ASSESSOR_GROUP_ID,
      );

    // Verify each product type has correct data
    const assessmentData0 = await assessment.getAssessmentDataForProductType(0);
    expect(assessmentData0.cooldownPeriod).to.equal(productType0CooldownPeriod);
    expect(assessmentData0.payoutRedemptionPeriod).to.equal(productType0PayoutRedemptionPeriod);
    expect(assessmentData0.assessingGroupId).to.equal(ASSESSOR_GROUP_ID);

    const assessmentData1 = await assessment.getAssessmentDataForProductType(1);
    expect(assessmentData1.cooldownPeriod).to.equal(productType1CooldownPeriod);
    expect(assessmentData1.payoutRedemptionPeriod).to.equal(productType1PayoutRedemptionPeriod);
    expect(assessmentData1.assessingGroupId).to.equal(ASSESSOR_GROUP_ID);

    const assessmentData2 = await assessment.getAssessmentDataForProductType(2);
    expect(assessmentData2.cooldownPeriod).to.equal(productType2CooldownPeriod);
    expect(assessmentData2.payoutRedemptionPeriod).to.equal(productType2PayoutRedemptionPeriod);
    expect(assessmentData2.assessingGroupId).to.equal(ASSESSOR_GROUP_ID);

    // Verify payoutCooldown function returns correct values
    expect(await assessment.payoutCooldown(0)).to.equal(productType0CooldownPeriod);
    expect(await assessment.payoutCooldown(1)).to.equal(productType1CooldownPeriod);
    expect(await assessment.payoutCooldown(2)).to.equal(productType2CooldownPeriod);
  });
});

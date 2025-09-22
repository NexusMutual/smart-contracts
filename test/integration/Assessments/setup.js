const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('../setup');

const { parseEther } = ethers;

/**
 * Sets up assessment-specific functionality for integration tests
 * @param {Object} contracts - Contract instances from main setup
 * @param {Object} accounts - Account instances from main setup
 * @returns {Object} Assessment-specific configuration and accounts
 */
async function setupAssessments() {
  const fixture = await loadFixture(setup);
  const { accounts, contracts } = fixture;
  const { registry, assessments, coverProducts } = contracts;
  const { assessors } = accounts;

  // create new assessor group with all assessors
  const assessorIds = await Promise.all(assessors.map(assessor => registry.getMemberId(assessor.address)));
  await assessments.addAssessorsToGroup(assessorIds, 0);

  const assessorGroupId = await assessments.getGroupsCount();

  // set the new assessor group for all product types
  const productCount = await coverProducts.getProductTypeCount();
  const productTypeIds = Array.from({ length: Number(productCount) }, (_, i) => i);
  await assessments.setAssessingGroupIdForProductTypes(productTypeIds, assessorGroupId);

  fixture.config = {
    ...fixture.config,
    ASSESSMENT_GROUP_ID: assessorGroupId,
    CLAIM_DEPOSIT: parseEther('0.05'),
  };

  fixture.constants = {
    ...fixture.constants,
    CLAIM_DEPOSIT: parseEther('0.05'),
  };

  return fixture;
}

module.exports = {
  setupAssessments,
};

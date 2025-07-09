const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

describe('assessorGroupOf', function () {
  it('reverts for invalid claim ID', async function () {
    const { contracts } = await loadFixture(setup);
    const { assessment } = contracts;

    const invalidClaimId = 999;
    const assessorGroupOf = assessment.assessorGroupOf(invalidClaimId);

    await expect(assessorGroupOf).to.be.revertedWithCustomError(assessment, 'InvalidClaimId');
  });

  it('returns group ID for a valid claim ID', async function () {
    const { contracts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID, ASSESSOR_GROUP_ID } = constants;

    const groupId = await assessment.assessorGroupOf(CLAIM_ID);
    expect(groupId).to.equal(ASSESSOR_GROUP_ID);
  });
});

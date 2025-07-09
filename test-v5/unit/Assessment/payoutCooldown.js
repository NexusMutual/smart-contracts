const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

const ONE_DAY = 24 * 60 * 60;

describe('payoutCooldown', function () {
  it('returns cooldown for valid product type', async function () {
    const { contracts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { PRODUCT_TYPE_ID } = constants;

    const cooldown = await assessment.payoutCooldown(PRODUCT_TYPE_ID);
    expect(cooldown).to.equal(ONE_DAY);
  });

  it('reverts for invalid product type', async function () {
    const { contracts } = await loadFixture(setup);
    const { assessment } = contracts;

    const invalidProductType = 999;
    const payoutCooldown = assessment.payoutCooldown(invalidProductType);
    await expect(payoutCooldown).to.be.revertedWithCustomError(assessment, 'InvalidProductType');
  });
});

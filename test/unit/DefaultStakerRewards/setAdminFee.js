const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

describe('setAdminFee', function () {
  it('reverts if new fee equals current fee (AlreadySet)', async function () {
    const { accounts, contracts } = await loadFixture(setup);
    const { adminFeeSetter } = accounts;
    const { rewards } = contracts;

    const setAdminFee = rewards.connect(adminFeeSetter).setAdminFee(500n);
    await expect(setAdminFee).to.be.revertedWithCustomError(rewards, 'AlreadySet');
  });

  it('reverts if new fee is greater than ADMIN_FEE_BASE (InvalidAdminFee)', async function () {
    const { accounts, contracts, constants } = await loadFixture(setup);
    const { adminFeeSetter } = accounts;
    const { rewards } = contracts;
    const { ADMIN_FEE_BASE } = constants;

    const setAdminFee = rewards.connect(adminFeeSetter).setAdminFee(BigInt(ADMIN_FEE_BASE) + 1n);
    await expect(setAdminFee).to.be.revertedWithCustomError(rewards, 'InvalidAdminFee');
  });

  it('updates admin fee and emits event', async function () {
    const { accounts, contracts } = await loadFixture(setup);
    const { adminFeeSetter } = accounts;
    const { rewards } = contracts;

    await expect(rewards.connect(adminFeeSetter).setAdminFee(1000n)).to.emit(rewards, 'SetAdminFee').withArgs(1000n);
    expect(await rewards.adminFee()).to.equal(1000n);
  });
});

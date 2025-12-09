const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

describe('initialize', function () {
  it('reverts if vault is not registered in registry (NotVault)', async function () {
    const { accounts, contracts } = await loadFixture(setup);
    const { defaultAdmin } = accounts;
    const { vault, middlewareService } = contracts;

    const fakeRegistry = await (await ethers.getContractFactory('SBMockRegistry')).deploy();
    await fakeRegistry.waitForDeployment();

    const DSR = await ethers.getContractFactory('DefaultStakerRewards');
    const rewardsImpl = await DSR.deploy(fakeRegistry.target, middlewareService.target);
    await rewardsImpl.waitForDeployment();

    const Factory = await ethers.getContractFactory('DefaultStakerRewardsFactory');
    const factory = await Factory.deploy(rewardsImpl.target);
    await factory.waitForDeployment();

    const params = {
      vault: vault.target,
      defaultAdminRoleHolder: defaultAdmin.address,
      adminFee: 0n,
      adminFeeClaimRoleHolder: ethers.ZeroAddress,
      adminFeeSetRoleHolder: ethers.ZeroAddress,
    };

    await expect(factory.create(params)).to.be.revertedWithCustomError(rewardsImpl, 'NotVault');
  });

  it('reverts on inconsistent admin role config (MissingRoles)', async function () {
    const { accounts, contracts } = await loadFixture(setup);
    const { adminFeeSetter } = accounts;
    const { vault, registry, middlewareService } = contracts;

    const DSR = await ethers.getContractFactory('DefaultStakerRewards');
    const rewardsImpl = await DSR.deploy(registry.target, middlewareService.target);
    await rewardsImpl.waitForDeployment();

    const Factory = await ethers.getContractFactory('DefaultStakerRewardsFactory');
    const factory = await Factory.deploy(rewardsImpl.target);
    await factory.waitForDeployment();

    await registry.setEntity(vault.target, true);

    const params = {
      vault: vault.target,
      defaultAdminRoleHolder: ethers.ZeroAddress,
      adminFee: 1n,
      adminFeeClaimRoleHolder: ethers.ZeroAddress,
      adminFeeSetRoleHolder: adminFeeSetter.address,
    };

    await expect(factory.create(params)).to.be.revertedWithCustomError(rewardsImpl, 'MissingRoles');
  });

  it('sets vault and admin fee roles correctly', async function () {
    const { accounts, contracts } = await loadFixture(setup);
    const { defaultAdmin, adminFeeClaimer, adminFeeSetter } = accounts;
    const { vault, rewards } = contracts;

    expect(await rewards.VAULT()).to.equal(vault.target);
    expect(await rewards.adminFee()).to.equal(500n);

    const DEFAULT_ADMIN_ROLE = await rewards.DEFAULT_ADMIN_ROLE();
    const ADMIN_FEE_CLAIM_ROLE = await rewards.ADMIN_FEE_CLAIM_ROLE();
    const ADMIN_FEE_SET_ROLE = await rewards.ADMIN_FEE_SET_ROLE();

    expect(await rewards.hasRole(DEFAULT_ADMIN_ROLE, defaultAdmin.address)).to.equal(true);
    expect(await rewards.hasRole(ADMIN_FEE_CLAIM_ROLE, adminFeeClaimer.address)).to.equal(true);
    expect(await rewards.hasRole(ADMIN_FEE_SET_ROLE, adminFeeSetter.address)).to.equal(true);
  });
});

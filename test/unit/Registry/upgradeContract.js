const { ethers, nexus } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

const { setup } = require('./setup');

const { numberToBytes32 } = nexus.helpers;
const { ContractIndexes } = nexus.constants;
const { ZeroAddress } = ethers;

describe('upgradeContract', () => {
  it('should revert when called by non-governor', async () => {
    const { registry, mallory } = await loadFixture(setup);

    const newImplementation = await ethers.deployContract('RGMockPool');
    const idx = ContractIndexes.C_POOL; // proxy contract from setup

    await expect(registry.connect(mallory).upgradeContract(idx, newImplementation)) //
      .to.be.revertedWithCustomError(registry, 'OnlyGovernor');
  });

  it('should revert when contract does not exist', async () => {
    const { registry, governor } = await loadFixture(setup);
    const idx = 2n ** 32n; // non-existent contract
    await expect(registry.connect(governor).upgradeContract(idx, ZeroAddress)) //
      .to.be.revertedWithCustomError(registry, 'ContractDoesNotExist');
  });

  it('should revert when contract is not a proxy', async () => {
    const { registry, governor } = await loadFixture(setup);

    // add a non-proxy contract
    const nonProxyContract = await ethers.deployContract('RGMockPool');
    const idx = 2n ** 32n;
    await registry.connect(governor).addContract(idx, nonProxyContract, false);

    await expect(registry.connect(governor).upgradeContract(idx, ZeroAddress)) //
      .to.be.revertedWithCustomError(registry, 'ContractIsNotProxy');
  });

  it('should successfully upgrade a proxy contract', async () => {
    const { registry, governor } = await loadFixture(setup);

    const targetImplementation = await ethers.deployContract('RGMockTokenController');
    const idx = ContractIndexes.C_POOL; // proxy contract from setup

    const proxyAddress = await registry.getContractAddressByIndex(idx);
    const proxy = await ethers.getContractAt('UpgradeableProxy', proxyAddress);

    const oldImplementation = await proxy.implementation();
    expect(oldImplementation).to.not.equal(targetImplementation);

    await registry.connect(governor).upgradeContract(idx, targetImplementation);

    const newImplementation = await proxy.implementation();
    expect(newImplementation).to.equal(targetImplementation);
  });

  it('should emit Upgraded event from proxy', async () => {
    const { registry, governor } = await loadFixture(setup);

    const newImplementation = await ethers.deployContract('RGMockTokenController');
    const idx = ContractIndexes.C_TOKEN_CONTROLLER; // proxy contract from setup

    const proxyAddress = await registry.getContractAddressByIndex(idx);
    const proxy = await ethers.getContractAt('UpgradeableProxy', proxyAddress);

    await expect(registry.connect(governor).upgradeContract(idx, newImplementation))
      .to.emit(proxy, 'Upgraded')
      .withArgs(newImplementation);
  });

  it('should allow upgrade to zero address', async () => {
    const { registry, governor } = await loadFixture(setup);

    const idx = ContractIndexes.C_POOL; // proxy contract from setup
    const proxyAddress = await registry.getContractAddressByIndex(idx);
    const proxy = await ethers.getContractAt('UpgradeableProxy', proxyAddress);

    await registry.connect(governor).upgradeContract(idx, ZeroAddress);

    expect(await proxy.implementation()).to.equal(ZeroAddress);
  });

  it('should allow upgrade to same implementation', async () => {
    const { registry, governor } = await loadFixture(setup);

    const idx = ContractIndexes.C_POOL; // proxy contract from setup
    const proxyAddress = await registry.getContractAddressByIndex(idx);
    const proxy = await ethers.getContractAt('UpgradeableProxy', proxyAddress);

    const currentImplementation = await proxy.implementation();

    await registry.connect(governor).upgradeContract(idx, currentImplementation);

    expect(await proxy.implementation()).to.equal(currentImplementation);
  });

  it('should not change the proxy owner after upgrade', async () => {
    const { registry, governor } = await loadFixture(setup);

    const newImplementation = await ethers.deployContract('RGMockPool');
    const idx = 2n ** 33n;

    await registry.connect(governor).deployContract(idx, numberToBytes32(1337), newImplementation);

    const proxyAddress = await registry.getContractAddressByIndex(idx);
    const proxy = await ethers.getContractAt('UpgradeableProxy', proxyAddress);

    expect(await proxy.proxyOwner()).to.equal(registry);

    const targetImplementation = await ethers.deployContract('RGMockTokenController');
    await registry.connect(governor).upgradeContract(idx, targetImplementation);

    expect(await proxy.proxyOwner()).to.equal(registry);
    expect(await proxy.implementation()).to.equal(targetImplementation);
  });

  it('should maintain contract registry state after upgrade', async () => {
    const { registry, governor } = await loadFixture(setup);

    const idx = ContractIndexes.C_POOL;
    const proxyAddress = await registry.getContractAddressByIndex(idx);

    // verify initial state
    expect(await registry.getContractAddressByIndex(idx)).to.equal(proxyAddress);
    expect(await registry.isProxyContract(idx)).to.be.true;
    expect(await registry.getContractIndexByAddress(proxyAddress)).to.equal(idx);

    const newImplementation = await ethers.deployContract('RGMockTokenController');
    await registry.connect(governor).upgradeContract(idx, newImplementation);

    // registry state should remain unchanged
    expect(await registry.getContractAddressByIndex(idx)).to.equal(proxyAddress);
    expect(await registry.isProxyContract(idx)).to.be.true;
    expect(await registry.getContractIndexByAddress(proxyAddress)).to.equal(idx);
  });
});

const { ethers, nexus } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

const { setup } = require('./setup');

const { ContractIndexes } = nexus.constants;
const { ZeroAddress } = ethers;

describe('addContract', () => {
  it('should revert when called by non-governor', async () => {
    const { registry, mallory } = await loadFixture(setup);
    const idx = 2n ** 32n;
    await expect(registry.connect(mallory).addContract(idx, ZeroAddress, false)) //
      .to.be.revertedWithCustomError(registry, 'OnlyGovernor');
  });

  it('should validate the index (not power of two)', async () => {
    const { registry, governor } = await loadFixture(setup);
    const idx = 2n ** 32n + 1n; // not a power of two
    await expect(registry.connect(governor).addContract(idx, ZeroAddress, false)) //
      .to.be.revertedWithCustomError(registry, 'InvalidContractIndex');
  });

  it('should revert with zero contract address', async () => {
    const { registry, governor } = await loadFixture(setup);
    const idx = 2n ** 32n;
    await expect(registry.connect(governor).addContract(idx, ZeroAddress, false)) //
      .to.be.revertedWithCustomError(registry, 'InvalidContractAddress');
  });

  it('should revert when contract already exists at index', async () => {
    const { registry, governor } = await loadFixture(setup);
    const idx = ContractIndexes.C_POOL; // already exists from setup
    const mockPool = await ethers.deployContract('RGMockPool');
    await expect(registry.connect(governor).addContract(idx, mockPool, false)) //
      .to.be.revertedWithCustomError(registry, 'ContractAlreadyExists');
  });

  it('should revert when the added proxy contract is not owned by Registry', async () => {
    const { registry, governor, alice } = await loadFixture(setup);

    const proxy = await ethers.deployContract('UpgradeableProxy', alice);
    const idx = 2n ** 32n;

    await expect(registry.connect(governor).addContract(idx, proxy, true)) //
      .to.be.revertedWithCustomError(registry, 'NotProxyOwner');
  });

  it('should successfully add a non-proxy contract', async () => {
    const { registry, governor } = await loadFixture(setup);
    const idx = 2n ** 32n;

    const mockContract = await ethers.deployContract('RGMockPool');
    await registry.connect(governor).addContract(idx, mockContract, false);

    expect(await registry.getContractAddressByIndex(idx)).to.equal(mockContract);
    expect(await registry.isProxyContract(idx)).to.be.false;
    expect(await registry.getContractIndexByAddress(mockContract)).to.equal(idx);
  });

  it('should successfully add a proxy contract owned by Registry', async () => {
    const { registry, governor } = await loadFixture(setup);
    const idx = 2n ** 33n;

    // deploy a proxy and transfer ownership to registry
    const proxy = await ethers.deployContract('UpgradeableProxy');
    await proxy.transferProxyOwnership(registry);

    await registry.connect(governor).addContract(idx, proxy, true);

    expect(await registry.getContractAddressByIndex(idx)).to.equal(proxy);
    expect(await registry.isProxyContract(idx)).to.be.true;
    expect(await registry.getContractIndexByAddress(proxy)).to.equal(idx);
  });

  it('should successfully add an EOA as non-proxy', async () => {
    const { registry, governor, alice } = await loadFixture(setup);
    const idx = 2n ** 34n;

    await registry.connect(governor).addContract(idx, alice, false);

    expect(await registry.getContractAddressByIndex(idx)).to.equal(alice.address);
    expect(await registry.isProxyContract(idx)).to.be.false;
    expect(await registry.getContractIndexByAddress(alice)).to.equal(idx);
  });

  it('should correctly store the isProxy boolean', async () => {
    const { registry, governor } = await loadFixture(setup);

    const nonProxy = await ethers.deployContract('RGMockPool');
    const proxy = await ethers.deployContract('UpgradeableProxy');
    await proxy.transferProxyOwnership(registry);

    const idx1 = 2n ** 41n;
    const idx2 = 2n ** 42n;

    await registry.connect(governor).addContract(idx1, nonProxy, false);
    await registry.connect(governor).addContract(idx2, proxy, true);

    expect(await registry.isProxyContract(idx1)).to.be.false;
    expect(await registry.isProxyContract(idx2)).to.be.true;
  });

  it('should allow adding a proxy contract at the same index after removing a non-proxy contract', async () => {
    const { registry, governor } = await loadFixture(setup);

    const mockPool = await ethers.deployContract('RGMockPool');
    const mockTC = await ethers.deployContract('RGMockTokenController');

    const tcProxy = await ethers.deployContract('UpgradeableProxy');
    await tcProxy.upgradeTo(mockTC);
    await tcProxy.transferProxyOwnership(registry);

    const idx = 2n ** 36n;

    await registry.connect(governor).addContract(idx, mockPool, false);
    await registry.connect(governor).removeContract(idx);
    await registry.connect(governor).addContract(idx, tcProxy, true);

    expect(await registry.getContractAddressByIndex(idx)).to.equal(tcProxy);
    expect(await registry.getContractIndexByAddress(tcProxy)).to.equal(idx);
    expect(await registry.isProxyContract(idx)).to.be.true;
    await expect(registry.getContractIndexByAddress(mockPool)) // reverts
      .to.revertedWithCustomError(registry, 'ContractDoesNotExist');
  });

  it('should allow adding a non-proxy contract at the same index after removing a proxy contract', async () => {
    const { registry, governor } = await loadFixture(setup);

    const mockPool = await ethers.deployContract('RGMockPool');
    const mockTC = await ethers.deployContract('RGMockTokenController');

    const tcProxy = await ethers.deployContract('UpgradeableProxy');
    await tcProxy.upgradeTo(mockTC);
    await tcProxy.transferProxyOwnership(registry);

    const idx = 2n ** 36n;

    await registry.connect(governor).addContract(idx, tcProxy, true);
    await registry.connect(governor).removeContract(idx);
    await registry.connect(governor).addContract(idx, mockPool, false);

    expect(await registry.getContractAddressByIndex(idx)).to.equal(mockPool);
    expect(await registry.getContractIndexByAddress(mockPool)).to.equal(idx);
    expect(await registry.isProxyContract(idx)).to.be.false;
    await expect(registry.getContractIndexByAddress(tcProxy)) // reverts
      .to.revertedWithCustomError(registry, 'ContractDoesNotExist');
  });
});

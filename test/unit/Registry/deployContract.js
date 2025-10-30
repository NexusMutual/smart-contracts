const { artifacts, ethers, nexus } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

const { setup } = require('./setup');

const { numberToBytes32 } = nexus.helpers;
const { ContractIndexes } = nexus.constants;
const { ZeroAddress, getBytes, hexlify, keccak256, getCreate2Address } = ethers;

describe('deployContract', () => {
  it('should validate the index', async () => {
    const { registry, governor } = await loadFixture(setup);

    const idx = 2n ** 32n + 1n; // not a valid power of two
    const salt = numberToBytes32(0);

    await expect(registry.connect(governor).deployContract(idx, salt, ZeroAddress)) //
      .to.be.revertedWithCustomError(registry, 'InvalidContractIndex');
  });

  it('should revert when called by non-governor', async () => {
    const { registry, mallory } = await loadFixture(setup);

    const idx = 2n ** 32n; // random large index we aren't currently using
    const salt = numberToBytes32(0);

    await expect(registry.connect(mallory).deployContract(idx, salt, ZeroAddress)) //
      .to.be.revertedWithCustomError(registry, 'OnlyGovernor');
  });

  it('should revert when a contract already exists at the index', async () => {
    const { registry, governor } = await loadFixture(setup);

    const idx = ContractIndexes.C_POOL;
    const salt = numberToBytes32(1337);

    await expect(registry.connect(governor).deployContract(idx, salt, ZeroAddress)) //
      .to.be.revertedWithCustomError(registry, 'ContractAlreadyExists');
  });

  it('should revert when a contract is already deployed using the same salt', async () => {
    const { registry, governor } = await loadFixture(setup);

    const idx = 2n ** 32n;
    const salt = numberToBytes32(1337);

    await expect(registry.connect(governor).deployContract(idx, salt, ZeroAddress)).to.not.be.reverted;
    await expect(registry.connect(governor).deployContract(idx, salt, ZeroAddress)) // reverts
      .to.be.revertedWithCustomError(registry, 'ContractAlreadyExists');
  });

  it('should deploy a contract at the correct address', async () => {
    const { registry, governor } = await loadFixture(setup);

    const idx = 2n ** 32n;
    const salt = numberToBytes32(1337);
    const { bytecode } = await artifacts.readArtifact('UpgradeableProxy');
    const bytecodeBytes = getBytes(bytecode);
    const bytecodeHash = hexlify(keccak256(bytecodeBytes));
    const expectedCreate2Address = getCreate2Address(registry.target, salt, bytecodeHash);

    await registry.connect(governor).deployContract(idx, salt, ZeroAddress);

    const actualCreate2Address = await registry.getContractAddressByIndex(idx);
    expect(actualCreate2Address).to.equal(expectedCreate2Address);

    expect(await registry.isProxyContract(idx)).to.be.true;
    expect(await registry.getContractIndexByAddress(expectedCreate2Address)).to.equal(idx);
  });

  it('should deploy with zero implementation address', async () => {
    const { registry, governor } = await loadFixture(setup);

    const idx = 2n ** 20n;
    const salt = numberToBytes32(1337);

    await registry.connect(governor).deployContract(idx, salt, ZeroAddress);

    const proxyAddress = await registry.getContractAddressByIndex(idx);
    const proxy = await ethers.getContractAt('UpgradeableProxy', proxyAddress);

    expect(await proxy.implementation()).to.equal(ZeroAddress);
    expect(await proxy.proxyOwner()).to.equal(registry);
  });

  it('should deploy with non-zero implementation address', async () => {
    const { registry, governor } = await loadFixture(setup);

    const mockImplementation = await ethers.deployContract('RGMockPool');
    const idx = 2n ** 20n;
    const salt = numberToBytes32(1337);

    await registry.connect(governor).deployContract(idx, salt, mockImplementation);

    const proxyAddress = await registry.getContractAddressByIndex(idx);
    const proxy = await ethers.getContractAt('UpgradeableProxy', proxyAddress);

    expect(await proxy.implementation()).to.equal(mockImplementation);
    expect(await proxy.proxyOwner()).to.equal(registry);
  });

  it('should emit ContractDeployed event from Registry and Upgraded event from UpgradeableProxy', async () => {
    const { registry, governor } = await loadFixture(setup);

    const mockImplementation = await ethers.deployContract('RGMockPool');
    const idx = 2n ** 22n;
    const salt = numberToBytes32(1337);

    const { bytecode } = await artifacts.readArtifact('UpgradeableProxy');
    const bytecodeBytes = getBytes(bytecode);
    const bytecodeHash = hexlify(keccak256(bytecodeBytes));
    const proxyAddress = getCreate2Address(registry.target, salt, bytecodeHash);
    const proxy = await ethers.getContractAt('UpgradeableProxy', proxyAddress);

    await expect(registry.connect(governor).deployContract(idx, salt, mockImplementation))
      .to.emit(registry, 'ContractDeployed')
      .withArgs(idx, proxy, mockImplementation)
      .to.emit(proxy, 'Upgraded')
      .withArgs(mockImplementation);
  });

  it('should properly update state mappings', async () => {
    const { registry, governor } = await loadFixture(setup);

    const idx = 2n ** 26n;
    const salt = numberToBytes32(1337);

    await registry.connect(governor).deployContract(idx, salt, ZeroAddress);
    const proxyAddress = await registry.getContractAddressByIndex(idx);

    expect(await registry.isProxyContract(idx)).to.be.true;
    expect(await registry.getContractIndexByAddress(proxyAddress)).to.equal(idx);
  });
});

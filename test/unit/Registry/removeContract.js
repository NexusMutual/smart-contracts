const { ethers, nexus, artifacts } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

const { setup } = require('./setup');

const { numberToBytes32 } = nexus.helpers;
const { ContractIndexes } = nexus.constants;
const { ZeroAddress, getBytes, hexlify, keccak256, getCreate2Address } = ethers;

describe('removeContract', () => {
  it('should revert when called by non-governor', async () => {
    const { registry, mallory } = await loadFixture(setup);
    const idx = ContractIndexes.C_POOL;
    await expect(registry.connect(mallory).removeContract(idx)) // called as mallory
      .to.be.revertedWithCustomError(registry, 'OnlyGovernor');
  });

  it('should revert when contract does not exist', async () => {
    const { registry, governor } = await loadFixture(setup);
    const idx = 2n ** 32n; // non-existent contract
    await expect(registry.connect(governor).removeContract(idx)) //
      .to.be.revertedWithCustomError(registry, 'ContractDoesNotExist');
  });

  it('should successfully remove a proxy contract', async () => {
    const { registry, governor, pool } = await loadFixture(setup);

    expect(await registry.getContractAddressByIndex(ContractIndexes.C_POOL)).to.equal(pool);
    expect(await registry.getContractIndexByAddress(pool)).to.equal(ContractIndexes.C_POOL);

    await expect(registry.connect(governor).removeContract(ContractIndexes.C_POOL))
      .to.emit(registry, 'ContractRemoved')
      .withArgs(ContractIndexes.C_POOL, pool, true);

    // check that mappings are cleared
    expect(await registry.getContractAddressByIndex(ContractIndexes.C_POOL)).to.equal(ZeroAddress);
    expect(await registry.getContractIndexByAddress(pool)).to.equal(0);
  });

  it('should successfully remove a non-proxy contract', async () => {
    const { registry, governor } = await loadFixture(setup);

    // add a non-proxy contract first
    const mockContract = await ethers.deployContract('RGMockPool');
    const idx = 2n ** 32n;
    await registry.connect(governor).addContract(idx, mockContract, false);

    // remove it
    await registry.connect(governor).removeContract(idx);

    // check that mappings are cleared
    expect(await registry.getContractAddressByIndex(idx)).to.equal(ZeroAddress);
    expect(await registry.getContractIndexByAddress(mockContract)).to.equal(0);
  });

  it('should not affect the actual proxy contract on-chain', async () => {
    const { registry, governor } = await loadFixture(setup);

    const pool = await registry.getContractAddressByIndex(ContractIndexes.C_POOL);
    const proxy = await ethers.getContractAt('UpgradeableProxy', pool);
    const implementation = await proxy.implementation();

    // verify proxy exists and has Registry as owner
    expect(await proxy.proxyOwner()).to.equal(registry);

    await registry.connect(governor).removeContract(ContractIndexes.C_POOL);

    // proxy still exists on-chain with same owner and implementation
    expect(await proxy.proxyOwner()).to.equal(registry);
    expect(await proxy.implementation()).to.equal(implementation);

    // but Registry no longer tracks it
    expect(await registry.getContractAddressByIndex(ContractIndexes.C_POOL)).to.equal(ZeroAddress);
  });

  it('should allow re-adding contract at same index after removal', async () => {
    const { registry, governor } = await loadFixture(setup);

    // remove existing contract
    const idx = ContractIndexes.C_TOKEN_CONTROLLER;
    await registry.connect(governor).removeContract(idx);

    // add new contract at same index
    const newContract = await ethers.deployContract('RGMockTokenController');
    await registry.connect(governor).addContract(idx, newContract, false);

    expect(await registry.getContractAddressByIndex(idx)).to.equal(newContract);
    expect(await registry.isProxyContract(idx)).to.be.false;
    expect(await registry.getContractIndexByAddress(newContract)).to.equal(idx);
  });

  it('should allow re-deploying at same index after removal', async () => {
    const { registry, governor } = await loadFixture(setup);

    const idx = 2n ** 32n;
    const randomEOA = ethers.Wallet.createRandom();

    // track a random address as a non proxy and then remove it
    await registry.connect(governor).addContract(idx, randomEOA, false);
    await registry.connect(governor).removeContract(idx);

    // deploy new proxy at same index
    const implementation = await ethers.deployContract('RGMockPool');
    await registry.connect(governor).deployContract(idx, numberToBytes32(1337), implementation);

    const { bytecode } = await artifacts.readArtifact('UpgradeableProxy');
    const bytecodeBytes = getBytes(bytecode);
    const bytecodeHash = hexlify(keccak256(bytecodeBytes));
    const expectedCreate2Address = getCreate2Address(registry.target, numberToBytes32(1337), bytecodeHash);

    const newProxyAddress = await registry.getContractAddressByIndex(idx);
    expect(newProxyAddress).to.equal(expectedCreate2Address);
    expect(await registry.isProxyContract(idx)).to.be.true;
    expect(await registry.getContractIndexByAddress(newProxyAddress)).to.equal(idx);
  });

  it('should not affect other contracts when removing one', async () => {
    const { registry, governor } = await loadFixture(setup);

    const getByIndex = async idx => {
      const addr = await registry.getContractAddressByIndex(idx);
      const isProxy = await registry.isProxyContract(idx);
      return { idx, addr, isProxy };
    };

    const indexes = new Array(254).fill(0).map((_, i) => 2n ** BigInt(i));
    const contracts = await Promise.all(indexes.map(getByIndex));

    // remove tc
    await registry.connect(governor).removeContract(ContractIndexes.C_TOKEN_CONTROLLER);

    // all other contracts should remain unaffected
    for (const { idx, addr, isProxy } of contracts) {
      const isRemoved = idx === ContractIndexes.C_TOKEN_CONTROLLER;
      const wasZeroAddress = addr === ZeroAddress;
      const [expectedAddress, expectedIsProxy] = isRemoved ? [ZeroAddress, false] : [addr, isProxy];
      expect(await registry.getContractAddressByIndex(idx)).to.equal(expectedAddress);
      expect(await registry.isProxyContract(idx)).to.equal(expectedIsProxy);
      expect(await registry.getContractIndexByAddress(expectedAddress)).to.equal(isRemoved || wasZeroAddress ? 0 : idx);
    }
  });
});

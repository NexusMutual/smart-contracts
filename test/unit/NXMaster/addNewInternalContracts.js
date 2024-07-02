const { ethers } = require('hardhat');
const {
  constants: { AddressZero },
} = require('ethers');
const { assert, expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');
const { hex } = require('../utils').helpers;
const { ContractTypes } = require('../utils').constants;

describe('addNewInternalContracts', function () {
  it('reverts when not called by governance', async function () {
    const fixture = await loadFixture(setup);
    const { master } = fixture;

    await expect(master.addNewInternalContracts([], [], [])).to.be.revertedWith('Not authorized');
  });

  it('reverts when contract code already in use', async function () {
    const fixture = await loadFixture(setup);
    const { governance } = fixture;

    await expect(
      governance.addNewInternalContracts(
        [hex('GV')],
        ['0x0000000000000000000000000000000000000001'],
        [ContractTypes.Replaceable],
      ),
    ).to.be.revertedWith('NXMaster: Code already in use');
  });

  it('reverts when contract address is 0', async function () {
    const fixture = await loadFixture(setup);
    const { governance } = fixture;

    await expect(
      governance.addNewInternalContracts([hex('XX')], [AddressZero], [ContractTypes.Replaceable]),
    ).to.be.revertedWith('NXMaster: Contract address is 0');
  });

  it('reverts when contract type is unknown', async function () {
    const fixture = await loadFixture(setup);
    const { governance } = fixture;

    await expect(
      governance.addNewInternalContracts([hex('XX')], ['0x0000000000000000000000000000000000000001'], ['15']),
    ).to.be.revertedWith('NXMaster: Unsupported contract type');
  });

  it('adds new replaceable contract', async function () {
    const fixture = await loadFixture(setup);
    const { master, governance } = fixture;

    const code = hex('XX');
    const newContract = await ethers.deployContract('MSMockNewContract');

    const { _contractCodes: prevContractCodes } = await master.getInternalContracts();

    await governance.addNewInternalContracts([code], [newContract.address], [ContractTypes.Replaceable]);
    const address = await master.getLatestAddress(code);
    assert.equal(address, newContract.address);
    const isInternal = await master.isInternal(newContract.address);
    assert(isInternal, 'Not internal');

    const isActive = await master.contractsActive(newContract.address);
    assert(isActive, 'Not active');

    // contract code gets appended to the end of the list of contract codes
    const { _contractCodes, _contractAddresses } = await master.getInternalContracts();
    assert.equal(_contractCodes.length, prevContractCodes.length + 1);
    assert.equal(_contractCodes[_contractCodes.length - 1], code);
    assert.equal(_contractAddresses[_contractAddresses.length - 1], address);
  });

  it('adds new proxy contract', async function () {
    const fixture = await loadFixture(setup);
    const { master, governance } = fixture;

    const code = hex('XX');
    const newContract = await ethers.deployContract('MSMockNewContract');

    const { _contractCodes: prevContractCodes } = await master.getInternalContracts();

    await governance.addNewInternalContracts([code], [newContract.address], [ContractTypes.Proxy]);
    const proxyAddress = await master.getLatestAddress(code);
    const isInternal = await master.isInternal(proxyAddress);
    assert(isInternal, 'Not internal');

    const isActive = await master.contractsActive(proxyAddress);
    assert(isActive, 'Not active');

    const OwnedUpgradeabilityProxy = await ethers.getContractFactory('OwnedUpgradeabilityProxy');
    const implementation = await (await OwnedUpgradeabilityProxy.attach(proxyAddress)).implementation();
    assert.equal(implementation, newContract.address);

    // contract code gets appended to the end of the list of contract codes
    const { _contractCodes, _contractAddresses } = await master.getInternalContracts();
    assert.equal(_contractCodes.length, prevContractCodes.length + 1);
    assert.equal(_contractCodes[_contractCodes.length - 1], code);
    assert.equal(_contractAddresses[_contractAddresses.length - 1], proxyAddress);
  });

  it('adds new replaceable contract and new proxy contract', async function () {
    const fixture = await loadFixture(setup);
    const { master, governance } = fixture;

    const replaceableCode = hex('RE');
    const proxyCode = hex('PX');
    const newReplaceableContract = await ethers.deployContract('MSMockNewContract');
    const newProxyContract = await ethers.deployContract('MSMockNewContract');

    const { _contractCodes: prevContractCodes } = await master.getInternalContracts();

    await governance.addNewInternalContracts(
      [replaceableCode, proxyCode],
      [newReplaceableContract.address, newProxyContract.address],
      [ContractTypes.Replaceable, ContractTypes.Proxy],
    );

    // contract code gets appended to the end of the list of contract codes
    const { _contractCodes, _contractAddresses } = await master.getInternalContracts();
    assert.equal(_contractCodes.length, prevContractCodes.length + 2);
    assert.equal(_contractCodes[_contractCodes.length - 2], replaceableCode);
    assert.equal(_contractAddresses[_contractAddresses.length - 2], newReplaceableContract.address);

    const proxyAddress = await master.getLatestAddress(proxyCode);
    assert.equal(_contractCodes[_contractCodes.length - 1], proxyCode);
    assert.equal(_contractAddresses[_contractAddresses.length - 1], proxyAddress);
  });
});

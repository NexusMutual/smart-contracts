const { artifacts } = require('hardhat');
const {
  constants: { ZERO_ADDRESS },
  expectRevert,
} = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { hex } = require('../utils').helpers;
const { ContractTypes } = require('../utils').constants;

const MMockNewContract = artifacts.require('MMockNewContract');
const OwnedUpgradeabilityProxy = artifacts.require('OwnedUpgradeabilityProxy');

describe('addNewInternalContracts', function () {
  it('reverts when not called by governance', async function () {
    const { master } = this;

    await expectRevert(master.addNewInternalContracts([], [], []), 'Not authorized');
  });

  it('reverts when contract code already in use', async function () {
    const { governance } = this;

    await expectRevert(
      governance.addNewInternalContracts(
        [hex('GV')],
        ['0x0000000000000000000000000000000000000001'],
        [ContractTypes.Replaceable],
      ),
      'NXMaster: Code already in use',
    );
  });

  it('reverts when contract address is 0', async function () {
    const { governance } = this;

    await expectRevert(
      governance.addNewInternalContracts([hex('XX')], [ZERO_ADDRESS], [ContractTypes.Replaceable]),
      'NXMaster: Contract address is 0',
    );
  });

  it('reverts when contract type is unknown', async function () {
    const { governance } = this;

    await expectRevert(
      governance.addNewInternalContracts([hex('XX')], ['0x0000000000000000000000000000000000000001'], ['15']),
      'NXMaster: Unsupported contract type',
    );
  });

  it('adds new replaceable contract', async function () {
    const { master, governance } = this;

    const code = hex('XX');
    const newContract = await MMockNewContract.new();

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
    const { master, governance } = this;

    const code = hex('XX');
    const newContract = await MMockNewContract.new();

    const { _contractCodes: prevContractCodes } = await master.getInternalContracts();

    await governance.addNewInternalContracts([code], [newContract.address], [ContractTypes.Proxy]);
    const proxyAddress = await master.getLatestAddress(code);
    const isInternal = await master.isInternal(proxyAddress);
    assert(isInternal, 'Not internal');

    const isActive = await master.contractsActive(proxyAddress);
    assert(isActive, 'Not active');

    const implementation = await (await OwnedUpgradeabilityProxy.at(proxyAddress)).implementation();
    assert.equal(implementation, newContract.address);

    // contract code gets appended to the end of the list of contract codes
    const { _contractCodes, _contractAddresses } = await master.getInternalContracts();
    assert.equal(_contractCodes.length, prevContractCodes.length + 1);
    assert.equal(_contractCodes[_contractCodes.length - 1], code);
    assert.equal(_contractAddresses[_contractAddresses.length - 1], proxyAddress);
  });

  it('adds new replaceable contract and new proxy contract', async function () {
    const { master, governance } = this;

    const replaceableCode = hex('RE');
    const proxyCode = hex('PX');
    const newReplaceableContract = await MMockNewContract.new();
    const newProxyContract = await MMockNewContract.new();

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

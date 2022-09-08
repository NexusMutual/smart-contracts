const { artifacts } = require('hardhat');
const {
  constants: { ZERO_ADDRESS },
  expectRevert,
} = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { hex } = require('../utils').helpers;
const { ContractTypes } = require('../utils').constants;

const MMockNewContract = artifacts.require('MMockNewContract');

describe('removeContracts', function () {
  it('reverts when not called by governance', async function () {
    const { master } = this;

    await expectRevert(master.removeContracts([]), 'Not authorized');
  });

  it('reverts when contract code does not exist', async function () {
    const { governance } = this;

    await expectRevert(governance.removeContracts([hex('XX')]), 'NXMaster: Address is 0');
  });

  it('remove newly added contracts', async function () {
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

    const proxyAddress = await master.getLatestAddress(proxyCode);

    await governance.removeContracts([replaceableCode, proxyCode]);

    const { _contractCodes } = await master.getInternalContracts();
    assert.equal(_contractCodes.length, prevContractCodes.length);

    {
      const addressAfterDeletion = await master.getLatestAddress(replaceableCode);
      assert.equal(addressAfterDeletion, ZERO_ADDRESS);
      const isInternal = await master.isInternal(newReplaceableContract.address);
      assert.equal(isInternal, false);
    }

    {
      const addressAfterDeletion = await master.getLatestAddress(proxyCode);
      assert.equal(addressAfterDeletion, ZERO_ADDRESS);
      const isInternal = await master.isInternal(proxyAddress);
      assert.equal(isInternal, false);
    }
  });
});

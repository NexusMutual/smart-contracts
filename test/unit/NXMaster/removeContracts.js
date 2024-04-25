const { ethers } = require('hardhat');
const { assert, expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

const { hex } = require('../utils').helpers;
const { ContractTypes } = require('../utils').constants;
const {
  constants: { AddressZero },
} = ethers;

describe('removeContracts', function () {
  it('reverts when not called by governance', async function () {
    const fixture = await loadFixture(setup);
    const { master } = fixture;

    await expect(master.removeContracts([])).to.be.revertedWith('Not authorized');
  });

  it('reverts when contract code does not exist', async function () {
    const fixture = await loadFixture(setup);
    const { governance } = fixture;

    await expect(governance.removeContracts([hex('XX')])).to.be.revertedWith('NXMaster: Address is 0');
  });

  it('remove newly added contracts', async function () {
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

    const proxyAddress = await master.getLatestAddress(proxyCode);

    await governance.removeContracts([replaceableCode, proxyCode]);

    const { _contractCodes } = await master.getInternalContracts();
    assert.equal(_contractCodes.length, prevContractCodes.length);

    {
      const addressAfterDeletion = await master.getLatestAddress(replaceableCode);
      assert.equal(addressAfterDeletion, AddressZero);
      const isInternal = await master.isInternal(newReplaceableContract.address);
      assert.equal(isInternal, false);
    }

    {
      const addressAfterDeletion = await master.getLatestAddress(proxyCode);
      assert.equal(addressAfterDeletion, AddressZero);
      const isInternal = await master.isInternal(proxyAddress);
      assert.equal(isInternal, false);
    }
  });
});

const { accounts, web3 } = require('hardhat');
const { expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { ProposalCategory } = require('../utils').constants;
const { submitProposal } = require('../utils').governance;
const { hex } = require('../utils').helpers;

const [owner, emergencyAdmin, unknown] = accounts;

const MMockNewContract = artifacts.require('MMockNewContract');
const Quotation = artifacts.require('Quotation');
const Incidents = artifacts.require('Incidents');
const OwnedUpgradeabilityProxy = artifacts.require('OwnedUpgradeabilityProxy');

describe('master', function () {

  it('adds new contract', async function () {
    const { master, gv, pc, tk } = this.contracts;

    const code = hex('XX');
    const newContract = await MMockNewContract.new();
    const actionData = web3.eth.abi.encodeParameters(['bytes2', 'address', 'uint'], [code, newContract.address, '1']);
    await submitProposal(gv, ProposalCategory.newContract, actionData, [owner]);

    const address = await master.getLatestAddress(code);
    assert.equal(address, newContract.address);
  });

  it('replace contract', async function () {
    const { master, gv, pc, tk } = this.contracts;

    const code = hex('QT');
    const quotation = await Quotation.new();

    const contractCodes = [code];
    const newAddresses = [quotation.address];

    const upgradeContractsData = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]'],
      [
        contractCodes,
        newAddresses,
      ],
    );
    await submitProposal(gv, ProposalCategory.upgradeNonProxy, upgradeContractsData, [owner]);

    const address = await master.getLatestAddress(code);
    assert.equal(address, quotation.address);
  });

  it('upgrade proxy contract', async function () {
    const { master, gv, pc, tk } = this.contracts;

    const code = hex('IC');
    const incidents = await Incidents.new();

    const contractCodes = [code];
    const newAddresses = [incidents.address];

    const upgradeContractsData = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]'],
      [
        contractCodes,
        newAddresses,
      ],
    );
    await submitProposal(gv, ProposalCategory.upgradeNonProxy, upgradeContractsData, [owner]);

    const address = await master.getLatestAddress(code);

    const implementation = (await OwnedUpgradeabilityProxy.at(address)).implementation();
    assert.equal(address, incidents.address);
  });
});

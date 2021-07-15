const { accounts, web3 } = require('hardhat');
const { expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { ProposalCategory } = require('../utils').constants;
const { submitProposal } = require('../utils').governance;
const { hex } = require('../utils').helpers;

const [owner, emergencyAdmin, unknown] = accounts;

const MMockNewContract = artifacts.require('MMockNewContract');

describe.skip('master', function () {

  it('adds new contract', async function () {
    const { master, gv, pc, tk } = this.contracts;

    const code = hex('XX');
    const newContract = await MMockNewContract.new();
    const actionData = web3.eth.abi.encodeParameters(['bytes2', 'address', 'uint'], [code, newContract.address, '1']);
    await submitProposal(gv, ProposalCategory.newContract, actionData, [owner]);

    const address = await master.getLatestAddress(code);
    assert.equal(address, newContract.address);
  });
});

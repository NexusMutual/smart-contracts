const { accounts, web3 } = require('hardhat');
const { expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { ProposalCategory } = require('../utils').constants;
const { submitProposal } = require('../utils').governance;

const [owner, emergencyAdmin, unknown] = accounts;

describe('master', function () {

  it('adds new contract', async function () {
    const { master, gv, pc, tk } = this.contracts;

    await submitProposal(gv, pc, ProposalCategory.newContract);
  });
});

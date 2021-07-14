const { accounts, web3 } = require('hardhat');
const { expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { ProposalCategory } = require('../utils').constants;
const { hex } = require('../utils').helpers;

const [owner, emergencyAdmin, unknown] = accounts;

describe('master', function () {
});

const fetch = require('node-fetch');
const { artifacts, web3, accounts, network } = require('hardhat');
const { ether, time } = require('@openzeppelin/test-helpers');

const {
  submitGovernanceProposal,
  getAddressByCodeFactory,
  Address,
  fund,
  unlock,
} = require('./utils');
const { hex } = require('../utils').helpers;
const { ProposalCategory, CoverStatus } = require('../utils').constants;

const OwnedUpgradeabilityProxy = artifacts.require('OwnedUpgradeabilityProxy');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMaster');
const NXMToken = artifacts.require('NXMToken');
const Governance = artifacts.require('Governance');
const TokenFunctions = artifacts.require('TokenFunctions');
const Quotation = artifacts.require('Quotation');
const TokenController = artifacts.require('TokenController');
const Gateway = artifacts.require('Gateway');
const Incidents = artifacts.require('Incidents');
const ERC20MintableDetailed = artifacts.require('ERC20MintableDetailed');
const Pool = artifacts.require('Pool');
const QuotationData = artifacts.require('QuotationData');

describe('sample test', function () {

  this.timeout(0);
  require('./basic-functionality-tests');
});

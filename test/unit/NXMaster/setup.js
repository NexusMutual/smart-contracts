const { artifacts, web3, accounts } = require('hardhat');
const { ether } = require('@openzeppelin/test-helpers');

const { Role, ContractTypes } = require('../utils').constants;
const { hex } = require('../utils').helpers;

const { BN } = web3.utils;

async function setup () {

  const DisposableNXMaster = artifacts.require('DisposableNXMaster');
  const MSMockGovernance = artifacts.require('MSMockGovernance');
  const TokenMock = artifacts.require('NXMTokenMock');

  const [owner, emergencyAdmin] = accounts;

  const token = await TokenMock.new();
  const master = await DisposableNXMaster.new();
  const governance = await MSMockGovernance.new();

  await governance.changeMasterAddress(master.address);

  const codes = ['GV'];
  const addresses = [governance.address];
  const contractTypes = [ContractTypes.Replaceable];
  await master.initialize(
    owner,
    token.address,
    emergencyAdmin,
    codes.map(hex), // codes
    contractTypes, // types
    addresses, // addresses
  );

  this.master = master;
  this.token = token;
  this.governance = governance;
}

module.exports = setup;

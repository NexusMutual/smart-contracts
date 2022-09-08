const { artifacts, accounts } = require('hardhat');

const { ContractTypes } = require('../utils').constants;
const { hex } = require('../utils').helpers;

async function setup() {
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

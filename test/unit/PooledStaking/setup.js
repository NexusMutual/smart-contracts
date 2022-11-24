const { artifacts } = require('hardhat');
const { ether } = require('@openzeppelin/test-helpers');

const { Role } = require('../utils').constants;
const { hex } = require('../utils').helpers;
const accounts = require('../utils').accounts;

const MasterMock = artifacts.require('MasterMock');
const MemberRolesMock = artifacts.require('MemberRolesMock');
const DisposablePooledStaking = artifacts.require('DisposablePooledStaking');
const TokenMock = artifacts.require('NXMTokenMock');
const TokenControllerMock = artifacts.require('TokenControllerMock');

async function setup() {
  const master = await MasterMock.new();
  const memberRoles = await MemberRolesMock.new();
  const staking = await DisposablePooledStaking.new();
  const token = await TokenMock.new();
  const tokenController = await TokenControllerMock.new();

  await token.mint(accounts.defaultSender, ether('10000'));

  // set contract addresses
  await master.setTokenAddress(token.address);
  await master.setLatestAddress(hex('TC'), tokenController.address);
  await master.setLatestAddress(hex('MR'), memberRoles.address);
  await master.setLatestAddress(hex('PS'), staking.address);

  // required to be able to whitelist itself
  await master.enrollInternal(staking.address);

  // set master address
  await staking.changeMasterAddress(master.address);
  await tokenController.changeMasterAddress(master.address);

  // pull other addresses from master
  await staking.changeDependentContractAddress();
  await tokenController.changeDependentContractAddress();

  for (const member of accounts.members) {
    await master.enrollMember(member, Role.Member);
    await memberRoles.setRole(member, Role.Member);
  }

  for (const advisoryBoardMember of accounts.advisoryBoardMembers) {
    await master.enrollMember(advisoryBoardMember, Role.AdvisoryBoard);
    await memberRoles.setRole(advisoryBoardMember, Role.AdvisoryBoard);
  }

  for (const internalContract of accounts.internalContracts) {
    await master.enrollInternal(internalContract);
  }

  // there is only one in reality, but it doesn't matter
  for (const governanceContract of accounts.governanceContracts) {
    await master.enrollGovernance(governanceContract);
  }

  // initialize token
  await token.setOperator(tokenController.address);

  // initialize then migrate
  await staking.changeDependentContractAddress();

  // revert initialized values for unit tests
  await staking.initialize(
    tokenController.address,
    '0', // MIN_STAKE
    '0', // MIN_UNSTAKE
    '0', // MAX_EXPOSURE
    '0', // UNSTAKE_LOCK_TIME
  );

  this.master = master;
  this.token = token;
  this.tokenController = tokenController;
  this.staking = staking;
  this.memberRoles = memberRoles;
}

module.exports = setup;

const { contract, defaultSender } = require('@openzeppelin/test-environment');
const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const { Role, ParamType } = require('./utils').constants;
const accounts = require('./utils').accounts;
const { hex } = require('./utils').helpers;

const MasterMock = contract.fromArtifact('MasterMock');
const MemberRolesMock = contract.fromArtifact('MemberRolesMock');
const PooledStaking = contract.fromArtifact('PooledStaking');
const TokenMock = contract.fromArtifact('NXMTokenMock');
const TokenControllerMock = contract.fromArtifact('TokenControllerMock');

async function setup () {

  const master = await MasterMock.new();
  const memberRoles = await MemberRolesMock.new();
  const staking = await PooledStaking.new();
  const token = await TokenMock.new();
  const tokenController = await TokenControllerMock.new();

  token.mint(defaultSender, ether('10000'));

  // set contract addresses
  await master.setTokenAddress(token.address);
  await master.setLatestAddress(hex('TC'), tokenController.address);
  await master.setLatestAddress(hex('MR'), memberRoles.address);

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
  }

  for (const advisoryBoardMember of accounts.advisoryBoardMembers) {
    await master.enrollMember(advisoryBoardMember, Role.AdvisoryBoard);
  }

  for (const internalContract of accounts.internalContracts) {
    await master.enrollInternal(internalContract);
  }

  // there is only one in reality, but it doesn't matter
  for (const governanceContract of accounts.governanceContracts) {
    await master.enrollGovernance(governanceContract);
  }

  await expectRevert(
    staking.depositAndStake(ether('1'), [], []),
    'Contract is not initialized',
  );

  // initialize then migrate
  await staking.changeDependentContractAddress();
  await staking.migrateStakers('1');

  assert(await staking.initialized(), 'Pooled staking contract should have been initialized');

  // revert initialized values for unit tests
  const firstGovernanceAddress = accounts.governanceContracts[0];
  await staking.updateUintParameters(ParamType.MIN_STAKE, 0, { from: firstGovernanceAddress });
  await staking.updateUintParameters(ParamType.MIN_UNSTAKE, 0, { from: firstGovernanceAddress });
  await staking.updateUintParameters(ParamType.MAX_EXPOSURE, 0, { from: firstGovernanceAddress });
  await staking.updateUintParameters(ParamType.UNSTAKE_LOCK_TIME, 0, { from: firstGovernanceAddress });

  this.master = master;
  this.token = token;
  this.staking = staking;
}

module.exports = setup;

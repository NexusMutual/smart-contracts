const { contract, defaultSender } = require('@openzeppelin/test-environment');
const { ether } = require('@openzeppelin/test-helpers');

const { Role, ParamType } = require('./constants');
const accounts = require('./accounts');
const { hex } = require('./helpers');

const MasterMock = contract.fromArtifact('MasterMock');
const PooledStaking = contract.fromArtifact('PooledStaking');
const TokenMock = contract.fromArtifact('TokenMock');
const TokenControllerMock = contract.fromArtifact('TokenControllerMock');

async function setup () {

  const master = await MasterMock.new();
  const staking = await PooledStaking.new();
  const token = await TokenMock.new();
  const tokenController = await TokenControllerMock.new();

  token.mint(defaultSender, ether('1000'));

  // set contract addresses
  await master.setTokenAddress(token.address);
  await master.setLatestAddress(hex('TC'), tokenController.address);

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

  // revert initialized values for unit tests
  const firstGovernanceAddress = accounts.governanceContracts[0];
  await staking.updateParameter(ParamType.MIN_ALLOCATION, 0, { from: firstGovernanceAddress });
  await staking.updateParameter(ParamType.MIN_ALLOWED_DEALLOCATION, 0, { from: firstGovernanceAddress });
  await staking.updateParameter(ParamType.MAX_LEVERAGE, 0, { from: firstGovernanceAddress });
  await staking.updateParameter(ParamType.DEALLOCATE_LOCK_TIME, 0, { from: firstGovernanceAddress });

  this.master = master;
  this.token = token;
  this.staking = staking;
}

module.exports = setup;

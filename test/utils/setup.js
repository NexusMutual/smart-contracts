const { contract } = require('@openzeppelin/test-environment');

const { Role } = require('./constants');
const accounts = require('./accounts');

const MasterMock = contract.fromArtifact('MasterMock');
const PooledStaking = contract.fromArtifact('PooledStaking');
const TokenMock = contract.fromArtifact('TokenMock');

async function setup () {

  const master = await MasterMock.new();
  const token = await TokenMock.new();
  const staking = await PooledStaking.new();

  await token.initialize();

  for (const member of accounts.members) {
    await master.enrollMember(member, Role.Member);
  }

  for (const advisoryBoardMember of accounts.advisoryBoardMembers) {
    await master.enrollMember(advisoryBoardMember, Role.AdvisoryBoard);
  }

  for (const internalContract of accounts.internalContracts) {
    await master.enrollInternal(internalContract);
  }

  for (const governanceContract of accounts.governanceContracts) {
    await master.enrollGovernance(governanceContract);
  }

  await staking.initialize(master.address, token.address);

  this.master = master;
  this.token = token;
  this.staking = staking;
}

module.exports = setup;

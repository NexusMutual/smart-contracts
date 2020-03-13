const { contract } = require('@openzeppelin/test-environment');

const { Role } = require('./constants');
const accounts = require('./accounts');

const MasterMock = contract.fromArtifact('MasterMock');
const PooledStaking = contract.fromArtifact('PooledStaking');

async function setup () {

  const master = await MasterMock.new();
  const staking = await PooledStaking.new();

  for (const member of accounts.members) {
    await master.enrollMember(member, Role.Member);
  }

  for (const advisoryBoardMember of accounts.advisoryBordMembers) {
    await master.enrollMember(advisoryBoardMember, Role.AdvisoryBord);
  }

  for (const internalContract of accounts.internalContracts) {
    await master.enrollInternal(internalContract);
  }

  for (const governanceContract of accounts.governanceContracts) {
    await master.enrollGovernance(governanceContract);
  }

  await staking.initialize(master.address);

  this.master = master;
  this.staking = staking;
}

module.exports = setup;

const { contract, defaultSender } = require('@openzeppelin/test-environment');
const { ether } = require('@openzeppelin/test-helpers');

const { Role } = require('./constants');
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
  await master.setLatestAddress(hex('TK'), token.address);
  await master.setLatestAddress(hex('TC'), tokenController.address);

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

  for (const governanceContract of accounts.governanceContracts) {
    await master.enrollGovernance(governanceContract);
  }

  this.master = master;
  this.token = token;
  this.staking = staking;
}

module.exports = setup;

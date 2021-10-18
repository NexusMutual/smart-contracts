const { artifacts } = require('hardhat');
const {
  defaultSender,
  members,
  internalContracts: [internal],
  governanceContracts: [governance],
} = require('../utils').accounts;

async function setup () {
  const TokenController = artifacts.require('TokenController');
  const NXMToken = artifacts.require('NXMToken');
  const MasterMock = artifacts.require('MasterMock');

  const token = await NXMToken.new(defaultSender, '0');

  const master = await MasterMock.new();
  await master.enrollInternal(internal);
  await master.enrollGovernance(governance);
  await master.setTokenAddress(token.address);

  const tokenController = await TokenController.new('0x0000000000000000000000000000000000000000');
  await tokenController.changeMasterAddress(master.address);
  await tokenController.changeDependentContractAddress();
  await tokenController.changeOperator(tokenController.address, { from: internal });

  for (const member of [...members, tokenController.address]) {
    await tokenController.addToWhitelist(member, { from: internal });
  }

  this.master = master;
  this.token = token;
  this.tokenController = tokenController;
}

module.exports = setup;

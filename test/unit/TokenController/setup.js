const { ethers } = require('hardhat');
const { getAccounts } = require('../../utils/accounts');

async function setup () {
  const TokenController = await ethers.getContractFactory('TokenController');
  const tokenController = await TokenController.deploy('0x0000000000000000000000000000000000000000');
  await tokenController.deployed();

  const MasterMock = await ethers.getContractFactory('MasterMock');
  const master = await MasterMock.deploy();
  await master.deployed();

  const signers = await ethers.getSigners();
  const accounts = getAccounts(signers);
  const { internalContracts, members } = accounts;
  const internal = internalContracts[0];

  await master.enrollGovernance(accounts.governanceContracts[0].address);

  const NXM = await ethers.getContractFactory('NXMToken');
  const token = await NXM.deploy(accounts.defaultSender.address, '0');
  await token.deployed();

  await master.enrollInternal(internal.address);
  await master.setTokenAddress(token.address);

  await tokenController.changeMasterAddress(master.address);
  await tokenController.changeDependentContractAddress();
  await tokenController.connect(internal).changeOperator(tokenController.address);

  for (const member of [...members, tokenController]) {
    await tokenController.connect(internal).addToWhitelist(member.address);
  }

  this.master = master;
  this.token = token;
  this.tokenController = tokenController;

  this.members = members;
  this.internal = internal;
}

module.exports = setup;

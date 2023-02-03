const { ethers } = require('hardhat');
const { getAccounts } = require('../../utils/accounts');
const { Role } = require('../../../lib/constants');
const { hex } = require('../utils').helpers;

async function setup() {
  const tokenController = await ethers.deployContract('TokenController', [
    '0x0000000000000000000000000000000000000000',
    '0x0000000000000000000000000000000000000000',
    '0x0000000000000000000000000000000000000000',
  ]);

  const master = await ethers.deployContract('MasterMock');

  const accounts = await getAccounts();
  const { internalContracts, members } = accounts;
  const internal = internalContracts[0];

  await master.enrollGovernance(accounts.governanceContracts[0].address);

  const nxm = await ethers.deployContract('NXMTokenMock');

  const governance = await ethers.deployContract('TCMockGovernance');

  const assessment = await ethers.deployContract('TCMockAssessment');

  await master.enrollInternal(internal.address);
  await master.setTokenAddress(nxm.address);

  await tokenController.changeMasterAddress(master.address);
  await tokenController.changeDependentContractAddress();
  await nxm.mint(tokenController.address, ethers.utils.parseUnits('1000'));

  for (const member of [...members, tokenController]) {
    await master.enrollMember(member.address, Role.Member);
    await tokenController.connect(internal).addToWhitelist(member.address);
  }

  master.setLatestAddress(hex('GV'), accounts.governanceContracts[0].address);
  await tokenController.connect(accounts.governanceContracts[0]).changeOperator(tokenController.address);

  const masterInitTxs = await Promise.all([
    master.setTokenAddress(nxm.address),
    master.setLatestAddress(hex('GV'), governance.address),
    master.setLatestAddress(hex('AS'), assessment.address),
  ]);
  await Promise.all(masterInitTxs.map(x => x.wait()));

  await tokenController.changeDependentContractAddress();

  this.accounts = accounts;
  this.contracts = {
    nxm,
    master,
    governance,
    tokenController,
    assessment,
  };
}

module.exports = setup;

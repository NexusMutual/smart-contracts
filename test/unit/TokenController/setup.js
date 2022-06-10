const { ethers } = require('hardhat');
const { getAccounts } = require('../../utils/accounts');
const { hex } = require('../utils').helpers;

async function setup () {
  const TokenController = await ethers.getContractFactory('TokenController');
  const tokenController = await TokenController.deploy(
    '0x0000000000000000000000000000000000000000',
    '0x0000000000000000000000000000000000000000',
  );
  await tokenController.deployed();

  const MasterMock = await ethers.getContractFactory('MasterMock');
  const master = await MasterMock.deploy();
  await master.deployed();

  const signers = await ethers.getSigners();
  const accounts = getAccounts(signers);
  const { internalContracts, members } = accounts;
  const internal = internalContracts[0];

  await master.enrollGovernance(accounts.governanceContracts[0].address);

  const NXM = await ethers.getContractFactory('NXMTokenMock');
  const nxm = await NXM.deploy();
  await nxm.deployed();

  const Governance = await ethers.getContractFactory('TCMockGovernance');
  const governance = await Governance.deploy();
  await governance.deployed();

  await master.enrollInternal(internal.address);
  await master.setTokenAddress(nxm.address);

  const masterInitTxs = await Promise.all([
    master.setTokenAddress(nxm.address),
    master.setLatestAddress(hex('GV'), governance.address),
  ]);
  await Promise.all(masterInitTxs.map(x => x.wait()));

  await tokenController.changeMasterAddress(master.address);
  await tokenController.changeDependentContractAddress();
  await tokenController.connect(internal).changeOperator(tokenController.address);
  await nxm.mint(tokenController.address, ethers.utils.parseUnits('1000'));

  for (const member of [...members, tokenController]) {
    await master.enrollMember(member.address, 2);
    await tokenController.connect(internal).addToWhitelist(member.address);
  }

  this.accounts = accounts;
  this.contracts = {
    nxm,
    master,
    governance,
    tokenController,
  };
}

module.exports = setup;

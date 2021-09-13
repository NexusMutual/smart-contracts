const { ethers } = require('hardhat');
const { hex } = require('../../../lib/helpers');
const { getAccounts } = require('../../utils/accounts');
const { parseEther } = ethers.utils;

async function setup () {
  const NXM = await ethers.getContractFactory('NXMTokenMock');
  const nxm = await NXM.deploy();
  await nxm.deployed();

  const MemberRoles = await ethers.getContractFactory('MemberRolesMock');
  const memberRoles = await MemberRoles.deploy();
  await memberRoles.deployed();

  const ASMockTokenController = await ethers.getContractFactory('ASMockTokenController');
  const tokenController = await ASMockTokenController.deploy(nxm.address);
  await tokenController.deployed();

  nxm.setOperator(tokenController.address);

  const Master = await ethers.getContractFactory('MasterMock');
  const master = await Master.deploy();
  await master.deployed();

  const DAI = await ethers.getContractFactory('ERC20BlacklistableMock');
  const dai = await DAI.deploy();
  await dai.deployed();

  const Assessment = await ethers.getContractFactory('Assessment');
  const assessment = await Assessment.deploy(nxm.address);
  await assessment.deployed();

  const masterInitTxs = await Promise.all([
    master.setLatestAddress(hex('TC'), tokenController.address),
    master.setTokenAddress(nxm.address),
  ]);
  await Promise.all(masterInitTxs.map(x => x.wait()));

  {
    const tx = await assessment.initialize(master.address);
    await tx.wait();
  }
  {
    const tx = await assessment.changeDependentContractAddress();
    await tx.wait();
  }

  const signers = await ethers.getSigners();
  const accounts = getAccounts(signers);
  await master.enrollGovernance(accounts.governanceContracts[0].address);
  for (const member of accounts.members) {
    await master.enrollMember(member.address, 1);
    await nxm.mint(member.address, ethers.utils.parseEther('10000'));
    await nxm.connect(member).approve(tokenController.address, ethers.utils.parseEther('10000'));
  }

  const config = await assessment.config();

  this.config = config;
  this.accounts = accounts;
  this.contracts = {
    nxm,
    dai,
    assessment,
    master,
  };
}

module.exports = {
  setup,
};

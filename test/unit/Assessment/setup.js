const { ethers } = require('hardhat');
const { hex } = require('../../../lib/helpers');
const { parseEther } = ethers.utils;

async function setup () {
  const NXM = await ethers.getContractFactory('NXMTokenMock');
  const nxm = await NXM.deploy();
  await nxm.deployed();

  const MemberRoles = await ethers.getContractFactory('MemberRolesMock');
  const memberRoles = await MemberRoles.deploy();
  await memberRoles.deployed();

  const AssessmentMockPool = await ethers.getContractFactory('AssessmentMockPool');
  const pool = await AssessmentMockPool.deploy();
  await pool.deployed();

  const AssessmentMockTokenController = await ethers.getContractFactory('AssessmentMockTokenController');
  const tokenController = await AssessmentMockTokenController.deploy();
  await tokenController.deployed();

  const Master = await ethers.getContractFactory('MasterMock');
  const master = await Master.deploy();
  await master.deployed();
  const masterInitTxs = await Promise.all([
    master.setLatestAddress(hex('TK'), nxm.address),
    master.setLatestAddress(hex('TC'), tokenController.address),
    master.setLatestAddress(hex('MR'), memberRoles.address),
    master.setLatestAddress(hex('P1'), pool.address),
  ]);
  await Promise.all(masterInitTxs.map(x => x.wait()));

  const DAI = await ethers.getContractFactory('ERC20BlacklistableMock');
  const dai = await DAI.deploy();
  await dai.deployed();

  const Assessment = await ethers.getContractFactory('Assessment');
  const assessment = await Assessment.deploy();
  await assessment.deployed();
  {
    const tx = await assessment.changeMasterAddress(master.address);
    await tx.wait();
  }
  {
    const tx = await assessment.changeDependentContractAddress();
    await tx.wait();
  }

  const accounts = await ethers.getSigners();
  // Use address 0 as governance
  await master.enrollGovernance(accounts[0].address);
  for (const account of accounts) {
    await master.enrollMember(account.address, 1);
    await nxm.mint(account.address, ethers.utils.parseEther('100'));
    await nxm.connect(account).approve(assessment.address, ethers.utils.parseEther('100'));
  }

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

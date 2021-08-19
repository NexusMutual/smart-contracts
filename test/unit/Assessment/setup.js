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

  const DAI = await ethers.getContractFactory('ERC20BlacklistableMock');
  const dai = await DAI.deploy();
  await dai.deployed();

  // const AssessmentClaimsDisplayLib = await ethers.getContractFactory('AssessmentClaimsDisplayLib');
  // const assessmentClaimsDisplayLib = await AssessmentClaimsDisplayLib.deploy();
  // await assessmentClaimsDisplayLib.deployed();

  const AssessmentClaimsLib = await ethers.getContractFactory('AssessmentClaimsLib');
  const assessmentClaimsLib = await AssessmentClaimsLib.deploy();
  await assessmentClaimsLib.deployed();

  const AssessmentIncidentsLib = await ethers.getContractFactory('AssessmentIncidentsLib');
  const assessmentIncidentsLib = await AssessmentIncidentsLib.deploy();
  await assessmentIncidentsLib.deployed();

  const AssessmentStakeLib = await ethers.getContractFactory('AssessmentStakeLib');
  const assessmentStakeLib = await AssessmentStakeLib.deploy();
  await assessmentStakeLib.deployed();

  const AssessmentGovernanceActionsLib = await ethers.getContractFactory('AssessmentGovernanceActionsLib');
  const assessmentGovernanceActionsLib = await AssessmentGovernanceActionsLib.deploy();
  await assessmentGovernanceActionsLib.deployed();

  const Assessment = await ethers.getContractFactory('Assessment', {
    libraries: {
      AssessmentClaimsLib: assessmentClaimsLib.address,
      AssessmentIncidentsLib: assessmentIncidentsLib.address,
      AssessmentStakeLib: assessmentStakeLib.address,
      AssessmentGovernanceActionsLib: assessmentGovernanceActionsLib.address,
    },
  });
  const assessment = await Assessment.deploy(
    '0x0000000000000000000000000000000000000000',
    '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  );
  await assessment.deployed();

  const masterInitTxs = await Promise.all([
    master.setLatestAddress(hex('TK'), nxm.address),
    master.setLatestAddress(hex('TC'), tokenController.address),
    master.setLatestAddress(hex('MR'), memberRoles.address),
    master.setLatestAddress(hex('P1'), pool.address),
    master.setLatestAddress(hex('AS'), assessment.address),
  ]);
  await Promise.all(masterInitTxs.map(x => x.wait()));

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
    await nxm.mint(account.address, ethers.utils.parseEther('10000'));
    await nxm.connect(account).approve(assessment.address, ethers.utils.parseEther('10000'));
  }

  const config = await assessment.CONFIG();
  this.MIN_VOTING_PERIOD_DAYS = config.MIN_VOTING_PERIOD_DAYS;
  this.MAX_VOTING_PERIOD_DAYS = config.MAX_VOTING_PERIOD_DAYS;
  this.CLAIM_ASSESSMENT_DEPOSIT_PERC = config.CLAIM_ASSESSMENT_DEPOSIT_PERC;

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

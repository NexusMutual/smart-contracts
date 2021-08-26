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

  const AssessmentMockTokenController = await ethers.getContractFactory('AssessmentMockTokenController');
  const tokenController = await AssessmentMockTokenController.deploy(nxm.address);
  await tokenController.deployed();

  nxm.setOperator(tokenController.address);

  const Master = await ethers.getContractFactory('MasterMock');
  const master = await Master.deploy();
  await master.deployed();

  const DAI = await ethers.getContractFactory('ERC20BlacklistableMock');
  const dai = await DAI.deploy();
  await dai.deployed();

  const AssessmentMockPool = await ethers.getContractFactory('AssessmentMockPool');
  const pool = await AssessmentMockPool.deploy();
  await pool.deployed();
  await pool.addAsset('0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE');
  await pool.addAsset(dai.address);

  const AssessmentClaimsLib = await ethers.getContractFactory('AssessmentClaimsLib');
  const assessmentClaimsLib = await AssessmentClaimsLib.deploy();
  await assessmentClaimsLib.deployed();

  const AssessmentIncidentsLib = await ethers.getContractFactory('AssessmentIncidentsLib');
  const assessmentIncidentsLib = await AssessmentIncidentsLib.deploy();
  await assessmentIncidentsLib.deployed();

  const AssessmentVoteLib = await ethers.getContractFactory('AssessmentVoteLib');
  const assessmentVoteLib = await AssessmentVoteLib.deploy();
  await assessmentVoteLib.deployed();

  const AssessmentGovernanceActionsLib = await ethers.getContractFactory('AssessmentGovernanceActionsLib');
  const assessmentGovernanceActionsLib = await AssessmentGovernanceActionsLib.deploy();
  await assessmentGovernanceActionsLib.deployed();

  const Assessment = await ethers.getContractFactory('Assessment', {
    libraries: {
      AssessmentClaimsLib: assessmentClaimsLib.address,
      AssessmentIncidentsLib: assessmentIncidentsLib.address,
      AssessmentVoteLib: assessmentVoteLib.address,
      AssessmentGovernanceActionsLib: assessmentGovernanceActionsLib.address,
    },
  });
  const assessment = await Assessment.deploy(master.address);
  await assessment.deployed();

  const Cover = await ethers.getContractFactory('AssessmentMockCover');
  const cover = await Cover.deploy('Nexus Mutual Cover', 'NXC');
  await cover.deployed();

  const masterInitTxs = await Promise.all([
    master.setLatestAddress(hex('TC'), tokenController.address),
    master.setLatestAddress(hex('MR'), memberRoles.address),
    master.setLatestAddress(hex('P1'), pool.address),
    master.setLatestAddress(hex('AS'), assessment.address),
    master.setLatestAddress(hex('CO'), cover.address),
    master.setTokenAddress(nxm.address),
  ]);
  await Promise.all(masterInitTxs.map(x => x.wait()));

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
    await nxm.connect(account).approve(tokenController.address, ethers.utils.parseEther('10000'));
  }

  const AssessmentVoteLibTest = await ethers.getContractFactory('AssessmentVoteLibTest');
  const assessmentVoteLibTest = await AssessmentVoteLibTest.deploy();
  await assessmentVoteLibTest.deployed();

  const AssessmentClaimsLibTest = await ethers.getContractFactory('AssessmentClaimsLibTest');
  const assessmentClaimsLibTest = await AssessmentClaimsLibTest.deploy();
  await assessmentClaimsLibTest.deployed();

  const AssessmentIncidentsLibTest = await ethers.getContractFactory('AssessmentIncidentsLibTest');
  const assessmentIncidentsLibTest = await AssessmentIncidentsLibTest.deploy();
  await assessmentIncidentsLibTest.deployed();

  const AssessmentGovernanceActionsLibTest = await ethers.getContractFactory('AssessmentGovernanceActionsLibTest', {
    libraries: {
      AssessmentGovernanceActionsLib: assessmentGovernanceActionsLib.address,
    },
  });
  const assessmentGovernanceActionsLibTest = await AssessmentGovernanceActionsLibTest.deploy();
  await assessmentGovernanceActionsLibTest.deployed();

  const config = await assessment.config();

  this.config = config;
  this.accounts = accounts;
  this.contracts = {
    nxm,
    dai,
    assessment,
    cover,
    master,
    assessmentVoteLibTest,
    assessmentGovernanceActionsLibTest,
  };
}

module.exports = {
  setup,
};

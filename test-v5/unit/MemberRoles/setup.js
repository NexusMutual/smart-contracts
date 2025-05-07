const { ethers } = require('hardhat');
const { getAccounts } = require('../utils').accounts;

const { hex } = require('../utils').helpers;
const { Role } = require('../utils').constants;

const { AddressZero } = ethers.constants;
const { parseEther, formatBytes32String } = ethers.utils;

async function setup() {
  const accounts = await getAccounts();
  const NXM = await ethers.getContractFactory('NXMTokenMock');
  const nxm = await NXM.deploy();

  const TokenControllerMock = await ethers.getContractFactory('TokenControllerMock');
  const tokenController = await TokenControllerMock.deploy(nxm.address);

  await nxm.setOperator(tokenController.address);

  const MemberRoles = await ethers.getContractFactory('MemberRoles');
  const memberRoles = await MemberRoles.deploy(nxm.address);

  const Master = await ethers.getContractFactory('MasterMock');
  const master = await Master.deploy();

  const Pool = await ethers.getContractFactory('PoolMock');
  const pool = await Pool.deploy();

  const CoverNFT = await ethers.getContractFactory('MRMockCoverNFT');
  const coverNFT = await CoverNFT.deploy('', '');

  const StakingNFT = await ethers.getContractFactory('MRMockStakingNFT');
  const stakingNFT = await StakingNFT.deploy('', '');
  await stakingNFT.deployed();

  const Cover = await ethers.getContractFactory('MRMockCover');
  const cover = await Cover.deploy(coverNFT.address, memberRoles.address, stakingNFT.address);

  const Governance = await ethers.getContractFactory('MRMockGovernance');
  const governance = await Governance.deploy();

  const Assessment = await ethers.getContractFactory('MRMockAssessment');
  const assessment = await Assessment.deploy();

  await master.setLatestAddress(hex('CO'), cover.address);
  await master.setTokenAddress(nxm.address);
  await master.setLatestAddress(hex('TC'), tokenController.address);
  await master.setLatestAddress(hex('P1'), pool.address);
  await master.setLatestAddress(hex('MR'), memberRoles.address);
  await master.setLatestAddress(hex('GV'), governance.address);
  await master.setLatestAddress(hex('AS'), assessment.address);
  await master.enrollInternal(tokenController.address);
  await master.enrollInternal(pool.address);
  await master.enrollInternal(nxm.address);
  await master.enrollInternal(cover.address);
  await master.enrollInternal(memberRoles.address);
  await master.enrollInternal(assessment.address);

  await master.enrollGovernance(accounts.governanceContracts[0].address);

  await memberRoles.changeMasterAddress(master.address);
  await memberRoles.changeDependentContractAddress();
  await tokenController.changeMasterAddress(master.address);
  await tokenController.changeDependentContractAddress();
  await master.setLatestAddress(hex('GV'), accounts.governanceContracts[0].address);
  await memberRoles.connect(accounts.governanceContracts[0]).setKycAuthAddress(accounts.defaultSender.address);

  await memberRoles
    .connect(accounts.governanceContracts[0])
    .addRole(formatBytes32String('Unassigned'), 'Unassigned', AddressZero);

  await memberRoles
    .connect(accounts.governanceContracts[0])
    .addRole(
      formatBytes32String('Advisory Board'),
      'Selected few members that are deeply entrusted by the dApp',
      AddressZero,
    );

  await memberRoles
    .connect(accounts.governanceContracts[0])
    .addRole(formatBytes32String('Member'), 'Represents all users of Mutual', AddressZero);

  // Setting Members
  for (const member of accounts.members) {
    await master.enrollMember(member.address, Role.Member);
    await memberRoles.connect(accounts.governanceContracts[0]).updateRole(member.address, Role.Member, true);
    await nxm.mint(member.address, parseEther('10000'));
    await nxm.connect(member).approve(tokenController.address, parseEther('10000'));
  }

  // Setting AB Member
  const [abMember] = accounts.advisoryBoardMembers;
  await master.enrollMember(abMember.address, Role.AdvisoryBoard);
  await memberRoles.connect(accounts.governanceContracts[0]).updateRole(abMember.address, Role.AdvisoryBoard, true);
  await master.enrollMember(abMember.address, Role.Member);
  await memberRoles.connect(accounts.governanceContracts[0]).updateRole(abMember.address, Role.Member, true);
  return {
    accounts,
    contracts: {
      nxm,
      master,
      pool,
      memberRoles,
      cover,
      coverNFT,
      stakingNFT,
      tokenController,
      assessment,
    },
  };
}

module.exports = { setup };

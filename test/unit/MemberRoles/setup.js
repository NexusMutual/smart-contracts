const { ethers, artifacts } = require('hardhat');

const { hex } = require('../utils').helpers;
const { getAccounts } = require('../utils').accounts;
const { setCode } = require('../utils').evm;
const { Role } = require('../utils').constants;

const { AddressZero } = ethers.constants;
const { parseEther, formatBytes32String } = ethers.utils;

async function setup() {
  const TokenControllerMock = await ethers.getContractFactory('TokenControllerMock');
  const tokenController = await TokenControllerMock.deploy();

  const NXM = await ethers.getContractFactory('NXMTokenMock');
  const nxm = await NXM.deploy();
  await nxm.setOperator(tokenController.address);

  const MemberRoles = await ethers.getContractFactory('MemberRoles');
  const memberRoles = await MemberRoles.deploy();

  const Master = await ethers.getContractFactory('MasterMock');
  const master = await Master.deploy();

  const Pool = await ethers.getContractFactory('MRMockPool');
  const pool = await Pool.deploy();

  const CoverNFT = await ethers.getContractFactory('MRMockCoverNFT');
  const coverNFT = await CoverNFT.deploy('', '');

  const Cover = await ethers.getContractFactory('MRMockCover');
  const cover = await Cover.deploy(coverNFT.address, memberRoles.address);

  const Governance = await ethers.getContractFactory('MRMockGovernance');
  const governance = await Governance.deploy();

  // quotation data is currently hardcoded in the MemberRoles contract
  // using setCode to deploy the QD mock at that specific address
  const quotationDataAddress = '0x1776651F58a17a50098d31ba3C3cD259C1903f7A';
  const quotationDataArtifact = await artifacts.readArtifact('MRMockQuotationData');
  await setCode(quotationDataAddress, quotationDataArtifact.deployedBytecode);
  const quotationData = await ethers.getContractAt('MRMockQuotationData', quotationDataAddress);

  const StakingPool = await ethers.getContractFactory('MRMockStakingPool');
  const stakingPool0 = await StakingPool.deploy('', '');
  const stakingPool1 = await StakingPool.deploy('', '');
  const stakingPool2 = await StakingPool.deploy('', '');

  await cover.addStakingPools([stakingPool0.address, stakingPool1.address, stakingPool2.address]);

  await master.setLatestAddress(hex('CO'), cover.address);
  await master.setTokenAddress(nxm.address);
  await master.setLatestAddress(hex('TC'), tokenController.address);
  await master.setLatestAddress(hex('P1'), pool.address);
  await master.setLatestAddress(hex('MR'), memberRoles.address);
  await master.setLatestAddress(hex('GV'), governance.address);
  await master.enrollInternal(tokenController.address);
  await master.enrollInternal(pool.address);
  await master.enrollInternal(nxm.address);
  await master.enrollInternal(cover.address);
  await master.enrollInternal(memberRoles.address);

  const accounts = await getAccounts();
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

  this.accounts = accounts;
  this.contracts = {
    nxm,
    master,
    pool,
    memberRoles,
    cover,
    coverNFT,
    tokenController,
    stakingPool0,
    stakingPool1,
    stakingPool2,
    quotationData,
  };
}

module.exports = {
  setup,
};

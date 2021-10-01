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

  const ICMockTokenController = await ethers.getContractFactory('ICMockTokenController');
  const tokenController = await ICMockTokenController.deploy(nxm.address);
  await tokenController.deployed();

  nxm.setOperator(tokenController.address);

  const Master = await ethers.getContractFactory('MasterMock');
  const master = await Master.deploy();
  await master.deployed();

  const DAI = await ethers.getContractFactory('ERC20BlacklistableMock');
  const dai = await DAI.deploy();
  await dai.deployed();

  const ybDAI = await ethers.getContractFactory('ERC20BlacklistableMock');
  const ybDai = await ybDAI.deploy();
  await ybDai.deployed();

  const ICMockPool = await ethers.getContractFactory('ICMockPool');
  const pool = await ICMockPool.deploy();
  await pool.deployed();
  await pool.addAsset(dai.address);

  const Assessment = await ethers.getContractFactory('ICMockAssessment');
  const assessment = await Assessment.deploy();
  await assessment.deployed();

  const Incidents = await ethers.getContractFactory('Incidents');
  const incidents = await Incidents.deploy(nxm.address);
  await incidents.deployed();

  const Cover = await ethers.getContractFactory('ICMockCover');
  const cover = await Cover.deploy('Nexus Mutual Cover', 'NXC');
  await cover.deployed();

  const ICMockUnknownNFT = await ethers.getContractFactory('ICMockUnknownNFT');
  const unkownNFT = await ICMockUnknownNFT.deploy('Unknown NFT', 'UNK');
  await unkownNFT.deployed();

  const masterInitTxs = await Promise.all([
    master.setLatestAddress(hex('TC'), tokenController.address),
    master.setLatestAddress(hex('MR'), memberRoles.address),
    master.setLatestAddress(hex('P1'), pool.address),
    master.setLatestAddress(hex('CO'), cover.address),
    master.setLatestAddress(hex('AS'), assessment.address),
    master.setTokenAddress(nxm.address),
  ]);
  await Promise.all(masterInitTxs.map(x => x.wait()));

  await cover.addProductType('', '0', '30', '5000');
  await cover.addProductType('', '0', '90', '5000');
  await cover.addProductType('', '1', '30', '5000');

  await cover.addProduct('0', '0x0000000000000000000000000000000000000001', '1', '0');
  await cover.addProduct('1', '0x0000000000000000000000000000000000000002', '1', '0');
  await cover.addProduct('2', '0x0000000000000000000000000000000000000003', '1', '0');

  await cover.setActiveCoverAmountInNXM(2, parseEther('35000'));

  {
    const tx = await incidents.initialize(master.address);
    await tx.wait();
  }

  {
    const tx = await incidents.changeDependentContractAddress();
    await tx.wait();
  }

  const signers = await ethers.getSigners();
  const accounts = getAccounts(signers);
  await master.enrollGovernance(accounts.governanceContracts[0].address);
  await memberRoles.setRole(accounts.advisoryBoardMembers[0].address, 1);
  for (const member of accounts.members) {
    await memberRoles.setRole(member.address, 2);
    await nxm.mint(member.address, ethers.utils.parseEther('10000'));
    await nxm.connect(member).approve(tokenController.address, ethers.utils.parseEther('10000'));
  }

  const config = await incidents.config();

  this.config = config;
  this.accounts = accounts;
  this.contracts = {
    nxm,
    dai,
    ybDai,
    assessment,
    incidents,
    cover,
    unkownNFT,
    master,
  };
}

module.exports = {
  setup,
};

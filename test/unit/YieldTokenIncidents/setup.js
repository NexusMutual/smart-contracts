const { ethers } = require('hardhat');
const { hex } = require('../../../lib/helpers');
const { getAccounts } = require('../../utils/accounts');
const { parseEther, parseUnits } = ethers.utils;

async function setup() {
  const accounts = await getAccounts();
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

  const ybETH = await ethers.getContractFactory('ERC20BlacklistableMock');
  const ybEth = await ybETH.deploy();
  await ybEth.deployed();

  const ybPermitDAI = await ethers.getContractFactory('ERC20PermitMock');
  const ybPermitDai = await ybPermitDAI.deploy('Mock with permit', 'MOCK');
  await ybPermitDai.deployed();

  const ethToDaiRate = parseEther('2000');
  const daiToEthRate = parseUnits('1', 36).div(ethToDaiRate);

  const ChainlinkAggregatorMock = await ethers.getContractFactory('ChainlinkAggregatorMock');
  const chainlinkDAI = await ChainlinkAggregatorMock.deploy();
  await chainlinkDAI.setLatestAnswer(daiToEthRate);

  const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');
  const priceFeedOracle = await PriceFeedOracle.deploy([dai.address], [chainlinkDAI.address], [18]);
  const ICMockPool = await ethers.getContractFactory('ICMockPool');
  const pool = await ICMockPool.deploy(priceFeedOracle.address);
  await pool.deployed();
  await pool.addAsset({ assetAddress: dai.address, isCoverAsset: true, isAbandonedAsset: false });

  const Assessment = await ethers.getContractFactory('ICMockAssessment');
  const assessment = await Assessment.deploy();
  await assessment.deployed();

  const CoverNFT = await ethers.getContractFactory('ICMockCoverNFT');
  const coverNFT = await CoverNFT.deploy();
  await coverNFT.deployed();

  const YieldTokenIncidents = await ethers.getContractFactory('YieldTokenIncidents');
  const yieldTokenIncidents = await YieldTokenIncidents.deploy(nxm.address, coverNFT.address);
  await yieldTokenIncidents.deployed();

  const Cover = await ethers.getContractFactory('ICMockCover');
  const cover = await Cover.deploy(coverNFT.address);
  await cover.deployed();

  const masterInitTxs = await Promise.all([
    master.setLatestAddress(hex('TC'), tokenController.address),
    master.setLatestAddress(hex('MR'), memberRoles.address),
    master.setLatestAddress(hex('P1'), pool.address),
    master.setLatestAddress(hex('CO'), cover.address),
    master.setLatestAddress(hex('AS'), assessment.address),
    master.setTokenAddress(nxm.address),
  ]);
  await Promise.all(masterInitTxs.map(x => x.wait()));

  await cover.addProductType('0', '30', '5000');
  await cover.addProductType('0', '90', '5000');
  await cover.addProductType('1', '30', '5000');

  await cover.addProduct(['0', '0x0000000000000000000000000000000000000001', '1', '0', '0']);
  await cover.addProduct(['1', '0x0000000000000000000000000000000000000002', '1', '0', '0']);
  await cover.addProduct(['2', ybEth.address, '1', 0b01, '0']);
  await cover.addProduct(['2', ybDai.address, '1', 0b10, '0']);
  await cover.addProduct(['2', ybPermitDai.address, 0b10, '1', '0']);

  await cover.setActiveCoverAmountInNXM(2, parseEther('3500'));

  await yieldTokenIncidents.changeMasterAddress(master.address);
  await yieldTokenIncidents.changeDependentContractAddress();

  await master.enrollGovernance(accounts.governanceContracts[0].address);
  await memberRoles.setRole(accounts.advisoryBoardMembers[0].address, 1);
  await memberRoles.setRole(accounts.advisoryBoardMembers[1].address, 1);
  for (const member of accounts.members) {
    await memberRoles.setRole(member.address, 2);
    await nxm.mint(member.address, ethers.utils.parseEther('10000'));
    await ybDai.mint(member.address, ethers.utils.parseEther('10000'));
    await ybEth.mint(member.address, ethers.utils.parseEther('10000'));
    await ybPermitDai.mint(member.address, ethers.utils.parseEther('10000'));
    await nxm.connect(member).approve(tokenController.address, ethers.utils.parseEther('10000'));
  }

  accounts.defaultSender.sendTransaction({ to: pool.address, value: parseEther('10000') });
  dai.mint(pool.address, parseEther('10000'));

  const config = await yieldTokenIncidents.config();

  return {
    config,
    accounts,
    contracts: {
      nxm,
      dai,
      ybDai,
      ybEth,
      ybPermitDai,
      assessment,
      yieldTokenIncidents,
      cover,
      coverNFT,
      master,
    },
  };
}

module.exports = {
  setup,
};

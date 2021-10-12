const { artifacts, web3, ethers } = require('hardhat');
const { ether } = require('@openzeppelin/test-helpers');

const { getAccounts } = require('../../utils/accounts');
const { Role } = require('../utils').constants;
const { hex } = require('../utils').helpers;

const { BN } = web3.utils;
const { BigNumber } = ethers.utils;

const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

async function setup () {

  const MasterMock = await ethers.getContractFactory('MasterMock');
  const Pool = await ethers.getContractFactory('CoverMockPool');
  const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
  const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');
  const ChainlinkAggregatorMock = await ethers.getContractFactory('ChainlinkAggregatorMock');
  const QuotationData = await ethers.getContractFactory('MCRMockQuotationData');
  const Cover = await ethers.getContractFactory('Cover');
  const MemberRolesMock = await ethers.getContractFactory('MemberRolesMock');
  const CoverNFT = await ethers.getContractFactory('CoverNFT');
  const TokenController = await ethers.getContractFactory('TokenControllerMock');
  const NXMToken = await ethers.getContractFactory('NXMTokenMock');
  const MCR = await ethers.getContractFactory('CoverMockMCR');

  const master = await MasterMock.deploy();
  await master.deployed();

  const dai = await ERC20Mock.deploy();
  await dai.deployed();

  const stETH = await ERC20Mock.deploy();
  await stETH.deployed();

  const memberRoles = await MemberRolesMock.deploy();
  await memberRoles.deployed();

  const tokenController = await TokenController.deploy();
  await tokenController.deployed();

  const nxm = await NXMToken.deploy();
  await nxm.deployed();

  const mcr = await MCR.deploy();
  await mcr.deployed();

  const cover = await Cover.deploy();
  await cover.deployed();

  await master.setTokenAddress(nxm.address);

  const coverNFT = await CoverNFT.deploy('NexusMutual Cover', 'NXMC', cover.address);
  await coverNFT.deployed();

  await cover.initialize(coverNFT.address);

  const ethToDaiRate = ether('2000');
  const daiToEthRate = new BN(10).pow(new BN(36)).div(ethToDaiRate);

  const chainlinkDAI = await ChainlinkAggregatorMock.deploy();
  await chainlinkDAI.deployed();

  await chainlinkDAI.setLatestAnswer(daiToEthRate.toString());

  const priceFeedOracle = await PriceFeedOracle.deploy(
    chainlinkDAI.address,
    dai.address,
    stETH.address,
  );
  await priceFeedOracle.deployed();

  const pool = await Pool.deploy();
  await pool.deployed();

  await pool.setAssets([ETH, dai.address]);

  await pool.setTokenPrice('0', ethers.utils.parseEther('1'));

  const quotationData = await QuotationData.deploy();
  await quotationData.deployed();

  await quotationData.setTotalSumAssured(hex('DAIX'), '0');
  await quotationData.setTotalSumAssured(hex('ETHX'), '100000');

  await mcr.setMCR(ethers.utils.parseEther('600000'));

  // set contract addresses
  await master.setLatestAddress(hex('P1'), pool.address);
  await master.setLatestAddress(hex('QD'), quotationData.address);
  await master.setLatestAddress(hex('MR'), memberRoles.address);
  await master.setLatestAddress(hex('CO'), cover.address);
  await master.setLatestAddress(hex('TC'), tokenController.address);
  await master.setLatestAddress(hex('MC'), mcr.address);

  const signers = await ethers.getSigners();
  const accounts = getAccounts(signers);

  for (const member of accounts.members) {
    await master.enrollMember(member.address, Role.Member);
    await memberRoles.setRole(member.address, Role.Member);
  }

  for (const advisoryBoardMember of accounts.advisoryBoardMembers) {
    await master.enrollMember(advisoryBoardMember.address, Role.AdvisoryBoard);
    await memberRoles.setRole(advisoryBoardMember.address, Role.AdvisoryBoard);
  }

  for (const internalContract of accounts.internalContracts) {
    await master.enrollInternal(internalContract.address);
  }

  // there is only one in reality, but it doesn't matter
  for (const governanceContract of accounts.governanceContracts) {
    await master.enrollGovernance(governanceContract.address);
  }

  for (const contract of [cover, tokenController]) {
    await contract.changeMasterAddress(master.address);
    await contract.changeDependentContractAddress();
    await master.enrollInternal(contract.address);
  }

  // add products
  await cover.connect(accounts.advisoryBoardMembers[0]).addProduct({
    productType: '1',
    productAddress: '0x0000000000000000000000000000000000000000',
    payoutAssets: '1', // ETH supported
  });

  this.master = master;
  this.pool = pool;
  this.dai = dai;
  this.chainlinkDAI = chainlinkDAI;
  this.cover = cover;
  this.accounts = accounts;
}

module.exports = setup;

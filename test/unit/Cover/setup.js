const { artifacts, web3 } = require('hardhat');
const { ether } = require('@openzeppelin/test-helpers');

const { Role } = require('../utils').constants;
const accounts = require('../utils').accounts;
const { hex } = require('../utils').helpers;

const { BN } = web3.utils;

const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

async function setup () {

  const MasterMock = artifacts.require('MasterMock');
  const Pool = artifacts.require('CoverMockPool');
  const ERC20Mock = artifacts.require('ERC20Mock');
  const PriceFeedOracle = artifacts.require('PriceFeedOracle');
  const ChainlinkAggregatorMock = artifacts.require('ChainlinkAggregatorMock');
  const QuotationData = artifacts.require('MCRMockQuotationData');
  const Cover = artifacts.require('Cover');
  const MemberRolesMock = artifacts.require('MemberRolesMock');
  const CoverNFT = artifacts.require('CoverNFT');
  const TokenController = artifacts.require('TokenControllerMock');
  const NXMToken = await artifacts.require('NXMTokenMock');
  const MCR = await artifacts.require('CoverMockMCR');

  const master = await MasterMock.new();
  const dai = await ERC20Mock.new();
  const stETH = await ERC20Mock.new();
  const memberRoles = await MemberRolesMock.new();
  const tokenController = await TokenController.new();
  const nxm = await NXMToken.new();
  const mcr = await MCR.new();
  const cover = await Cover.new();

  await master.setTokenAddress(nxm.address);

  const coverNFT = await CoverNFT.new('NexusMutual Cover', 'NXMC', cover.address);
  await cover.initialize(coverNFT.address);

  const ethToDaiRate = ether('2000');
  const daiToEthRate = new BN(10).pow(new BN(36)).div(ethToDaiRate);

  const chainlinkDAI = await ChainlinkAggregatorMock.new();
  await chainlinkDAI.setLatestAnswer(daiToEthRate);

  const priceFeedOracle = await PriceFeedOracle.new(
    chainlinkDAI.address,
    dai.address,
    stETH.address,
  );

  const pool = await Pool.new();

  await pool.setAssets([ETH, dai.address]);

  await pool.setTokenPrice('0', ether('1'));

  const quotationData = await QuotationData.new();

  await quotationData.setTotalSumAssured(hex('DAI'), '0');
  await quotationData.setTotalSumAssured(hex('ETH'), '100000');

  await mcr.setMCR(ether('600000'));

  // set contract addresses
  await master.setLatestAddress(hex('P1'), pool.address);
  await master.setLatestAddress(hex('QD'), quotationData.address);
  await master.setLatestAddress(hex('MR'), memberRoles.address);
  await master.setLatestAddress(hex('CO'), cover.address);
  await master.setLatestAddress(hex('TC'), tokenController.address);
  await master.setLatestAddress(hex('MC'), mcr.address);

  for (const member of accounts.members) {
    await master.enrollMember(member, Role.Member);
    await memberRoles.setRole(member, Role.Member);
  }

  for (const advisoryBoardMember of accounts.advisoryBoardMembers) {
    await master.enrollMember(advisoryBoardMember, Role.AdvisoryBoard);
    await memberRoles.setRole(advisoryBoardMember, Role.AdvisoryBoard);
  }

  for (const internalContract of accounts.internalContracts) {
    await master.enrollInternal(internalContract);
  }

  // there is only one in reality, but it doesn't matter
  for (const governanceContract of accounts.governanceContracts) {
    await master.enrollGovernance(governanceContract);
  }

  for (const contract of [cover, tokenController]) {
    await contract.changeMasterAddress(master.address);
    await contract.changeDependentContractAddress();
    await master.enrollInternal(contract.address);
  }

  // add products

  await cover.addProduct({
    productType: '1',
    productAddress: '0x0000000000000000000000000000000000000000',
    payoutAssets: '1', // ETH supported
  },
  { from: accounts.advisoryBoardMembers[0] },
  );

  this.master = master;
  this.pool = pool;
  this.dai = dai;
  this.chainlinkDAI = chainlinkDAI;
  this.cover = cover;
}

module.exports = setup;

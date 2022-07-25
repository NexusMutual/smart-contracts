const { artifacts, web3 } = require('hardhat');
const { ether } = require('@openzeppelin/test-helpers');

const { Role } = require('../utils').constants;
const accounts = require('../utils').accounts;
const { hex } = require('../utils').helpers;
const { initMCR } = require('./common');

const { BN } = web3.utils;

async function setup () {

  const MasterMock = artifacts.require('MasterMock');
  const Pool = artifacts.require('MCRMockPool');
  const ERC20Mock = artifacts.require('ERC20Mock');
  const PriceFeedOracle = artifacts.require('PriceFeedOracle');
  const ChainlinkAggregatorMock = artifacts.require('ChainlinkAggregatorMock');
  const QuotationData = artifacts.require('MCRMockQuotationData');

  const master = await MasterMock.new();
  const dai = await ERC20Mock.new();
  const stETH = await ERC20Mock.new();

  const ethToDaiRate = ether('2000');
  const daiToEthRate = new BN(10).pow(new BN(36)).div(ethToDaiRate);

  const chainlinkDAI = await ChainlinkAggregatorMock.new();
  await chainlinkDAI.setLatestAnswer(daiToEthRate);

  const chainlinkStETH = await ChainlinkAggregatorMock.new();
  await chainlinkStETH.setLatestAnswer(ether('1'));

  const priceFeedOracle = await PriceFeedOracle.new(
    [dai.address, stETH.address],
    [chainlinkDAI.address, chainlinkStETH.address],
    [18, 18],
    dai.address
  );

  const pool = await Pool.new(priceFeedOracle.address);
  const quotationData = await QuotationData.new();

  await quotationData.setTotalSumAssured(hex('DAI'), '0');
  await quotationData.setTotalSumAssured(hex('ETH'), '100000');

  const mcr = await initMCR({
    mcrValue: ether('150000'),
    mcrFloor: ether('150000'),
    desiredMCR: ether('150000'),
    mcrFloorIncrementThreshold: '13000',
    maxMCRFloorIncrement: '100',
    maxMCRIncrement: '500',
    gearingFactor: '48000',
    minUpdateTime: '3600',
    master,
  });
  // set contract addresses
  await master.setLatestAddress(hex('P1'), pool.address);
  await master.setLatestAddress(hex('QD'), quotationData.address);

  for (const member of accounts.members) {
    await master.enrollMember(member, Role.Member);
  }

  for (const advisoryBoardMember of accounts.advisoryBoardMembers) {
    await master.enrollMember(advisoryBoardMember, Role.AdvisoryBoard);
  }

  for (const internalContract of accounts.internalContracts) {
    await master.enrollInternal(internalContract);
  }

  // there is only one in reality, but it doesn't matter
  for (const governanceContract of accounts.governanceContracts) {
    await master.enrollGovernance(governanceContract);
  }

  this.master = master;
  this.pool = pool;
  this.dai = dai;
  this.chainlinkDAI = chainlinkDAI;
  this.mcr = mcr;
  this.quotationData = quotationData;
}

module.exports = setup;

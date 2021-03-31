const { artifacts, web3 } = require('hardhat');
const { ether, time } = require('@openzeppelin/test-helpers');

const { Role } = require('../utils').constants;
const accounts = require('../utils').accounts;
const { hex } = require('../utils').helpers;

const { initMCR } = require('./common');

const { BN } = web3.utils;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

async function setup () {

  const MasterMock = artifacts.require('MasterMock');
  const Pool = artifacts.require('MCRMockPool');
  const ERC20Mock = artifacts.require('ERC20Mock');
  const PriceFeedOracle = artifacts.require('PriceFeedOracle');
  const P1MockChainlinkAggregator = artifacts.require('P1MockChainlinkAggregator');
  const QuotationData = artifacts.require('MCRMockQuotationData');
  const MCR = artifacts.require('DisposableMCR');

  const master = await MasterMock.new();
  const dai = await ERC20Mock.new();

  const ethToDaiRate = new BN((394.59 * 1e18).toString());
  const daiToEthRate = new BN(10).pow(new BN(36)).div(ethToDaiRate);

  const chainlinkDAI = await P1MockChainlinkAggregator.new();
  await chainlinkDAI.setLatestAnswer(daiToEthRate);
  const priceFeedOracle = await PriceFeedOracle.new([dai.address], [chainlinkDAI.address], dai.address);

  const pool = await Pool.new(priceFeedOracle.address);
  const quotationData = await QuotationData.new();

  await quotationData.setTotalSumAssured(hex('DAI'), ether(1e8.toString()));
  await quotationData.setTotalSumAssured(hex('ETH'), ether('100000'));

  const latest = await time.latest();

  const mcrParams = [

  ];

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

  const contractsToUpdate = [mcr];

  for (const contract of contractsToUpdate) {
    await contract.changeMasterAddress(master.address);
    await contract.changeDependentContractAddress();
  }

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
}

module.exports = setup;

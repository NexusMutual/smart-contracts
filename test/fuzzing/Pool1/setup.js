const { ether } = require('@openzeppelin/test-helpers');
const { web3, artifacts } = require('hardhat');
const { hex } = require('../../unit/utils').helpers;
const { BN } = web3.utils;
const { accounts } = require('../../unit/utils');

const { Role } = require('../../unit/utils').constants;

const {
  nonMembers: [fundSource],
  members: [member1, member2],
} = accounts;

const MasterMock = artifacts.require('MasterMock');
const PoolData = artifacts.require('P1MockPoolData');
const TokenData = artifacts.require('TokenData');
const TokenController = artifacts.require('TokenControllerMock');
const TokenMock = artifacts.require('NXMTokenMock');
const ERC20Mock = artifacts.require('ERC20Mock');
const TokenFunctions = artifacts.require('TokenFunctions');
const PriceFeedOracle = artifacts.require('PriceFeedOracle');
const P1MockChainlinkAggregator = artifacts.require('P1MockChainlinkAggregator');

async function setup ({ MCR, Pool1 }) {

  const master = await MasterMock.new();

  const daiFeedAddress = '0x0000000000000000000000000000000000000001';
  const mockP2Address = '0x0000000000000000000000000000000000000012';
  const dai = await ERC20Mock.new();

  const chainlinkAggregators = {};
  chainlinkAggregators['DAI'] = await P1MockChainlinkAggregator.new();
  const priceFeedOracle = await PriceFeedOracle.new([dai.address], [chainlinkAggregators['DAI'].address], dai.address);

  const poolData = await PoolData.new(accounts.notariseAddress, daiFeedAddress, dai.address);
  const tokenData = await TokenData.new(accounts.notariseAddress);
  const pool1 = await Pool1.new(priceFeedOracle.address);
  const token = await TokenMock.new();
  const mcr = await MCR.new();
  const tokenController = await TokenController.new();
  const tokenFunctions = await TokenFunctions.new();
  await token.mint(accounts.defaultSender, ether('10000'));

  // set contract addresses
  await master.setTokenAddress(token.address);
  await master.setLatestAddress(hex('P1'), pool1.address);
  await master.setLatestAddress(hex('PD'), poolData.address);
  await master.setLatestAddress(hex('TD'), tokenData.address);
  await master.setLatestAddress(hex('MC'), mcr.address);
  await master.setLatestAddress(hex('TC'), tokenController.address);
  await master.setLatestAddress(hex('P2'), mockP2Address);
  await master.setLatestAddress(hex('TF'), tokenFunctions.address);

  const contractsToUpdate = [pool1, tokenController, tokenFunctions, mcr];
  for (const contract of contractsToUpdate) {
    await contract.changeMasterAddress(master.address);
    await contract.changeDependentContractAddress();
  }

  // required to be able to mint
  await master.enrollInternal(pool1.address);

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

  // initialize token
  await token.setOperator(tokenController.address);

  return {
    master,
    token,
    pool1,
    mcr,
    poolData,
    tokenData,
    tokenController,
    chainlinkAggregators,
  };
}

module.exports = setup;

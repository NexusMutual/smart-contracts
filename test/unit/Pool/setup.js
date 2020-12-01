const { artifacts, web3 } = require('hardhat');
const { ether } = require('@openzeppelin/test-helpers');

const { Role } = require('../utils').constants;
const accounts = require('../utils').accounts;
const { hex } = require('../utils').helpers;

const { BN } = web3.utils;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

async function setup () {

  const MasterMock = artifacts.require('MasterMock');
  const PoolData = artifacts.require('P1MockPoolData');
  const TokenData = artifacts.require('TokenData');
  const TokenController = artifacts.require('TokenControllerMock');
  const TokenMock = artifacts.require('NXMTokenMock');
  const  Pool = artifacts.require('Pool');
  const MCR = artifacts.require('MCR');
  const ERC20Mock = artifacts.require('ERC20Mock');
  const TokenFunctions = artifacts.require('TokenFunctions');
  const PriceFeedOracle = artifacts.require('PriceFeedOracle');
  const SwapAgent = artifacts.require('SwapAgent');
  const P1MockChainlinkAggregator = artifacts.require('P1MockChainlinkAggregator');

  const master = await MasterMock.new();
  const mockP2Address = '0x0000000000000000000000000000000000000012';
  const dai = await ERC20Mock.new();

  const ethToDaiRate = new BN((394.59 * 1e18).toString());
  const daiToEthRate = new BN(10).pow(new BN(36)).div(ethToDaiRate);

  const chainlinkDAI = await P1MockChainlinkAggregator.new();
  await chainlinkDAI.setLatestAnswer(daiToEthRate);
  const priceFeedOracle = await PriceFeedOracle.new([dai.address], [chainlinkDAI.address], dai.address);

  const swapAgent = await SwapAgent.new();
   Pool.link(swapAgent);

  const poolData = await PoolData.new();
  const tokenData = await TokenData.new(accounts.notariseAddress);
  const pool = await  Pool.new(
    [dai.address], // assets
    [0], // min
    [0], // max
    [ether('0.01')], // maxSlippage 1%
    accounts.defaultSender, // master: it is changed a few lines below
    priceFeedOracle.address,
    ZERO_ADDRESS, // we do not test swaps here
    ZERO_ADDRESS, // swap controller, not used here
  );

  const token = await TokenMock.new();
  const mcr = await MCR.new(ZERO_ADDRESS);
  const tokenController = await TokenController.new();
  const tokenFunctions = await TokenFunctions.new();
  await token.mint(accounts.defaultSender, ether('10000'));

  // set contract addresses
  await master.setTokenAddress(token.address);
  await master.setLatestAddress(hex('P1'), pool.address);
  await master.setLatestAddress(hex('PD'), poolData.address);
  await master.setLatestAddress(hex('TD'), tokenData.address);
  await master.setLatestAddress(hex('MC'), mcr.address);
  await master.setLatestAddress(hex('TC'), tokenController.address);
  await master.setLatestAddress(hex('P2'), mockP2Address);
  await master.setLatestAddress(hex('TF'), tokenFunctions.address);

  const contractsToUpdate = [mcr, pool, tokenController, tokenFunctions];

  for (const contract of contractsToUpdate) {
    await contract.changeMasterAddress(master.address);
    await contract.changeDependentContractAddress();
  }

  // required to be able to mint
  await master.enrollInternal(pool.address);

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

  this.master = master;
  this.token = token;
  this.pool = pool;
  this.mcr = mcr;
  this.poolData = poolData;
  this.tokenData = tokenData;
  this.tokenController = tokenController;
  this.dai = dai;
  this.chainlinkDAI = chainlinkDAI;
}

module.exports = setup;

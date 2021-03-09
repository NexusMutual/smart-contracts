const { ether } = require('@openzeppelin/test-helpers');
const { artifacts } = require('hardhat');
const { hex } = require('../../unit/utils').helpers;
const { accounts } = require('../../unit/utils');

const { Role } = require('../../unit/utils').constants;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const MasterMock = artifacts.require('MasterMock');
const TokenData = artifacts.require('TokenData');
const TokenController = artifacts.require('TokenControllerMock');
const TokenMock = artifacts.require('NXMTokenMock');
const ERC20Mock = artifacts.require('ERC20Mock');
const TokenFunctions = artifacts.require('TokenFunctions');
const PriceFeedOracle = artifacts.require('PriceFeedOracle');
const P1MockChainlinkAggregator = artifacts.require('P1MockChainlinkAggregator');

async function setup ({ MCR, Pool }) {

  const master = await MasterMock.new();
  const mockP2Address = '0x0000000000000000000000000000000000000012';
  const dai = await ERC20Mock.new();

  const chainlinkDAI = await P1MockChainlinkAggregator.new();
  const priceFeedOracle = await PriceFeedOracle.new([dai.address], [chainlinkDAI.address], dai.address);

  const tokenData = await TokenData.new(accounts.notariseAddress);
  const pool = await Pool.new(
    [dai.address],
    [0], // min
    [0], // max
    [0], // max slippage
    accounts.defaultSender, // master: it is changed a few lines below
    priceFeedOracle.address,
    ZERO_ADDRESS, // twap
    ZERO_ADDRESS, // swap controller
  );

  const token = await TokenMock.new();
  const mcr = await MCR.new(ZERO_ADDRESS);
  const tokenController = await TokenController.new();
  const tokenFunctions = await TokenFunctions.new();
  await token.mint(accounts.defaultSender, ether('10000'));

  // set contract addresses
  await master.setTokenAddress(token.address);
  await master.setLatestAddress(hex('P1'), pool.address);
  await master.setLatestAddress(hex('TD'), tokenData.address);
  await master.setLatestAddress(hex('MC'), mcr.address);
  await master.setLatestAddress(hex('TC'), tokenController.address);
  await master.setLatestAddress(hex('P2'), mockP2Address);
  await master.setLatestAddress(hex('TF'), tokenFunctions.address);

  const contractsToUpdate = [pool, tokenController, tokenFunctions, mcr];
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

  return {
    master,
    token,
    pool,
    mcr,
    tokenData,
    tokenController,
    chainlinkDAI,
    dai,
  };
}

module.exports = setup;

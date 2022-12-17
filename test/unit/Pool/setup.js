const { artifacts, web3, ethers } = require('hardhat');
const { ether } = require('@openzeppelin/test-helpers');
const { parseEther } = ethers.utils;

const { Role } = require('../utils').constants;
const accounts = require('../utils').accounts;
const { hex } = require('../utils').helpers;

const { BN } = web3.utils;

async function setup() {
  const MasterMock = artifacts.require('MasterMock');
  const TokenController = artifacts.require('TokenControllerMock');
  const TokenMock = artifacts.require('NXMTokenMock');
  const Pool = artifacts.require('Pool');
  const MCR = artifacts.require('P1MockMCR');
  const ERC20Mock = artifacts.require('ERC20Mock');
  const ERC20BlacklistableMock = artifacts.require('ERC20BlacklistableMock');
  const PriceFeedOracle = artifacts.require('PriceFeedOracle');
  const ChainlinkAggregatorMock = artifacts.require('ChainlinkAggregatorMock');
  const P1MockSwapOperator = artifacts.require('P1MockSwapOperator');
  const MemberRolesMock = await artifacts.require('MemberRolesMock');

  const master = await MasterMock.new();
  const dai = await ERC20Mock.new();
  const stETH = await ERC20BlacklistableMock.new();
  const otherAsset = await ERC20Mock.new();
  const memberRoles = await MemberRolesMock.new();

  const ethToDaiRate = new BN((394.59 * 1e18).toString());
  const daiToEthRate = new BN(10).pow(new BN(36)).div(ethToDaiRate);

  const chainlinkDAI = await ChainlinkAggregatorMock.new();
  await chainlinkDAI.setLatestAnswer(daiToEthRate);
  const chainlinkSteth = await ChainlinkAggregatorMock.new();
  await chainlinkSteth.setLatestAnswer(new BN((1e18).toString()));
  const chainlinkNewAsset = await ChainlinkAggregatorMock.new();
  await chainlinkNewAsset.setLatestAnswer(new BN((1e18).toString()));

  const priceFeedOracle = await PriceFeedOracle.new(
    [dai.address, stETH.address, otherAsset.address],
    [chainlinkDAI.address, chainlinkSteth.address, chainlinkNewAsset.address],
    [18, 18, 18],
  );

  const swapOperator = await P1MockSwapOperator.new();

  const coverAssets = {
    assets: [
      {
        decimals: 18,
        assetAddress: dai.address,
      },
    ],
    swapDetails: [
      {
        // dai
        minAmount: parseEther('1000000'),
        maxAmount: parseEther('2000000'),
        maxSlippageRatio: 250,
        lastSwapTime: 0,
      },
    ],
  };

  const investmentAssets = {
    assets: [
      {
        decimals: 18,
        assetAddress: stETH.address,
      },
    ],
    swapDetails: [
      {
        // stEth
        minAmount: parseEther('24360'),
        maxAmount: parseEther('32500'),
        maxSlippageRatio: 0,
        lastSwapTime: 0,
      },
    ],
  };

  const pool = await Pool.new(
    master.address,
    priceFeedOracle.address,
    swapOperator.address, // we do not test swaps here
    coverAssets,
    investmentAssets,
  );

  const token = await TokenMock.new();
  const mcr = await MCR.new();
  const tokenController = await TokenController.new();
  await token.mint(accounts.defaultSender, ether('10000'));

  // set contract addresses
  await master.setTokenAddress(token.address);
  await master.setLatestAddress(hex('P1'), pool.address);
  await master.setLatestAddress(hex('MC'), mcr.address);
  await master.setLatestAddress(hex('TC'), tokenController.address);
  await master.setLatestAddress(hex('MR'), memberRoles.address);

  await pool.changeDependentContractAddress();
  const contractsToUpdate = [mcr, tokenController];

  for (const contract of contractsToUpdate) {
    await contract.changeMasterAddress(master.address);
    await contract.changeDependentContractAddress();
  }

  // required to be able to mint
  await master.enrollInternal(pool.address);

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

  // initialize token
  await token.setOperator(tokenController.address);

  this.master = master;
  this.token = token;
  this.pool = pool;
  this.mcr = mcr;
  this.tokenController = tokenController;
  this.memberRoles = memberRoles;
  this.dai = dai;
  this.chainlinkDAI = chainlinkDAI;
  this.chainlinkSteth = chainlinkSteth;
  this.swapOperator = swapOperator;
  this.priceFeedOracle = priceFeedOracle;
  this.stETH = stETH;
  this.otherAsset = otherAsset;
}

module.exports = setup;

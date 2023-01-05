const { ethers } = require('hardhat');
const { BigNumber } = ethers;
const { parseEther } = ethers.utils;
const { WeiPerEther } = ethers.constants;

const { Role } = require('../utils').constants;
const { getAccounts } = require('../../utils/accounts');
const { hex } = require('../utils').helpers;

async function setup() {
  // rewrite above artifact imports using ethers.js
  const MasterMock = await ethers.getContractFactory('MasterMock');
  const TokenController = await ethers.getContractFactory('TokenControllerMock');
  const TokenMock = await ethers.getContractFactory('NXMTokenMock');
  const Pool = await ethers.getContractFactory('Pool');
  const MCR = await ethers.getContractFactory('P1MockMCR');
  const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
  const ERC20BlacklistableMock = await ethers.getContractFactory('ERC20BlacklistableMock');
  const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');
  const ChainlinkAggregatorMock = await ethers.getContractFactory('ChainlinkAggregatorMock');
  const P1MockSwapOperator = await ethers.getContractFactory('P1MockSwapOperator');
  const MemberRolesMock = await ethers.getContractFactory('MemberRolesMock');

  const master = await MasterMock.deploy();
  const dai = await ERC20Mock.deploy();
  const stETH = await ERC20BlacklistableMock.deploy();
  const otherAsset = await ERC20Mock.deploy();
  const memberRoles = await MemberRolesMock.deploy();

  const ethToDaiRate = parseEther('394.59');
  const daiToEthRate = BigNumber.from(10).pow(36).div(ethToDaiRate);

  const chainlinkDAI = await ChainlinkAggregatorMock.deploy();
  await chainlinkDAI.setLatestAnswer(daiToEthRate);
  const chainlinkSteth = await ChainlinkAggregatorMock.deploy();
  await chainlinkSteth.setLatestAnswer(WeiPerEther);
  const chainlinkNewAsset = await ChainlinkAggregatorMock.deploy();
  await chainlinkNewAsset.setLatestAnswer(WeiPerEther);

  const priceFeedOracle = await PriceFeedOracle.deploy(
    [dai.address, stETH.address, otherAsset.address],
    [chainlinkDAI.address, chainlinkSteth.address, chainlinkNewAsset.address],
    [18, 18, 18],
  );

  const swapOperator = await P1MockSwapOperator.deploy();
  const accounts = await getAccounts();

  const pool = await Pool.deploy(
    accounts.defaultSender.address, // master: it is changed a few lines below
    priceFeedOracle.address,
    swapOperator.address, // we do not test swaps here
    dai.address,
    stETH.address,
  );

  await master.setLatestAddress(hex('P1'), pool.address);

  const token = await TokenMock.deploy();
  const mcr = await MCR.deploy();
  const tokenController = await TokenController.deploy();
  await token.mint(accounts.defaultSender.address, parseEther('10000'));

  // set contract addresses
  await master.setTokenAddress(token.address);
  await master.setLatestAddress(hex('P1'), pool.address);
  await master.setLatestAddress(hex('MC'), mcr.address);
  await master.setLatestAddress(hex('TC'), tokenController.address);
  await master.setLatestAddress(hex('MR'), memberRoles.address);

  const contractsToUpdate = [mcr, pool, tokenController];

  for (const contract of contractsToUpdate) {
    await contract.changeMasterAddress(master.address);
    await contract.changeDependentContractAddress();
  }

  // required to be able to mint
  await master.enrollInternal(pool.address);

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

  // initialize token
  await token.setOperator(tokenController.address);

  this.accounts = accounts;
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

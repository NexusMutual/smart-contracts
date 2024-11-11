const { ethers } = require('hardhat');

const { getAccounts } = require('../utils').accounts;
const { Role, Assets, AggregatorType } = require('../utils').constants;
const { toBytes2 } = require('../utils').helpers;

const { BigNumber } = ethers;
const { parseEther, parseUnits } = ethers.utils;
const { AddressZero, WeiPerEther } = ethers.constants;

async function setup() {
  const accounts = await getAccounts();
  // rewrite above artifact imports using ethers.js
  const MasterMock = await ethers.getContractFactory('MasterMock');
  const TokenController = await ethers.getContractFactory('TokenControllerMock');
  const TokenMock = await ethers.getContractFactory('NXMTokenMock');
  const LegacyPool = await ethers.getContractFactory('LegacyPool');
  const Pool = await ethers.getContractFactory('Pool');
  const MCR = await ethers.getContractFactory('P1MockMCR');
  const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
  const ERC20BlacklistableMock = await ethers.getContractFactory('ERC20BlacklistableMock');
  const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');
  const ChainlinkAggregatorMock = await ethers.getContractFactory('ChainlinkAggregatorMock');
  const P1MockSwapOperator = await ethers.getContractFactory('P1MockSwapOperator');
  const MemberRolesMock = await ethers.getContractFactory('MemberRolesMock');
  const RammMock = await ethers.getContractFactory('RammMock');

  const master = await MasterMock.deploy();
  const dai = await ERC20Mock.deploy();
  const stETH = await ERC20BlacklistableMock.deploy();
  const enzymeVault = await ERC20Mock.deploy();
  const otherAsset = await ERC20Mock.deploy();
  const st = await ERC20Mock.deploy();
  const memberRoles = await MemberRolesMock.deploy();
  const ramm = await RammMock.deploy();

  const ethToUsdRate = parseUnits('2500', 8);
  const ethToDaiRate = parseEther('394.59');
  const daiToEthRate = BigNumber.from(10).pow(36).div(ethToDaiRate);

  const chainlinkDAI = await ChainlinkAggregatorMock.deploy();
  await chainlinkDAI.setLatestAnswer(daiToEthRate);

  const chainlinkSteth = await ChainlinkAggregatorMock.deploy();
  await chainlinkSteth.setLatestAnswer(WeiPerEther);

  const chainlinkEnzymeVault = await ChainlinkAggregatorMock.deploy();
  await chainlinkEnzymeVault.setLatestAnswer(WeiPerEther);

  const chainlinkOtherAsset = await ChainlinkAggregatorMock.deploy();
  await chainlinkOtherAsset.setLatestAnswer(WeiPerEther);

  const chainlinkEthUsdAsset = await ChainlinkAggregatorMock.deploy();
  await chainlinkEthUsdAsset.setLatestAnswer(ethToUsdRate);
  await chainlinkEthUsdAsset.setDecimals(8);

  const priceFeedOracle = await PriceFeedOracle.deploy(
    [dai, stETH, enzymeVault, otherAsset, { address: Assets.ETH }].map(c => c.address),
    [chainlinkDAI, chainlinkSteth, chainlinkEnzymeVault, chainlinkOtherAsset, chainlinkEthUsdAsset].map(c => c.address),
    [AggregatorType.ETH, AggregatorType.ETH, AggregatorType.ETH, AggregatorType.ETH, AggregatorType.USD],
    [18, 18, 18, 18, 18],
    st.address,
  );

  const swapOperator = await P1MockSwapOperator.deploy();

  const mcr = await MCR.deploy();
  const token = await TokenMock.deploy();
  const tokenController = await TokenController.deploy(token.address);

  await token.setOperator(tokenController.address);
  await token.mint(accounts.defaultSender.address, parseEther('10000'));

  const legacyPool = await LegacyPool.deploy(
    AddressZero, // master: it is changed a few lines below
    priceFeedOracle.address,
    swapOperator.address,
    dai.address,
    stETH.address,
    enzymeVault.address,
    token.address,
  );

  const pool = await Pool.deploy(
    AddressZero, // master: it is changed a few lines below
    priceFeedOracle.address,
    swapOperator.address,
    token.address,
    legacyPool.address,
  );

  // set contract addresses
  await master.setTokenAddress(token.address);
  await master.setLatestAddress(toBytes2('P1'), pool.address);
  await master.setLatestAddress(toBytes2('MC'), mcr.address);
  await master.setLatestAddress(toBytes2('TC'), tokenController.address);
  await master.setLatestAddress(toBytes2('MR'), memberRoles.address);
  await master.setLatestAddress(toBytes2('RA'), ramm.address);

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

  return {
    accounts,
    master,
    token,
    pool,
    mcr,
    tokenController,
    memberRoles,
    swapOperator,
    priceFeedOracle,
    ramm,

    // tokens
    dai,
    stETH,
    enzymeVault,
    otherAsset,
    st, // safeTracker

    // oracles
    chainlinkDAI,
    chainlinkSteth,
    chainlinkEnzymeVault,
    chainlinkEthUsdAsset,
  };
}

module.exports = setup;

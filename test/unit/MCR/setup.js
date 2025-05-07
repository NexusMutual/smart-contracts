const { ethers } = require('hardhat');
const { parseEther, parseUnits } = ethers.utils;

const { initMCR } = require('./common');
const { getAccounts } = require('../../utils/accounts');
const { Assets, AggregatorType, Role } = require('../utils').constants;
const { hex } = require('../utils').helpers;

async function setup() {
  const accounts = await getAccounts();
  const MasterMock = await ethers.getContractFactory('MasterMock');
  const Pool = await ethers.getContractFactory('PoolMock');
  const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
  const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');
  const ChainlinkAggregatorMock = await ethers.getContractFactory('ChainlinkAggregatorMock');
  const Cover = await ethers.getContractFactory('MCRMockCover');

  const master = await MasterMock.deploy();
  const dai = await ERC20Mock.deploy();
  const stETH = await ERC20Mock.deploy();
  const st = await ERC20Mock.deploy();

  const ethToUsdRate = parseUnits('2500', 8);
  const ethToDaiRate = parseEther('2000');
  const daiToEthRate = parseUnits('1', 36).div(ethToDaiRate);

  const chainlinkDAI = await ChainlinkAggregatorMock.deploy();
  await chainlinkDAI.setLatestAnswer(daiToEthRate);

  const chainlinkSteth = await ChainlinkAggregatorMock.deploy();
  await chainlinkSteth.setLatestAnswer(parseEther('1'));

  const chainlinkEthUsdAsset = await ChainlinkAggregatorMock.deploy();
  await chainlinkEthUsdAsset.setLatestAnswer(ethToUsdRate);
  await chainlinkEthUsdAsset.setDecimals(8);

  const priceFeedOracle = await PriceFeedOracle.deploy(
    [dai.address, stETH.address, Assets.ETH], // assetAddresses
    [chainlinkDAI.address, chainlinkSteth.address, chainlinkEthUsdAsset.address], // assetAggregators
    [AggregatorType.ETH, AggregatorType.ETH, AggregatorType.USD], // aggregatorTypes
    [18, 18, 18], // assetDecimals
    st.address,
  );

  const pool = await Pool.deploy(priceFeedOracle.address);
  const cover = await Cover.deploy();

  await cover.setTotalActiveCoverInAsset(0, parseEther('100000')); // ETH
  await cover.setTotalActiveCoverInAsset(1, '0'); // DAI

  const mcr = await initMCR({
    mcrValue: parseEther('150000'),
    mcrFloor: parseEther('150000'),
    desiredMCR: parseEther('150000'),
    mcrFloorIncrementThreshold: '13000',
    maxMCRFloorIncrement: '100',
    maxMCRIncrement: '500',
    gearingFactor: '48000',
    minUpdateTime: '3600',
    master,
  });

  // set contract addresses
  await master.setLatestAddress(hex('P1'), pool.address);
  await master.setLatestAddress(hex('CO'), cover.address);

  for (const member of accounts.members) {
    await master.enrollMember(member.address, Role.Member);
  }

  for (const advisoryBoardMember of accounts.advisoryBoardMembers) {
    await master.enrollMember(advisoryBoardMember.address, Role.AdvisoryBoard);
  }

  for (const internalContract of accounts.internalContracts) {
    await master.enrollInternal(internalContract.address);
  }

  // there is only one in reality, but it doesn't matter
  for (const governanceContract of accounts.governanceContracts) {
    await master.enrollGovernance(governanceContract.address);
  }

  return {
    master,
    pool,
    dai,
    st,
    chainlinkDAI,
    mcr,
    cover,
    accounts,
  };
}

module.exports = setup;

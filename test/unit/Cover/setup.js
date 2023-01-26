const { ethers } = require('hardhat');
const { expect } = require('chai');

const { getAccounts } = require('../utils').accounts;
const { Role } = require('../utils').constants;
const { hex } = require('../utils').helpers;

const { BigNumber } = ethers;
const { MaxUint256 } = ethers.constants;
const { getContractAddress, parseEther } = ethers.utils;

const getDeployAddressAfter = async (account, txCount) => {
  const from = account.address;
  const nonce = (await account.getTransactionCount()) + txCount;
  return getContractAddress({ from, nonce });
};

async function setup() {
  const MasterMock = await ethers.getContractFactory('MasterMock');
  const Pool = await ethers.getContractFactory('CoverMockPool');
  const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
  const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');
  const ChainlinkAggregatorMock = await ethers.getContractFactory('ChainlinkAggregatorMock');
  const MemberRolesMock = await ethers.getContractFactory('MemberRolesMock');
  const CoverNFT = await ethers.getContractFactory('CoverMockCoverNFT');
  const StakingNFT = await ethers.getContractFactory('CoverMockStakingNFT');
  const TokenController = await ethers.getContractFactory('TokenControllerMock');
  const NXMToken = await ethers.getContractFactory('NXMTokenMock');
  const MCR = await ethers.getContractFactory('CoverMockMCR');
  const StakingPool = await ethers.getContractFactory('CoverMockStakingPool');
  const StakingPoolFactory = await ethers.getContractFactory('StakingPoolFactory');
  const ERC20CustomDecimalsMock = await ethers.getContractFactory('ERC20CustomDecimalsMock');
  const Cover = await ethers.getContractFactory('Cover');

  const master = await MasterMock.deploy();
  await master.deployed();

  const dai = await ERC20Mock.deploy();
  await dai.deployed();

  const usdcDecimals = 6;
  const usdc = await ERC20CustomDecimalsMock.deploy(usdcDecimals); // 6 decimals
  await usdc.deployed();

  const stETH = await ERC20Mock.deploy();
  await stETH.deployed();

  const memberRoles = await MemberRolesMock.deploy();
  await memberRoles.deployed();

  const tokenController = await TokenController.deploy();
  await tokenController.deployed();

  const nxm = await NXMToken.deploy();
  await nxm.deployed();
  await nxm.setOperator(tokenController.address);

  const mcr = await MCR.deploy();
  await mcr.deployed();
  await mcr.setMCR(parseEther('600000'));

  const stakingPoolImplementation = await StakingPool.deploy();
  await stakingPoolImplementation.deployed();

  const coverNFT = await CoverNFT.deploy();
  await coverNFT.deployed();

  const stakingNFT = await StakingNFT.deploy();
  await stakingNFT.deployed();

  const { defaultSender } = await getAccounts();
  const expectedCoverAddress = await getDeployAddressAfter(defaultSender, 1);

  const stakingPoolFactory = await StakingPoolFactory.deploy(expectedCoverAddress);
  await stakingPoolFactory.deployed();

  const cover = await Cover.deploy(
    coverNFT.address,
    stakingNFT.address,
    stakingPoolFactory.address,
    stakingPoolImplementation.address,
  );
  await cover.deployed();

  expect(expectedCoverAddress).to.equal(cover.address);

  await master.setTokenAddress(nxm.address);

  const ethToDaiRate = parseEther('2000');
  const daiToEthRate = BigNumber.from(10).pow(BigNumber.from(36)).div(ethToDaiRate);

  const chainlinkDAI = await ChainlinkAggregatorMock.deploy();
  await chainlinkDAI.deployed();
  await chainlinkDAI.setLatestAnswer(daiToEthRate.toString());

  const chainlinkUSDC = await ChainlinkAggregatorMock.deploy();
  await chainlinkUSDC.deployed();
  await chainlinkUSDC.setLatestAnswer(daiToEthRate.toString());

  const chainlinkSteth = await ChainlinkAggregatorMock.deploy();
  await chainlinkSteth.deployed();
  await chainlinkSteth.setLatestAnswer(parseEther('1'));

  const priceFeedOracle = await PriceFeedOracle.deploy(
    [dai.address, stETH.address, usdc.address],
    [chainlinkDAI.address, chainlinkSteth.address, chainlinkUSDC.address],
    [18, 18, usdcDecimals],
  );
  await priceFeedOracle.deployed();

  const pool = await Pool.deploy();
  await pool.deployed();

  await pool.setAssets([dai.address, usdc.address], [18, usdcDecimals]);

  await pool.setTokenPrice('0', parseEther('1'));
  await pool.setTokenPrice('1', parseEther('1'));
  await pool.setTokenPrice('2', parseEther('1'));

  // set contract addresses
  await master.setLatestAddress(hex('P1'), pool.address);
  await master.setLatestAddress(hex('MR'), memberRoles.address);
  await master.setLatestAddress(hex('CO'), cover.address);
  await master.setLatestAddress(hex('TC'), tokenController.address);
  await master.setLatestAddress(hex('MC'), mcr.address);

  const accounts = await getAccounts();

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

  for (const contract of [cover, tokenController]) {
    await contract.changeMasterAddress(master.address);
    await contract.changeDependentContractAddress();
    await master.enrollInternal(contract.address);
  }

  await master.setEmergencyAdmin(accounts.emergencyAdmin.address);

  await cover.initialize();
  const capacityFactor = '20000';
  const coverAssetsFallback = 0b111; // ETH, DAI and USDC
  await cover
    .connect(accounts.governanceContracts[0])
    .updateUintParameters([0, 2], [capacityFactor, coverAssetsFallback]);

  await cover.connect(accounts.advisoryBoardMembers[0]).setProductTypes([
    {
      productTypeId: MaxUint256,
      ipfsMetadata: 'ipfs metadata',
      productType: {
        claimMethod: '1',
        gracePeriod: 120 * 24 * 3600, // 120 days
      },
    },
  ]);

  // add products
  await cover.connect(accounts.advisoryBoardMembers[0]).setProducts([
    {
      productId: MaxUint256,
      ipfsMetadata: 'ipfs metadata',
      product: {
        productType: '0',
        yieldTokenAddress: '0x0000000000000000000000000000000000000000',
        coverAssets: parseInt('111', 2), // ETH DAI and USDC supported
        initialPriceRatio: '1000', // 10%
        capacityReductionRatio: '0',
        isDeprecated: false,
        useFixedPrice: false,
      },
      allowedPools: [],
    },
    {
      productId: MaxUint256,
      ipfsMetadata: 'ipfs metadata',
      product: {
        productType: '0',
        yieldTokenAddress: '0x0000000000000000000000000000000000000001',
        coverAssets: parseInt('111', 2), // ETH DAI and USDC supported
        initialPriceRatio: '1000', // 10%
        capacityReductionRatio: '0',
        isDeprecated: false,
        useFixedPrice: true,
      },
      allowedPools: [0],
    },
  ]);

  const [GLOBAL_MIN_PRICE_RATIO, BUCKET_SIZE, MAX_COMMISSION_RATIO] = await Promise.all([
    cover.GLOBAL_MIN_PRICE_RATIO(),
    cover.BUCKET_SIZE(),
    cover.MAX_COMMISSION_RATIO(),
  ]);

  this.master = master;
  this.pool = pool;
  this.dai = dai;
  this.usdc = usdc;
  this.nxm = nxm;
  this.tokenController = tokenController;
  this.memberRoles = memberRoles;
  this.chainlinkDAI = chainlinkDAI;
  this.cover = cover;
  this.coverNFT = coverNFT;
  this.accounts = accounts;
  this.capacityFactor = capacityFactor;
  this.stakingPoolImplementation = stakingPoolImplementation;
  this.stakingPoolFactory = stakingPoolFactory;
  this.config = { GLOBAL_MIN_PRICE_RATIO, BUCKET_SIZE, MAX_COMMISSION_RATIO };
}

module.exports = setup;

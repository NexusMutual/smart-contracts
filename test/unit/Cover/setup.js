const { ethers } = require('hardhat');
const { getContractAddress } = require('@ethersproject/address');
const { hexlify, arrayify, hexValue, hexZeroPad, parseEther } = ethers.utils;
const { BigNumber } = ethers;
const { getAccounts } = require('../../utils/accounts');
const { Role } = require('../utils').constants;
const { hex, zeroPadRight } = require('../utils').helpers;

const getDeployAddressAfter = async txCount => {
  const signers = await ethers.getSigners();
  const { defaultSender } = getAccounts(signers);
  const transactionCount = await defaultSender.getTransactionCount();
  const nextAddress = getContractAddress({
    from: defaultSender.address,
    nonce: transactionCount + txCount,
  });
  return nextAddress;
};

async function setup () {
  const MasterMock = await ethers.getContractFactory('MasterMock');
  const Pool = await ethers.getContractFactory('CoverMockPool');
  const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
  const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');
  const ChainlinkAggregatorMock = await ethers.getContractFactory('ChainlinkAggregatorMock');
  const QuotationData = await ethers.getContractFactory('CoverMockQuotationData');
  const Cover = await ethers.getContractFactory('Cover');
  const MemberRolesMock = await ethers.getContractFactory('MemberRolesMock');
  const CoverNFT = await ethers.getContractFactory('CoverNFT');
  const TokenController = await ethers.getContractFactory('TokenControllerMock');
  const NXMToken = await ethers.getContractFactory('NXMTokenMock');
  const MCR = await ethers.getContractFactory('CoverMockMCR');
  const StakingPool = await ethers.getContractFactory('CoverMockStakingPool');

  const [owner] = await ethers.getSigners();

  const master = await MasterMock.deploy();
  await master.deployed();

  const quotationData = await QuotationData.deploy();

  const daiAsset = zeroPadRight(Buffer.from('DAI'), 4);
  const ethAsset = zeroPadRight(Buffer.from('ETH'), 4);

  await quotationData.setTotalSumAssured(daiAsset, '0');
  await quotationData.setTotalSumAssured(ethAsset, '100000');

  const dai = await ERC20Mock.deploy();
  await dai.deployed();

  const stETH = await ERC20Mock.deploy();
  await stETH.deployed();

  const memberRoles = await MemberRolesMock.deploy();
  await memberRoles.deployed();

  const tokenController = await TokenController.deploy();
  await tokenController.deployed();

  const nxm = await NXMToken.deploy();
  await nxm.deployed();
  nxm.setOperator(tokenController.address);

  const mcr = await MCR.deploy();
  await mcr.deployed();
  await mcr.setMCR(parseEther('600000'));

  const futureCoverNFTAddress = getDeployAddressAfter(2);

  const coverAddress = getDeployAddressAfter(1);

  const stakingPool = await StakingPool.deploy(nxm.address, coverAddress, memberRoles.address);
  const cover = await Cover.deploy(
    quotationData.address,
    ethers.constants.AddressZero,
    stakingPool.address,
    futureCoverNFTAddress,
    coverAddress,
  );
  await cover.deployed();

  const coverNFT = await CoverNFT.deploy('NexusMutual Cover', 'NXMC', cover.address);
  await coverNFT.deployed();

  await master.setTokenAddress(nxm.address);

  const ethToDaiRate = parseEther('2000');
  const daiToEthRate = BigNumber.from(10)
    .pow(BigNumber.from(36))
    .div(ethToDaiRate);

  const chainlinkDAI = await ChainlinkAggregatorMock.deploy();
  await chainlinkDAI.deployed();

  await chainlinkDAI.setLatestAnswer(daiToEthRate.toString());

  const priceFeedOracle = await PriceFeedOracle.deploy(chainlinkDAI.address, dai.address, stETH.address);
  await priceFeedOracle.deployed();

  const pool = await Pool.deploy();
  await pool.deployed();

  await pool.setAssets([dai.address], [18]);

  await pool.setTokenPrice('0', parseEther('1'));
  await pool.setTokenPrice('1', parseEther('1'));

  await cover.initialize();

  // set contract addresses
  await master.setLatestAddress(hex('P1'), pool.address);
  await master.setLatestAddress(hex('QD'), quotationData.address);
  await master.setLatestAddress(hex('MR'), memberRoles.address);
  await master.setLatestAddress(hex('CO'), cover.address);
  await master.setLatestAddress(hex('TC'), tokenController.address);
  await master.setLatestAddress(hex('MC'), mcr.address);

  const signers = await ethers.getSigners();
  const accounts = getAccounts(signers);

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

  // add products
  await cover.connect(accounts.advisoryBoardMembers[0]).addProducts([
    {
      productType: '0',
      productAddress: '0x0000000000000000000000000000000000000000',
      coverAssets: parseInt('11', 2), // ETH and DAI supported
      initialPriceRatio: '1000', // 10%
      capacityReductionRatio: '0',
    },
  ], ['']);

  await cover.connect(accounts.advisoryBoardMembers[0]).addProductTypes([
    {
      descriptionIpfsHash: 'my ipfs hash',
      claimMethod: '1',
      gracePeriodInDays: '120',
    },
  ], ['']);

  this.master = master;
  this.pool = pool;
  this.dai = dai;
  this.nxm = nxm;
  this.tokenController = tokenController;
  this.memberRoles = memberRoles;
  this.chainlinkDAI = chainlinkDAI;
  this.cover = cover;
  this.accounts = accounts;
}

module.exports = setup;

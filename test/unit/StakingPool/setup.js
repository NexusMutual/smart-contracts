const { ethers } = require('hardhat');
const { parseEther } = ethers.utils;
const { getAccounts } = require('../../utils/accounts');
const { Role } = require('../utils').constants;
const { zeroPadRight } = require('../utils').helpers;

async function setup() {
  const MasterMock = await ethers.getContractFactory('MasterMock');
  const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
  const QuotationData = await ethers.getContractFactory('CoverMockQuotationData');
  const MemberRolesMock = await ethers.getContractFactory('MemberRolesMock');
  const TokenController = await ethers.getContractFactory('TokenControllerMock');
  const NXMToken = await ethers.getContractFactory('NXMTokenMock');
  const MCR = await ethers.getContractFactory('CoverMockMCR');
  const StakingPool = await ethers.getContractFactory('StakingPool');

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

  const mcr = await MCR.deploy();
  await mcr.deployed();
  await mcr.setMCR(parseEther('600000'));

  const signers = await ethers.getSigners();
  const accounts = getAccounts(signers);

  const stakingPool = await StakingPool.deploy(nxm.address, accounts.defaultSender.address, tokenController.address);

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

  const REWARD_BONUS_PER_TRANCHE_RATIO = await stakingPool.REWARD_BONUS_PER_TRANCHE_RATIO();
  const REWARD_BONUS_PER_TRANCHE_DENOMINATOR = await stakingPool.REWARD_BONUS_PER_TRANCHE_DENOMINATOR();

  this.master = master;
  this.stakingPool = stakingPool;
  this.dai = dai;
  this.accounts = accounts;
  this.config = {
    REWARD_BONUS_PER_TRANCHE_DENOMINATOR,
    REWARD_BONUS_PER_TRANCHE_RATIO,
  };
}

module.exports = setup;

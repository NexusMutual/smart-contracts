const { ethers } = require('hardhat');
const { parseEther } = ethers.utils;
const { getAccounts } = require('../../utils/accounts');
const { setEtherBalance } = require('../../utils/evm');
const { Role } = require('../utils').constants;

async function setup() {
  const MasterMock = await ethers.getContractFactory('MasterMock');
  const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
  const SPCoverProducts = await ethers.getContractFactory('SPMockCover');
  const MemberRolesMock = await ethers.getContractFactory('MemberRolesMock');
  const TokenController = await ethers.getContractFactory('TokenControllerMock');
  const NXMToken = await ethers.getContractFactory('NXMTokenMock');
  const MCR = await ethers.getContractFactory('CoverMockMCR');
  const StakingPool = await ethers.getContractFactory('StakingPool');

  const master = await MasterMock.deploy();
  await master.deployed();

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

  const accounts = await getAccounts();

  const cover = await SPCoverProducts.deploy();
  await cover.deployed();

  const StakingNFT = await ethers.getContractFactory('SPMockStakingNFT');
  const stakingNFT = await StakingNFT.deploy();

  const stakingPool = await StakingPool.deploy(stakingNFT.address, nxm.address, cover.address, tokenController.address, master.address);

  await nxm.setOperator(tokenController.address);
  await tokenController.setContractAddresses(cover.address, nxm.address);
  await cover.setStakingPool(stakingPool.address, 0);

  for (const member of accounts.members) {
    const amount = ethers.constants.MaxUint256.div(100);
    await master.enrollMember(member.address, Role.Member);
    await memberRoles.setRole(member.address, Role.Member);
    await nxm.mint(member.address, amount);
    await nxm.connect(member).approve(tokenController.address, amount);
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

  await tokenController.changeMasterAddress(master.address);

  const config = {
    REWARD_BONUS_PER_TRANCHE_RATIO: await stakingPool.REWARD_BONUS_PER_TRANCHE_RATIO(),
    REWARD_BONUS_PER_TRANCHE_DENOMINATOR: await stakingPool.REWARD_BONUS_PER_TRANCHE_DENOMINATOR(),
    PRICE_CHANGE_PER_DAY: await stakingPool.PRICE_CHANGE_PER_DAY(),
    PRICE_BUMP_RATIO: await stakingPool.PRICE_BUMP_RATIO(),
    SURGE_PRICE_RATIO: await stakingPool.SURGE_PRICE_RATIO(),
    SURGE_THRESHOLD_DENOMINATOR: await stakingPool.SURGE_THRESHOLD_DENOMINATOR(),
    SURGE_THRESHOLD_RATIO: await stakingPool.SURGE_THRESHOLD_RATIO(),
    NXM_PER_ALLOCATION_UNIT: await stakingPool.NXM_PER_ALLOCATION_UNIT(),
    ALLOCATION_UNITS_PER_NXM: await stakingPool.ALLOCATION_UNITS_PER_NXM(),
    INITIAL_PRICE_DENOMINATOR: await stakingPool.INITIAL_PRICE_DENOMINATOR(),
    TARGET_PRICE_DENOMINATOR: await stakingPool.TARGET_PRICE_DENOMINATOR(),
    POOL_FEE_DENOMINATOR: await stakingPool.POOL_FEE_DENOMINATOR(),
    GLOBAL_CAPACITY_DENOMINATOR: await stakingPool.GLOBAL_CAPACITY_DENOMINATOR(),
    GLOBAL_CAPACITY_RATIO: await cover.globalCapacityRatio(),
    GLOBAL_MIN_PRICE_RATIO: await cover.GLOBAL_MIN_PRICE_RATIO(),
  };

  const coverSigner = await ethers.getImpersonatedSigner(cover.address);
  await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));

  this.tokenController = tokenController;
  this.master = master;
  this.nxm = nxm;
  this.stakingNFT = stakingNFT;
  this.stakingPool = stakingPool;
  this.cover = cover;
  this.coverSigner = coverSigner;
  this.dai = dai;
  this.accounts = accounts;
  this.config = config;
}

module.exports = setup;

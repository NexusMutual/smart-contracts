const { ethers } = require('hardhat');
const { getAccounts } = require('../../utils/accounts');
const { parseEther } = ethers.utils;
const { setEtherBalance } = require('../utils').evm;
const { Role } = require('../utils').constants;

async function setup() {
  const accounts = await getAccounts();
  const master = await ethers.deployContract('MasterMock');
  const memberRoles = await ethers.deployContract('MemberRolesMock');
  const tokenController = await ethers.deployContract('TokenControllerMock');

  const nxm = await ethers.deployContract('NXMTokenMock');

  const mcr = await ethers.deployContract('CoverMockMCR');
  await mcr.setMCR(parseEther('600000'));

  // TODO: move to separate folder
  const multicallMock = await ethers.deployContract('MulticallMock');

  const cover = await ethers.deployContract('SPMockCover');
  const stakingNFT = await ethers.deployContract('SPMockStakingNFT');
  const spf = await ethers.deployContract('StakingPoolFactory', [cover.address]);
  const stakingProducts = await ethers.deployContract('SPMockStakingProducts', [cover.address, spf.address]);

  const stakingPool = await ethers.deployContract('StakingPool', [
    stakingNFT.address,
    nxm.address,
    cover.address,
    tokenController.address,
    master.address,
    stakingProducts.address,
  ]);

  await nxm.setOperator(tokenController.address);
  await tokenController.setContractAddresses(cover.address, nxm.address);
  await cover.setStakingPool(stakingPool.address, 0);

  await master.enrollInternal(cover.address);
  await tokenController.changeMasterAddress(master.address);
  await stakingProducts.changeMasterAddress(master.address);

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

  const config = {
    REWARD_BONUS_PER_TRANCHE_RATIO: await stakingPool.REWARD_BONUS_PER_TRANCHE_RATIO(),
    REWARD_BONUS_PER_TRANCHE_DENOMINATOR: await stakingPool.REWARD_BONUS_PER_TRANCHE_DENOMINATOR(),
    PRICE_CHANGE_PER_DAY: await stakingProducts.PRICE_CHANGE_PER_DAY(),
    PRICE_BUMP_RATIO: await stakingProducts.PRICE_BUMP_RATIO(),
    SURGE_PRICE_RATIO: await stakingProducts.SURGE_PRICE_RATIO(),
    SURGE_THRESHOLD_DENOMINATOR: await stakingProducts.SURGE_THRESHOLD_DENOMINATOR(),
    SURGE_THRESHOLD_RATIO: await stakingProducts.SURGE_THRESHOLD_RATIO(),
    NXM_PER_ALLOCATION_UNIT: await stakingPool.NXM_PER_ALLOCATION_UNIT(),
    ALLOCATION_UNITS_PER_NXM: await stakingPool.ALLOCATION_UNITS_PER_NXM(),
    INITIAL_PRICE_DENOMINATOR: await stakingProducts.INITIAL_PRICE_DENOMINATOR(),
    REWARDS_DENOMINATOR: await stakingPool.REWARDS_DENOMINATOR(),
    WEIGHT_DENOMINATOR: await stakingPool.WEIGHT_DENOMINATOR(),
    CAPACITY_REDUCTION_DENOMINATOR: await stakingPool.CAPACITY_REDUCTION_DENOMINATOR(),
    TARGET_PRICE_DENOMINATOR: await stakingProducts.TARGET_PRICE_DENOMINATOR(),
    POOL_FEE_DENOMINATOR: await stakingPool.POOL_FEE_DENOMINATOR(),
    GLOBAL_CAPACITY_DENOMINATOR: await stakingPool.GLOBAL_CAPACITY_DENOMINATOR(),
    TRANCHE_DURATION: await stakingProducts.TRANCHE_DURATION(),
    GLOBAL_CAPACITY_RATIO: await cover.globalCapacityRatio(),
    GLOBAL_REWARDS_RATIO: await cover.globalRewardsRatio(),
    GLOBAL_MIN_PRICE_RATIO: await cover.GLOBAL_MIN_PRICE_RATIO(),
  };

  const coverSigner = await ethers.getImpersonatedSigner(cover.address);
  await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));

  return {
    accounts,
    coverSigner,
    config,

    multicall: multicallMock,
    tokenController,
    master,
    nxm,
    stakingNFT,
    stakingPool,
    stakingProducts,
    cover,
  };
}

module.exports = setup;

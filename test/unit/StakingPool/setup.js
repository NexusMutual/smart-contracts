const { ethers, nexus } = require('hardhat');
const { setBalance } = require('@nomicfoundation/hardhat-network-helpers');
const { getAccounts } = require('../../utils/accounts');

const { parseEther, ZeroAddress, MaxUint256 } = ethers;
const { Role } = nexus.constants;

async function setup() {
  const accounts = await getAccounts();
  const master = await ethers.deployContract('MasterMock');
  const memberRoles = await ethers.deployContract('MemberRolesMock');
  const nxm = await ethers.deployContract('NXMTokenMock');
  const tokenController = await ethers.deployContract('TokenControllerMock', [nxm.target]);

  const multicallMock = await ethers.deployContract('MulticallMock');

  const cover = await ethers.deployContract('SKMockCover');
  const coverProducts = await ethers.deployContract('SKMockCoverProducts');
  const stakingNFT = await ethers.deployContract('SKMockStakingNFT');
  const spf = await ethers.deployContract('StakingPoolFactory', [cover.target]);

  // address _coverContract, address _stakingPoolFactory, address _coverProductsContract
  const stakingProducts = await ethers.deployContract('SKMockStakingProducts', [cover.target, spf.target, ZeroAddress]);

  const stakingPool = await ethers.deployContract(
    'StakingPool',
    [stakingNFT, nxm, cover, tokenController, master, stakingProducts].map(c => c.target),
  );

  await nxm.setOperator(tokenController.target);
  await cover.setStakingPool(stakingPool.target, 0);

  await master.enrollInternal(cover.target);
  await stakingProducts.changeMasterAddress(master.target);

  await master.enrollInternal(stakingProducts.target);

  for (const member of accounts.members) {
    const amount = MaxUint256 / 100n;
    await master.enrollMember(member.address, Role.Member);
    await memberRoles.setRole(member.address, Role.Member);
    await nxm.mint(member.address, amount);
    await nxm.connect(member).approve(tokenController.target, amount);
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
    PRICE_CHANGE_PER_DAY: await stakingProducts.PRICE_CHANGE_PER_DAY(),
    PRICE_BUMP_RATIO: await stakingProducts.PRICE_BUMP_RATIO(),
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
    GLOBAL_CAPACITY_RATIO: await cover.getGlobalCapacityRatio(),
    GLOBAL_REWARDS_RATIO: await cover.getGlobalRewardsRatio(),
    DEFAULT_MIN_PRICE_RATIO: await cover.DEFAULT_MIN_PRICE_RATIO(),
  };

  const coverSigner = await ethers.getImpersonatedSigner(cover.target);
  await setBalance(coverSigner.address, parseEther('1'));

  const stakingProductsSigner = await ethers.getImpersonatedSigner(stakingProducts.target);
  await setBalance(stakingProductsSigner.address, parseEther('100'));

  // Backward-compat alias used widely by migrated tests.
  for (const contract of [
    master,
    memberRoles,
    nxm,
    tokenController,
    multicallMock,
    cover,
    coverProducts,
    stakingNFT,
    spf,
    stakingProducts,
    stakingPool,
  ]) {
    contract.address = contract.target;
  }

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
    coverProducts,
    stakingProductsSigner,
  };
}

module.exports = setup;

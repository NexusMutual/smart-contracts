const { ethers } = require('hardhat');
const { getAccounts } = require('../../utils/accounts');
const { parseEther } = ethers.utils;
const { setEtherBalance } = require('../utils').evm;
const { Role } = require('../utils').constants;
const { AddressZero } = ethers.constants;

async function setup() {
  const accounts = await getAccounts();
  const master = await ethers.deployContract('MasterMock');
  const memberRoles = await ethers.deployContract('MemberRolesMock');
  const nxm = await ethers.deployContract('NXMTokenMock');
  const tokenController = await ethers.deployContract('TokenControllerMock', [nxm.address]);

  const mcr = await ethers.deployContract('COMockMCR');
  await mcr.setMCR(parseEther('600000'));

  const multicallMock = await ethers.deployContract('MulticallMock');

  const cover = await ethers.deployContract('SKMockCover');
  const coverProducts = await ethers.deployContract('SKMockCoverProducts');
  const stakingNFT = await ethers.deployContract('SKMockStakingNFT');
  const spf = await ethers.deployContract('StakingPoolFactory', [cover.address]);

  // address _coverContract, address _stakingPoolFactory, address _coverProductsContract
  const stakingProducts = await ethers.deployContract('SKMockStakingProducts', [
    cover.address,
    spf.address,
    AddressZero,
  ]);

  const stakingPool = await ethers.deployContract(
    'StakingPool',
    [stakingNFT, nxm, cover, tokenController, master, stakingProducts].map(c => c.address),
  );

  await nxm.setOperator(tokenController.address);
  await tokenController.setContractAddresses(cover.address, nxm.address);
  await cover.setStakingPool(stakingPool.address, 0);

  await master.enrollInternal(cover.address);
  await tokenController.changeMasterAddress(master.address);
  await stakingProducts.changeMasterAddress(master.address);

  await master.enrollInternal(stakingProducts.address);

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
    GLOBAL_CAPACITY_RATIO: await cover.globalCapacityRatio(),
    GLOBAL_REWARDS_RATIO: await cover.getGlobalRewardsRatio(),
    DEFAULT_MIN_PRICE_RATIO: await cover.DEFAULT_MIN_PRICE_RATIO(),
  };

  const coverSigner = await ethers.getImpersonatedSigner(cover.address);
  await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));

  const stakingProductsSigner = await ethers.getImpersonatedSigner(stakingProducts.address);
  await setEtherBalance(stakingProductsSigner.address, ethers.utils.parseEther('100'));

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

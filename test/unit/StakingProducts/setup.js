const { ethers } = require('hardhat');
const { expect } = require('chai');
const { getAccounts } = require('../../utils/accounts');

const { setEtherBalance } = require('../utils').evm;
const { Role } = require('../utils').constants;
const { hex } = require('../utils').helpers;

const { BigNumber } = ethers;
const { parseEther, getContractAddress } = ethers.utils;
const { AddressZero } = ethers.constants;

const initialProductTemplate = {
  productId: 0,
  weight: 100, // 1.00
  initialPrice: 500, // 5%
  targetPrice: 100, // 1%
};

const coverProductTemplate = {
  productType: 1,
  yieldTokenAddress: AddressZero,
  coverAssets: 1111,
  initialPriceRatio: 500,
  capacityReductionRatio: 0,
  useFixedPrice: false,
};

const ProductTypeFixture = {
  claimMethod: 1,
  gracePeriod: 7 * 24 * 3600, // 7 days
};
async function setup() {
  const accounts = await getAccounts();
  const master = await ethers.deployContract('MasterMock');
  const memberRoles = await ethers.deployContract('MemberRolesMock');
  const tokenController = await ethers.deployContract('TokenControllerMock');

  const nxm = await ethers.deployContract('NXMTokenMock');

  const mcr = await ethers.deployContract('CoverMockMCR');
  await mcr.setMCR(parseEther('600000'));

  const stakingNFT = await ethers.deployContract('SPMockStakingNFT');

  const nonce = (await accounts.defaultSender.getTransactionCount()) + 4;
  const expectedCoverAddress = getContractAddress({ from: accounts.defaultSender.address, nonce });
  const coverNFT = await ethers.deployContract('CoverNFT', [
    'CoverNFT',
    'CNFT',
    accounts.defaultSender.address,
    expectedCoverAddress,
  ]);
  const stakingPoolFactory = await ethers.deployContract('StakingPoolFactory', [expectedCoverAddress]);
  const stakingProducts = await ethers.deployContract('StakingProducts', [
    expectedCoverAddress,
    stakingPoolFactory.address,
  ]);
  const stakingPoolImplementation = await ethers.deployContract('StakingPool', [
    stakingNFT.address,
    nxm.address,
    expectedCoverAddress,
    tokenController.address,
    master.address,
    stakingProducts.address,
  ]);
  const cover = await ethers.deployContract('StakingProductsMockCover', [
    coverNFT.address,
    stakingNFT.address,
    stakingPoolFactory.address,
    stakingPoolImplementation.address,
  ]);
  expect(cover.address).to.equal(expectedCoverAddress);

  // set contract addresses
  await master.setTokenAddress(nxm.address);
  await master.setLatestAddress(hex('MR'), memberRoles.address);
  await master.setLatestAddress(hex('CO'), cover.address);
  await master.setLatestAddress(hex('TC'), tokenController.address);
  await master.setLatestAddress(hex('MC'), mcr.address);
  await master.setLatestAddress(hex('SP'), stakingProducts.address);
  await tokenController.setContractAddresses(cover.address, nxm.address);
  await master.setTokenAddress(nxm.address);
  await master.enrollInternal(accounts.defaultSender.address);
  await stakingProducts.changeMasterAddress(master.address);
  await nxm.setOperator(tokenController.address);

  for (const member of accounts.members) {
    await master.enrollMember(member.address, Role.Member);
    await memberRoles.setRole(member.address, Role.Member);
  }

  for (const internalContract of accounts.internalContracts) {
    await master.enrollInternal(internalContract.address);
  }

  let i = 0;
  const initialProducts = Array(200)
    .fill('')
    .map(() => ({ ...initialProductTemplate, productId: i++ }));
  // Add products to cover contract
  await Promise.all(
    initialProducts.map(({ productId, initialPrice: initialPriceRatio }) => [
      cover.setProduct({ ...coverProductTemplate, initialPriceRatio }, productId),
      cover.setProductType(ProductTypeFixture, productId),
      cover.setPoolAllowed(productId, 1 /* poolID */, true),
    ]),
  );
  const ret = await cover.callStatic.createStakingPool(false, 5, 5, [], 'ipfs hash');

  await cover.createStakingPool(false, 5, 5, [], 'ipfs hash');

  const stakingPool = await ethers.getContractAt('StakingPool', ret[1]);
  tokenController.setStakingPoolManager(1 /* poolID */, accounts.members[0].address);

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
    GLOBAL_CAPACITY_RATIO: await cover.GLOBAL_CAPACITY_RATIO(),
    GLOBAL_REWARDS_RATIO: await cover.GLOBAL_REWARDS_RATIO(),
    GLOBAL_MIN_PRICE_RATIO: await cover.GLOBAL_MIN_PRICE_RATIO(),
  };

  const coverSigner = await ethers.getImpersonatedSigner(cover.address);
  await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));

  const poolId = BigNumber.from(await stakingPool.getPoolId());

  return {
    accounts,
    coverSigner,
    config,

    tokenController,
    master,
    nxm,
    stakingNFT,
    stakingPool,
    stakingProducts,
    cover,
    poolId,
  };
}

module.exports = setup;

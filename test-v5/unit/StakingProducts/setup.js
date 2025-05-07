const { ethers } = require('hardhat');
const { expect } = require('chai');

const { getAccounts } = require('../utils').accounts;
const { setEtherBalance } = require('../utils').evm;
const { Role } = require('../utils').constants;
const { hex } = require('../utils').helpers;

const { parseEther, getContractAddress } = ethers.utils;

const initialProductTemplate = {
  productId: 0,
  weight: 100, // 1.00
  initialPrice: 500, // 5%
  targetPrice: 100, // 1%
};

const coverProductTemplate = {
  productType: 1,
  minPrice: 0,
  __gap: 0,
  coverAssets: 1111,
  initialPriceRatio: 500,
  capacityReductionRatio: 0,
  useFixedPrice: false,
};

const productWithMinPrice = {
  ...coverProductTemplate,
  minPrice: 10, // 0.1%
};

const ProductTypeFixture = {
  claimMethod: 0,
  gracePeriod: 7 * 24 * 3600, // 7 days
};

async function setup() {
  const accounts = await getAccounts();
  const master = await ethers.deployContract('MasterMock');
  const memberRoles = await ethers.deployContract('MemberRolesMock');

  const nxm = await ethers.deployContract('NXMTokenMock');
  const tokenController = await ethers.deployContract('TokenControllerMock', [nxm.address]);

  const mcr = await ethers.deployContract('COMockMCR');
  await mcr.setMCR(parseEther('600000'));

  const stakingNFT = await ethers.deployContract('SKMockStakingNFT');
  const coverProducts = await ethers.deployContract('SPMockCoverProducts');

  const nonce = await accounts.defaultSender.getTransactionCount();
  const expectedStakingProductsAddress = getContractAddress({ from: accounts.defaultSender.address, nonce: nonce + 2 });
  const expectedCoverAddress = getContractAddress({ from: accounts.defaultSender.address, nonce: nonce + 4 });
  const coverNFT = await ethers.deployContract('CoverNFT', [
    'CoverNFT',
    'CNFT',
    accounts.defaultSender.address,
    expectedStakingProductsAddress,
  ]);

  const stakingPoolFactory = await ethers.deployContract('StakingPoolFactory', [expectedStakingProductsAddress]);
  const stakingProducts = await ethers.deployContract('SPMockStakingProducts', [
    expectedCoverAddress,
    stakingPoolFactory.address,
  ]);
  expect(stakingProducts.address).to.equal(expectedStakingProductsAddress);

  const stakingPoolImplementation = await ethers.deployContract('StakingPool', [
    stakingNFT.address,
    nxm.address,
    expectedCoverAddress,
    tokenController.address,
    master.address,
    stakingProducts.address,
  ]);

  const cover = await ethers.deployContract('SPMockCover', [
    coverNFT.address,
    stakingNFT.address,
    stakingPoolFactory.address,
    stakingPoolImplementation.address,
    coverProducts.address,
  ]);
  expect(cover.address).to.be.equal(expectedCoverAddress);

  // set contract addresses
  await master.setTokenAddress(nxm.address);
  await master.setLatestAddress(hex('MR'), memberRoles.address);
  await master.setLatestAddress(hex('CO'), cover.address);
  await master.setLatestAddress(hex('TC'), tokenController.address);
  await master.setLatestAddress(hex('MC'), mcr.address);
  await master.setLatestAddress(hex('SP'), stakingProducts.address);
  await master.setLatestAddress(hex('CP'), coverProducts.address);

  const pooledStakingSigner = accounts.members[4];
  await master.setLatestAddress(hex('PS'), pooledStakingSigner.address);

  await tokenController.setContractAddresses(cover.address, nxm.address);
  await master.setTokenAddress(nxm.address);
  await master.enrollInternal(accounts.defaultSender.address);
  await nxm.setOperator(tokenController.address);

  for (const member of accounts.members) {
    await master.enrollMember(member.address, Role.Member);
    await memberRoles.setRole(member.address, Role.Member);
  }

  for (const internalContract of accounts.internalContracts) {
    await master.enrollInternal(internalContract.address);
  }

  for (const contract of [stakingProducts]) {
    await contract.changeMasterAddress(master.address);
    await contract.changeDependentContractAddress();
    await master.enrollInternal(contract.address);
  }

  // setup a staking pool
  const [member] = accounts.members;

  const [poolId, stakingPoolAddress] = await stakingProducts
    .connect(member)
    .callStatic.createStakingPool(false, 5, 5, [], 'ipfs hash');

  await stakingProducts.connect(member).createStakingPool(false, 5, 5, [], 'ipfs hash');
  await tokenController.setStakingPoolManager(poolId, member.address);

  const stakingPool = await ethers.getContractAt('StakingPool', stakingPoolAddress);

  // set initial products
  const initialProducts = Array(200)
    .fill('')
    .map((_, productId) => ({ ...initialProductTemplate, productId }));

  // Add products to cover contract
  await Promise.all(
    initialProducts.map(async ({ productId, initialPrice: initialPriceRatio }) => {
      await coverProducts.setProduct({ ...coverProductTemplate, initialPriceRatio }, productId);
      await coverProducts.setProductType(ProductTypeFixture, productId);
      await coverProducts.setPoolAllowed(productId, poolId, true);
    }),
  );

  // set product with minPrice
  const expectedProductId = await coverProducts.getProductCount();
  await coverProducts.setProduct(productWithMinPrice, expectedProductId);
  await coverProducts.setProductType(ProductTypeFixture, expectedProductId);
  await coverProducts.setPoolAllowed(expectedProductId, poolId, true);

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
    GLOBAL_CAPACITY_RATIO: await cover.GLOBAL_CAPACITY_RATIO(),
    GLOBAL_REWARDS_RATIO: await cover.GLOBAL_REWARDS_RATIO(),
    DEFAULT_MIN_PRICE_RATIO: await cover.DEFAULT_MIN_PRICE_RATIO(),
  };

  const coverSigner = await ethers.getImpersonatedSigner(cover.address);
  await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));

  return {
    accounts,
    coverSigner,
    pooledStakingSigner,
    initialProducts,
    coverProducts,
    config,
    tokenController,
    master,
    nxm,
    stakingNFT,
    stakingPool,
    stakingProducts,
    cover,
    poolId,
    stakingPoolFactory,
    coverProductTemplate,
  };
}

module.exports = setup;

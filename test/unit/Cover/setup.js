const { ethers, nexus } = require('hardhat');
const { setBalance } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const { getAccounts } = require('../../utils/accounts');

const { parseEther, deployContract, getCreateAddress, MaxUint256 } = ethers;
const { PoolAsset, Role } = nexus.constants;
const { hex } = nexus.helpers;

const ASSETS = {
  ETH: 0,
  USDC: 1,
  cbBTC: 2,
};
const DEFAULT_POOL_FEE = '5';
const DEFAULT_PRODUCTS = [
  {
    productName: 'Product A',
    productId: MaxUint256,
    ipfsMetadata: 'ipfs metadata',
    product: {
      productType: '0',
      minPrice: 0,
      __gap: 0,
      coverAssets: 0, // use fallback
      initialPriceRatio: '1000', // 10%
      capacityReductionRatio: '0',
      isDeprecated: false,
      useFixedPrice: false,
    },
    allowedPools: [],
  },
  {
    productName: 'Product B',
    productId: MaxUint256,
    ipfsMetadata: 'ipfs metadata',
    product: {
      productType: '0',
      minPrice: 0,
      __gap: 0,
      coverAssets: 0, // use fallback
      initialPriceRatio: '1000', // 10%
      capacityReductionRatio: '0',
      isDeprecated: false,
      useFixedPrice: true,
    },
    allowedPools: [1],
  },
  {
    productName: 'Product C',
    productId: MaxUint256,
    ipfsMetadata: 'ipfs metadata',
    product: {
      productType: '0',
      minPrice: 0,
      __gap: 0,
      coverAssets: ASSETS.ETH | ASSETS.cbBTC, // ETH and cbBTC, no USDC
      initialPriceRatio: '1000', // 10%
      capacityReductionRatio: '0',
      isDeprecated: false,
      useFixedPrice: true,
    },
    allowedPools: [1],
  },
  {
    productName: 'Product D',
    productId: MaxUint256,
    ipfsMetadata: 'ipfs metadata',
    product: {
      productType: '0',
      minPrice: 0,
      __gap: 0,
      coverAssets: ASSETS.ETH | ASSETS.cbBTC, // ETH and cbBTC, no USDC
      initialPriceRatio: '1000', // 10%
      capacityReductionRatio: '0',
      isDeprecated: false,
      useFixedPrice: true,
    },
    allowedPools: [],
  },
];
const COVER_BUY_FIXTURE = {
  coverId: 0n,
  productId: 0n,
  coverAsset: 0n, // ETH
  paymentAsset: 0n, // ETH
  period: 3600n * 24n * 30n, // 30 days
  amount: parseEther('1000'),
  targetPriceRatio: 260n,
  priceDenominator: 10000n,
  activeCover: parseEther('5000'),
  capacity: parseEther('10000'),
  capacityFactor: '10000',
};

const getDeployAddressAfter = async (account, txCount) => {
  const from = account.address;
  const nonce = (await account.getNonce()) + txCount;
  return getCreateAddress({ from, nonce });
};

async function setup() {
  const accounts = await getAccounts();
  const master = await deployContract('MasterMock');
  const memberRoles = await deployContract('MemberRolesMock');
  const nxm = await deployContract('NXMTokenMock');
  const tokenController = await deployContract('TokenControllerMock', [nxm]);

  await nxm.setOperator(tokenController.target);

  const stakingPoolImplementation = await deployContract('COMockStakingPool');
  const coverNFT = await deployContract('COMockCoverNFT');
  const stakingNFT = await deployContract('COMockStakingNFT');

  const { defaultSender } = accounts;
  const expectedStakingProductsAddress = await getDeployAddressAfter(defaultSender, 3);

  const stakingPoolFactory = await deployContract('StakingPoolFactory', [expectedStakingProductsAddress]);

  const cover = await deployContract('Cover', [coverNFT, stakingNFT, stakingPoolFactory, stakingPoolImplementation]);

  const coverProducts = await ethers.deployContract('CoverProducts');

  const stakingProducts = await ethers.deployContract('COMockStakingProducts', [
    cover,
    stakingPoolFactory,
    tokenController,
    coverProducts,
  ]);
  expect(expectedStakingProductsAddress).to.equal(stakingProducts.target);

  const usdc = await deployContract('ERC20CustomDecimalsMock', [6]);
  const cbBTC = await deployContract('ERC20CustomDecimalsMock', [8]);

  const pool = await deployContract('PoolMock');
  await pool.setAssets([
    { assetAddress: cbBTC.target, isCoverAsset: true, isAbandoned: false },
    { assetAddress: usdc.target, isCoverAsset: true, isAbandoned: false },
  ]);

  await pool.setTokenPrice('0', parseEther('1'));
  await pool.setTokenPrice('1', parseEther('1'));
  await pool.setTokenPrice('2', parseEther('1'));

  await master.setTokenAddress(nxm);
  await master.setLatestAddress(hex('P1'), pool);
  await master.setLatestAddress(hex('MR'), memberRoles);
  await master.setLatestAddress(hex('CO'), cover);
  await master.setLatestAddress(hex('TC'), tokenController);
  await master.setLatestAddress(hex('SP'), stakingProducts);
  await master.setLatestAddress(hex('CP'), coverProducts);

  const pooledStakingSigner = accounts.members[4];
  await master.setLatestAddress(hex('PS'), pooledStakingSigner);

  for (const member of accounts.members) {
    await master.enrollMember(member.address, Role.Member);
    await memberRoles.setRole(member.address, Role.Member);
    await setBalance(member.address, parseEther('100'));
    await usdc.mint(member.address, parseEther('100000'));
    await usdc.connect(member).approve(cover, parseEther('100000'));
    await cbBTC.mint(member.address, parseEther('100000'));
    await cbBTC.connect(member).approve(cover, parseEther('100000'));
  }

  for (const advisoryBoardMember of accounts.advisoryBoardMembers) {
    await master.enrollMember(advisoryBoardMember.address, Role.AdvisoryBoard);
    await memberRoles.setRole(advisoryBoardMember.address, Role.AdvisoryBoard);
  }

  for (const internalContract of accounts.internalContracts) {
    await master.enrollInternal(internalContract.address);
  }

  for (const contract of [cover, coverProducts, tokenController]) {
    await contract.changeMasterAddress(master);
    await contract.changeDependentContractAddress();
    await master.enrollInternal(contract);
  }

  await master.setEmergencyAdmin(await accounts.emergencyAdmin.getAddress());

  await coverProducts.connect(accounts.advisoryBoardMembers[0]).setProductTypes([
    {
      productTypeName: 'ProductType X',
      productTypeId: MaxUint256,
      ipfsMetadata: 'ipfs metadata',
      productType: {
        claimMethod: '0',
        assessmentCooldownPeriod: 24 * 3600,
        payoutRedemptionPeriod: 3 * 24 * 3600,
        gracePeriod: 120 * 24 * 3600, // 120 days
      },
    },
  ]);

  // add products
  await coverProducts.connect(accounts.advisoryBoardMembers[0]).setProducts(DEFAULT_PRODUCTS);

  // create 1st stakingPool
  const productInitializationParams = DEFAULT_PRODUCTS.map(() => {
    return {
      productId: 0,
      weight: 100,
      initialPrice: COVER_BUY_FIXTURE.targetPriceRatio,
      targetPrice: COVER_BUY_FIXTURE.targetPriceRatio,
    };
  });

  await stakingProducts.connect(accounts.members[0]).createStakingPool(
    false, // isPrivatePool,
    DEFAULT_POOL_FEE, // initialPoolFee
    DEFAULT_POOL_FEE, // maxPoolFee,
    productInitializationParams,
    'ipfsDescriptionHash',
  );

  const stakingPoolId1 = await stakingPoolFactory.stakingPoolCount();
  const stakingPoolAddress1 = await stakingProducts.stakingPool(stakingPoolId1);
  const stakingPool1 = await ethers.getContractAt('COMockStakingPool', stakingPoolAddress1);

  for (let i = 0; i < DEFAULT_PRODUCTS.length; i++) {
    if (DEFAULT_PRODUCTS[i].allowedPools.length !== 0 || DEFAULT_PRODUCTS[i].allowedPools.includes(stakingPoolId1)) {
      continue;
    }
    await stakingPool1.setStake(i, COVER_BUY_FIXTURE.capacity);
    await stakingPool1.setUsedCapacity(i, COVER_BUY_FIXTURE.activeCover);
    await stakingPool1.setPrice(i, COVER_BUY_FIXTURE.targetPriceRatio); // 2.6%
  }

  // create 2nd stakingPool
  await stakingProducts.connect(accounts.members[1]).createStakingPool(
    false, // isPrivatePool,
    DEFAULT_POOL_FEE, // initialPoolFee
    DEFAULT_POOL_FEE, // maxPoolFee,
    productInitializationParams,
    'ipfsDescriptionHash',
  );

  const stakingPoolId2 = await stakingPoolFactory.stakingPoolCount();
  const stakingPoolAddress2 = await stakingProducts.stakingPool(stakingPoolId2);
  const stakingPool2 = await ethers.getContractAt('COMockStakingPool', stakingPoolAddress2);

  for (let i = 0; i < DEFAULT_PRODUCTS.length; i++) {
    await stakingPool2.setStake(i, COVER_BUY_FIXTURE.capacity);
    await stakingPool2.setUsedCapacity(i, COVER_BUY_FIXTURE.activeCover);
    await stakingPool2.setPrice(i, COVER_BUY_FIXTURE.targetPriceRatio); // 2.6%
  }

  const DEFAULT_MIN_PRICE_RATIO = await cover.DEFAULT_MIN_PRICE_RATIO();
  const MAX_COMMISSION_RATIO = await cover.MAX_COMMISSION_RATIO();
  const BUCKET_SIZE = 7n * 24n * 3600n; // 7 days
  const capacityFactor = '20000';

  return {
    accounts,
    master,
    pool,
    usdc,
    cbBTC,
    nxm,
    tokenController,
    memberRoles,
    cover,
    coverNFT,
    capacityFactor,
    coverProducts,
    stakingPoolImplementation,
    stakingPoolFactory,
    stakingProducts,
    stakingPool1,
    stakingPool2,
    config: { DEFAULT_MIN_PRICE_RATIO, BUCKET_SIZE, MAX_COMMISSION_RATIO },
    constants: {
      ASSETS,
      DEFAULT_POOL_FEE,
      DEFAULT_PRODUCTS,
      COVER_BUY_FIXTURE,
    },
    PoolAsset,
    pooledStakingSigner,
  };
}

module.exports = { setup };

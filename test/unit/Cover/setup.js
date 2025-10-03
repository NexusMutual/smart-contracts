const { ethers, nexus } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { getAccounts } = require('../../utils/accounts');
const { init } = require('../../init');

const { MaxUint256, deployContract, parseEther } = ethers;
const { ContractIndexes, PoolAsset, Role } = nexus.constants;
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

async function setup() {
  await loadFixture(init);
  const accounts = await getAccounts();
  const [governor] = accounts.governanceContracts;
  const [riSigner, riPremiumDst] = accounts.generalPurpose;

  // deploy proxy contracts
  const coverProxy = await deployContract('UpgradeableProxy');
  const coverProductsProxy = await deployContract('UpgradeableProxy');
  const stakingProductsProxy = await deployContract('UpgradeableProxy');
  const tokenControllerProxy = await deployContract('UpgradeableProxy');
  const poolProxy = await deployContract('UpgradeableProxy');

  // deploy immutable contracts
  const stakingPoolFactory = await deployContract('StakingPoolFactory', [stakingProductsProxy]); // SP is the operator
  const coverNFT = await deployContract('COMockCoverNFT');
  const stakingNFT = await deployContract('COMockStakingNFT');
  const nxm = await deployContract('NXMTokenMock');
  await nxm.setOperator(tokenControllerProxy);

  const registry = await deployContract('RegistryMock');
  await registry.addContract(ContractIndexes.C_REGISTRY, registry, false);
  await registry.addContract(ContractIndexes.C_GOVERNOR, governor, false);

  // add immutables
  await registry.addContract(ContractIndexes.C_STAKING_POOL_FACTORY, stakingPoolFactory, false);
  await registry.addContract(ContractIndexes.C_COVER_NFT, coverNFT, false);
  await registry.addContract(ContractIndexes.C_STAKING_NFT, stakingNFT, false);
  await registry.addContract(ContractIndexes.C_TOKEN, nxm, false);

  // add proxies
  await registry.addContract(ContractIndexes.C_COVER, coverProxy, true);
  await registry.addContract(ContractIndexes.C_COVER_PRODUCTS, coverProductsProxy, true);
  await registry.addContract(ContractIndexes.C_STAKING_PRODUCTS, stakingProductsProxy, true);
  await registry.addContract(ContractIndexes.C_TOKEN_CONTROLLER, tokenControllerProxy, true);
  await registry.addContract(ContractIndexes.C_POOL, poolProxy, true);

  // deploy implementations
  const stakingPoolImplementation = await deployContract('COMockStakingPool');
  const coverImplementation = await deployContract('Cover', [registry, stakingPoolImplementation, coverProxy]);
  const tokenControllerImplementation = await deployContract('TokenControllerMock', [nxm]);
  const coverProductsImplementation = await ethers.deployContract('CoverProducts');
  const stakingProductsImplementation = await ethers.deployContract('COMockStakingProducts', [
    coverProxy,
    stakingPoolFactory,
    tokenControllerProxy,
    coverProductsProxy,
  ]);
  const poolImplementation = await deployContract('PoolMock');

  // upgrade proxies
  await coverProxy.upgradeTo(coverImplementation);
  await tokenControllerProxy.upgradeTo(tokenControllerImplementation);
  await coverProductsProxy.upgradeTo(coverProductsImplementation);
  await stakingProductsProxy.upgradeTo(stakingProductsImplementation);
  await poolProxy.upgradeTo(poolImplementation);

  // get contract instances
  const cover = await ethers.getContractAt('Cover', coverProxy);
  const tokenController = await ethers.getContractAt('TokenControllerMock', tokenControllerProxy);
  const coverProducts = await ethers.getContractAt('CoverProducts', coverProductsProxy);
  const stakingProducts = await ethers.getContractAt('COMockStakingProducts', stakingProductsProxy);
  const pool = await ethers.getContractAt('PoolMock', poolProxy);

  const usdc = await deployContract('ERC20CustomDecimalsMock', [6]);
  const cbBTC = await deployContract('ERC20CustomDecimalsMock', [8]);

  const riProviderId = 0n;
  await cover.connect(governor).setRiSigner(riSigner);
  await cover.connect(governor).setRiConfig(riProviderId, riPremiumDst);

  await pool.setAssets([
    { assetAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', isCoverAsset: true, isAbandoned: false },
    { assetAddress: usdc.target, isCoverAsset: true, isAbandoned: false },
    { assetAddress: cbBTC.target, isCoverAsset: true, isAbandoned: false },
  ]);

  await pool.setTokenPrice('0', parseEther('1'));
  await pool.setTokenPrice('1', parseEther('1'));
  await pool.setTokenPrice('2', parseEther('1'));

  // legacy contracts
  const memberRoles = await deployContract('MemberRolesMock');
  const master = await deployContract('MasterMock');

  await master.setTokenAddress(nxm);
  await master.setLatestAddress(hex('P1'), pool);
  await master.setLatestAddress(hex('CO'), cover);
  await master.setLatestAddress(hex('TC'), tokenController);
  await master.setLatestAddress(hex('SP'), stakingProducts);
  await master.setLatestAddress(hex('CP'), coverProducts);
  await master.setLatestAddress(hex('MR'), memberRoles);

  for (const member of accounts.members) {
    await master.enrollMember(member, Role.Member);
    await memberRoles.setRole(member, Role.Member);
    await registry.join(member, '0x');
    await usdc.mint(member, parseEther('100000'));
    await usdc.connect(member).approve(cover, parseEther('100000'));
    await cbBTC.mint(member, parseEther('100000'));
    await cbBTC.connect(member).approve(cover, parseEther('100000'));
  }

  for (const advisoryBoardMember of accounts.advisoryBoardMembers) {
    await master.enrollMember(advisoryBoardMember, Role.AdvisoryBoard);
    await memberRoles.setRole(advisoryBoardMember, Role.AdvisoryBoard);
    await registry.join(advisoryBoardMember, '0x');
  }

  for (const internalContract of accounts.internalContracts) {
    await master.enrollInternal(internalContract);
  }

  await coverProducts.changeMasterAddress(master);
  await coverProducts.changeDependentContractAddress();

  const emergencyAdmin = accounts.emergencyAdmins[0];
  await master.setEmergencyAdmin(emergencyAdmin); // can only set one

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
    registry,
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
    riSigner,
    riPremiumDst,
    riProviderId,
    constants: {
      PoolAsset,
      ASSETS,
      DEFAULT_POOL_FEE,
      DEFAULT_PRODUCTS,
      COVER_BUY_FIXTURE,
    },
  };
}

module.exports = { setup };

const { ethers, nexus } = require('hardhat');

const { getAccounts } = require('../../utils/accounts');

const { MaxUint256 } = ethers;
const { Role } = nexus.constants;
const { hex } = nexus.helpers;

const Assets = {
  ETH: 1,
  DAI: 2,
  USDC: 3,
};

async function setup() {
  const accounts = await getAccounts();
  const master = await ethers.deployContract('MasterMock');
  const memberRoles = await ethers.deployContract('MemberRolesMock');

  const coverProducts = await ethers.deployContract('CoverProducts');
  const stakingPoolFactory = await ethers.deployContract('CPMockStakingPoolFactory');
  const cover = await ethers.deployContract('CPMockCover', [stakingPoolFactory.target]);

  const stakingProducts = await ethers.deployContract('COMockStakingProducts', [
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
  ]);

  const dai = await ethers.deployContract('ERC20Mock');
  const usdc = await ethers.deployContract('ERC20CustomDecimalsMock', [6]); // 6 decimals

  const pool = await ethers.deployContract('PoolMock');
  await pool.setAssets([
    { assetAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', isCoverAsset: true, isAbandoned: false },
    { assetAddress: dai.target, isCoverAsset: true, isAbandoned: false },
    { assetAddress: usdc.target, isCoverAsset: true, isAbandoned: false },
  ]);

  // set contract addresses
  await master.setLatestAddress(hex('P1'), pool.target);
  await master.setLatestAddress(hex('MR'), memberRoles.target);
  await master.setLatestAddress(hex('CP'), coverProducts.target);
  await master.setLatestAddress(hex('SP'), stakingProducts.target);
  await master.setLatestAddress(hex('CO'), cover.target);

  const pooledStakingSigner = accounts.members[4];
  await master.setLatestAddress(hex('PS'), pooledStakingSigner.address);

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

  for (const contract of [coverProducts]) {
    await contract.changeMasterAddress(master.target);
    await contract.changeDependentContractAddress();
    await master.enrollInternal(contract.target);
  }

  await master.setEmergencyAdmin(accounts.emergencyAdmins[0].address);

  const productTypes = [
    {
      productTypeName: 'ProductType X',
      productTypeId: MaxUint256,
      ipfsMetadata: 'ipfs metadata',
      productType: {
        claimMethod: 0,
        gracePeriod: 120 * 24 * 3600, // 120 days
        assessmentCooldownPeriod: 24 * 3600,
        payoutRedemptionPeriod: 3 * 24 * 3600,
      },
    },
  ];

  const products = [
    {
      productName: 'Product A',
      productId: MaxUint256,
      ipfsMetadata: 'ipfs metadata',
      product: {
        productType: 0,
        minPrice: 0,
        __gap: 0,
        coverAssets: 0, // use fallback
        initialPriceRatio: 1000, // 10%
        capacityReductionRatio: 0,
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
        productType: 0,
        minPrice: 0,
        __gap: 0,
        coverAssets: 0, // use fallback
        initialPriceRatio: 1000, // 10%
        capacityReductionRatio: 0,
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
        productType: 0,
        minPrice: 0,
        __gap: 0,
        coverAssets: Assets.ETH | Assets.DAI, // ETH and DAI, no USDC
        initialPriceRatio: 1000, // 10%
        capacityReductionRatio: 0,
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
        productType: 0,
        minPrice: 0,
        __gap: 0,
        coverAssets: Assets.ETH | Assets.DAI, // ETH and DAI, no USDC
        initialPriceRatio: 1000, // 10%
        capacityReductionRatio: 0,
        isDeprecated: false,
        useFixedPrice: true,
      },
      allowedPools: [],
    },
  ];

  await coverProducts.connect(accounts.advisoryBoardMembers[0]).setProductTypes(productTypes);

  // add products
  await coverProducts.connect(accounts.advisoryBoardMembers[0]).setProducts(products);

  const DEFAULT_MIN_PRICE_RATIO = await cover.DEFAULT_MIN_PRICE_RATIO();
  const BUCKET_SIZE = 7n * 24n * 3600n; // 7 days
  const capacityFactor = '20000';

  return {
    master,
    pool,
    dai,
    usdc,
    cover,
    stakingPoolFactory,
    memberRoles,
    accounts,
    capacityFactor,
    stakingProducts,
    coverProducts,
    config: { DEFAULT_MIN_PRICE_RATIO, BUCKET_SIZE },
    Assets,
    pooledStakingSigner,
    productTypes,
    products,
  };
}

module.exports = setup;

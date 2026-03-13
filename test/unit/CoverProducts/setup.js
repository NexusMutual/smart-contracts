const { ethers, nexus } = require('hardhat');

const { getAccounts } = require('../../utils/accounts');

const { MaxUint256 } = ethers;
const { Role } = nexus.constants;
const { hex } = nexus.helpers;

const COVER_ASSET = {
  ETH: 1 << 0, // 1
  // DAI: 1 << 1, // 2 - deprecated
  USDC: 1 << 6, // 64
  CBBTC: 1 << 7, // 128
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
    // cover assets
    { assetAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', isCoverAsset: true, isAbandoned: false }, // 0 ETH
    { assetAddress: dai.target, isCoverAsset: true, isAbandoned: true }, // 2 DAI - deprecated
    // non-cover assets
    { assetAddress: ethers.Wallet.createRandom().address, isCoverAsset: false, isAbandoned: false }, // 1 stETH
    { assetAddress: ethers.Wallet.createRandom().address, isCoverAsset: false, isAbandoned: false }, // 2 NXMTY
    { assetAddress: ethers.Wallet.createRandom().address, isCoverAsset: false, isAbandoned: false }, // 3 rETH
    { assetAddress: ethers.Wallet.createRandom().address, isCoverAsset: false, isAbandoned: false }, // 4 NXMIS
    // cover assets
    { assetAddress: usdc.target, isCoverAsset: true, isAbandoned: false }, // 6 USDC
    { assetAddress: ethers.Wallet.createRandom().address, isCoverAsset: true, isAbandoned: false }, // 7 CBBTC
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
        coverAssets: COVER_ASSET.ETH | COVER_ASSET.USDC, // ETH and USDC, no CBBTC
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
        coverAssets: COVER_ASSET.ETH | COVER_ASSET.USDC, // ETH and USDC, no CBBTC
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
    COVER_ASSET,
    pooledStakingSigner,
    productTypes,
    products,
  };
}

module.exports = {
  setup,
  COVER_ASSET,
};

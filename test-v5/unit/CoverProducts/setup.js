const { ethers, accounts } = require('hardhat');
const { BigNumber } = require('ethers');

const { Role } = require('../utils').constants;
const { hex } = require('../utils').helpers;

const { AddressZero, MaxUint256 } = ethers.constants;
const { parseEther } = ethers.utils;

const Assets = {
  ETH: 1,
  DAI: 2,
  USDC: 3,
};

async function setup() {
  const master = await ethers.deployContract('MasterMock');
  const memberRoles = await ethers.deployContract('MemberRolesMock');
  const nxm = await ethers.deployContract('NXMTokenMock');
  const tokenController = await ethers.deployContract('TokenControllerMock', [nxm.address]);

  await nxm.setOperator(tokenController.address);

  const mcr = await ethers.deployContract('COMockMCR');
  await mcr.setMCR(parseEther('600000'));

  const coverProducts = await ethers.deployContract('CoverProducts');
  const stakingPoolFactory = await ethers.deployContract('CPMockStakingPoolFactory');
  const cover = await ethers.deployContract('CPMockCover', [stakingPoolFactory.address]);

  const stakingProducts = await ethers.deployContract('COMockStakingProducts', [
    AddressZero,
    AddressZero,
    AddressZero,
    AddressZero,
  ]);

  const coverNFT = await ethers.deployContract('COMockCoverNFT');

  const dai = await ethers.deployContract('ERC20Mock');
  const usdc = await ethers.deployContract('ERC20CustomDecimalsMock', [6]); // 6 decimals

  const pool = await ethers.deployContract('PoolMock');
  await pool.setAssets([
    { assetAddress: dai.address, isCoverAsset: true, isAbandoned: false },
    { assetAddress: usdc.address, isCoverAsset: true, isAbandoned: false },
  ]);

  await pool.setTokenPrice('0', parseEther('1'));
  await pool.setTokenPrice('1', parseEther('1'));
  await pool.setTokenPrice('2', parseEther('1'));

  // set contract addresses
  await master.setTokenAddress(nxm.address);
  await master.setLatestAddress(hex('P1'), pool.address);
  await master.setLatestAddress(hex('MR'), memberRoles.address);
  await master.setLatestAddress(hex('CP'), coverProducts.address);
  await master.setLatestAddress(hex('TC'), tokenController.address);
  await master.setLatestAddress(hex('MC'), mcr.address);
  await master.setLatestAddress(hex('SP'), stakingProducts.address);
  await master.setLatestAddress(hex('CO'), cover.address);

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

  for (const contract of [coverProducts, tokenController]) {
    await contract.changeMasterAddress(master.address);
    await contract.changeDependentContractAddress();
    await master.enrollInternal(contract.address);
  }

  await master.setEmergencyAdmin(accounts.emergencyAdmin.address);

  const productTypes = [
    {
      productTypeName: 'ProductType X',
      productTypeId: MaxUint256,
      ipfsMetadata: 'ipfs metadata',
      productType: {
        claimMethod: 0,
        gracePeriod: 120 * 24 * 3600, // 120 days
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
  const BUCKET_SIZE = BigNumber.from(7 * 24 * 3600); // 7 days
  const capacityFactor = '20000';

  return {
    master,
    pool,
    dai,
    usdc,
    nxm,
    cover,
    stakingPoolFactory,
    tokenController,
    memberRoles,
    coverNFT,
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

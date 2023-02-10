const { ethers } = require('hardhat');
const { expect } = require('chai');

const { getAccounts } = require('../utils').accounts;
const { Role } = require('../utils').constants;
const { hex } = require('../utils').helpers;

const { AddressZero, MaxUint256 } = ethers.constants;
const { getContractAddress, parseEther } = ethers.utils;

const getDeployAddressAfter = async (account, txCount) => {
  const from = account.address;
  const nonce = (await account.getTransactionCount()) + txCount;
  return getContractAddress({ from, nonce });
};

const Assets = {
  ETH: 1,
  DAI: 2,
  USDC: 3,
};

async function setup() {
  const master = await ethers.deployContract('MasterMock');
  const memberRoles = await ethers.deployContract('MemberRolesMock');
  const tokenController = await ethers.deployContract('TokenControllerMock');

  const nxm = await ethers.deployContract('NXMTokenMock');
  await nxm.setOperator(tokenController.address);

  const mcr = await ethers.deployContract('CoverMockMCR');
  await mcr.setMCR(parseEther('600000'));

  const stakingProducts = await ethers.deployContract('CoverMockStakingProducts');

  const stakingPoolImplementation = await ethers.deployContract('CoverMockStakingPool');
  const coverNFT = await ethers.deployContract('CoverMockCoverNFT');
  const stakingNFT = await ethers.deployContract('CoverMockStakingNFT');

  const { defaultSender } = await getAccounts();
  const expectedCoverAddress = await getDeployAddressAfter(defaultSender, 1);

  const stakingPoolFactory = await ethers.deployContract('StakingPoolFactory', [expectedCoverAddress]);

  const cover = await ethers.deployContract('Cover', [
    coverNFT.address,
    stakingNFT.address,
    stakingPoolFactory.address,
    stakingPoolImplementation.address,
  ]);

  expect(expectedCoverAddress).to.equal(cover.address);

  const dai = await ethers.deployContract('ERC20Mock');
  const usdc = await ethers.deployContract('ERC20CustomDecimalsMock', [6]); // 6 decimals

  const pool = await ethers.deployContract('CoverMockPool');
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
  await master.setLatestAddress(hex('CO'), cover.address);
  await master.setLatestAddress(hex('TC'), tokenController.address);
  await master.setLatestAddress(hex('MC'), mcr.address);
  await master.setLatestAddress(hex('SP'), stakingProducts.address);

  const accounts = await getAccounts();

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

  for (const contract of [cover, tokenController]) {
    await contract.changeMasterAddress(master.address);
    await contract.changeDependentContractAddress();
    await master.enrollInternal(contract.address);
  }

  await master.setEmergencyAdmin(accounts.emergencyAdmin.address);

  await cover.initialize();
  const capacityFactor = '20000';
  await cover.connect(accounts.governanceContracts[0]).updateUintParameters([0, 2], [capacityFactor]);

  await cover.connect(accounts.advisoryBoardMembers[0]).setProductTypes([
    {
      productTypeName: 'ProductType X',
      productTypeId: MaxUint256,
      ipfsMetadata: 'ipfs metadata',
      productType: {
        claimMethod: '1',
        gracePeriod: 120 * 24 * 3600, // 120 days
      },
    },
  ]);

  // add products
  await cover.connect(accounts.advisoryBoardMembers[0]).setProducts([
    {
      productName: 'Product A',
      productId: MaxUint256,
      ipfsMetadata: 'ipfs metadata',
      product: {
        productType: '0',
        yieldTokenAddress: AddressZero,
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
        yieldTokenAddress: '0x0000000000000000000000000000000000000001',
        coverAssets: 0, // use fallback
        initialPriceRatio: '1000', // 10%
        capacityReductionRatio: '0',
        isDeprecated: false,
        useFixedPrice: true,
      },
      allowedPools: [0],
    },
    {
      productName: 'Product C',
      productId: MaxUint256,
      ipfsMetadata: 'ipfs metadata',
      product: {
        productType: '0',
        yieldTokenAddress: AddressZero,
        coverAssets: Assets.ETH | Assets.DAI, // ETH and DAI, no USDC
        initialPriceRatio: '1000', // 10%
        capacityReductionRatio: '0',
        isDeprecated: false,
        useFixedPrice: true,
      },
      allowedPools: [0],
    },
  ]);

  const GLOBAL_MIN_PRICE_RATIO = await cover.GLOBAL_MIN_PRICE_RATIO();
  const BUCKET_SIZE = await cover.BUCKET_SIZE();
  const MAX_COMMISSION_RATIO = await cover.MAX_COMMISSION_RATIO();

  this.master = master;
  this.pool = pool;
  this.dai = dai;
  this.usdc = usdc;
  this.nxm = nxm;
  this.tokenController = tokenController;
  this.memberRoles = memberRoles;
  this.cover = cover;
  this.coverNFT = coverNFT;
  this.accounts = accounts;
  this.capacityFactor = capacityFactor;
  this.stakingPoolImplementation = stakingPoolImplementation;
  this.stakingPoolFactory = stakingPoolFactory;
  this.config = { GLOBAL_MIN_PRICE_RATIO, BUCKET_SIZE, MAX_COMMISSION_RATIO };
  this.assets = Assets;
}

module.exports = setup;

const { ethers } = require('hardhat');

const { ASSET } = require('./helpers');
const { hex } = require('../../../lib/helpers');

const { parseEther } = ethers.utils;

const assignRoles = accounts => ({
  defaultSender: accounts[0],
  nonMembers: accounts.slice(1, 5),
  members: accounts.slice(5, 10),
  advisoryBoardMembers: accounts.slice(10, 15),
  internalContracts: accounts.slice(15, 20),
  nonInternalContracts: accounts.slice(20, 25),
  governanceContracts: accounts.slice(25, 30),
  stakingPoolManagers: accounts.slice(30, 40),
  emergencyAdmin: accounts[40],
  generalPurpose: accounts.slice(41),
});

async function setup() {
  const accounts = assignRoles(await ethers.getSigners());

  const nxm = await ethers.deployContract('NXMTokenMock');
  await nxm.deployed();

  const memberRoles = await ethers.deployContract('MemberRolesMock');
  await memberRoles.deployed();

  const ramm = await ethers.deployContract('RammMock');
  await ramm.deployed();

  const tokenController = await ethers.deployContract('CLMockTokenController', [nxm.address]);
  await tokenController.deployed();

  await nxm.setOperator(tokenController.address);

  const master = await ethers.deployContract('MasterMock');
  await master.deployed();

  const dai = await ethers.deployContract('ERC20BlacklistableMock');
  await dai.deployed();

  const pool = await ethers.deployContract('PoolMock');
  await pool.deployed();

  await pool.addAsset({ assetAddress: dai.address, isCoverAsset: true, isAbandonedAsset: false });
  await pool.setTokenPrice(ASSET.ETH, parseEther('0.0382')); // 1 NXM ~ 0.0382 ETH
  await pool.setTokenPrice(ASSET.DAI, parseEther('3.82')); // 1 NXM ~ 3.82 DAI)

  const assessment = await ethers.deployContract('CLMockAssessment');
  await assessment.deployed();

  const coverNFT = await ethers.deployContract('CLMockCoverNFT');
  await coverNFT.deployed();

  const individualClaims = await ethers.deployContract('IndividualClaims', [coverNFT.address]);
  await individualClaims.deployed();

  const cover = await ethers.deployContract('CLMockCover', [coverNFT.address]);
  await cover.deployed();

  const coverProducts = await ethers.deployContract('CLMockCoverProducts');
  await coverProducts.deployed();

  const masterInitTxs = await Promise.all([
    master.setLatestAddress(hex('TC'), tokenController.address),
    master.setLatestAddress(hex('MR'), memberRoles.address),
    master.setLatestAddress(hex('P1'), pool.address),
    master.setLatestAddress(hex('AS'), assessment.address),
    master.setLatestAddress(hex('CO'), cover.address),
    master.setLatestAddress(hex('CP'), coverProducts.address),
    master.setLatestAddress(hex('CI'), individualClaims.address),
    master.setLatestAddress(hex('RA'), ramm.address),
    master.setTokenAddress(nxm.address),
  ]);
  await Promise.all(masterInitTxs.map(x => x.wait()));
  await coverProducts.addProductType('0', '30', '5000');
  await coverProducts.addProductType('0', '90', '5000');
  await coverProducts.addProductType('0', '30', '5000');

  const productTemplate = {
    productType: '0',
    minPrice: 0,
    __gap: 0,
    coverAssets: '1',
    initialPriceRatio: '0',
    capacityReductionRatio: '0',
    isDeprecated: false,
    useFixedPrice: false,
  };

  await coverProducts.addProduct({
    ...productTemplate,
    productType: '0',
  });

  await coverProducts.addProduct({
    ...productTemplate,
    productType: '1',
  });

  await coverProducts.addProduct({
    ...productTemplate,
    productType: '2',
  });

  await individualClaims.changeMasterAddress(master.address);
  await individualClaims.changeDependentContractAddress();

  await master.enrollGovernance(accounts.governanceContracts[0].address);
  for (const member of accounts.members) {
    await memberRoles.setRole(member.address, 2);
    await nxm.mint(member.address, parseEther('10000'));
    await nxm.connect(member).approve(tokenController.address, parseEther('10000'));
  }

  accounts.defaultSender.sendTransaction({ to: pool.address, value: parseEther('200') });
  await dai.mint(pool.address, parseEther('200'));

  const config = {
    minAssessmentDepositRatio: (await individualClaims.getMinAssessmentDepositRatio()).toNumber(),
    maxRewardInNxm: await individualClaims.getMaxRewardInNxm(),
    payoutCooldown: (await assessment.getPayoutCooldown()).toNumber(),
    payoutRedemptionPeriod: (await individualClaims.getPayoutRedemptionPeriod()).toNumber(),
  };

  const contracts = {
    pool,
    nxm,
    dai,
    individualClaims,
    assessment,
    cover,
    coverProducts,
    coverNFT,
    master,
    memberRoles,
  };

  return { config, accounts, contracts };
}

module.exports = { setup };

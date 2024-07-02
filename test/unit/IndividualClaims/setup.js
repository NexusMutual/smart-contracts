const { ethers } = require('hardhat');

const { ASSET } = require('./helpers');
const { hex } = require('../../../lib/helpers');
const { getAccounts } = require('../../utils/accounts');

const { parseEther } = ethers.utils;

async function setup() {
  const accounts = await getAccounts();
  const NXM = await ethers.getContractFactory('NXMTokenMock');
  const nxm = await NXM.deploy();
  await nxm.deployed();

  const MemberRoles = await ethers.getContractFactory('MemberRolesMock');
  const memberRoles = await MemberRoles.deploy();
  await memberRoles.deployed();

  const Ramm = await ethers.getContractFactory('RammMock');
  const ramm = await Ramm.deploy();
  await ramm.deployed();

  const CLMockTokenController = await ethers.getContractFactory('CLMockTokenController');
  const tokenController = await CLMockTokenController.deploy(nxm.address);
  await tokenController.deployed();

  await nxm.setOperator(tokenController.address);

  const Master = await ethers.getContractFactory('MasterMock');
  const master = await Master.deploy();
  await master.deployed();

  const DAI = await ethers.getContractFactory('ERC20BlacklistableMock');
  const dai = await DAI.deploy();
  await dai.deployed();

  const PoolMock = await ethers.getContractFactory('PoolMock');
  const pool = await PoolMock.deploy();
  await pool.deployed();
  await pool.addAsset({ assetAddress: dai.address, isCoverAsset: true, isAbandonedAsset: false });
  await pool.setTokenPrice(ASSET.ETH, parseEther('0.0382')); // 1 NXM ~ 0.0382 ETH
  await pool.setTokenPrice(ASSET.DAI, parseEther('3.82')); // 1 NXM ~ 3.82 DAI)

  const Assessment = await ethers.getContractFactory('CLMockAssessment');
  const assessment = await Assessment.deploy();
  await assessment.deployed();

  const CoverNFT = await ethers.getContractFactory('CLMockCoverNFT');
  const coverNFT = await CoverNFT.deploy();
  await coverNFT.deployed();

  const IndividualClaims = await ethers.getContractFactory('IndividualClaims');
  const individualClaims = await IndividualClaims.deploy(nxm.address, coverNFT.address);
  await individualClaims.deployed();

  const Cover = await ethers.getContractFactory('CLMockCover');
  const cover = await Cover.deploy(coverNFT.address);
  await cover.deployed();

  const CoverProducts = await ethers.getContractFactory('ICMockCoverProducts');
  const coverProducts = await CoverProducts.deploy();
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
  await coverProducts.addProductType('1', '30', '5000');

  const productTemplate = {
    productType: '0',
    yieldTokenAddress: '0x1111111111111111111111111111111111111111',
    coverAssets: '1',
    initialPriceRatio: '0',
    capacityReductionRatio: '0',
    isDeprecated: false,
    useFixedPrice: false,
  };

  await coverProducts.addProduct({
    ...productTemplate,
    productType: '0',
    yieldTokenAddress: '0x1111111111111111111111111111111111111111',
  });

  await coverProducts.addProduct({
    ...productTemplate,
    productType: '1',
    yieldTokenAddress: '0x2222222222222222222222222222222222222222',
  });

  await coverProducts.addProduct({
    ...productTemplate,
    productType: '2',
    yieldTokenAddress: '0x3333333333333333333333333333333333333333',
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

  const config = await individualClaims.config();

  return {
    config,
    accounts,
    contracts: {
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
    },
  };
}

module.exports = {
  setup,
};

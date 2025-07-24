const { ethers, nexus } = require('hardhat');

const { ContractIndexes } = nexus.constants;
const { ASSET } = require('./helpers');
const { getAccounts } = require('../../utils/accounts');

const { parseEther } = ethers;

async function setup() {
  const accounts = await getAccounts();
  const nxm = await ethers.deployContract('NXMTokenMock');
  await nxm.waitForDeployment();

  const registry = await ethers.deployContract('RegistryMock');
  await registry.waitForDeployment();

  const ramm = await ethers.deployContract('RammMock');
  await ramm.waitForDeployment();

  const tokenController = await ethers.deployContract('CLMockTokenController', [await nxm.getAddress()]);
  await tokenController.waitForDeployment();

  await nxm.setOperator(await tokenController.getAddress());

  const dai = await ethers.deployContract('ERC20BlacklistableMock');
  await dai.waitForDeployment();

  const pool = await ethers.deployContract('PoolMock');
  await pool.waitForDeployment();

  await Promise.all([
    pool.addAsset({ assetAddress: await dai.getAddress(), isCoverAsset: true, isAbandoned: false }),
    pool.setTokenPrice(ASSET.ETH, parseEther('0.0382')),
    pool.setTokenPrice(ASSET.DAI, parseEther('3.82')),
  ]);

  const assessment = await ethers.deployContract('CLMockAssessment');
  await assessment.waitForDeployment();

  const coverNFT = await ethers.deployContract('CLMockCoverNFT');
  await coverNFT.waitForDeployment();

  const claims = await ethers.deployContract('Claims', [await registry.getAddress()]);
  await claims.waitForDeployment();
  await claims.initialize();

  const cover = await ethers.deployContract('CLMockCover', [await coverNFT.getAddress()]);
  await cover.waitForDeployment();

  const coverProducts = await ethers.deployContract('CLMockCoverProducts');
  await coverProducts.waitForDeployment();

  await Promise.all([
    registry.addContract(ContractIndexes.C_COVER, await cover.getAddress(), false),
    registry.addContract(ContractIndexes.C_COVER_NFT, await coverNFT.getAddress(), false),
    registry.addContract(ContractIndexes.C_COVER_PRODUCTS, await coverProducts.getAddress(), false),
    registry.addContract(ContractIndexes.C_ASSESSMENT, await assessment.getAddress(), false),
    registry.addContract(ContractIndexes.C_POOL, await pool.getAddress(), false),
    registry.addContract(ContractIndexes.C_RAMM, await ramm.getAddress(), false),
  ]);

  await Promise.all([
    coverProducts.addProductType('0', '30', '5000'),
    coverProducts.addProductType('0', '90', '5000'),
    coverProducts.addProductType('0', '30', '5000'),
  ]);

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

  await Promise.all([
    coverProducts.addProduct({ ...productTemplate, productType: '0' }),
    coverProducts.addProduct({ ...productTemplate, productType: '1' }),
    coverProducts.addProduct({ ...productTemplate, productType: '2' }),
  ]);

  const tokenControllerAddress = await tokenController.getAddress();
  for (const member of accounts.members) {
    await Promise.all([
      registry.join(member, ethers.toBeHex(0, 32)),
      nxm.mint(member.address, parseEther('10000')),
      nxm.connect(member).approve(tokenControllerAddress, parseEther('10000')),
    ]);
  }

  accounts.defaultSender.sendTransaction({ to: await pool.getAddress(), value: parseEther('200') });
  await dai.mint(await pool.getAddress(), parseEther('200'));

  const config = {
    claimDepositInETH: await claims.CLAIM_DEPOSIT_IN_ETH(),
    payoutRedemptionPeriod: Number(await claims.getPayoutRedemptionPeriod()),
  };

  const contracts = {
    pool,
    nxm,
    dai,
    claims,
    assessment,
    cover,
    coverProducts,
    coverNFT,
    registry,
  };

  return { config, accounts, contracts };
}

module.exports = { setup };

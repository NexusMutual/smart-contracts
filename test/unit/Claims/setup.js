const { ethers, nexus } = require('hardhat');

const { ContractIndexes } = nexus.constants;
const { ASSET } = require('./helpers');
const { getAccounts } = require('../../utils/accounts');

const { parseEther } = ethers;

async function setup() {
  const accounts = await getAccounts();
  const nxm = await ethers.deployContract('NXMTokenMock');

  const registry = await ethers.deployContract('RegistryMock');

  const ramm = await ethers.deployContract('RammMock');

  const tokenController = await ethers.deployContract('CLMockTokenController', [nxm.target]);

  await nxm.setOperator(tokenController.target);

  const dai = await ethers.deployContract('ERC20BlacklistableMock');

  const pool = await ethers.deployContract('PoolMock');

  await pool.addAsset({ assetAddress: dai.target, isCoverAsset: true, isAbandoned: false });
  await pool.setTokenPrice(ASSET.ETH, parseEther('0.0382'));
  await pool.setTokenPrice(ASSET.DAI, parseEther('3.82'));

  const assessment = await ethers.deployContract('CLMockAssessment');

  const coverNFT = await ethers.deployContract('CLMockCoverNFT');

  const cover = await ethers.deployContract('CLMockCover', [coverNFT.target]);

  const coverProducts = await ethers.deployContract('CLMockCoverProducts');

  const [governanceAccount] = accounts.governanceContracts;
  await registry.addContract(ContractIndexes.C_COVER, cover.target, false);
  await registry.addContract(ContractIndexes.C_COVER_NFT, coverNFT.target, false);
  await registry.addContract(ContractIndexes.C_COVER_PRODUCTS, coverProducts.target, false);
  await registry.addContract(ContractIndexes.C_ASSESSMENT, assessment.target, false);
  await registry.addContract(ContractIndexes.C_POOL, pool.target, false);
  await registry.addContract(ContractIndexes.C_RAMM, ramm.target, false);
  await registry.addContract(ContractIndexes.C_GOVERNOR, governanceAccount.address, false);

  const claims = await ethers.deployContract('Claims', [registry.target]);
  await claims.connect(governanceAccount).initialize(0);

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

  // NOTE: must sequential to ensure deterministic productId → productType mapping
  await coverProducts.addProduct({ ...productTemplate, productType: '0' }); // productId 0 -> productType 0
  await coverProducts.addProduct({ ...productTemplate, productType: '1' }); // productId 1 -> productType 1
  await coverProducts.addProduct({ ...productTemplate, productType: '2' }); // productId 2 -> productType 2

  const tokenControllerAddress = tokenController.target;
  for (const member of accounts.members) {
    await Promise.all([
      registry.join(member, ethers.toBeHex(0, 32)),
      nxm.mint(member.address, parseEther('10000')),
      nxm.connect(member).approve(tokenControllerAddress, parseEther('10000')),
    ]);
  }

  accounts.defaultSender.sendTransaction({ to: pool.target, value: parseEther('200') });
  await dai.mint(pool.target, parseEther('200'));

  const config = {
    claimDepositInETH: await claims.CLAIM_DEPOSIT_IN_ETH(),
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
    governance: governanceAccount,
  };

  return { config, accounts, contracts };
}

module.exports = { setup };

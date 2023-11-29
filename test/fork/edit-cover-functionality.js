const { ethers, network } = require('hardhat');
const evm = require('./evm')();
const { getConfig, upgradeMultipleContracts, submitGovernanceProposal } = require('./utils');
const { ProposalCategory: PROPOSAL_CATEGORIES, ContractTypes } = require('../../lib/constants');
const { expect } = require('chai');

const { parseEther, toUtf8Bytes } = ethers.utils;

const ENZYMEV4_VAULT_PROXY_ADDRESS = '0x27F23c710dD3d878FE9393d93465FeD1302f2EbD';
const ENZYMEV4_VAULT_PRICE_FEED_ORACLE_AGGREGATOR = '0xCc72039A141c6e34a779eF93AEF5eB4C82A893c7';

const NXM_TOKEN_ADDRESS = '0xd7c49CEE7E9188cCa6AD8FF264C1DA2e69D4Cf3B';

const V2Addresses = {
  CoverNFTDescriptor: '0xcafead1E31Ac8e4924Fc867c2C54FAB037458cb9',
  CoverNFT: '0xcafeaCa76be547F14D0220482667B42D8E7Bc3eb',
  StakingPoolFactory: '0xcafeafb97BF8831D95C0FC659b8eB3946B101CB3',
  StakingNFTDescriptor: '0xcafea534e156a41b3e77f29Bf93C653004f1455C',
  StakingNFT: '0xcafea508a477D94c502c253A58239fb8F948e97f',
};

const getSigner = async address => {
  const provider =
    network.name !== 'hardhat' // ethers errors out when using non-local accounts
      ? new ethers.providers.JsonRpcProvider(network.config.url)
      : ethers.provider;
  return provider.getSigner(address);
};

describe('deploy functionality for edit covers', function () {
  before(async function () {
    // Initialize evm helper
    await evm.connect(ethers.provider);

    // Get or revert snapshot if network is tenderly
    if (network.name === 'tenderly') {
      const { TENDERLY_SNAPSHOT_ID } = process.env;
      if (TENDERLY_SNAPSHOT_ID) {
        await evm.revert(TENDERLY_SNAPSHOT_ID);
        console.log(`Reverted to snapshot ${TENDERLY_SNAPSHOT_ID}`);
      } else {
        console.log('Snapshot ID: ', await evm.snapshot());
      }
    }
  });

  it('load contracts', async function () {
    this.master = await ethers.getContractAt('NXMaster', '0x01BFd82675DBCc7762C84019cA518e701C0cD07e');

    this.pool = await ethers.getContractAt('Pool', await this.master.getLatestAddress(toUtf8Bytes('P1')));

    this.enzymeVaultShares = await ethers.getContractAt('ERC20Mock', ENZYMEV4_VAULT_PROXY_ADDRESS);

    this.stakingPoolFactory = await ethers.getContractAt('StakingPoolFactory', V2Addresses.StakingPoolFactory);

    this.enzymeSharesOracle = await ethers.getContractAt('Aggregator', ENZYMEV4_VAULT_PRICE_FEED_ORACLE_AGGREGATOR);

    this.cover = await ethers.getContractAt('Cover', await this.master.getLatestAddress(toUtf8Bytes('CO')));
    this.tokenController = await ethers.getContractAt(
      'TokenController',
      await this.master.getLatestAddress(toUtf8Bytes('TC')),
    );
    this.master = await ethers.getContractAt('NXMaster', await this.master.address);
    this.stakingProducts = await ethers.getContractAt(
      'StakingProducts',
      await this.master.getLatestAddress(toUtf8Bytes('SP')),
    );
    this.nxm = await ethers.getContractAt('NXMToken', NXM_TOKEN_ADDRESS);

    const governanceAddress = await this.master.getLatestAddress(toUtf8Bytes('GV'));
    this.governance = await ethers.getContractAt('Governance', governanceAddress);

    await evm.impersonate(governanceAddress);
    await evm.setBalance(governanceAddress, parseEther('1000'));
    this.governanceImpersonated = await getSigner(governanceAddress);
  });

  it('Upgrade contracts', async function () {
    const newStakingPoolImpl = await ethers.deployContract('StakingPool', [
      V2Addresses.StakingNFT,
      this.nxm.address,
      this.cover.address,
      this.tokenController.address,
      this.master.address,
      this.stakingProducts.address,
    ]);

    // Deploy new cover contract
    const newCoverImpl = await ethers.deployContract('Cover', [
      V2Addresses.CoverNFT,
      V2Addresses.StakingNFT,
      V2Addresses.StakingPoolFactory,
      newStakingPoolImpl.address,
    ]);

    const individualClaimsImpl = await ethers.deployContract('IndividualClaims', [
      this.nxm.address,
      V2Addresses.CoverNFT,
    ]);

    const newStakingProductsImpl = await ethers.deployContract('StakingProducts', [
      this.cover.address,
      V2Addresses.StakingPoolFactory,
    ]);

    // Submit governance proposal to update cover contract address
    this.abMembers = await upgradeMultipleContracts.call(this, {
      codes: ['CO', 'SP', 'CI'],
      addresses: [newCoverImpl, newStakingProductsImpl, individualClaimsImpl],
    });

    const coverProductsImpl = await ethers.deployContract('CoverProducts', []);

    const contractCodes = ['CP'].map(code => ethers.utils.toUtf8Bytes(code));
    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.newContracts, // addNewInternalContracts(bytes2[],address[],uint256[])
      ethers.utils.defaultAbiCoder.encode(
        ['bytes2[]', 'address[]', 'uint256[]'],
        [contractCodes, [coverProductsImpl.address], [ContractTypes.Proxy]],
      ),
      this.abMembers,
      this.governance,
    );

    this.coverProducts = await ethers.getContractAt(
      'CoverProducts',
      await this.master.getLatestAddress(toUtf8Bytes('CP')),
    );

    this.config = await getConfig.call(this);
  });

  it('change StakingPoolFactory operator', async function () {
    const { cover, stakingPoolFactory, stakingProducts } = this;

    await cover.changeStakingPoolFactoryOperator();

    const operator = await stakingPoolFactory.operator();

    expect(operator).to.be.equal(stakingProducts.address);

    await expect(cover.changeStakingPoolFactoryOperator()).to.be.revertedWith('StakingPoolFactory: Not operator');
  });

  it('migrate products', async function () {
    const { cover, coverProducts } = this;

    const products = await cover.getProductsToMigrate();
    console.log(` Products to migrate: ${products.length}`);

    const productTypes = await cover.getProductTypesToMigrate();
    console.log(` Products types to migrate: ${productTypes.length}`);

    await coverProducts.migrateProductsAndProductTypes();

    const migratedProducts = await coverProducts.getProducts();
    const migratedProductTypes = await coverProducts.getProductTypes();

    expect(migratedProducts.length).to.equal(products.length);
    expect(migratedProductTypes.length).to.equal(productTypes.length);

    console.log('Validate migrated products');

    for (let i = 0; i < migratedProducts.length; i++) {
      const migratedProduct = migratedProducts[i];

      expect(migratedProduct.yieldTokenAddress).to.be.equal(products[i].yieldTokenAddress);
      expect(migratedProduct.initialPriceRatio).to.be.equal(products[i].initialPriceRatio);
      expect(migratedProduct.capacityReductionRatio).to.be.equal(products[i].capacityReductionRatio);
      expect(migratedProduct.isDeprecated).to.be.equal(products[i].isDeprecated);
      expect(migratedProduct.useFixedPrice).to.be.equal(products[i].useFixedPrice);

      const productName = await coverProducts.productNames(i);
      const migratedProductName = await coverProducts.productNames(i);
      expect(migratedProductName).to.be.equal(productName);
    }

    await expect(coverProducts.migrateProductsAndProductTypes()).to.be.revertedWith(
      'CoverProducts: _products already migrated',
    );
  });

  require('./run-basic-functionality-tests');
});

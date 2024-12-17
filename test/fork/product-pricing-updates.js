const { abis, addresses } = require('@nexusmutual/deployments');
const chai = require('chai');
const { ethers, network } = require('hardhat');

const { Address, EnzymeAdress, V2Addresses, getSigner, submitGovernanceProposal } = require('./utils');
const { ContractCode, ProposalCategory: PROPOSAL_CATEGORIES } = require('../../lib/constants');

const evm = require('./evm')();

const { expect } = chai;
const { deployContract } = ethers;

const { parseEther, defaultAbiCoder, toUtf8Bytes } = ethers.utils;

const compareProxyImplementationAddress = async (proxyAddress, addressToCompare) => {
  const proxy = await ethers.getContractAt('OwnedUpgradeabilityProxy', proxyAddress);
  const implementationAddress = await proxy.implementation();
  expect(implementationAddress).to.be.equal(addressToCompare);
};

describe('product pricing updates', function () {
  async function getContractByContractCode(contractName, contractCode) {
    this.master = this.master ?? (await ethers.getContractAt('NXMaster', V2Addresses.NXMaster));
    const contractAddress = await this.master?.getLatestAddress(toUtf8Bytes(contractCode));
    return ethers.getContractAt(contractName, contractAddress);
  }

  before(async function () {
    // Initialize evm helper
    await evm.connect(ethers.provider);

    // Get or revert snapshot if network is tenderly
    if (network.name === 'tenderly') {
      const { TENDERLY_SNAPSHOT_ID } = process.env;
      if (TENDERLY_SNAPSHOT_ID) {
        await evm.revert(TENDERLY_SNAPSHOT_ID);
        console.info(`Reverted to snapshot ${TENDERLY_SNAPSHOT_ID}`);
      } else {
        console.info('Snapshot ID: ', await evm.snapshot());
      }
    }
    const [deployer] = await ethers.getSigners();
    await evm.setBalance(deployer.address, parseEther('1000'));
  });

  it('load contracts', async function () {
    this.mcr = await ethers.getContractAt(abis.MCR, addresses.MCR);
    this.cover = await ethers.getContractAt(abis.Cover, addresses.Cover);
    this.nxm = await ethers.getContractAt(abis.NXMToken, addresses.NXMToken);
    this.master = await ethers.getContractAt(abis.NXMaster, addresses.NXMaster);
    this.coverNFT = await ethers.getContractAt(abis.CoverNFT, addresses.CoverNFT);
    this.coverProducts = await ethers.getContractAt(abis.CoverProducts, addresses.CoverProducts);
    this.pool = await ethers.getContractAt(abis.Pool, addresses.Pool);
    this.safeTracker = await ethers.getContractAt(abis.SafeTracker, addresses.SafeTracker);
    this.assessment = await ethers.getContractAt(abis.Assessment, addresses.Assessment);
    this.stakingNFT = await ethers.getContractAt(abis.StakingNFT, addresses.StakingNFT);
    this.stakingProducts = await ethers.getContractAt(abis.StakingProducts, addresses.StakingProducts);
    this.swapOperator = await ethers.getContractAt(abis.SwapOperator, addresses.SwapOperator);
    this.stakingPool = await ethers.getContractAt(abis.StakingPool, V2Addresses.StakingPoolImpl);
    this.priceFeedOracle = await ethers.getContractAt(abis.PriceFeedOracle, addresses.PriceFeedOracle);
    this.tokenController = await ethers.getContractAt(abis.TokenController, addresses.TokenController);
    this.individualClaims = await ethers.getContractAt(abis.IndividualClaims, addresses.IndividualClaims);
    this.quotationData = await ethers.getContractAt(abis.LegacyQuotationData, addresses.LegacyQuotationData);
    this.newClaimsReward = await ethers.getContractAt(abis.LegacyClaimsReward, addresses.LegacyClaimsReward);
    this.proposalCategory = await ethers.getContractAt(abis.ProposalCategory, addresses.ProposalCategory);
    this.stakingPoolFactory = await ethers.getContractAt(abis.StakingPoolFactory, addresses.StakingPoolFactory);
    this.pooledStaking = await ethers.getContractAt(abis.LegacyPooledStaking, addresses.LegacyPooledStaking);
    this.yieldTokenIncidents = await ethers.getContractAt(abis.YieldTokenIncidents, addresses.YieldTokenIncidents);
    this.ramm = await ethers.getContractAt(abis.Ramm, addresses.Ramm);

    this.governance = await getContractByContractCode(abis.Governance, ContractCode.Governance);
    this.memberRoles = await getContractByContractCode(abis.MemberRoles, ContractCode.MemberRoles);

    // Token Mocks
    this.cbBTC = await ethers.getContractAt('ERC20Mock', Address.CBBTC_ADDRESS);
    this.dai = await ethers.getContractAt('ERC20Mock', Address.DAI_ADDRESS);
    this.usdc = await ethers.getContractAt('ERC20Mock', Address.USDC_ADDRESS);
    this.rEth = await ethers.getContractAt('ERC20Mock', Address.RETH_ADDRESS);
    this.stEth = await ethers.getContractAt('ERC20Mock', Address.STETH_ADDRESS);
    this.awEth = await ethers.getContractAt('ERC20Mock', Address.AWETH_ADDRESS);
    this.enzymeShares = await ethers.getContractAt('ERC20Mock', EnzymeAdress.ENZYMEV4_VAULT_PROXY_ADDRESS);
  });

  it('Impersonate AB members', async function () {
    const { memberArray: abMembers } = await this.memberRoles.members(1);
    const impersonatePromises = abMembers.map(async address => {
      await Promise.all([evm.impersonate(address), evm.setBalance(address, parseEther('1000'))]);
      return getSigner(address);
    });
    this.abMembers = await Promise.all(impersonatePromises);
  });

  it('Upgrade contracts', async function () {
    const newStakingPool = await deployContract('StakingPool', [
      this.stakingNFT.address,
      this.nxm.address,
      this.cover.address,
      this.tokenController.address,
      this.master.address,
      this.stakingProducts.address,
    ]);

    const newStakingProducts = await deployContract('StakingProducts', [
      this.cover.address,
      this.stakingPoolFactory.address,
    ]);

    const newCover = await deployContract('Cover', [
      this.coverNFT.address,
      this.stakingNFT.address,
      this.stakingPoolFactory.address,
      newStakingPool.address,
    ]);

    const newCoverProducts = await deployContract('CoverProducts');

    const newIndividualClaims = await deployContract('IndividualClaims', [this.nxm.address, this.coverNFT.address]);

    const upgradeContracts = [
      { code: ContractCode.Cover, contract: newCover },
      { code: ContractCode.CoverProducts, contract: newCoverProducts },
      { code: ContractCode.StakingProducts, contract: newStakingProducts },
      { code: ContractCode.IndividualClaims, contract: newIndividualClaims },
    ];

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMultipleContracts,
      defaultAbiCoder.encode(
        ['bytes2[]', 'address[]'],
        [upgradeContracts.map(c => toUtf8Bytes(c.code)), upgradeContracts.map(c => c.contract.address)],
      ),
      this.abMembers,
      this.governance,
    );

    this.cover = await getContractByContractCode('Cover', ContractCode.Cover);
    this.stakingProducts = await getContractByContractCode('StakingProducts', ContractCode.StakingProducts);
    this.coverProducts = await getContractByContractCode('CoverProducts', ContractCode.CoverProducts);
    this.individualClaims = await getContractByContractCode('IndividualClaims', ContractCode.IndividualClaims);
    this.stakingPool = newStakingPool;

    await compareProxyImplementationAddress(this.cover.address, newCover.address);
    await compareProxyImplementationAddress(this.coverProducts.address, newCoverProducts.address);
    await compareProxyImplementationAddress(this.stakingProducts.address, newStakingProducts.address);
    await compareProxyImplementationAddress(this.individualClaims.address, newIndividualClaims.address);
  });

  it('Price bump parameter should be changed', async function () {
    expect(await this.stakingProducts.PRICE_BUMP_RATIO()).to.be.equal(500);
  });

  it('All products with min price set (previously yieldTokenAddress) should be deprecated', async function () {
    const products = await this.coverProducts.getProducts();
    for (let i = 0; i < products.length; i++) {
      if (products[i].minPrice !== 0) {
        expect(products[i].isDeprecated).to.be.equal(true);
      }
    }
  });

  it('Should be able to set min price per product', async function () {
    const productsCountBefore = await this.coverProducts.getProductCount();

    const minPriceToSet = 10;

    await this.coverProducts.connect(this.abMembers[0]).setProducts([
      {
        productName: 'Protocol Product',
        productId: ethers.constants.MaxUint256,
        ipfsMetadata: '',
        product: {
          productType: 0,
          minPrice: minPriceToSet,
          __gap: 0,
          coverAssets: 0,
          initialPriceRatio: 100,
          capacityReductionRatio: 0,
          useFixedPrice: false,
          isDeprecated: false,
        },
        allowedPools: [],
      },
    ]);

    const [productMinPrice] = await this.coverProducts.getMinPrices([productsCountBefore]);

    expect(productMinPrice).to.be.equal(minPriceToSet);
  });

  it('Should use default price if min price is not set', async function () {
    const productsCountBefore = await this.coverProducts.getProductCount();

    await this.coverProducts.connect(this.abMembers[0]).setProducts([
      {
        productName: 'Protocol Product',
        productId: ethers.constants.MaxUint256,
        ipfsMetadata: '',
        product: {
          productType: 0,
          minPrice: 0,
          __gap: 0,
          coverAssets: 0,
          initialPriceRatio: 100,
          capacityReductionRatio: 0,
          useFixedPrice: false,
          isDeprecated: false,
        },
        allowedPools: [],
      },
    ]);

    const [productMinPrice] = await this.coverProducts.getMinPrices([productsCountBefore]);

    expect(productMinPrice).to.be.equal(await this.cover.DEFAULT_MIN_PRICE_RATIO());
  });

  require('./basic-functionality-tests');
});

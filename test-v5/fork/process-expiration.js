const { ethers, network } = require('hardhat');
const { expect } = require('chai');
const { abis, addresses } = require('@nexusmutual/deployments');

const {
  Address,
  EnzymeAdress,
  V2Addresses,
  formatInternalContracts,
  getSigner,
  submitGovernanceProposal,
} = require('./utils');
const { ContractCode, ProposalCategory: PROPOSAL_CATEGORIES } = require('../../lib/constants');
const evm = require('./evm')();

const { parseEther, defaultAbiCoder, toUtf8Bytes } = ethers.utils;

describe('process-expirations', function () {
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
    this.gateway = await ethers.getContractAt(abis.LegacyGateway, addresses.LegacyGateway);
    this.yieldTokenIncidents = await ethers.getContractAt(abis.YieldTokenIncidents, addresses.YieldTokenIncidents);
    this.ramm = await ethers.getContractAt(abis.Ramm, addresses.Ramm);

    this.governance = await getContractByContractCode(abis.Governance, ContractCode.Governance);
    this.memberRoles = await getContractByContractCode(abis.MemberRoles, ContractCode.MemberRoles);

    // Token Mocks
    this.dai = await ethers.getContractAt('ERC20Mock', Address.DAI_ADDRESS);
    this.rEth = await ethers.getContractAt('ERC20Mock', Address.RETH_ADDRESS);
    this.stEth = await ethers.getContractAt('ERC20Mock', Address.STETH_ADDRESS);
    this.usdc = await ethers.getContractAt('ERC20Mock', Address.USDC_ADDRESS);
    this.enzymeShares = await ethers.getContractAt('ERC20Mock', EnzymeAdress.ENZYMEV4_VAULT_PROXY_ADDRESS);
  });

  it('Impersonate AB members', async function () {
    const { memberArray: abMembers } = await this.memberRoles.members(1);
    this.abMembers = [];
    for (const address of abMembers) {
      await evm.impersonate(address);
      await evm.setBalance(address, parseEther('1000'));
      this.abMembers.push(await getSigner(address));
    }
  });

  it('Collect storage data before upgrade', async function () {
    const stakingPoolCount = (await this.stakingPoolFactory.stakingPoolCount()).toNumber();
    this.contractData = {
      cover: { before: {}, after: {} },
    };

    // Cover
    const productTypesCount = await this.cover.productTypesCount();

    this.contractData.cover.before.productTypes = [];
    this.contractData.cover.before.productTypeNames = [];
    this.contractData.cover.before.productNames = [];
    this.contractData.cover.before.allowedPools = {};

    for (let i = 0; i < productTypesCount; i++) {
      const productType = await this.cover.productTypes(i);
      const productTypeName = await this.cover.productTypeNames(i);
      this.contractData.cover.before.productTypes.push(productType);
      this.contractData.cover.before.productTypeNames.push(productTypeName);
    }

    this.contractData.cover.before.products = await this.cover.getProducts();

    const productsCount = this.contractData.cover.before.products.length;

    for (let i = 0; i < productsCount; i++) {
      const productName = await this.cover.productNames(i);
      this.contractData.cover.before.productNames.push(productName);

      const allowedPools = [];
      let hasAllowedPools = false;

      if (!this.contractData.cover.before.products[i].isDeprecated) {
        for (let j = 1; j <= stakingPoolCount; j++) {
          const isAllowed = await this.cover.isPoolAllowed(i, j);

          if (isAllowed) {
            allowedPools.push(j);
          } else {
            hasAllowedPools = true;
          }
        }
      }

      if (hasAllowedPools) {
        this.contractData.cover.before.allowedPools[i] = allowedPools;
      }
    }
  });

  it('Upgrade contracts', async function () {
    const contractsBefore = await this.master.getInternalContracts();

    // StakingPool.sol
    this.stakingPool = await ethers.deployContract('StakingPool', [
      this.stakingNFT.address,
      this.nxm.address,
      this.cover.address,
      this.tokenController.address,
      this.master.address,
      this.stakingProducts.address,
    ]);

    // Cover.sol
    this.cover = await ethers.deployContract('Cover', [
      this.coverNFT.address,
      this.stakingNFT.address,
      this.stakingPoolFactory.address,
      this.stakingPool.address,
    ]);

    const contractCodeAddressMapping = {
      [ContractCode.Cover]: this.cover.address,
    };
    // NOTE: Do not manipulate the map between Object.keys and Object.values otherwise the ordering could go wrong
    const codes = Object.keys(contractCodeAddressMapping).map(code => toUtf8Bytes(code));
    const addresses = Object.values(contractCodeAddressMapping);

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMultipleContracts, // upgradeMultipleContracts(bytes2[],address[])
      defaultAbiCoder.encode(['bytes2[]', 'address[]'], [codes, addresses]),
      this.abMembers,
      this.governance,
    );

    const contractsAfter = await this.master.getInternalContracts();

    console.info('Upgrade Contracts before:', formatInternalContracts(contractsBefore));
    console.info('Upgrade Contracts after:', formatInternalContracts(contractsAfter));

    // Set references to proxy contracts
    this.cover = await getContractByContractCode('Cover', ContractCode.Cover);
  });

  it('Compares storage of upgrade Cover contract', async function () {
    const stakingPoolCount = (await this.stakingPoolFactory.stakingPoolCount()).toNumber();

    const productTypesCount = await this.cover.productTypesCount();

    this.contractData.cover.after.productTypes = [];
    this.contractData.cover.after.productTypeNames = [];
    this.contractData.cover.after.productNames = [];
    this.contractData.cover.after.allowedPools = {};

    for (let i = 0; i < productTypesCount; i++) {
      const productType = await this.cover.productTypes(i);
      const productTypeName = await this.cover.productTypeNames(i);

      expect(this.contractData.cover.before.productTypes[i]).to.be.deep.equal(productType);
      expect(this.contractData.cover.before.productTypeNames[i]).to.be.deep.equal(productTypeName);
    }

    this.contractData.cover.after.products = await this.cover.getProducts();

    const productsCount = this.contractData.cover.after.products.length;

    for (let i = 0; i < productsCount; i++) {
      const productName = await this.cover.productNames(i);

      expect(this.contractData.cover.before.products[i]).to.be.deep.equal(this.contractData.cover.after.products[i]);
      expect(this.contractData.cover.before.productNames[i]).to.be.deep.equal(productName);

      const allowedPools = [];
      let hasAllowedPools = false;

      if (!this.contractData.cover.after.products[i].isDeprecated) {
        for (let j = 1; j <= stakingPoolCount; j++) {
          const isAllowed = await this.cover.isPoolAllowed(i, j);

          if (isAllowed) {
            allowedPools.push(j);
          } else {
            hasAllowedPools = true;
          }
        }
      }

      if (hasAllowedPools) {
        expect(this.contractData.cover.before.allowedPools[i]).to.be.deep.equal(allowedPools);
      }
    }
  });

  it('Process expirations on pool 8', async function () {
    const poolAddress = await this.cover.stakingPool(8);
    const pool = await ethers.getContractAt(abis.StakingPool, poolAddress);

    await pool.processExpirations(true);
  });

  require('./basic-functionality-tests');
});

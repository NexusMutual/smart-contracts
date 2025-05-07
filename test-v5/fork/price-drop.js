const { ethers, network } = require('hardhat');
const { expect } = require('chai');
const { addresses } = require('@nexusmutual/deployments');

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

function assertionErrorMsg(key, parentKey) {
  return `AssertionError: values of ${key}${parentKey ? ` in ${parentKey}` : ''} don't match\n`;
}

describe('price drop per day change', function () {
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
    this.stakingProducts = await ethers.getContractAt('StakingProducts', addresses.StakingProducts);
    this.cover = await ethers.getContractAt('Cover', addresses.Cover);
    this.stakingPoolFactory = await ethers.getContractAt('StakingPoolFactory', addresses.StakingPoolFactory);
    this.stakingViewer = await ethers.getContractAt('StakingViewer', addresses.StakingViewer);
    this.mcr = await ethers.getContractAt('MCR', addresses.MCR);
    this.nxm = await ethers.getContractAt('NXMToken', addresses.NXMToken);
    this.master = await ethers.getContractAt('NXMaster', addresses.NXMaster);
    this.coverNFT = await ethers.getContractAt('CoverNFT', addresses.CoverNFT);
    this.pool = await ethers.getContractAt('ILegacyPool', addresses.Pool);
    this.ramm = await ethers.getContractAt('Ramm', addresses.Ramm);
    this.assessment = await ethers.getContractAt('Assessment', addresses.Assessment);
    this.stakingNFT = await ethers.getContractAt('StakingNFT', addresses.StakingNFT);
    this.swapOperator = await ethers.getContractAt('SwapOperator', addresses.SwapOperator);
    this.priceFeedOracle = await ethers.getContractAt('PriceFeedOracle', addresses.PriceFeedOracle);
    this.tokenController = await ethers.getContractAt('TokenController', addresses.TokenController);
    this.individualClaims = await ethers.getContractAt('IndividualClaims', addresses.IndividualClaims);
    this.quotationData = await ethers.getContractAt('LegacyQuotationData', addresses.LegacyQuotationData);
    this.newClaimsReward = await ethers.getContractAt('LegacyClaimsReward', addresses.LegacyClaimsReward);
    this.proposalCategory = await ethers.getContractAt('ProposalCategory', addresses.ProposalCategory);
    this.yieldTokenIncidents = await ethers.getContractAt('YieldTokenIncidents', addresses.YieldTokenIncidents);
    this.pooledStaking = await ethers.getContractAt('LegacyPooledStaking', addresses.LegacyPooledStaking);
    this.gateway = await ethers.getContractAt('LegacyGateway', addresses.LegacyGateway);

    this.dai = await ethers.getContractAt('ERC20Mock', Address.DAI_ADDRESS);
    this.rEth = await ethers.getContractAt('ERC20Mock', Address.RETH_ADDRESS);
    this.stEth = await ethers.getContractAt('ERC20Mock', Address.STETH_ADDRESS);
    this.enzymeShares = await ethers.getContractAt('ERC20Mock', EnzymeAdress.ENZYMEV4_VAULT_PROXY_ADDRESS);

    this.governance = await getContractByContractCode('Governance', ContractCode.Governance);
    this.memberRoles = await getContractByContractCode('MemberRoles', ContractCode.MemberRoles);
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
    this.contractData = {
      before: {
        poolData: {},
      },
      after: {
        poolData: {},
      },
    };

    const poolCount = await this.stakingPoolFactory.stakingPoolCount();

    for (let i = 1; i <= poolCount; i++) {
      this.contractData.before.poolData[i] = {
        totalTargetWeight: await this.stakingProducts.getTotalTargetWeight(i),
        totalEffectiveWeight: await this.stakingProducts.getTotalEffectiveWeight(i),
      };
      this.contractData.before.poolData[i].products = await this.stakingViewer.getPoolProducts(i);
    }
  });

  it('Upgrade existing contracts', async function () {
    const contractsBefore = await this.master.getInternalContracts();

    // Cover.sol
    this.stakingProducts = await ethers.deployContract('StakingProducts', [
      this.cover.address,
      this.stakingPoolFactory.address,
    ]);

    const contractCodeAddressMapping = {
      [ContractCode.StakingProducts]: this.stakingProducts.address,
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

  it('Compares storage of upgrade StakingProducts contract', async function () {
    const poolCount = await this.stakingPoolFactory.stakingPoolCount();

    for (let i = 0; i <= poolCount; i++) {
      this.contractData.after.poolData[i] = {
        // productTargetWeight: await this.stakingProducts.getProductTargetWeight(i),
        totalTargetWeight: await this.stakingProducts.getTotalTargetWeight(i),
        totalEffectiveWeight: await this.stakingProducts.getTotalEffectiveWeight(i),
      };
      this.contractData.after.poolData[i].products = await this.stakingViewer.getPoolProducts(i);
    }
    Object.entries(this.contractData.after).forEach(([key, value]) => {
      expect(this.contractData.after[key], assertionErrorMsg(key)).to.be.deep.equal(value);
    });

    // Empty storage
    await expect(this.cover.coverSegmentAllocations(1, 1, 1)).to.be.reverted;
  });

  require('./basic-functionality-tests');
});

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

describe('MemberRoles.join no signature', function () {
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
    this.productsV1 = await ethers.getContractAt(abis.ProductsV1, addresses.ProductsV1);
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

  it('Upgrade MemberRole', async function () {
    const contractsBefore = await this.master.getInternalContracts();

    // MemberRoles.sol
    this.memberRoles = await ethers.deployContract('MemberRoles', [this.nxm.address]);

    const contractCodeAddressMapping = {
      [ContractCode.MemberRoles]: this.memberRoles.address,
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
    this.memberRoles = await getContractByContractCode('MemberRoles', ContractCode.MemberRoles);
  });

  it('join without signature', async function () {
    const address = '0xAB28AEFb6ccb2d9176a23FfAA40Bf8674FCaDC4d';
    expect(await this.memberRoles.isMember(address)).to.equal(false);

    await this.memberRoles.join(address, 0, '0x', { value: parseEther('0.002') });

    expect(await this.memberRoles.isMember(address)).to.equal(true);
  });
});

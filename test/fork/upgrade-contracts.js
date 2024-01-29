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

describe('contract upgrades', function () {
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
    this.mcr = await ethers.getContractAt('MCR', addresses.MCR);
    this.pool = await ethers.getContractAt('Pool', addresses.Pool);
    this.cover = await ethers.getContractAt('Cover', addresses.Cover);
    this.nxm = await ethers.getContractAt('NXMToken', addresses.NXMToken);
    this.master = await ethers.getContractAt('NXMaster', addresses.NXMaster);
    this.coverNFT = await ethers.getContractAt('CoverNFT', addresses.CoverNFT);
    this.poolBefore = await ethers.getContractAt('ILegacyPool', addresses.Pool);
    this.assessment = await ethers.getContractAt('Assessment', addresses.Assessment);
    this.productsV1 = await ethers.getContractAt('ProductsV1', addresses.ProductsV1);
    this.stakingNFT = await ethers.getContractAt('StakingNFT', addresses.StakingNFT);
    this.swapOperator = await ethers.getContractAt('SwapOperator', addresses.SwapOperator);
    this.priceFeedOracle = await ethers.getContractAt('PriceFeedOracle', addresses.PriceFeedOracle);
    this.tokenController = await ethers.getContractAt('TokenController', addresses.TokenController);
    this.individualClaims = await ethers.getContractAt('IndividualClaims', addresses.IndividualClaims);
    this.quotationData = await ethers.getContractAt('LegacyQuotationData', addresses.LegacyQuotationData);
    this.newClaimsReward = await ethers.getContractAt('LegacyClaimsReward', addresses.LegacyClaimsReward);
    this.proposalCategory = await ethers.getContractAt('ProposalCategory', addresses.ProposalCategory);
    this.stakingPoolFactory = await ethers.getContractAt('StakingPoolFactory', addresses.StakingPoolFactory);
    this.yieldTokenIncidents = await ethers.getContractAt('YieldTokenIncidents', addresses.YieldTokenIncidents);

    const stakingPoolImplementationAddress = await this.cover.stakingPoolImplementation();
    this.stakingPool = await ethers.getContractAt('StakingPool', stakingPoolImplementationAddress);

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
      cover: { before: {}, after: {} },
      memberRoles: { before: {}, after: {} },
      assessment: { before: {}, after: {} },
    };

    // Assessment
    this.hugh = '0x87B2a7559d85f4653f13E6546A14189cd5455d45';
    this.contractData.assessment.before.assessment1 = await this.assessment.assessments(1);
    this.contractData.assessment.before.stakeOf = await this.assessment.stakeOf(this.hugh);
    this.contractData.assessment.before.votesOf = await this.assessment.votesOf(this.hugh, 1);
    this.contractData.assessment.before.hasAlreadyVotedOn = await this.assessment.hasAlreadyVotedOn(this.hugh, 1);

    // Cover
    this.contractData.cover.before.activeCover1 = await this.cover.activeCover(1);
    this.contractData.cover.before.productNames1 = await this.cover.productNames(1);
    this.contractData.cover.before.productTypeNames1 = await this.cover.productTypeNames(1);
    this.contractData.cover.before.allowedPool100 = await this.cover.allowedPools(100, 0);

    this.contractData.memberRoles.before.isMember = await this.memberRoles.isMember(this.hugh);
    this.contractData.memberRoles.before.totalRoles = await this.memberRoles.totalRoles();
    this.contractData.memberRoles.before.numberOfABMembers = await this.memberRoles.numberOfMembers(1);
    this.contractData.memberRoles.before.numberOfMembers = await this.memberRoles.numberOfMembers(2);
  });

  it('Upgrade existing contracts', async function () {
    const contractsBefore = await this.master.getInternalContracts();

    // Cover.sol
    const coverImplementationAddress = '0xcafeaC8EdFfEa40D3BFD076DB94A8BEa39bed5Cc';

    // Assessment.sol
    const assessmentImplementationAddress = '0xcafeafbdf1C3730363D7410B37Da242601a30D94';

    // MemberRoles.sol
    const memberRolesImplementationAddress = '0xcafea69Fb5b61D15C0B4BeA5a2c40177fBAd6686';

    // StakingPool.sol
    const stakingPoolImplementationAddress = '0xcafea7fd0183c72006b53e95eE92EDd43Cc5fE69';
    this.stakingPool = await ethers.getContractAt('StakingPool', stakingPoolImplementationAddress);

    const contractCodeAddressMapping = {
      [ContractCode.Cover]: coverImplementationAddress,
      [ContractCode.Assessment]: assessmentImplementationAddress,
      [ContractCode.MemberRoles]: memberRolesImplementationAddress,
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
    this.assessment = await getContractByContractCode('Assessment', ContractCode.Assessment);
    this.memberRoles = await getContractByContractCode('MemberRoles', ContractCode.MemberRoles);

    // Check if implementation addresses are correct
    const coverProxy = await ethers.getContractAt('OwnedUpgradeabilityProxy', this.cover.address);
    const assesmentProxy = await ethers.getContractAt('OwnedUpgradeabilityProxy', this.assessment.address);
    const memberRolesProxy = await ethers.getContractAt('OwnedUpgradeabilityProxy', this.memberRoles.address);

    const coverImplementationAddressAfter = await coverProxy.implementation();
    const assessmentImplementationAddressAfter = await assesmentProxy.implementation();
    const memberRolesImplementationAddressAfter = await memberRolesProxy.implementation();

    expect(coverImplementationAddressAfter).to.be.equal(coverImplementationAddress);
    expect(assessmentImplementationAddressAfter).to.be.equal(assessmentImplementationAddress);
    expect(memberRolesImplementationAddressAfter).to.be.equal(memberRolesImplementationAddress);
  });

  it('Compares storage of upgrade Assessment contract', async function () {
    this.contractData.assessment.after.assessment1 = await this.assessment.assessments(1);
    this.contractData.assessment.after.stakeOf = await this.assessment.stakeOf(this.hugh);
    this.contractData.assessment.after.votesOf = await this.assessment.votesOf(this.hugh, 1);
    this.contractData.assessment.after.hasAlreadyVotedOn = await this.assessment.hasAlreadyVotedOn(this.hugh, 1);

    Object.entries(this.contractData.assessment.before).forEach(([key, value]) => {
      expect(this.contractData.assessment.after[key], assertionErrorMsg(key)).to.be.deep.equal(value);
    });
  });

  it('Compares storage of upgrade Cover contract', async function () {
    this.contractData.cover.after.activeCover1 = await this.cover.activeCover(1);
    this.contractData.cover.after.productNames1 = await this.cover.productNames(1);
    this.contractData.cover.after.productTypeNames1 = await this.cover.productTypeNames(1);
    this.contractData.cover.after.allowedPool100 = await this.cover.allowedPools(100, 0);

    Object.entries(this.contractData.cover.after).forEach(([key, value]) => {
      expect(this.contractData.cover.after[key], assertionErrorMsg(key)).to.be.deep.equal(value);
    });

    // Empty storage
    await expect(this.cover.coverSegmentAllocations(1, 1, 1)).to.be.reverted;
  });

  it('Compares storage of upgrade MemberRoles contract', async function () {
    this.contractData.memberRoles.after.isMember = await this.memberRoles.isMember(this.hugh);
    this.contractData.memberRoles.after.totalRoles = await this.memberRoles.totalRoles();
    this.contractData.memberRoles.after.numberOfABMembers = await this.memberRoles.numberOfMembers(1);
    this.contractData.memberRoles.after.numberOfMembers = await this.memberRoles.numberOfMembers(2);

    Object.entries(this.contractData.cover.after).forEach(([key, value]) => {
      expect(this.contractData.cover.after[key], assertionErrorMsg(key)).to.be.deep.equal(value);
    });

    // Empty storage
    await expect(this.cover.coverSegmentAllocations(1, 1, 1)).to.be.reverted;
  });

  require('./basic-functionality-tests');
});

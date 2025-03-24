const chai = require('chai');
const { ethers, network } = require('hardhat');

const { getSigner, submitGovernanceProposal, getContractByContractCode } = require('./utils');
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

describe('march 2025 release fork tests', function () {
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

  require('./load-contracts');

  it('Impersonate AB members', async function () {
    const { memberArray: abMembers } = await this.memberRoles.members(1);
    const impersonatePromises = abMembers.map(async address => {
      await Promise.all([evm.impersonate(address), evm.setBalance(address, parseEther('1000'))]);
      return getSigner(address);
    });
    this.abMembers = await Promise.all(impersonatePromises);
  });

  // Internal contracts that have changes:
  // - Assessment
  // - IndividualClaims
  // - Cover
  // - CoverProducts
  // - MemberRoles
  // - StakingPool
  // - StakingProducts
  // - TokenController

  // Non-internal dependency:
  // - CoverNFTDescriptor

  // Viewer contracts:
  // - CoverViewer
  // - AssessmentViewer
  // - NexusViewer

  // New contracts:
  // - LimitOrders

  // Removed contracts:
  // - LegacyClaimsReward ??????
  // - LegacyPooledStaking ??????
  // - LegacyQuotationData ??????

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

    const newIndividualClaims = await deployContract('IndividualClaims', [this.coverNFT.address]);
    const newAssessment = await deployContract('Assessment', [this.master.address]);

    const newCoverNFTDescriptor = await deployContract('CoverNFTDescriptor', [this.master.address]);
    await this.cover.connect(this.abMembers[0]).changeCoverNFTDescriptor(newCoverNFTDescriptor.address);

    const newTokenController = await deployContract('TokenController', [
      this.stakingPoolFactory.address,
      this.nxm.address,
      this.stakingNFT.address,
    ]);

    const newMemberRoles = await deployContract('MemberRoles', [this.nxm.address]);

    const upgradeContracts = [
      { code: ContractCode.Cover, contract: newCover },
      { code: ContractCode.CoverProducts, contract: newCoverProducts },
      { code: ContractCode.StakingProducts, contract: newStakingProducts },
      { code: ContractCode.IndividualClaims, contract: newIndividualClaims },
      { code: ContractCode.Assessment, contract: newAssessment },
      { code: ContractCode.TokenController, contract: newTokenController },
      { code: ContractCode.MemberRoles, contract: newMemberRoles },
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
    this.assessment = await getContractByContractCode('Assessment', ContractCode.Assessment);
    this.tokenController = await getContractByContractCode('TokenController', ContractCode.TokenController);
    this.memberRoles = await getContractByContractCode('MemberRoles', ContractCode.MemberRoles);
    this.stakingPool = newStakingPool;
    this.coverNFTDescriptor = newCoverNFTDescriptor;

    this.assessmentViewer = await deployContract('AssessmentViewer', [this.master.address]);
    this.coverViewer = await deployContract('CoverViewer', [this.master.address]);
    this.nexusViewer = await deployContract('NexusViewer', [
      this.master.address,
      this.stakingViewer.address,
      this.assessmentViewer.address,
    ]);

    await compareProxyImplementationAddress(this.cover.address, newCover.address);
    await compareProxyImplementationAddress(this.coverProducts.address, newCoverProducts.address);
    await compareProxyImplementationAddress(this.stakingProducts.address, newStakingProducts.address);
    await compareProxyImplementationAddress(this.individualClaims.address, newIndividualClaims.address);
    await compareProxyImplementationAddress(this.assessment.address, newAssessment.address);
    await compareProxyImplementationAddress(this.tokenController.address, newTokenController.address);
    await compareProxyImplementationAddress(this.memberRoles.address, newMemberRoles.address);
    expect(await this.coverNFT.nftDescriptor()).to.equal(newCoverNFTDescriptor.address);
  });

  require('./cover-data-migration');
  require('./basic-functionality-tests');
});

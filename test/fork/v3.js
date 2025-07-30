const { ethers, network, nexus } = require('hardhat');
const { submitGovernanceProposal } = require('./utils');
const { getContractAt } = require('@nomicfoundation/hardhat-ethers/internal/helpers');
const { expect } = require('chai');

const { parseEther, deployContract, toUtf8Bytes, AbiCoder } = ethers;
const { ContractCode, ContractIndexes, ProposalCategory } = nexus.constants;

const evm = nexus.evmInit();
const defaultAbiCoder = AbiCoder.defaultAbiCoder();

const ADVISORY_BOARD_MULTISIG = '0x422D71fb8040aBEF53f3a05d21A9B85eebB2995D';
const EMERGENCY_ADMIN = '0x422D71fb8040aBEF53f3a05d21A9B85eebB2995D';
const KYC_AUTH_ADDRESS = '0x176c27973E0229501D049De626d50918ddA24656';

describe('v3 launch', function () {
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
    this.evm = evm;
  });

  require('./setup');
  /*
   * Phase 0
   * push old governance rewards
   * deploy registry implementation as proxy
   * deploy TempGov implementation
   * deploy Governor implementation
   * */

  it('should run phase 0', async function () {
    // push old governance rewards
    // @TODO: calculate salts for registry and registry proxy
    this.registry = await deployContract('UpgradeableProxy', []);
    const registryImplementation = await deployContract('Registry', [this.registry.target, this.master.target]);
    const tempGovernanceImplementation = await deployContract('TemporaryGovernance', [ADVISORY_BOARD_MULTISIG]);
    const legacyAssessmentImplementation = await deployContract('LegacyAssessment', [this.nxm.target]);

    await this.registry.upgradeTo(registryImplementation.target);

    // submit governance proposal - upgrade multiple contracts
    const categoryId = ProposalCategory.upgradeMultipleContracts;
    const upgradeContracts = [
      { code: ContractCode.Governance, contract: tempGovernanceImplementation },
      { code: ContractCode.Assessment, contract: legacyAssessmentImplementation },
    ];
    const actionData = defaultAbiCoder.encode(
      ['bytes2[]', 'address[]'],
      [upgradeContracts.map(c => toUtf8Bytes(c.code)), upgradeContracts.map(c => c.contract.target)],
    );

    const signers = this.abMembers;
    const id = await this.governance.getProposalLength();

    console.log(`Proposal ${id}`);

    await this.governance.connect(signers[0]).createProposal('', '', '', 0);
    await this.governance.connect(signers[0]).categorizeProposal(id, categoryId, 0);
    await this.governance.connect(signers[0]).submitProposalWithSolution(id, '', actionData);

    await Promise.all(signers.map(signer => this.governance.connect(signer).submitVote(id, 1)));

    const tx = await this.governance.closeProposal(id, { gasLimit: 21e6 });
    const receipt = await tx.wait();

    const hasActionSuccessLog = receipt.logs.some(log => {
      try {
        const parsed = this.governance.interface.parseLog(log);
        return parsed.name === 'ActionSuccess';
      } catch {
        return false;
      }
    });

    expect(hasActionSuccessLog, 'ActionSuccess was expected').to.be.true;

    this.governance = await ethers.getContractAt('TemporaryGovernance', this.governance.target);
  });

   // Withdraw governance rewards / assessment stake & rewards
  require('./legacy-assessment');

  /*
   * Phase 1
   * - call registry.migrate using TempGov
   * - call registry.addContract using TempGov to add Token, CoverNFT, StakingNFT
   * - set emergency admins
   * - set kyc address
   * - upgrade MemberRoles
   * - upgrade Master
   * - transfer of Master ownership from TempGov to Governor
   * */

  it('should run phase 1', async function () {
    console.info('Snapshot ID Phase 1 start: ', await this.evm.snapshot());

    // @TODO: calculate all the salts
    // await this.registry.migrate(/*
    // params
    // */);

    // Create Registry contract instance using the proxy address but Registry interface
    // console.log('Registry proxy address: ', this.registry.target);
    // this.registry = await ethers.getContractAt('Registry', this.registry.target);
    this.registry = await ethers.getContractAt('Registry', '0xdf422894281A27Aa3d19B0B7D578c59Cb051ABF8');
    const governorAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_GOVERNOR);
    this.governor = await ethers.getContractAt('Governor', governorAddress);

    const memberRolesImplementation = await deployContract('LegacyMemberRoles', [this.registry.target]);
    const masterImplementation = await deployContract('NXMaster', []);

    // const govInterface = (await ethers.getContractFactory('TemporaryGovernance')).interface;

    const switchContractsToInternal = [
      { index: ContractIndexes.C_TOKEN, address: this.nxm.target, isProxy: false },
      { index: ContractIndexes.C_COVER_NFT, address: this.coverNFT.target, isProxy: false },
      { index: ContractIndexes.C_STAKING_NFT, address: this.stakingNFT.target, isProxy: false },
    ];
    const transactions = [];

    console.log('adding contracts to registry');
    switchContractsToInternal.forEach(c => {
      transactions.push({
        target: this.registry.target,
        value: 0n,
        data: this.registry.interface.encodeFunctionData('addContract', [c.index, c.address, c.isProxy]),
      });
    });

    console.log('setting emergency admin');
    transactions.push({
      target: this.registry.target,
      value: 0n,
      data: this.registry.interface.encodeFunctionData('setEmergencyAdmin', [EMERGENCY_ADMIN, true]),
    });

    console.log('setting kyc auth address');
    transactions.push({
      target: this.registry.target,
      value: 0n,
      data: this.registry.interface.encodeFunctionData('setKycAuthAddress', [KYC_AUTH_ADDRESS]),
    });

    console.log('upgrading member roles', memberRolesImplementation);
    transactions.push({
      target: this.master.target,
      value: 0n,
      data: this.master.interface.encodeFunctionData('upgradeMultipleContracts', [
        [toUtf8Bytes(ContractCode.MemberRoles)],
        [memberRolesImplementation.target],
      ]),
    });

    console.log('temp gov executing');
    await Promise.all(
      transactions.map(transaction => this.governance.execute(transaction.target, transaction.value, transaction.data)),
    );

    // upgrade Master
    console.log('upgrading master');
    await this.governance.execute({
      target: this.master.target,
      value: 0n,
      data: this.registry.interface.encodeFunctionData('upgradeTo', [masterImplementation.target]),
    });

    await this.governance.execute({
      target: this.master.target,
      value: 0n,
      data: this.registry.interface.encodeFunctionData('transferProxyOwnership', [this.governor.target]),
    });
  });

  /*
   * Phase 2
   * - deploy new P1, SO, RA, ST, AS, CL implementations
   * - memberRoles.migrateMembers - called with any address (deployer for ex)
   * */

  it('should run phase 3', async function () {
    const poolImplementation = await deployContract('Pool', []);
    const swapOperatorImplementation = await deployContract('SwapOperator', []);
    const rammImplementation = await deployContract('Ramm', []);
    const safeTrackerImplementation = await deployContract('SafeTracker', []);
    const assessmentImplementation = await deployContract('Assessment', []);
    const claimsImplementation = await deployContract('Claims', []);

    const contractUpgrade = [
      { index: ContractIndexes.C_POOL, address: poolImplementation.target },
      { index: ContractIndexes.C_SWAP_OPERATOR, address: swapOperatorImplementation.target },
      { index: ContractIndexes.C_RAMM, address: rammImplementation.target },
      { index: ContractIndexes.C_SAFE_TRACKER, address: safeTrackerImplementation.target },
      { index: ContractIndexes.C_ASSESSMENT, address: assessmentImplementation.target },
      { index: ContractIndexes.C_CLAIMS, address: claimsImplementation.target },
      // {index: ContractIndexes.C_GOVERNOR, address: governorImplementation.target },
    ];

    await Promise.all(
      contractUpgrade.map(c =>
        this.tempGovernance.execute(
          this.registry.target,
          0n,
          this.registry.interface.encodeFunctionData('upgradeContract', [c.index, c.address]),
        ),
      ),
    );

    // @TODO: run migrate members script
  });

  /*
   * Phase 3
   * - call pool.migrate
   * - all master.migrate using TempGov
   *   - transfer internal contracts proxies' ownership
   *   - upgrades the capital pool
   *   - switches control over to Governor/Registry
   * - upgrade Governor using TempGov
   * */

  it('should run phase 2', async function () {
    await this.pool.migrate(this.oldPool.target, this.mcr.target);

    await this.tempGovernance.execute({
      target: this.master.target,
      value: 0n,
      data: this.master.interface.encodeFunctionData('migrate', [this.registry.target]),
    });
  });
});

const { ethers, network, nexus } = require('hardhat');
const { submitGovernanceProposal } = require('../../test-v5/fork/utils');
const { getContractAt } = require('@nomicfoundation/hardhat-ethers/internal/helpers');
const { parseEther, deployContract, toUtf8Bytes, defaultAbiCoder } = ethers;
const { ContractCode, ContractIndexes, ProposalCategory } = nexus.constants;
const evm = nexus.evmInit();

const ADVISORY_BOARD_MULTISIG = '0x422D71fb8040aBEF53f3a05d21A9B85eebB2995D';
const EMERGENCY_ADMIN = '0x422D71fb8040aBEF53f3a05d21A9B85eebB2995D';
const KYC_AUTH_ADDRESS = '0x176c27973E0229501D049De626d50918ddA24656';

describe('v3 launch', () => {
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

  it('should run phase 0', async () => {
    // push old governance rewards
    // @TODO: calculate salts for registry and registry proxy
    this.registry = deployContract('UpgradeableProxy', []);
    const registryImplementation = deployContract('Registry', [this.registry.target, this.master.target]);
    this.registry.upgradeTo(registryImplementation.target);
    const tempGovernance = deployContract('TemporaryGovernance', [ADVISORY_BOARD_MULTISIG]);

    const upgradeContracts = [{ code: ContractCode.Governance, contract: tempGovernance }];

    await submitGovernanceProposal(
      ProposalCategory.upgradeMultipleContracts,
      defaultAbiCoder.encode(
        ['bytes2[]', 'address[]'],
        [upgradeContracts.map(c => toUtf8Bytes(c.code)), upgradeContracts.map(c => c.contract.target)],
      ),
      this.abMembers,
      this.governance,
    );
  });

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

  it('should run phase 1', async () => {
    // @TODO: calculate all the salts
    await this.registry.migrate(/*
    params
    */);
    const governorAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_GOVERNOR);
    this.governor = await getContractAt('Governor', governorAddress);

    const memberRolesImplementation = deployContract('LegacyMemberRoles', [this.registry.target]);
    const masterImplementation = deployContract('NXMaster', []);

    const switchContractsToInternal = [
      { index: ContractIndexes.C_TOKEN, address: this.nxm.target, isProxy: false },
      { index: ContractIndexes.C_COVER_NFT, address: this.coverNFT.target, isProxy: false },
      { index: ContractIndexes.C_STAKING_NFT, address: this.stakingNFT.target, isProxy: false },
    ];
    const transactions = [];

    switchContractsToInternal.forEach(c => {
      transactions.push({
        target: this.registry.target,
        value: 0n,
        data: this.registry.interface.encodeFunctionData('addContract', [c.index, c.address, c.isProxy]),
      });
    });

    transactions.push({
      target: this.registry.target,
      value: 0n,
      data: this.registry.interface.encodeFunctionData('setEmergencyAdmin', [EMERGENCY_ADMIN, true]),
    });

    transactions.push({
      target: this.registry.target,
      value: 0n,
      data: this.registry.interface.encodeFunctionData('setKycAuthAddress', [KYC_AUTH_ADDRESS]),
    });

    transactions.push({
      target: this.master.target,
      value: 0n,
      data: this.master.interface.encodeFunctionData('upgradeMultipleContracts', [
        [toUtf8Bytes(ContractCode.MemberRoles)],
        [memberRolesImplementation],
      ]),
    });

    await Promise.all(
      transactions.map(transaction =>
        this.tempGovernance.execute(transaction.target, transaction.value, transaction.data),
      ),
    );

    // upgrade Master
    this.tempGovernance.execute({
      target: this.master.target,
      value: 0n,
      data: this.registry.interface.encodeFunctionData('upgradeTo', [masterImplementation.target]),
    });

    this.tempGovernance.execute({
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

  it('should run phase 3', async () => {
    const poolImplementation = deployContract('Pool', []);
    const swapOperatorImplementation = deployContract('SwapOperator', []);
    const rammImplementation = deployContract('Ramm', []);
    const safeTrackerImplementation = deployContract('SafeTracker', []);
    const assessmentImplementation = deployContract('Assessment', []);
    const claimsImplementation = deployContract('Claims', []);

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

  it('should run phase 2', async () => {
    await this.pool.migrate(this.oldPool.target, this.mcr.target);

    await this.tempGovernance.execute({
      target: this.master.target,
      value: 0n,
      data: this.master.interface.encodeFunctionData('migrate', [this.registry.target]),
    });
  });
});

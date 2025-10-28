const { ethers, network, nexus, tracer } = require('hardhat');
const { expect } = require('chai');
const { abis, addresses } = require('@nexusmutual/deployments');
const {
  impersonateAccount,
  setBalance,
  setStorageAt,
  takeSnapshot,
} = require('@nomicfoundation/hardhat-network-helpers');

const {
  Addresses,
  createSafeExecutor,
  deployCreate2,
  getImplementation,
  getFundedSigner,
  getSigner,
  revertToSnapshot,
  submitGovernanceProposal,
  tenderlySetStorageAt,
} = require('./utils');
const { create1Proxies, create2Impl, create2Proxies } = require('../../release/3.0/config/fork-deployments.js');

const { AbiCoder, toBeHex, parseEther, toUtf8Bytes } = ethers;
const { ContractCode, ContractIndexes, ProposalCategory } = nexus.constants;
const { toBytes2 } = nexus.helpers;

const defaultAbiCoder = AbiCoder.defaultAbiCoder();

// "false", "0" and empty strings are evaluated as false
const truthy = v => !/^(false|0|)$/i.test((v || '').trim());
const FAST_MIGRATION = truthy(process.env.FAST_MIGRATION);

async function getPoolBalances(poolAddress, prefix) {
  const balanceConfig = [
    { name: 'ETH', getBalance: () => ethers.provider.getBalance(poolAddress), decimals: 18 },
    { name: 'DAI', getBalance: () => this.dai.balanceOf(poolAddress), decimals: 18 },
    { name: 'stETH', getBalance: () => this.stEth.balanceOf(poolAddress), decimals: 18 },
    { name: 'NXMTY', getBalance: () => this.enzymeShares.balanceOf(poolAddress), decimals: 18 },
    { name: 'rEth', getBalance: () => this.rEth.balanceOf(poolAddress), decimals: 18 },
    { name: 'SafeTracker', getBalance: () => this.safeTracker.balanceOf(poolAddress), decimals: 18 },
    { name: 'USDC', getBalance: () => this.usdc.balanceOf(poolAddress), decimals: 6 },
    { name: 'cbBTC', getBalance: () => this.cbBTC.balanceOf(poolAddress), decimals: 8 },
  ];

  console.log(`\n${prefix} POOL BALANCES:`);

  const balances = {};
  for (const { name, getBalance, decimals } of balanceConfig) {
    balances[name] = await getBalance();
    console.log(`${name} balance:`, ethers.formatUnits(balances[name], decimals));
  }

  const poolContract = await ethers.getContractAt('Pool', poolAddress);
  const totalPoolValueInEth = await poolContract.getPoolValueInEth();
  console.log('totalPoolValueInEth: ', ethers.formatEther(totalPoolValueInEth), '\n');

  return { balances, totalPoolValueInEth };
}

/**
 * IMPORTANT: execute with ENABLE_OPTIMIZER=1 to get the correct address from salts
 */
describe('v3 launch', function () {
  before(async function () {
    // Get or revert snapshot if network is tenderly
    if (network.name === 'tenderly') {
      const { TENDERLY_SNAPSHOT_ID } = process.env;
      if (TENDERLY_SNAPSHOT_ID) {
        await revertToSnapshot(TENDERLY_SNAPSHOT_ID);
        console.info(`Reverted to snapshot ${TENDERLY_SNAPSHOT_ID}`);
      } else {
        const { snapshotId } = await takeSnapshot();
        console.info('Snapshot ID: ', snapshotId);
      }
    }

    const [deployer] = await ethers.getSigners();
    await setBalance(deployer.address, parseEther('1000'));
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
    // this.assessment = await ethers.getContractAt(abis.Assessment, addresses.Assessment); // instances created later
    this.stakingNFT = await ethers.getContractAt(abis.StakingNFT, addresses.StakingNFT);
    this.stakingProducts = await ethers.getContractAt(abis.StakingProducts, addresses.StakingProducts);
    this.swapOperator = await ethers.getContractAt(abis.SwapOperator, addresses.SwapOperator);
    this.priceFeedOracle = await ethers.getContractAt(abis.PriceFeedOracle, addresses.PriceFeedOracle);
    this.tokenController = await ethers.getContractAt(abis.TokenController, addresses.TokenController);
    this.individualClaims = await ethers.getContractAt(abis.IndividualClaims, addresses.IndividualClaims);
    this.proposalCategory = await ethers.getContractAt(abis.ProposalCategory, addresses.ProposalCategory);
    this.stakingPoolFactory = await ethers.getContractAt(abis.StakingPoolFactory, addresses.StakingPoolFactory);
    this.ramm = await ethers.getContractAt(abis.Ramm, addresses.Ramm);
    this.limitOrders = await ethers.getContractAt(abis.LimitOrders, addresses.LimitOrders);
    this.governance = await ethers.getContractAt(abis.Governance, addresses.Governance);
    this.memberRoles = await ethers.getContractAt(abis.MemberRoles, addresses.MemberRoles);
    this.assessmentsViewer = await ethers.getContractAt(abis.AssessmentViewer, addresses.AssessmentViewer);
    this.coverViewer = await ethers.getContractAt(abis.CoverViewer, addresses.CoverViewer);
    this.nexusViewer = await ethers.getContractAt(abis.NexusViewer, addresses.NexusViewer);
    this.stakingViewer = await ethers.getContractAt(abis.StakingViewer, addresses.StakingViewer);

    // External contracts
    this.coverBroker = await ethers.getContractAt(abis.CoverBroker, addresses.CoverBroker);

    // Token Mocks
    this.weth = await ethers.getContractAt('WETH9', Addresses.WETH_ADDRESS);
    this.cbBTC = await ethers.getContractAt('ERC20Mock', Addresses.CBBTC_ADDRESS);
    this.dai = await ethers.getContractAt('ERC20Mock', Addresses.DAI_ADDRESS);
    this.usdc = await ethers.getContractAt('ERC20Mock', Addresses.USDC_ADDRESS);
    this.rEth = await ethers.getContractAt('ERC20Mock', Addresses.RETH_ADDRESS);
    this.stEth = await ethers.getContractAt('ERC20Mock', Addresses.STETH_ADDRESS);
    this.awEth = await ethers.getContractAt('ERC20Mock', Addresses.AWETH_ADDRESS);
    this.enzymeShares = await ethers.getContractAt('ERC20Mock', Addresses.ENZYMEV4_VAULT_PROXY_ADDRESS);

    // safe executor
    this.executeSafeTransaction = await createSafeExecutor(Addresses.ADVISORY_BOARD_MULTISIG);

    Object.entries(addresses).forEach(([k, v]) => (tracer.nameTags[v] = `#[${k}]`));
  });

  it('Impersonate AB members', async function () {
    const { memberArray: members } = await this.memberRoles.members(1);
    this.abMembers = [];
    for (const address of members) {
      this.abMembers.push(await getFundedSigner(address));
    }
  });

  // push legacy governance rewards (DONE)
  // require('../../scripts/v3-migration/push-governance-rewards');

  // Phase 0
  //   - push old governance rewards
  //   - deploy registry proxy and implementation
  //   - transfer registry proxy ownership to Governor
  //   - deploy TemporaryGovernance implementation
  //   - deploy LegacyAssessment implementation
  //   - deploy LegacyMemberRoles implementation
  // Phase 1
  //   1. Raise legacy Governance proposal to upgrade contracts:
  //      - Governance to TemporaryGovernance
  //      - Assessment to LegacyAssessment
  //      - MemberRoles to LegacyMemberRoles
  //   2. Execute TGovernance transactions via safe multisig:
  //      - upgrade NXMaster
  //      - master.transferOwnershipToRegistry
  //      - registry.migrate
  it('should run phase 0 and 1', async function () {
    this.registryProxy = await ethers.getContractAt('UpgradeableProxy', create1Proxies.Registry.expectedAddress);

    const registryOwner = await this.registryProxy.proxyOwner();
    await impersonateAccount(registryOwner);
    await setBalance(registryOwner, parseEther('1'));
    const registryOwnerSigner = await getSigner(registryOwner);

    const registryImpl = await ethers.getContractAt('Registry', create2Impl.Registry.expectedAddress);
    await this.registryProxy.connect(registryOwnerSigner).upgradeTo(registryImpl.target);
    await this.registryProxy.connect(registryOwnerSigner).transferProxyOwnership(Addresses.ADVISORY_BOARD_MULTISIG);

    // deploy new implementations
    const { TemporaryGovernance: TGovernance, LegacyAssessment, LegacyMemberRoles } = create2Impl;
    const temporaryGovernanceImpl = await ethers.getContractAt('TemporaryGovernance', TGovernance.expectedAddress);
    const legacyAssessmentImpl = await ethers.getContractAt('LegacyAssessment', LegacyAssessment.expectedAddress);
    const legacyMemberRolesImpl = await ethers.getContractAt('LegacyMemberRoles', LegacyMemberRoles.expectedAddress);

    // submit governance proposal - upgrade multiple contracts
    const codes = [ContractCode.Governance, ContractCode.Assessment, ContractCode.MemberRoles].map(c => toUtf8Bytes(c));
    const implementations = [temporaryGovernanceImpl, legacyAssessmentImpl, legacyMemberRolesImpl].map(c => c.target);

    await submitGovernanceProposal(
      ProposalCategory.upgradeMultipleContracts,
      defaultAbiCoder.encode(['bytes2[]', 'address[]'], [codes, implementations]),
      this.abMembers,
      this.governance,
    );

    this.legacyAssessment = await ethers.getContractAt('LegacyAssessment', addresses.Assessment);
    const governanceAddress = await this.master.getLatestAddress(toBytes2('GV'));

    // set temp governance and registry contracts
    this.tGovernance = await ethers.getContractAt('TemporaryGovernance', governanceAddress);
    this.registry = await ethers.getContractAt('Registry', this.registryProxy);

    const masterProxy = await ethers.getContractAt('UpgradeableProxy', addresses.NXMaster);
    const masterImpl = await deployCreate2('NXMaster', create2Impl.NXMaster);

    // tx.data for TGovernance.execute -> NXMaster/Registry
    const { data: upgradeMasterTx } = await masterProxy.upgradeTo.populateTransaction(masterImpl.target);
    const { data: transferOwnerTx } = await masterImpl.transferOwnershipToRegistry.populateTransaction(this.registry);
    const { data: registryMigrateTx } = await this.registry.migrate.populateTransaction(
      temporaryGovernanceImpl,
      this.coverNFT,
      this.stakingNFT,
      this.stakingPoolFactory,
      this.nxm,
      toBeHex(create2Proxies.Governor.salt, 32),
      toBeHex(create2Proxies.Pool.salt, 32),
      toBeHex(create2Proxies.SwapOperator.salt, 32),
      toBeHex(create2Proxies.Assessments.salt, 32),
      toBeHex(create2Proxies.Claims.salt, 32),
    );

    const tGovIface = this.tGovernance.interface;

    // tx.data for Safe -> TGovernance
    const upgradeMasterSafeTx = tGovIface.encodeFunctionData('execute', [this.master.target, 0n, upgradeMasterTx]);
    const transferOwnerSafeTx = tGovIface.encodeFunctionData('execute', [this.master.target, 0n, transferOwnerTx]);
    const registryMigrateSafeTx = tGovIface.encodeFunctionData('execute', [this.registry.target, 0, registryMigrateTx]);

    const abTx = await this.executeSafeTransaction([
      { to: this.tGovernance.target, data: upgradeMasterSafeTx },
      { to: this.tGovernance.target, data: transferOwnerSafeTx },
      { to: this.tGovernance.target, data: registryMigrateSafeTx },
    ]);
    const receipt = await abTx.wait();
    console.log('Phase 1 AB tx gas used:', receipt.gasUsed.toString());

    const actualMasterImplementation = await masterProxy.implementation();
    expect(actualMasterImplementation).to.equal(masterImpl.target);

    // set tGovernor contract
    const governorAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_GOVERNOR);
    this.tGovernor = await ethers.getContractAt('TemporaryGovernance', governorAddress);
  });

  it('verify post phase 1 state', async function () {
    const contractIndexMap = {
      Governor: ContractIndexes.C_GOVERNOR,
      Pool: ContractIndexes.C_POOL,
      SwapOperator: ContractIndexes.C_SWAP_OPERATOR,
      Assessments: ContractIndexes.C_ASSESSMENTS,
      Claims: ContractIndexes.C_CLAIMS,
    };

    // verify create2 addresses are as expected
    for (const [contractName, contractIndex] of Object.entries(contractIndexMap)) {
      const address = await this.registry.getContractAddressByIndex(contractIndex);
      expect(address).to.equal(create2Proxies[contractName].expectedAddress);
    }

    let codeIndex = 0;

    // verify contract proxy ownerships are transferred to registry
    while (true) {
      const code = await this.master.contractCodes(codeIndex++).catch(e => {
        if (e.message.includes('reverted')) {
          // return false for revert, expecting invalid opcode meaning out of bounds read
          return false;
        }
        // rethrow for other kinds of errors
        throw e;
      });

      if (code === false) {
        break;
      }

      if (await this.master.isProxy(code)) {
        const proxyAddress = await this.master.getLatestAddress(code);
        const proxy = await ethers.getContractAt('UpgradeableProxy', proxyAddress);
        expect(await proxy.proxyOwner()).to.equal(this.registry.target);
      }
    }

    // AB multisig is the Registry owner
    expect(await this.registryProxy.proxyOwner()).to.equal(Addresses.ADVISORY_BOARD_MULTISIG);
  });

  // Phase 2
  // - push legacy assessment stake and rewards
  // - migrate legacyMemberRoles (including AB members)
  // - legacyMemberRoles.migrateMembers (including AB members)
  // - deploy non-proxy contract (create2)
  //   - CoverNFTDescriptor
  //   - VotePower
  //   - StakingViewer
  //   - CoverBroker
  // - deploy new proxy contract implementations (create2)
  //   - Pool
  //   - SwapOperator
  //   - Ramm
  //   - SafeTracker
  //   - Assessments
  //   - Claims
  //   - TokenController
  //   - Cover
  //   - CoverProducts
  //   - LimitOrders
  //   - StakingProducts
  //   - Governor

  // push legacy assessment stake and rewards
  require('../../scripts/v3-migration/push-assessment-stake');
  require('../../scripts/v3-migration/push-assessment-rewards');

  it('should run phase 2', async function () {
    // memberRoles.migrateMembers (including AB members)
    this.memberRoles = await ethers.getContractAt('LegacyMemberRoles', this.memberRoles);

    let finishedMigrating = await this.memberRoles.hasFinishedMigrating();

    while (!finishedMigrating) {
      console.log('calling memberRoles.migrateMembers(50)');
      const migrateMembersTx = await this.memberRoles.migrateMembers(50);
      await migrateMembersTx.wait();
      finishedMigrating = FAST_MIGRATION || (await this.memberRoles.hasFinishedMigrating());
    }

    console.log('memberRoles.migrateMembers done');

    if (FAST_MIGRATION) {
      const abMembers = this.abMembers.map(ab => ab.address);
      const mrSigner = await getSigner(this.memberRoles.target);

      // 1. migrate ab members
      await this.registry.connect(mrSigner).migrateMembers(abMembers);
      await this.registry.connect(mrSigner).migrateAdvisoryBoardMembers(abMembers);

      // 2. migrate CoverBroker membership
      await this.registry.connect(mrSigner).migrateMembers([addresses.CoverBroker]);

      // 3. overwrite `nextMemberStorageIndex` to mark the migration as completed
      const targetLength = await this.memberRoles.getMembersArrayLength(2);
      const setStorageAtFn = network.name === 'tenderly' ? tenderlySetStorageAt : setStorageAt;
      await setStorageAtFn(this.memberRoles.target, 18, targetLength);

      expect(await this.memberRoles.nextMemberStorageIndex()).to.equal(targetLength);
    }

    // deploy non-proxy contracts
    this.coverNFTDescriptor = await deployCreate2('CoverNFTDescriptor', create2Impl.CoverNFTDescriptor);
    this.votePower = await deployCreate2('VotePower', create2Impl.VotePower);
    this.stakingViewer = await deployCreate2('StakingViewer', create2Impl.StakingViewer);
    this.newCoverBroker = await deployCreate2('CoverBroker', create2Impl.CoverBroker);

    // deploy proxy implementations
    const poolImplementation = await deployCreate2('Pool', create2Impl.Pool);
    const swapOperatorImplementation = await deployCreate2('SwapOperator', create2Impl.SwapOperator);
    const rammImplementation = await deployCreate2('Ramm', create2Impl.Ramm);
    const safeTrackerImplementation = await deployCreate2('SafeTracker', create2Impl.SafeTracker);
    const assessmentImplementation = await deployCreate2('Assessments', create2Impl.Assessments);
    const claimsImplementation = await deployCreate2('Claims', create2Impl.Claims);
    const tokenControllerImplementation = await deployCreate2('TokenController', create2Impl.TokenController);
    const coverProductsImplementation = await deployCreate2('CoverProducts', create2Impl.CoverProducts);
    const coverImplementation = await deployCreate2('Cover', create2Impl.Cover);
    const limitOrdersImplementation = await deployCreate2('LimitOrders', create2Impl.LimitOrders);
    const stakingProductsImplementation = await deployCreate2('StakingProducts', create2Impl.StakingProducts);

    // upgraded separately once all phase 3 actions are done
    this.governorImplementation = await deployCreate2('Governor', create2Impl.Governor);

    this.contractUpgrades = [
      { index: ContractIndexes.C_POOL, address: poolImplementation.target },
      { index: ContractIndexes.C_SWAP_OPERATOR, address: swapOperatorImplementation.target },
      { index: ContractIndexes.C_RAMM, address: rammImplementation.target },
      { index: ContractIndexes.C_SAFE_TRACKER, address: safeTrackerImplementation.target },
      { index: ContractIndexes.C_ASSESSMENTS, address: assessmentImplementation.target },
      { index: ContractIndexes.C_CLAIMS, address: claimsImplementation.target },
      { index: ContractIndexes.C_TOKEN_CONTROLLER, address: tokenControllerImplementation.target },
      { index: ContractIndexes.C_COVER_PRODUCTS, address: coverProductsImplementation.target },
      { index: ContractIndexes.C_COVER, address: coverImplementation.target },
      { index: ContractIndexes.C_LIMIT_ORDERS, address: limitOrdersImplementation.target },
      { index: ContractIndexes.C_STAKING_PRODUCTS, address: stakingProductsImplementation.target },
    ];
  });

  it('verify post phase 2 members migration state', async function () {
    const members = FAST_MIGRATION
      ? this.abMembers.map(ab => ab.address)
      : require('../../scripts/v3-migration/data/members.json');
    const batchSize = 100;
    const totalBatches = Math.ceil(members.length / batchSize);

    for (let i = 0; i < members.length; i += batchSize) {
      const currentBatch = Math.floor(i / batchSize) + 1;
      const batch = members.slice(i, i + batchSize);

      console.log(`Member migration check batch ${currentBatch}/${totalBatches}`);

      await Promise.all(
        batch.map(async member => {
          const isMember = await this.registry.isMember(member);
          if (!isMember) {
            console.log(`Member ${member} is not migrated`);
          }
          expect(isMember).to.be.true;
        }),
      );
    }

    // verify abMembers were migrated
    for (const address of this.abMembers.map(ab => ab.address)) {
      expect(await this.registry.isAdvisoryBoardMember(address)).to.equal(true, `AB member ${address} not migrated`);
    }
  });

  it('store pre phase 3 state', async function () {
    // store before product types
    this.beforeProductTypes = [];
    const productTypeCount = await this.coverProducts.getProductTypeCount();
    for (let i = 0; i < productTypeCount; i++) {
      const productType = await this.coverProducts.getProductType(i);
      const productTypeName = await this.coverProducts.getProductTypeName(i);
      const { ipfsHash } = await this.coverProducts.getLatestProductTypeMetadata(i);
      this.beforeProductTypes.push({ productType, productTypeName, ipfsHash });
    }

    // store pool balances
    this.prevPoolBeforeBalance = await getPoolBalances.call(this, addresses.Pool, '(BEFORE MIGRATION) OLD');
  });

  /*
   * Phase 3 - all are TGovernor actions except master.migrate
   * - upgrade contracts:
   *   - Pool
   *   - SwapOperator
   *   - Ramm
   *   - SafeTracker
   *   - Assessment
   *   - Claims
   *   - TokenController
   *   - CoverProducts
   *   - Cover
   *   - LimitOrders
   *   - StakingProducts
   * - registry.setEmergencyAdmin
   * - registry.setKycAuthAddress
   * - swapOperator.setSwapController
   * - claims.initialize
   * - assessments.addAssessorsToGroup
   * - assessments.setAssessingGroupIdForProductTypes
   * - Cover.changeCoverNFTDescriptor
   * - master.migrate (TGovernance action)
   * - registryProxy.transferProxyOwnership to Governor
   * - registry.upgradeContract tGovernorImpl -> governorImpl
   */
  it('should run phase 3', async function () {
    const tGovernorTxs = [];
    const tGovernanceTxs = [];

    // TGovernor -> Registry.upgradeContract
    tGovernorTxs.push(
      ...this.contractUpgrades.map(c => ({
        target: this.registry.target,
        data: this.registry.interface.encodeFunctionData('upgradeContract', [c.index, c.address]),
      })),
    );

    // TGovernor -> Registry.setEmergencyAdmin
    this.emergencyAdmins = [Addresses.EMERGENCY_ADMIN_1, Addresses.EMERGENCY_ADMIN_2];
    tGovernorTxs.push(
      ...this.emergencyAdmins.map(admin => ({
        target: this.registry.target,
        data: this.registry.interface.encodeFunctionData('setEmergencyAdmin', [admin, true]),
      })),
    );

    // TGovernor -> Registry.setKycAuthAddress
    tGovernorTxs.push({
      target: this.registry.target,
      data: this.registry.interface.encodeFunctionData('setKycAuthAddress', [Addresses.KYC_AUTH_ADDRESS]),
    });

    const swapOperatorAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_SWAP_OPERATOR);
    this.swapOperator = await ethers.getContractAt('SwapOperator', swapOperatorAddress);

    // TGovernor -> SwapOperator.setSwapController
    tGovernorTxs.push({
      target: this.swapOperator.target,
      data: this.swapOperator.interface.encodeFunctionData('setSwapController', [Addresses.SWAP_CONTROLLER]),
    });

    // get last claim id
    const individualClaims = await ethers.getContractAt(abis.IndividualClaims, addresses.IndividualClaims);
    const latestClaimCount = await individualClaims.getClaimsCount();
    this.latestClaimId = latestClaimCount - 1n; // latestClaimId is the last index

    const claimsAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_CLAIMS);
    this.claims = await ethers.getContractAt('Claims', claimsAddress);

    // TGovernor -> Claims.initialize
    tGovernorTxs.push({
      target: this.claims.target,
      data: this.claims.interface.encodeFunctionData('initialize', [this.latestClaimId]),
    });

    // TGovernor -> Assessments.addAssessorsToGroup
    const assessmentsAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_ASSESSMENTS);
    this.assessments = await ethers.getContractAt('Assessments', assessmentsAddress);

    this.assessorIds = [
      await this.registry.getMemberId('0x87B2a7559d85f4653f13E6546A14189cd5455d45'),
      await this.registry.getMemberId('0x43f4cd7d153701794ce25a01eFD90DdC32FF8e8E'),
      await this.registry.getMemberId('0x9063a2C78aFd6C8A3510273d646111Df67D6CB4b'),
    ];

    tGovernorTxs.push({
      target: this.assessments.target,
      data: this.assessments.interface.encodeFunctionData('addAssessorsToGroup', [this.assessorIds, 0]), // new group
    });

    // TGovernor -> Assessments.setAssessingGroupIdForProductTypes
    this.assessmentGroupId = 1;
    const latestProductTypeCount = await this.coverProducts.getProductTypeCount();
    this.allProductTypeIds = Array.from({ length: Number(latestProductTypeCount) }, (_, i) => i);

    tGovernorTxs.push({
      target: this.assessments.target,
      data: this.assessments.interface.encodeFunctionData('setAssessingGroupIdForProductTypes', [
        this.allProductTypeIds,
        this.assessmentGroupId,
      ]),
    });

    // TGovernor -> Cover.changeCoverNFTDescriptor
    tGovernorTxs.push({
      target: this.cover.target,
      data: this.cover.interface.encodeFunctionData('changeCoverNFTDescriptor', [this.coverNFTDescriptor.target]),
    });

    // TGovernance -> NXMaster.migrate
    this.master = await ethers.getContractAt('NXMaster', this.master.target); // get upgraded master contract
    tGovernanceTxs.push({
      target: this.master.target,
      data: this.master.interface.encodeFunctionData('migrate', [this.registry.target]),
    });

    // tx.data for Safe -> TGovernor.execute
    const tGovernorCalls = tGovernorTxs
      .map(tx => this.tGovernor.interface.encodeFunctionData('execute', [tx.target, 0n, tx.data]))
      .map(data => ({ to: this.tGovernor.target, data }));

    // tx.data for Safe -> TGovernance.execute
    const tGovernanceCalls = tGovernanceTxs
      .map(tx => this.tGovernance.interface.encodeFunctionData('execute', [tx.target, 0n, tx.data]))
      .map(data => ({ to: this.tGovernance.target, data }));

    // tx.data for Safe -> RegistryProxy.transferProxyOwnership
    const registryProxyCall = {
      to: this.registryProxy.target,
      data: this.registryProxy.interface.encodeFunctionData('transferProxyOwnership', [this.tGovernor.target]),
    };

    const safeCalls = [...tGovernorCalls, ...tGovernanceCalls, registryProxyCall];
    const abTx = await this.executeSafeTransaction(safeCalls);

    const receipt = await abTx.wait();
    console.log('Phase 3 AB tx gas used:', receipt.gasUsed.toString());

    // Last Step: TGovernor -> Registry.upgradeContract (tGovernorImpl -> governorImpl)
    const registryCallData = this.registry.interface.encodeFunctionData('upgradeContract', [
      ContractIndexes.C_GOVERNOR,
      this.governorImplementation.target,
    ]);

    // tx.data for safe -> TGovernor
    const tGovernorCall = {
      to: this.tGovernor.target,
      data: this.tGovernor.interface.encodeFunctionData('execute', [this.registry.target, 0n, registryCallData]),
    };

    // execute via safe
    tracer.printNext = true;
    await this.executeSafeTransaction([tGovernorCall]);

    // set v3 contracts
    this.governor = await ethers.getContractAt('Governor', this.tGovernor.target);

    const coverProductsAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_COVER_PRODUCTS);
    this.coverProducts = await ethers.getContractAt('CoverProducts', coverProductsAddress);

    const poolAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_POOL);
    this.pool = await ethers.getContractAt('Pool', poolAddress);

    const coverAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_COVER);
    this.cover = await ethers.getContractAt('Cover', coverAddress);
  });

  it('verify post phase 3 state', async function () {
    // master.migrate - Pool migration
    expect(await this.master.registry()).to.equal(this.registry.target);

    // old Pool balance should be 0 (allow tiny deviation ~ 1 wei)
    const prevPoolAfterBalance = await getPoolBalances.call(this, addresses.Pool, '(AFTER MIGRATION) OLD');
    for (const balance of Object.values(prevPoolAfterBalance.balances)) {
      expect(balance).to.be.closeTo(0n, 1n);
    }
    expect(prevPoolAfterBalance.totalPoolValueInEth).to.be.closeTo(0n, 1n);

    // new Pool balance same as prev Pool balance before migration (allow tiny deviation ~ 2 wei)
    const newPoolBalance = await getPoolBalances.call(this, this.pool.target, '(AFTER MIGRATION) NEW');
    for (const [token, balance] of Object.entries(newPoolBalance.balances)) {
      expect(balance).to.be.closeTo(this.prevPoolBeforeBalance.balances[token], 2n);
    }
    expect(newPoolBalance.totalPoolValueInEth).to.be.closeTo(this.prevPoolBeforeBalance.totalPoolValueInEth, 2n);

    // Registry.setEmergencyAdmin 1 & 2
    for (const admin of this.emergencyAdmins) {
      expect(await this.registry.isEmergencyAdmin(admin)).to.equal(true);
    }

    // Registry.setKycAuthAddress
    expect(await this.registry.getKycAuthAddress()).to.equal(Addresses.KYC_AUTH_ADDRESS);

    // SwapOperator.setSwapController
    expect(await this.swapOperator.swapController()).to.equal(Addresses.SWAP_CONTROLLER);

    // Claims.initialize
    expect(await this.claims.getClaimsCount()).to.equal(this.latestClaimId + 1n);

    // Assessments.addAssessorsToGroup
    for (const assessorId of this.assessorIds) {
      expect(await this.assessments.isAssessor(assessorId)).to.equal(true);
      expect(await this.assessments.isAssessorInGroup(assessorId, this.assessmentGroupId)).to.equal(true);
    }

    // Assessments.setAssessingGroupIdForProductTypes
    for (const productTypeId of this.allProductTypeIds) {
      expect(await this.assessments.getAssessingGroupIdForProductType(productTypeId)).to.equal(this.assessmentGroupId);
    }

    // Cover.changeCoverNFTDescriptor
    expect(await this.coverNFT.nftDescriptor()).to.equal(this.coverNFTDescriptor.target);

    // RegistryProxy.transferProxyOwnership
    expect(await this.registryProxy.proxyOwner()).to.equal(this.governor.target);

    // Governor upgraded from tGovernor to real governor implementation
    const governorProxyImplementation = await getImplementation(this.governor);
    expect(governorProxyImplementation).to.equal(this.governorImplementation.target);
  });

  // phase 4:
  //   - update existing productTypes
  //     - set new productType.assessmentCooldownPeriod = 1 day
  //     - set new productType.payoutRedemptionPeriod = 30 days
  //   - memberRoles.recoverETH
  //   - migrate cover ipfsMetadata to storage
  //   - CoverBroker
  //     - switchMembership to newCoverBroker (via safe owner)
  //     - new CoverBroker maxApproveCoverContract for cbbtc and usdc (via safe owner)
  it('should run phase 4', async function () {
    // add new fields to product types
    const ONE_DAY = 24 * 60 * 60;
    const productTypeCount = await this.coverProducts.getProductTypeCount();

    const updatedProductTypeParams = [];
    for (let i = 0; i < productTypeCount; i++) {
      const productType = await this.coverProducts.getProductType(i);
      const productTypeName = await this.coverProducts.getProductTypeName(i);
      const { ipfsHash } = await this.coverProducts.getLatestProductTypeMetadata(i);
      updatedProductTypeParams.push({
        productTypeName,
        productTypeId: i,
        ipfsMetadata: ipfsHash,
        productType: {
          claimMethod: productType.claimMethod,
          gracePeriod: productType.gracePeriod,
          assessmentCooldownPeriod: ONE_DAY,
          payoutRedemptionPeriod: 30 * ONE_DAY,
        },
      });
    }

    await this.coverProducts.connect(this.abMembers[0]).setProductTypes(updatedProductTypeParams);

    // send MemberRoles ETH to pool
    this.poolBalanceBefore = await ethers.provider.getBalance(this.pool);
    this.mrBalanceBefore = await ethers.provider.getBalance(this.memberRoles);

    await this.memberRoles.recoverETH();

    // migrate cover IPFS metadata to storage
    const { coverIds, ipfsMetadata } = require('../../scripts/v3-migration/data/cover-ipfs-metadata.json');

    await this.cover.connect(this.abMembers[0]).populateIpfsMetadata(coverIds, ipfsMetadata);

    // cbSafeOwner -> CoverBroker / newCoverBroker
    const cbSafeOwnerCalls = [
      {
        to: this.coverBroker.target,
        data: this.coverBroker.interface.encodeFunctionData('switchMembership', [this.newCoverBroker.target]),
      },
      {
        to: this.newCoverBroker.target,
        data: this.newCoverBroker.interface.encodeFunctionData('maxApproveCoverContract', [this.usdc.target]),
      },
      {
        to: this.newCoverBroker.target,
        data: this.newCoverBroker.interface.encodeFunctionData('maxApproveCoverContract', [this.cbBTC.target]),
      },
    ];

    // execute via safe
    const cbOwner = await this.coverBroker.owner();
    const cbOwnerSafeExecutor = await createSafeExecutor(cbOwner);
    const cbOwnerSafeTx = await cbOwnerSafeExecutor(cbSafeOwnerCalls);

    const receipt = await cbOwnerSafeTx.wait();
    console.log('cbOwnerSafe tx gas used:', receipt.gasUsed.toString());

    this.coverBroker = this.newCoverBroker;
  });

  it('verify post phase 4 state', async function () {
    // cover product types
    const ONE_DAY = 24 * 60 * 60;
    const productTypeCount = await this.coverProducts.getProductTypeCount();

    for (let i = 0; i < productTypeCount; i++) {
      const productType = await this.coverProducts.getProductType(i);
      expect(productType.claimMethod).to.equal(this.beforeProductTypes[i].productType.claimMethod);
      expect(productType.gracePeriod).to.equal(this.beforeProductTypes[i].productType.gracePeriod);
      expect(productType.assessmentCooldownPeriod).to.equal(ONE_DAY); // new fields
      expect(productType.payoutRedemptionPeriod).to.equal(30 * ONE_DAY); // new fields

      const { ipfsHash } = await this.coverProducts.getLatestProductTypeMetadata(i);
      expect(ipfsHash).to.equal(this.beforeProductTypes[i].ipfsHash);

      expect(await this.coverProducts.getProductTypeName(i)).to.equal(this.beforeProductTypes[i].productTypeName);
    }

    // MemberRoles.recoverETH
    expect(await ethers.provider.getBalance(this.pool)).to.equal(this.poolBalanceBefore + this.mrBalanceBefore);
    expect(await ethers.provider.getBalance(this.memberRoles)).to.equal(0n);

    // cover IPFS metadata storage
    const { coverIds, ipfsMetadata } = require('../../scripts/v3-migration/data/cover-ipfs-metadata.json');
    for (const [index, coverId] of coverIds.entries()) {
      expect(await this.cover.getCoverMetadata(coverId)).to.equal(ipfsMetadata[index]);
    }

    // CoverBroker - membership and allowances
    expect(await this.registry.isMember(this.coverBroker)).to.equal(true);
    expect(await this.usdc.allowance(this.coverBroker, this.cover)).to.equal(ethers.MaxUint256);
    expect(await this.cbBTC.allowance(this.coverBroker, this.cover)).to.equal(ethers.MaxUint256);
  });

  // Basic functionality tests
  require('./basic-functionality-tests');

  // Assessment and Claims
  require('./assessment-claims');
});

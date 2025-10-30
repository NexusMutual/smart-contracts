const { ethers, network, nexus, tracer } = require('hardhat');
const { expect } = require('chai');
const { abis, addresses } = require('@nexusmutual/deployments');
const { setBalance, setStorageAt, takeSnapshot } = require('@nomicfoundation/hardhat-network-helpers');

const {
  Addresses,
  createSafeExecutor,
  getImplementation,
  getFundedSigner,
  getSigner,
  revertToSnapshot,
  submitGovernanceProposal,
} = require('./utils');

const { AbiCoder, deployContract, encodeBytes32String, parseEther, parseUnits, toBeHex, toUtf8Bytes } = ethers;
const { ContractCode, ContractIndexes, ProposalCategory } = nexus.constants;
const { toBytes2 } = nexus.helpers;

const defaultAbiCoder = AbiCoder.defaultAbiCoder();

// "false", "0" and empty strings are evaluated as false
const truthy = v => !/^(false|0|)$/i.test((v || '').trim());
const FAST_MIGRATION = truthy(process.env.FAST_MIGRATION);

async function getPoolBalances(thisParam, poolAddress, prefix) {
  // Check old pool balances to see if migration worked
  const ethBalance = await ethers.provider.getBalance(poolAddress);
  const usdcBal = await thisParam.usdc.balanceOf(poolAddress);
  const cbBTCBal = await thisParam.cbBTC.balanceOf(poolAddress);
  const rEthBal = await thisParam.rEth.balanceOf(poolAddress);
  const stEthBal = await thisParam.stEth.balanceOf(poolAddress);
  const enzymeShareBal = await thisParam.enzymeShares.balanceOf(poolAddress);
  const safeTrackerBal = await thisParam.safeTracker.balanceOf(poolAddress);

  console.log(`\n${prefix} POOL BALANCES:`);
  console.log('ETH balance:', ethers.formatEther(ethBalance));
  console.log('USDC balance:', ethers.formatUnits(usdcBal, 6));
  console.log('cbBTC balance:', ethers.formatUnits(cbBTCBal, 8));
  console.log('rEth balance:', ethers.formatEther(rEthBal));
  console.log('stEth balance:', ethers.formatEther(stEthBal));
  console.log('enzymeShare balance:', ethers.formatEther(enzymeShareBal));
  console.log('safeTracker balance:', ethers.formatEther(safeTrackerBal));

  const poolContract = await ethers.getContractAt('Pool', poolAddress);
  const totalPoolValueInEth = await poolContract.getPoolValueInEth();
  console.log('totalPoolValueInEth: ', ethers.formatEther(totalPoolValueInEth), '\n');

  return [ethBalance, usdcBal, cbBTCBal, rEthBal, stEthBal, enzymeShareBal, safeTrackerBal];
}

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

  // push legacy governance rewards
  require('../../scripts/v3-migration/push-governance-rewards');

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
    // @TODO: push old governance rewards
    // @TODO: calculate salts for registry and registry proxy

    this.registryProxy = await deployContract('UpgradeableProxy', []);
    const registryImpl = await deployContract('Registry', [this.registryProxy, this.master]);
    await this.registryProxy.upgradeTo(registryImpl);
    await this.registryProxy.transferProxyOwnership(Addresses.ADVISORY_BOARD_MULTISIG);

    // deploy new implementations
    const temporaryGovernanceImpl = await deployContract('TemporaryGovernance', [Addresses.ADVISORY_BOARD_MULTISIG]);
    const legacyAssessmentImpl = await deployContract('LegacyAssessment', [this.nxm]);
    const legacyMemberRolesImpl = await deployContract('LegacyMemberRoles', [this.registryProxy, this.nxm]);

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

    const masterImpl = await deployContract('NXMaster');
    const masterProxy = await ethers.getContractAt('UpgradeableProxy', addresses.NXMaster);

    // tx.data for TGovernance.execute -> NXMaster/Registry
    const { data: upgradeMasterTx } = await masterProxy.upgradeTo.populateTransaction(masterImpl.target);
    const { data: transferOwnerTx } = await masterImpl.transferOwnershipToRegistry.populateTransaction(this.registry);
    const { data: registryMigrateTx } = await this.registry.migrate.populateTransaction(
      temporaryGovernanceImpl,
      this.coverNFT,
      this.stakingNFT,
      this.stakingPoolFactory,
      this.nxm,
      encodeBytes32String('governorSalt'),
      encodeBytes32String('poolSalt'),
      encodeBytes32String('swapOperatorSalt'),
      encodeBytes32String('assessmentSalt'),
      encodeBytes32String('claimsSalt'),
    );

    const tGovIface = this.tGovernance.interface;

    // tx.data for Safe -> TGovernance
    const upgradeMasterSafeTx = tGovIface.encodeFunctionData('execute', [this.master.target, 0n, upgradeMasterTx]);
    const transferOwnerSafeTx = tGovIface.encodeFunctionData('execute', [this.master.target, 0n, transferOwnerTx]);
    const registryMigrateSafeTx = tGovIface.encodeFunctionData('execute', [this.registry.target, 0, registryMigrateTx]);

    tracer.printNext = true;
    const abTx = await this.executeSafeTransaction([
      { to: this.tGovernance.target, data: upgradeMasterSafeTx },
      { to: this.tGovernance.target, data: transferOwnerSafeTx },
      { to: this.tGovernance.target, data: registryMigrateSafeTx },
    ]);
    const receipt = await abTx.wait();
    console.log('Phase 1 AB tx gas used:', receipt.gasUsed.toString());

    const actualMasterImplementatinon = await masterProxy.implementation();
    expect(actualMasterImplementatinon).to.equal(masterImpl.target);

    let codeIndex = 0;

    while (true) {
      const code = await this.master.contractCodes(codeIndex++).catch(e => {
        if (e.message.includes('Transaction reverted')) {
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

    // get governor contract
    const governorAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_GOVERNOR);
    this.tGovernor = await ethers.getContractAt('TemporaryGovernance', governorAddress);
  });

  // Phase 2
  //   - push legacy assessment stake and rewards
  //   - legacyMemberRoles.migrateMembers (including AB members)
  //   - legacyMemberRoles.recoverETH
  //   - deploy new P1, SO, RA, ST, AS, CL implementations

  // push legacy assessment stake and rewards
  require('../../scripts/v3-migration/push-assessment-stake');
  require('../../scripts/v3-migration/push-assessment-rewards');

  it('should run phase 2', async function () {
    const SAFE_ADDRESS = '0x51ad1265C8702c9e96Ea61Fe4088C2e22eD4418e';

    // memberRoles.migrateMembers (including AB members)
    this.memberRoles = await ethers.getContractAt('LegacyMemberRoles', this.memberRoles);

    let finishedMigrating = await this.memberRoles.hasFinishedMigrating();

    while (!finishedMigrating) {
      console.log('calling memberRoles.migrateMembers(500)');
      const migrateMembersTx = await this.memberRoles.migrateMembers(50);
      await migrateMembersTx.wait();
      finishedMigrating = FAST_MIGRATION || (await this.memberRoles.hasFinishedMigrating());
    }

    console.log('memberRoles.migrateMembers done');

    const abMembers = [
      '0x87B2a7559d85f4653f13E6546A14189cd5455d45',
      '0x8D38C81B7bE9Dbe7440D66B92d4EF529806baAE7',
      '0x23E1B127Fd62A4dbe64cC30Bb30FFfBfd71BcFc6',
      '0x9063a2C78aFd6C8A3510273d646111Df67D6CB4b',
      '0x43f4cd7d153701794ce25a01eFD90DdC32FF8e8E',
    ];

    if (FAST_MIGRATION) {
      const mrSigner = await getSigner(this.memberRoles.target);

      // 1. migrate ab members
      await this.registry.connect(mrSigner).migrateMembers(abMembers);
      await this.registry.connect(mrSigner).migrateAdvisoryBoardMembers(abMembers);

      // 2. migrate CoverBroker membership
      await this.registry.connect(mrSigner).migrateMembers([addresses.CoverBroker]);

      // 3. overwrite `nextMemberStorageIndex` to mark the migration as completed
      const targetLength = await this.memberRoles.getMembersArrayLength(2);
      const slot = 18;

      if (network.name === 'tenderly') {
        // tenderly_setStorageAt must be 32-byte padded slot and value
        const slotAsHex = toBeHex(slot, 32);
        const targetLengthAsHex = toBeHex(targetLength, 32);
        await ethers.provider.send('tenderly_setStorageAt', [this.memberRoles.target, slotAsHex, targetLengthAsHex]);
      } else {
        // hardhat_setStorageAt
        await setStorageAt(this.memberRoles.target, slot, targetLength);
      }
      expect(await this.memberRoles.nextMemberStorageIndex()).to.equal(targetLength);
    }

    // verify abMembers were migrated
    for (const address of abMembers) {
      expect(await this.registry.isAdvisoryBoardMember(address)).to.equal(true, `AB member ${address} not migrated`);
    }

    const poolImplementation = await deployContract('Pool', [this.registry.target]);
    const swapOperatorImplementation = await deployContract('SwapOperator', [
      this.registry.target,
      Addresses.COWSWAP_SETTLEMENT,
      Addresses.ENZYMEV4_VAULT_PROXY_ADDRESS,
      Addresses.WETH_ADDRESS,
    ]);
    const rammImplementation = await deployContract('Ramm', [
      this.registry.target,
      parseEther('0.01'), // TODO: set correct value for initialSpotPriceB
    ]);
    const safeTrackerImplementation = await deployContract('SafeTracker', [
      this.registry.target,
      parseUnits('25000000', 6), // investmentLimit
      SAFE_ADDRESS,
      Addresses.USDC_ADDRESS,
      Addresses.WETH_ADDRESS,
      Addresses.AWETH_ADDRESS,
      '0x72E95b8931767C79bA4EeE721354d6E99a61D004', // VARIABLE_DEBT_USDC_ADDRESS
    ]);
    const assessmentImplementation = await deployContract('Assessments', [this.registry.target]);
    const claimsImplementation = await deployContract('Claims', [this.registry.target]);
    const tokenControllerImplementation = await deployContract('TokenController', [this.registry.target]);
    const coverProductsImplementation = await deployContract('CoverProducts');
    const coverImplementation = await deployContract('Cover', [
      this.registry.target,
      await this.cover.stakingPoolImplementation(),
      this.cover,
    ]);

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
    ];
  });

  /*
   * Phase 3
   * - registry.setEmergencyAdmin
   * - registry.setKycAuthAddress
   * - upgrade Pool, SwapOperator, Ramm, SafeTracker, Assessment, Claims via governor proposal
   * - claims.initialize
   * - swapOperator.setSwapController
   * - memberRoles.recoverETH
   * - master.migrate
   * - pool.migrate
   * - update existing productTypes with new assessmentCooldownPeriod and payoutRedemptionPeriod fields
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
    const admins = [Addresses.EMERGENCY_ADMIN_1, Addresses.EMERGENCY_ADMIN_2];
    tGovernorTxs.push(
      ...admins.map(admin => ({
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
    const latestClaimId = latestClaimCount - 1n;

    const claimsAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_CLAIMS);
    this.claims = await ethers.getContractAt('Claims', claimsAddress);

    // TGovernor -> Claims.initialize
    tGovernorTxs.push({
      target: this.claims.target,
      data: this.claims.interface.encodeFunctionData('initialize', [latestClaimId]),
    });

    // TGovernor -> Assessments.addAssessorsToGroup
    const assessmentsAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_ASSESSMENTS);
    this.assessments = await ethers.getContractAt('Assessments', assessmentsAddress);

    const assessorIds = [
      await this.registry.getMemberId('0x87B2a7559d85f4653f13E6546A14189cd5455d45'),
      await this.registry.getMemberId('0x43f4cd7d153701794ce25a01eFD90DdC32FF8e8E'),
      await this.registry.getMemberId('0x9063a2C78aFd6C8A3510273d646111Df67D6CB4b'),
    ];

    tGovernorTxs.push({
      target: this.assessments.target,
      data: this.assessments.interface.encodeFunctionData('addAssessorsToGroup', [assessorIds, 0]), // create new group
    });

    // TGovernor -> Assessments.setAssessingGroupIdForProductTypes
    const assessmentGroupId = 1;
    const latestProductTypeCount = await this.coverProducts.getProductTypeCount();
    const allProductTypeIds = Array.from({ length: Number(latestProductTypeCount) }, (_, i) => i);

    tGovernorTxs.push({
      target: this.assessments.target,
      data: this.assessments.interface.encodeFunctionData('setAssessingGroupIdForProductTypes', [
        allProductTypeIds,
        assessmentGroupId,
      ]),
    });

    // TGovernance -> NXMaster.migrate
    this.master = await ethers.getContractAt('NXMaster', this.master.target); // get upgraded master contract
    tGovernanceTxs.push({
      target: this.master.target,
      data: this.master.interface.encodeFunctionData('migrate', [this.registry.target]),
    });

    // tx.data for Safe -> TGovernor
    const tGovernorCalls = tGovernorTxs
      .map(tx => this.tGovernor.interface.encodeFunctionData('execute', [tx.target, 0n, tx.data]))
      .map(data => ({ to: this.tGovernor.target, data }));

    // tx.data for Safe -> TGovernance
    const tGovernanceCalls = tGovernanceTxs
      .map(tx => this.tGovernance.interface.encodeFunctionData('execute', [tx.target, 0n, tx.data]))
      .map(data => ({ to: this.tGovernance.target, data }));

    // tx.data for Safe -> RegistryProxy
    const registryProxyCall = {
      to: this.registryProxy.target,
      data: this.registryProxy.interface.encodeFunctionData('transferProxyOwnership', [this.tGovernor.target]),
    };

    const safeCalls = [...tGovernorCalls, ...tGovernanceCalls, registryProxyCall];
    tracer.printNext = true;
    const abTx = await this.executeSafeTransaction(safeCalls);

    const receipt = await abTx.wait();
    console.log('Phase 3 AB tx gas used:', receipt.gasUsed.toString());

    const coverProductsAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_COVER_PRODUCTS);
    this.coverProducts = await ethers.getContractAt('CoverProducts', coverProductsAddress);

    const poolAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_POOL);
    this.pool = await ethers.getContractAt('Pool', poolAddress);

    const coverAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_COVER);
    this.cover = await ethers.getContractAt('Cover', coverAddress);

    await getPoolBalances(this, addresses.Pool, 'OLD POOL BALANCES AFTER POOL.MIGRATION');

    const [ethBalance, usdcBal, cbBTCBal, rEthBal, stEthBal, enzymeShareBal, safeTrackerBal] = await getPoolBalances(
      this,
      this.pool.target,
      'NEW POOL BALANCES AFTER POOL.MIGRATION',
    );

    expect(ethBalance).to.not.equal(0n);
    expect(usdcBal).to.not.equal(0n);
    expect(cbBTCBal).to.not.equal(0n);
    expect(rEthBal).to.not.equal(0n);
    expect(stEthBal).to.not.equal(0n);
    expect(enzymeShareBal).to.not.equal(0n);
    expect(safeTrackerBal).to.not.equal(0n);

    const governorImplementation = await deployContract('Governor', [this.registry]);

    // TGovernor -> Registry.upgradeContract
    const registryCallData = this.registry.interface.encodeFunctionData('upgradeContract', [
      ContractIndexes.C_GOVERNOR,
      governorImplementation.target,
    ]);

    // tx.data for safe -> TGovernor
    const tGovernorCall = {
      to: this.tGovernor.target,
      data: this.tGovernor.interface.encodeFunctionData('execute', [this.registry.target, 0n, registryCallData]),
    };

    // execute via safe
    tracer.printNext = true;
    await this.executeSafeTransaction([tGovernorCall]);

    this.governor = await ethers.getContractAt('Governor', this.tGovernor.target);

    const governorProxyImplementation = await getImplementation(this.governor);
    expect(governorProxyImplementation).to.equal(governorImplementation.target);
  });

  // post phase 3:
  //   - update existing productTypes with new assessmentCooldownPeriod and payoutRedemptionPeriod fields
  //   - memberRoles.recoverETH
  //   - migrate cover ipfsMetadata to storage
  it('update productTypes with new assessmentCooldownPeriod and payoutRedemptionPeriod fields', async function () {
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
    const poolBalanceBefore = await ethers.provider.getBalance(this.pool.target);
    const mrBalanceBefore = await ethers.provider.getBalance(this.memberRoles.target);

    await this.memberRoles.recoverETH();

    const poolBalanceAfter = await ethers.provider.getBalance(this.pool.target);
    const mrBalanceAfter = await ethers.provider.getBalance(this.memberRoles.target);

    expect(poolBalanceAfter).to.equal(poolBalanceBefore + mrBalanceBefore);
    expect(mrBalanceAfter).to.equal(0n);

    console.log('MemberRoles ETH sent to Pool');

    // migrate cover IPFS metadata to storage
    const { coverIds, ipfsMetadata } = require('../../scripts/v3-migration/data/cover-ipfs-metadata.json');

    await this.cover.connect(this.abMembers[0]).populateIpfsMetadata(coverIds, ipfsMetadata);

    const lastIndex = coverIds.length - 1;
    expect(await this.cover.getCoverMetadata(coverIds[0])).to.equal(ipfsMetadata[0]);
    expect(await this.cover.getCoverMetadata(coverIds[lastIndex])).to.equal(ipfsMetadata[lastIndex]);
  });

  // Basic functionality tests
  require('./basic-functionality-tests');

  // Assessment and Claims
  require('./assessment-claims');
});

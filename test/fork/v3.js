const { ethers, network, nexus } = require('hardhat');
const { expect } = require('chai');
const { parseUnits } = require('ethers');
const { abis, addresses } = require('@nexusmutual/deployments');
const { setBalance, setStorageAt, takeSnapshot } = require('@nomicfoundation/hardhat-network-helpers');

const {
  Addresses,
  getImplementation,
  getFundedSigner,
  getSigner,
  revertToSnapshot,
  submitGovernanceProposal,
} = require('./utils');

const { AbiCoder, deployContract, encodeBytes32String, parseEther, toBeHex, toUtf8Bytes } = ethers;
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
    this.assessment = await ethers.getContractAt(abis.Assessment, addresses.Assessment);
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
    this.assessmentViewer = await ethers.getContractAt(abis.AssessmentViewer, addresses.AssessmentViewer);
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
  });

  it('Impersonate AB members', async function () {
    const { memberArray: members } = await this.memberRoles.members(1);
    this.abMembers = [];
    for (const address of members) {
      this.abMembers.push(await getFundedSigner(address));
    }
  });

  /*
   * Phase 0
   * push old governance rewards
   * deploy registry implementation as proxy
   * deploy TempGov implementation
   * deploy LegacyAssessment implementation
   * deploy LegacyMemberRoles implementation
   * upgrade Governance, Assessment, MemberRoles contracts via governance proposal
   */
  it('should run phase 0', async function () {
    // @TODO: push old governance rewards
    // @TODO: calculate salts for registry and registry proxy

    this.registryProxy = await deployContract('UpgradeableProxy', []);
    const registryImplementation = await deployContract('Registry', [this.registryProxy, this.master]);
    await this.registryProxy.upgradeTo(registryImplementation);
    console.log('registry address: ', this.registryProxy.target);

    // deploy new implementations
    const tempGovernanceImplementation = await deployContract('TemporaryGovernance', [
      Addresses.ADVISORY_BOARD_MULTISIG,
    ]);
    const legacyAssessmentImplementation = await deployContract('LegacyAssessment', [this.nxm]);
    const memberRolesImplementation = await deployContract('LegacyMemberRoles', [this.registryProxy, this.nxm]);

    // submit governance proposal - upgrade multiple contracts
    this.upgradeContractsPhase1 = [
      { code: ContractCode.Governance, contract: tempGovernanceImplementation },
      { code: ContractCode.Assessment, contract: legacyAssessmentImplementation },
      { code: ContractCode.MemberRoles, contract: memberRolesImplementation },
    ];
  });

  // TODO: push old assessment stake and rewards
  // require('./legacy-assessment');

  /*
   * Phase 1
   * - push LegacyAssessment stake and rewards
   * - upgrade NXMaster
   * - master.transferOwnershipToRegistry
   * - registry.migrate
   * - transfer registry proxy ownership to Governor
   */
  it('should run phase 1', async function () {
    await submitGovernanceProposal(
      ProposalCategory.upgradeMultipleContracts,
      defaultAbiCoder.encode(
        ['bytes2[]', 'address[]'],
        [
          this.upgradeContractsPhase1.map(c => toUtf8Bytes(c.code)),
          this.upgradeContractsPhase1.map(c => c.contract.target),
        ],
      ),
      this.abMembers,
      this.governance,
    );

    const governanceAddress = await this.master.getLatestAddress(toBytes2('GV'));

    // set temp governance and registry contracts
    this.tempGovernance = await ethers.getContractAt('TemporaryGovernance', governanceAddress);
    this.registry = await ethers.getContractAt('Registry', this.registryProxy);

    // set advisory board multisig as temp governance signer
    const advisoryBoardMultisig = await this.tempGovernance.advisoryBoardMultisig();
    this.multisigSigner = await getFundedSigner(advisoryBoardMultisig);
    this.tempGovernance = this.tempGovernance.connect(this.multisigSigner);

    // upgrade NXMaster
    const masterImplementation = await deployContract('NXMaster');
    await this.tempGovernance.execute(
      this.master,
      0n,
      this.registryProxy.interface.encodeFunctionData('upgradeTo', [masterImplementation.target]),
    );

    // transfer all master contracts proxy ownership to registry
    const master = await ethers.getContractAt('NXMaster', this.master.target);
    const { data: transferOwnershipData } = await master.transferOwnershipToRegistry.populateTransaction(this.registry);
    await this.tempGovernance.execute(this.master.target, 0n, transferOwnershipData);

    // deploy tempGovernance as temp governor implementation
    const governorImplementation = await deployContract('TemporaryGovernance', [Addresses.ADVISORY_BOARD_MULTISIG]);

    // registry.migrate
    const { data: registryMigrateCallData } = await this.registry.migrate.populateTransaction(
      governorImplementation,
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
    const registryMigrateTx = await this.tempGovernance.execute(this.registry.target, 0n, registryMigrateCallData);
    await registryMigrateTx.wait();

    // get governor contract
    const governorAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_GOVERNOR);
    this.governor = await ethers.getContractAt('Governor', governorAddress);

    // transfer registry proxy ownership from deployer to governor
    const [deployer] = await ethers.getSigners();
    await this.registryProxy.connect(deployer).transferProxyOwnership(this.governor.target);
    const registryProxyOwner = await this.registryProxy.proxyOwner();
    expect(registryProxyOwner).to.equal(this.governor.target);
  });

  /*
   * Phase 2
   * - legacyMemberRoles.migrateMembers (including AB members)
   * - deploy new P1, SO, RA, ST, AS, CL implementations
   */
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
    const assessmentImplementation = await deployContract('Assessment', [this.registry.target]);
    const claimsImplementation = await deployContract('Claims', [this.registry.target]);
    // const tokenControllerImplementation = await deployContract('TokenController', [this.registry.target]);

    this.contractUpgrades = [
      { index: ContractIndexes.C_POOL, address: poolImplementation.target },
      { index: ContractIndexes.C_SWAP_OPERATOR, address: swapOperatorImplementation.target },
      { index: ContractIndexes.C_RAMM, address: rammImplementation.target },
      { index: ContractIndexes.C_SAFE_TRACKER, address: safeTrackerImplementation.target },
      { index: ContractIndexes.C_ASSESSMENTS, address: assessmentImplementation.target },
      { index: ContractIndexes.C_CLAIMS, address: claimsImplementation.target },
      // FIX: token controller upgrade causes basic functionality test "Deploy to StakingPool" to fail
      // { index: ContractIndexes.C_TOKEN_CONTROLLER, address: tokenControllerImplementation.target },
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
   */
  it('should run phase 3', async function () {
    // connect multisig signer to tempGovernor
    const tempGovernorAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_GOVERNOR);
    this.tempGovernor = await ethers.getContractAt('TemporaryGovernance', tempGovernorAddress);
    this.tempGovernor = this.tempGovernor.connect(this.multisigSigner);

    // registry settings and contract upgrades
    const txs = [
      // set emergency admins
      {
        target: this.registry.target,
        value: 0n,
        data: this.registry.interface.encodeFunctionData('setEmergencyAdmin', [Addresses.EMERGENCY_ADMIN_1, true]),
      },
      {
        target: this.registry.target,
        value: 0n,
        data: this.registry.interface.encodeFunctionData('setEmergencyAdmin', [Addresses.EMERGENCY_ADMIN_2, true]),
      },
      // set kyc auth address
      {
        target: this.registry.target,
        value: 0n,
        data: this.registry.interface.encodeFunctionData('setKycAuthAddress', [Addresses.KYC_AUTH_ADDRESS]),
      },
      // upgrade contracts
      ...this.contractUpgrades.map(c => ({
        target: this.registry.target,
        value: 0n,
        data: this.registry.interface.encodeFunctionData('upgradeContract', [c.index, c.address]),
      })),
    ];

    for (const tx of txs) {
      const transaction = await this.tempGovernor.execute(tx.target, tx.value, tx.data);
      await transaction.wait();
    }

    console.log('contracts upgraded');

    // TODO: reset the contracts with right addresses
    const assessmentAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_ASSESSMENTS);
    this.assessment = await ethers.getContractAt('Assessment', assessmentAddress);

    const claimsAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_CLAIMS);
    this.claims = await ethers.getContractAt('Claims', claimsAddress);

    const swapOperatorAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_SWAP_OPERATOR);
    this.swapOperator = await ethers.getContractAt('SwapOperator', swapOperatorAddress);

    // get individual claims latest claim id
    const individualClaims = await ethers.getContractAt(abis.IndividualClaims, addresses.IndividualClaims);
    const latestClaimCount = await individualClaims.getClaimsCount();
    const latestClaimId = latestClaimCount - 1n;
    const SWAP_CONTROLLER = '0x551D5500F613a4beC77BA8B834b5eEd52ad5764f';

    const txs2 = [
      // claims.initialize
      {
        target: this.claims.target,
        value: 0n,
        data: this.claims.interface.encodeFunctionData('initialize', [latestClaimId]),
      },
      // swapOperator.setSwapController
      {
        target: this.swapOperator.target,
        value: 0n,
        data: this.swapOperator.interface.encodeFunctionData('setSwapController', [SWAP_CONTROLLER]),
      },
    ];

    for (const tx of txs2) {
      const transaction = await this.tempGovernor.execute(tx.target, tx.value, tx.data);
      await transaction.wait();
    }

    // recover MemberRoles ETH to pool
    const poolAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_POOL);
    const poolBalanceBefore = await ethers.provider.getBalance(poolAddress);

    await this.memberRoles.recoverETH();

    expect(await ethers.provider.getBalance(poolAddress)).to.be.gt(poolBalanceBefore);
    console.log('MemberRoles ETH recovered to pool');

    // master.migrate
    this.master = await ethers.getContractAt('NXMaster', this.master.target); // get upgraded master contract
    const migrateData = this.master.interface.encodeFunctionData('migrate', [this.registry.target]);
    const masterMigrateTx = await this.tempGovernance.execute(this.master.target, 0n, migrateData);
    await masterMigrateTx.wait();
    console.log('master migrated');

    // pool.migrate
    const oldPoolAddress = this.pool.target;

    const newPoolAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_POOL);
    this.pool = await ethers.getContractAt('Pool', newPoolAddress);

    const poolMigrateTx = await this.tempGovernor.execute(
      this.pool.target,
      0n,
      this.pool.interface.encodeFunctionData('migrate', [oldPoolAddress, this.mcr.target]),
    );
    await poolMigrateTx.wait();
    console.log('pool migrated');

    await getPoolBalances(this, oldPoolAddress, 'OLD POOL BALANCES AFTER POOL.MIGRATION');

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
  });

  /**
   * Phase 4
   * upgrade Governor from TemporaryGovernor to Governor first before calling executeGovernorProposal
   */
  it('upgrade Governor from TemporaryGovernor to Governor', async function () {
    const governorImplementation = await deployContract('Governor', [this.registry]);

    const upgradeGovernorTx = await this.tempGovernor.execute(
      this.registry.target,
      0n,
      this.registry.interface.encodeFunctionData('upgradeContract', [
        ContractIndexes.C_GOVERNOR,
        governorImplementation.target,
      ]),
    );
    await upgradeGovernorTx.wait();

    const governorProxyImplementation = await getImplementation(this.governor);
    expect(governorProxyImplementation).to.equal(governorImplementation.target);
  });

  // Basic functionality tests
  require('./basic-functionality-tests');

  // Assessment and Claims
  require('./assessment-claims');
});

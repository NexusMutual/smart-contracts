const { ethers, network, nexus } = require('hardhat');
const { Address, EnzymeAddress, getImplementation, getSigner, submitGovernanceProposal } = require('./utils');
const { expect } = require('chai');
const { parseUnits } = require('ethers');

const { parseEther, deployContract, toUtf8Bytes, AbiCoder } = ethers;
const { ContractCode, ContractIndexes, ProposalCategory } = nexus.constants;
const { toBytes2 } = nexus.helpers;

const evm = nexus.evmInit();
const defaultAbiCoder = AbiCoder.defaultAbiCoder();

const ADVISORY_BOARD_MULTISIG = '0x422D71fb8040aBEF53f3a05d21A9B85eebB2995D';
const KYC_AUTH_ADDRESS = '0x176c27973E0229501D049De626d50918ddA24656';
const EMERGENCY_ADMIN_1 = '0x422D71fb8040aBEF53f3a05d21A9B85eebB2995D';
const EMERGENCY_ADMIN_2 = '0x87B2a7559d85f4653f13E6546A14189cd5455d45';

async function getPoolBalances(thisParam, poolAddress, prefix) {
  // Check old pool balances to see if migration worked
  const [ethBalance, usdcBal, cbBTCBal, rEthBal, stEthBal, enzymeShareBal, safeTrackerBal] = await Promise.all([
    ethers.provider.getBalance(poolAddress),
    thisParam.usdc.balanceOf(poolAddress),
    thisParam.cbBTC.balanceOf(poolAddress),
    thisParam.rEth.balanceOf(poolAddress),
    thisParam.stEth.balanceOf(poolAddress),
    thisParam.enzymeShares.balanceOf(poolAddress),
    thisParam.safeTracker.balanceOf(poolAddress),
  ]);

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

// Fork tests
describe('v3 launch', function () {
  before(async function () {
    // Initialize evm helper
    const provider =
      network.name !== 'hardhat' // ethers errors out when using non-local accounts
        ? new ethers.JsonRpcProvider(network.config.url)
        : ethers.provider;
    await evm.connect(provider);

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

    this.EMERGENCY_ADMIN_1 = EMERGENCY_ADMIN_1;
    this.EMERGENCY_ADMIN_2 = EMERGENCY_ADMIN_2;
  });

  require('./setup');

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
    const registryImplementation = await deployContract('Registry', [this.registryProxy.target, this.master.target]);
    await this.registryProxy.upgradeTo(registryImplementation.target);
    console.log('registry address: ', this.registryProxy.target);

    // deploy new implementations
    const tempGovernanceImplementation = await deployContract('TemporaryGovernance', [ADVISORY_BOARD_MULTISIG]);
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
      true, // skip accepted validation - tempGovernance doesn't have proposal function
    );
    console.log('temp governance upgraded');

    const governanceAddress = await this.master.getLatestAddress(toBytes2('GV'));

    // set temp governance and registry contracts
    [this.tempGovernance, this.registry] = await Promise.all([
      ethers.getContractAt('TemporaryGovernance', governanceAddress),
      ethers.getContractAt('Registry', this.registryProxy.target),
    ]);

    // set advisory board multisig as temp governance signer
    const advisoryBoardMultisig = await this.tempGovernance.advisoryBoardMultisig();
    await Promise.all([
      this.evm.impersonate(advisoryBoardMultisig),
      this.evm.setBalance(advisoryBoardMultisig, parseEther('1000')),
    ]);
    this.multisigSigner = await getSigner(advisoryBoardMultisig);
    this.tempGovernance = this.tempGovernance.connect(this.multisigSigner);

    // upgrade NXMaster
    const masterImplementation = await deployContract('NXMaster', []);
    const masterUpgradeTx = await this.tempGovernance.execute(
      this.master.target,
      0n,
      this.registryProxy.interface.encodeFunctionData('upgradeTo', [masterImplementation.target]),
    );
    await masterUpgradeTx.wait();
    console.log('master upgraded');

    // transfer all master contracts proxy ownership to registry
    const master = await ethers.getContractAt('NXMaster', this.master.target);
    const transferOwnershipCallData = master.interface.encodeFunctionData('transferOwnershipToRegistry', [
      this.registry.target,
    ]);
    const transferOwnershipTx = await this.tempGovernance.execute(this.master.target, 0n, transferOwnershipCallData);
    await transferOwnershipTx.wait();
    console.log('ALL contracts proxy ownership transferred to registry');

    // deploy tempGovernance as temp governor implementation
    const governorImplementation = await deployContract('TemporaryGovernance', [ADVISORY_BOARD_MULTISIG]);

    // registry.migrate
    const registryMigrateCallData = this.registry.interface.encodeFunctionData('migrate', [
      governorImplementation.target,
      this.coverNFT.target,
      this.stakingNFT.target,
      this.nxm.target,
      ethers.encodeBytes32String('governorSalt'),
      ethers.encodeBytes32String('poolSalt'),
      ethers.encodeBytes32String('swapOperatorSalt'),
      ethers.encodeBytes32String('assessmentSalt'),
      ethers.encodeBytes32String('claimsSalt'),
    ]);
    const registryMigrateTx = await this.tempGovernance.execute(this.registry.target, 0n, registryMigrateCallData);
    await registryMigrateTx.wait();
    console.log('registry.migrate done');

    // get governor contract
    const governorAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_GOVERNOR);
    this.governor = await ethers.getContractAt('Governor', governorAddress);

    // transfer registry proxy ownership from deployer to governor
    const [deployer] = await ethers.getSigners();
    await this.registryProxy.connect(deployer).transferProxyOwnership(this.governor.target);
    const registryProxyOwner = await this.registryProxy.proxyOwner();
    expect(registryProxyOwner).to.equal(this.governor.target);
    console.log('registry proxy owner transferred to governor');
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
    const fastMigration = true;

    while (!finishedMigrating) {
      console.log('calling memberRoles.migrateMembers(500)');
      const migrateMembersTx = await this.memberRoles.migrateMembers(500);
      await migrateMembersTx.wait();
      finishedMigrating = fastMigration || (await this.memberRoles.hasFinishedMigrating());
    }

    console.log('memberRoles.migrateMembers done');

    const abMembers = [
      '0x87B2a7559d85f4653f13E6546A14189cd5455d45',
      '0x8D38C81B7bE9Dbe7440D66B92d4EF529806baAE7',
      '0x23E1B127Fd62A4dbe64cC30Bb30FFfBfd71BcFc6',
      '0x9063a2C78aFd6C8A3510273d646111Df67D6CB4b',
      '0x43f4cd7d153701794ce25a01eFD90DdC32FF8e8E',
    ];

    if (fastMigration) {
      await this.evm.impersonate(this.memberRoles.target);
      const mrSigner = await getSigner(this.memberRoles.target);
      await this.registry.connect(mrSigner).migrateMembers(abMembers);
      await this.registry.connect(mrSigner).migrateAdvisoryBoardMembers(abMembers);
    }

    // verify abMembers were migrated
    for (const address of abMembers) {
      expect(await this.registry.isAdvisoryBoardMember(address)).to.equal(true, `AB member ${address} not migrated`);
    }

    const poolImplementation = await deployContract('Pool', [this.registry.target]);
    const swapOperatorImplementation = await deployContract('SwapOperator', [
      this.registry.target,
      Address.COWSWAP_SETTLEMENT,
      EnzymeAddress.ENZYMEV4_VAULT_PROXY_ADDRESS,
      Address.WETH_ADDRESS,
    ]);
    const rammImplementation = await deployContract('Ramm', [
      this.registry.target,
      parseEther('0.01'), // TODO: set correct value for initialSpotPriceB
    ]);
    const safeTrackerImplementation = await deployContract('SafeTracker', [
      this.registry.target,
      parseUnits('25000000', 6), // investmentLimit
      SAFE_ADDRESS,
      Address.USDC_ADDRESS,
      Address.WETH_ADDRESS,
      Address.AWETH_ADDRESS,
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
      { index: ContractIndexes.C_ASSESSMENT, address: assessmentImplementation.target },
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
        data: this.registry.interface.encodeFunctionData('setEmergencyAdmin', [this.EMERGENCY_ADMIN_1, true]),
      },
      {
        target: this.registry.target,
        value: 0n,
        data: this.registry.interface.encodeFunctionData('setEmergencyAdmin', [this.EMERGENCY_ADMIN_2, true]),
      },
      // set kyc auth address
      {
        target: this.registry.target,
        value: 0n,
        data: this.registry.interface.encodeFunctionData('setKycAuthAddress', [KYC_AUTH_ADDRESS]),
      },
      // upgrade contracts
      ...this.contractUpgrades.map(c => ({
        target: this.registry.target,
        value: 0n,
        data: this.registry.interface.encodeFunctionData('upgradeContract', [c.index, c.address]),
      })),
    ];

    const executeTxs = await Promise.all(txs.map(tx => this.tempGovernor.execute(tx.target, tx.value, tx.data)));
    await Promise.all(executeTxs.map(tx => tx.wait()));
    console.log('contracts upgraded');

    // TODO: reset the contracts with right addresses
    const assessmentAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_ASSESSMENT);
    this.assessment = await ethers.getContractAt('Assessment', assessmentAddress);

    const claimsAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_CLAIMS);
    this.claims = await ethers.getContractAt('Claims', claimsAddress);

    const swapOperatorAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_SWAP_OPERATOR);
    this.swapOperator = await ethers.getContractAt('SwapOperator', swapOperatorAddress);

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

  // upgrade Governor from TemporaryGovernor to Governor first before calling executeGovernorProposal
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

  // Assessment and Claims
  // require('./assessment-claims');

  // Basic functionality tests
  require('./basic-functionality-tests');
});

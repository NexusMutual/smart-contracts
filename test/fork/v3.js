const { ethers, network, nexus } = require('hardhat');
const { Address, EnzymeAddress, getSigner, submitGovernanceProposal, executeGovernorProposal } = require('./utils');
const { getContractAt } = require('@nomicfoundation/hardhat-ethers/internal/helpers');
const { expect } = require('chai');
const { parseUnits } = require('ethers');

const { parseEther, deployContract, toUtf8Bytes, AbiCoder } = ethers;
const { ContractCode, ContractIndexes, ProposalCategory } = nexus.constants;
const { toBytes2 } = nexus.helpers;

const evm = nexus.evmInit();
const defaultAbiCoder = AbiCoder.defaultAbiCoder();

const ADVISORY_BOARD_MULTISIG = '0x422D71fb8040aBEF53f3a05d21A9B85eebB2995D';
const EMERGENCY_ADMIN = '0x422D71fb8040aBEF53f3a05d21A9B85eebB2995D';
const KYC_AUTH_ADDRESS = '0x176c27973E0229501D049De626d50918ddA24656';

// Helpers
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
  console.log('** totalPoolValueInEth: ', ethers.formatEther(totalPoolValueInEth), '\n');

  return [ethBalance, usdcBal, cbBTCBal, rEthBal, stEthBal, enzymeShareBal, safeTrackerBal];
}

/**
 * Logs all registered contract addresses in the given Registry contract.
 * Uses ContractIndexes constants for index lookup.
 * @param {object} registry - ethers.js contract instance of Registry
 * @returns {Promise<void>}
 */
async function logAllRegisteredContracts(registry, title) {
  console.log(`\n${title}`);
  const contractIndexes = nexus.constants.ContractIndexes;
  for (const code in contractIndexes) {
    const index = contractIndexes[code];
    try {
      const addr = await registry.getContractAddressByIndex(index);
      console.log(`Contract ${code} (index ${index}): ${addr}`);
    } catch (e) {
      console.log(`Contract ${code} (index ${index}): not registered or error (${e.message})`);
    }
  }
}

// Fork tests

describe('v3 launch', function () {
  this.EMERGENCY_ADMIN = EMERGENCY_ADMIN;

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
  });

  require('./setup');

  // require('./legacy-assessment');

  /*
   * Phase 0
   * push old governance rewards
   * deploy registry implementation as proxy
   * deploy TempGov implementation
   * deploy Governor implementation
   * deploy LegacyMemberRoles implementation
   * deploy NXMaster implementation
   * submit governance proposal - upgrade multiple contracts
   * */

  it('should run phase 0', async function () {
    // @TODO: push old governance rewards
    // @TODO: calculate salts for registry and registry proxy

    this.registryProxy = await deployContract('UpgradeableProxy', []);
    const registryImplementation = await deployContract('Registry', [this.registryProxy.target, this.master.target]);
    await this.registryProxy.upgradeTo(registryImplementation.target);
    console.log('registry address: ', this.registryProxy.target);

    // deploy new implementations
    const tempGovernanceImplementation = await deployContract('TemporaryGovernance', [ADVISORY_BOARD_MULTISIG]);
    const legacyAssessmentImplementation = await deployContract('LegacyAssessment', [this.nxm.target]);

    // submit governance proposal - upgrade multiple contracts
    const upgradeContracts = [
      { code: ContractCode.Governance, contract: tempGovernanceImplementation },
      { code: ContractCode.Assessment, contract: legacyAssessmentImplementation },
    ];

    await submitGovernanceProposal(
      ProposalCategory.upgradeMultipleContracts,
      defaultAbiCoder.encode(
        ['bytes2[]', 'address[]'],
        [upgradeContracts.map(c => toUtf8Bytes(c.code)), upgradeContracts.map(c => c.contract.target)],
      ),
      this.abMembers,
      this.governance,
      true, // skip accepted validation - tempGovernance doesn't have proposal function
    );
    console.log('temp governance upgraded');
  });

  // Withdraw governance rewards / assessment stake & rewards

  /*
   * Phase 1
   * - upgrade Master
   * - master.transferOwnershipToRegistry
   * - registry.migrate
   * - set emergency admins
   * - set kyc address
   * - upgrade MemberRoles
   * - transfer registry proxy ownership Governor
   * */

  it('should run phase 1', async function () {
    console.info('Snapshot ID Phase 1 start: ', await this.evm.snapshot());

    // skip to phase 1 start
    const REGISTRY_ADDRESS = this.registryProxy?.target || '0x4b73E995c68F307702b1b0828318d7A38037e1bb';
    this.registryProxy = await ethers.getContractAt('UpgradeableProxy', REGISTRY_ADDRESS);
    // skip to phase 2 end

    const governanceAddress = await this.master.getLatestAddress(toBytes2('GV'));

    // set temp governance and registry contracts
    [this.tempGovernance, this.registry] = await Promise.all([
      ethers.getContractAt('TemporaryGovernance', governanceAddress),
      ethers.getContractAt('Registry', REGISTRY_ADDRESS),
    ]);

    // set advisory board multisig as temp governance signer
    const advisoryBoardMultisig = await this.tempGovernance.advisoryBoardMultisig();
    await Promise.all([
      this.evm.impersonate(advisoryBoardMultisig),
      this.evm.setBalance(advisoryBoardMultisig, parseEther('1000')),
    ]);
    const multisigSigner = await getSigner(advisoryBoardMultisig);
    this.tempGovernance = this.tempGovernance.connect(multisigSigner);

    // upgrade NXMaster
    const masterImplementation = await deployContract('NXMaster', []);
    const masterUpgradeTx = await this.tempGovernance.execute(
      this.master.target,
      0n,
      this.registryProxy.interface.encodeFunctionData('upgradeTo', [masterImplementation.target]),
      { gasLimit: 21e6 },
    );
    await masterUpgradeTx.wait();
    console.log('master upgraded');

    // transfer contract proxy ownership to registry
    const master = await ethers.getContractAt('NXMaster', this.master.target);
    const transferOwnershipCallData = master.interface.encodeFunctionData('transferOwnershipToRegistry', [
      this.registry.target,
    ]);
    const transferOwnershipTx = await this.tempGovernance.execute(this.master.target, 0n, transferOwnershipCallData, {
      gasLimit: 21e6,
    });
    await transferOwnershipTx.wait();
    console.log('ALL contracts proxy ownership transferred to registry');

    // deploy governor implementation
    const governorImplementation = await deployContract('Governor', [this.registry.target]);

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
    const registryMigrateTx = await this.tempGovernance.execute(this.registry.target, 0n, registryMigrateCallData, {
      gasLimit: 21e6,
    });
    await registryMigrateTx.wait();
    console.log('registry.migrate done');

    // await logAllRegisteredContracts(this.registry, 'AFTER registry.migrate');

    // get governor contract
    const governorAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_GOVERNOR);
    this.governor = await ethers.getContractAt('Governor', governorAddress);

    const transactions = [];

    // set emergency admin
    const emergencyAdminData = this.registry.interface.encodeFunctionData('setEmergencyAdmin', [EMERGENCY_ADMIN, true]);
    transactions.push({
      target: this.registry.target,
      value: 0n,
      data: emergencyAdminData,
    });

    // set kyc auth address
    const kycAuthData = this.registry.interface.encodeFunctionData('setKycAuthAddress', [KYC_AUTH_ADDRESS]);
    transactions.push({
      target: this.registry.target,
      value: 0n,
      data: kycAuthData,
    });

    // upgrade MemberRoles
    const memberRolesImplementation = await deployContract('LegacyMemberRoles', [this.registry.target]);
    const memberRolesUpgradeData = this.master.interface.encodeFunctionData('upgradeMultipleContracts', [
      [toUtf8Bytes(ContractCode.MemberRoles)],
      [memberRolesImplementation.target],
    ]);
    transactions.push({
      target: this.master.target,
      value: 0n,
      data: memberRolesUpgradeData,
    });

    await Promise.all(
      transactions.map(transaction =>
        this.tempGovernance.execute(transaction.target, transaction.value, transaction.data, { gasLimit: 21e6 }),
      ),
    );

    // transfer registry proxy ownership from master to governor
    const transferOwnershipData = this.registryProxy.interface.encodeFunctionData('transferProxyOwnership', [
      this.governor.target,
    ]);
    await this.tempGovernance.execute(this.master.target, 0n, transferOwnershipData, { gasLimit: 21e6 });
  });

  /*
   * Phase 2
   * - upgrade new pool
   * - deploy new SO, RA, ST, AS, CL implementations
   * - memberRoles.migrateMembers - called with any address (deployer for ex)
   */
  it('should run phase 2', async function () {
    console.info('Snapshot ID Phase 2 start: ', await this.evm.snapshot());

    const SAFE_ADDRESS = '0x51ad1265C8702c9e96Ea61Fe4088C2e22eD4418e';

    // skip to phase 2 start
    // const REGISTRY_ADDRESS = '0x4b73E995c68F307702b1b0828318d7A38037e1bb';
    // this.registryProxy = await ethers.getContractAt('UpgradeableProxy', REGISTRY_ADDRESS);
    // // set temp governance and registry contracts
    // const governanceAddress = await this.master.getLatestAddress(toBytes2('GV'));
    // console.log('Governance address from master:', governanceAddress);

    // [this.tempGovernance, this.registry] = await Promise.all([
    //   ethers.getContractAt('TemporaryGovernance', governanceAddress),
    //   ethers.getContractAt('Registry', REGISTRY_ADDRESS),
    // ]);

    // const advisoryBoardMultisig = await this.tempGovernance.advisoryBoardMultisig();
    // await Promise.all([
    //   this.evm.impersonate(advisoryBoardMultisig),
    //   this.evm.setBalance(advisoryBoardMultisig, parseEther('1000')),
    // ]);
    // const multisigSigner = await getSigner(advisoryBoardMultisig);
    // this.tempGovernance = this.tempGovernance.connect(multisigSigner);
    // skip to phase 2 end

    // set governor as registry signer
    const governorAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_GOVERNOR);
    await Promise.all([
      this.evm.impersonate(governorAddress),
      this.evm.setBalance(governorAddress, parseEther('1000')),
    ]);
    const governorSigner = await ethers.getSigner(governorAddress);
    console.log('governorAddress: ', governorAddress);

    // upgrade pool first before deploying safeTracker implementation
    const poolImplementation = await deployContract('Pool', [this.registry.target]);
    const poolUpgradeTx = await this.registry
      .connect(governorSigner)
      .upgradeContract(ContractIndexes.C_POOL, poolImplementation.target, { gasLimit: 21e6 });
    await poolUpgradeTx.wait();

    // deploy new contract implementations
    const swapOperatorImplementation = await deployContract('SwapOperator', [
      this.registry.target,
      Address.COWSWAP_SETTLEMENT,
      EnzymeAddress.ENZYMEV4_VAULT_PROXY_ADDRESS,
      EnzymeAddress.ENZYME_FUND_VALUE_CALCULATOR_ROUTER,
      Address.WETH_ADDRESS,
      SAFE_ADDRESS,
      this.tokenController.target, // SWAP_CONTROLLER
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
      Address.DAI_ADDRESS,
      Address.WETH_ADDRESS,
      Address.AWETH_ADDRESS,
      '0x72E95b8931767C79bA4EeE721354d6E99a61D004', // VARIABLE_DEBT_USDC_ADDRESS
    ]);
    const assessmentImplementation = await deployContract('Assessment', [this.registry.target]);
    const claimsImplementation = await deployContract('Claims', [this.registry.target]);

    this.contractUpgrades = [
      { index: ContractIndexes.C_SWAP_OPERATOR, address: swapOperatorImplementation.target },
      { index: ContractIndexes.C_RAMM, address: rammImplementation.target },
      { index: ContractIndexes.C_SAFE_TRACKER, address: safeTrackerImplementation.target },
      { index: ContractIndexes.C_ASSESSMENT, address: assessmentImplementation.target },
      { index: ContractIndexes.C_CLAIMS, address: claimsImplementation.target },
    ];

    // @TODO: memberRoles.migrateMembers
  });

  /*
   * Phase 3
   * - upgrade SO, RA, ST, AS, CL
   * - master.migrate
   * - pool.migrate
   */
  it('should run phase 3', async function () {
    console.info('Snapshot ID Phase 3 start: ', await this.evm.snapshot());

    // TEST: skip to phase 3 start
    // const REGISTRY_ADDRESS = '0x4b73E995c68F307702b1b0828318d7A38037e1bb';
    // [this.tempGovernance, this.registry] = await Promise.all([
    //   ethers.getContractAt('TemporaryGovernance', governanceAddress),
    //   ethers.getContractAt('Registry', REGISTRY_ADDRESS),
    // ]);

    // // set advisory board multisig as governance signer
    // const advisoryBoardMultisig = await this.tempGovernance.advisoryBoardMultisig();
    // await Promise.all([
    //   this.evm.impersonate(advisoryBoardMultisig),
    //   this.evm.setBalance(advisoryBoardMultisig, parseEther('1000')),
    // ]);
    // const multisigSigner = await getSigner(advisoryBoardMultisig);
    // this.tempGovernance = this.tempGovernance.connect(multisigSigner);
    // TEST: skip to phase 3 ends

    await getPoolBalances(this, this.pool.target, 'OLD BEFORE registry.upgradeContracts');

    // TODO: move to phase 3
    // TODO: use governance proposal instead
    await Promise.all(
      this.contractUpgrades.map(async c => {
        const tx = await this.registry.connect(governorSigner).upgradeContract(c.index, c.address, { gasLimit: 21e6 });
        await tx.wait();
      }),
    );
    console.log('contracts upgraded');

    // initialize Ramm
    const rammAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_RAMM);
    this.ramm = await ethers.getContractAt('Ramm', rammAddress);
    const rammInitTx = await this.ramm.connect(governorSigner).initialize();
    await rammInitTx.wait();
    console.log('ramm initialized: ', rammAddress);

    const assessmentAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_ASSESSMENT);
    this.assessment = await ethers.getContractAt('Assessment', assessmentAddress);

    // TODO: use governor proposal instead
    // const rammInitializeData = this.ramm.interface.encodeFunctionData('initialize', [
    //   parseEther('0.01'),
    //   parseEther('0.01'),
    // ]);
    // const rammInitTx = await executeGovernorProposal(this.governor, this.abMembers, [
    //   { target: this.ramm.target, value: 0n, data: rammInitializeData },
    // ]);

    await getPoolBalances(this, this.pool.target, 'AFTER registry.upgradeContracts PHASE 2');

    const oldPoolAddress = this.pool.target;
    console.log('oldPoolAddress: ', oldPoolAddress);

    const governanceAddress = await this.master.getLatestAddress(toBytes2('GV'));
    console.log('Governance address from master:', governanceAddress);

    await getPoolBalances(this, oldPoolAddress, 'OLD BEFORE MASTER MIGRATION');

    // master.migrate
    this.master = await ethers.getContractAt('NXMaster', this.master.target); // get upgraded master contract
    const migrateData = this.master.interface.encodeFunctionData('migrate', [this.registry.target]);
    const masterMigrateTx = await this.tempGovernance.execute(this.master.target, 0n, migrateData, { gasLimit: 21e6 });
    await masterMigrateTx.wait();
    console.log('master migrated');

    const governorAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_GOVERNOR);
    const governorSigner = await ethers.getSigner(governorAddress);

    // @TODO: use governor proposal instead
    // pool migrate
    const newPoolAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_POOL);
    this.pool = await ethers.getContractAt('Pool', newPoolAddress);
    const poolMigrateTx = await this.pool
      .connect(governorSigner)
      .migrate(oldPoolAddress, this.mcr.target, { gasLimit: 21e6 });
    await poolMigrateTx.wait();
    console.log('pool migrated');

    await getPoolBalances(this, oldPoolAddress, 'OLD AFTER MASTER/POOL MIGRATION');

    const [ethBalance, usdcBal, cbBTCBal, rEthBal, stEthBal, enzymeShareBal, safeTrackerBal] = await getPoolBalances(
      this,
      newPoolAddress,
      'NEW AFTER POOL MIGRATION',
    );

    expect(ethBalance).to.not.equal(0n);
    expect(usdcBal).to.not.equal(0n);
    expect(cbBTCBal).to.not.equal(0n);
    expect(rEthBal).to.not.equal(0n);
    expect(stEthBal).to.not.equal(0n);
    expect(enzymeShareBal).to.not.equal(0n);
    expect(safeTrackerBal).to.not.equal(0n);
  });

  // Assessment and Claims
  require('./assessment-claims');
});

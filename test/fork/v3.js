const { ethers, network, nexus } = require('hardhat');
const { Address, EnzymeAddress, getSigner, submitGovernanceProposal } = require('./utils');
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
    this.registryProxy = await deployContract('UpgradeableProxy', []);
    const registryImplementation = await deployContract('Registry', [this.registryProxy.target, this.master.target]);
    const tempGovernanceImplementation = await deployContract('TemporaryGovernance', [ADVISORY_BOARD_MULTISIG]);
    const legacyAssessmentImplementation = await deployContract('LegacyAssessment', [this.nxm.target]);

    await this.registryProxy.upgradeTo(registryImplementation.target);
    console.log('registry proxy upgraded: ', this.registryProxy.target);

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

    // create, categorize, and submit proposal
    await this.governance.connect(signers[0]).createProposal('', '', '', 0);
    await this.governance.connect(signers[0]).categorizeProposal(id, categoryId, 0);
    await this.governance.connect(signers[0]).submitProposalWithSolution(id, '', actionData);

    // submit in favour votes
    await Promise.all(signers.map(signer => this.governance.connect(signer).submitVote(id, 1)));

    // close proposal
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
  });

  // Withdraw governance rewards / assessment stake & rewards
  // require('./legacy-assessment');

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
    // skip phase 0 start
    // const REGISTRY_ADDRESS = '0xC3E28A37EEF2674175Fc37f28C4f33f9D8aF7E43';
    // this.registryProxy = await ethers.getContractAt('UpgradeableProxy', REGISTRY_ADDRESS);
    // skip phase 0 end

    const registryAddress = this.registryProxy?.target || REGISTRY_ADDRESS;
    // console.info('Snapshot ID Phase 1 start: ', await this.evm.snapshot());
    const governorImplementation = await deployContract('Governor', [registryAddress]);

    // Get the master contract first, then governance
    const governanceAddress = await this.master.getLatestAddress(toBytes2('GV'));
    console.log('Governance address from master:', governanceAddress);

    // pass proxy ownership to registry
    const stakingProductsProxy = await ethers.getContractAt('UpgradeableProxy', this.stakingProducts.target);
    const coverProxy = await ethers.getContractAt('UpgradeableProxy', this.cover.target);
    const coverProductsProxy = await ethers.getContractAt('UpgradeableProxy', this.coverProducts.target);
    const safeTrackerProxy = await ethers.getContractAt('UpgradeableProxy', this.safeTracker.target);
    const tokenControllerProxy = await ethers.getContractAt('UpgradeableProxy', this.tokenController.target);
    const rammProxy = await ethers.getContractAt('UpgradeableProxy', this.ramm.target);
    const limitOrdersProxy = await ethers.getContractAt('UpgradeableProxy', this.limitOrders.target);

    // set temp governance and registry contracts
    console.log('Governance address from master:', governanceAddress);
    [this.tempGovernance, this.registry] = await Promise.all([
      ethers.getContractAt('TemporaryGovernance', governanceAddress),
      ethers.getContractAt('Registry', REGISTRY_ADDRESS),
    ]);

    // transfer proxy ownership to registry
    const proxyContracts = [
      { name: 'stakingProducts', proxy: stakingProductsProxy },
      { name: 'cover', proxy: coverProxy },
      { name: 'coverProducts', proxy: coverProductsProxy },
      { name: 'safeTracker', proxy: safeTrackerProxy },
      { name: 'tokenController', proxy: tokenControllerProxy },
      { name: 'ramm', proxy: rammProxy },
      { name: 'limitOrders', proxy: limitOrdersProxy },
    ];

    await Promise.all(
      proxyContracts.map(async ({ name, proxy }) => {
        const owner = await proxy.proxyOwner();

        // get owner signer
        await Promise.all([this.evm.impersonate(owner), this.evm.setBalance(owner, parseEther('1000'))]);
        const ownerSigner = await getSigner(owner);

        // transfer ownership to registry
        await proxy.connect(ownerSigner).transferProxyOwnership(this.registry.target);
      }),
    );

    // set governance as registry signer
    const governanceSigner = await getSigner(this.tempGovernance.target);
    this.registry = this.registry.connect(governanceSigner);

    // registry.migrate
    const tx = await this.registry.migrate(
      governorImplementation.target,
      ethers.encodeBytes32String('governorSalt'),
      ethers.encodeBytes32String('poolSalt'),
      ethers.encodeBytes32String('swapOperatorSalt'),
      ethers.encodeBytes32String('assessmentSalt'),
      ethers.encodeBytes32String('claimsSalt'),
      { gasLimit: 21e6 },
    );
    await tx.wait();
    console.log('registry.migrate done');

    const governorAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_GOVERNOR);
    console.log('governorAddress: ', governorAddress);
    this.governor = await ethers.getContractAt('Governor', governorAddress);

    const memberRolesImplementation = await deployContract('LegacyMemberRoles', [this.registry.target]);
    const masterImplementation = await deployContract('NXMaster', []);

    const switchContractsToInternal = [
      { index: ContractIndexes.C_TOKEN, address: this.nxm.target, isProxy: false },
      { index: ContractIndexes.C_COVER_NFT, address: this.coverNFT.target, isProxy: false },
      { index: ContractIndexes.C_STAKING_NFT, address: this.stakingNFT.target, isProxy: false },
    ];
    const transactions = [];

    // set advisory board multisig as governance signer
    const advisoryBoardMultisig = await this.tempGovernance.advisoryBoardMultisig();
    await Promise.all([
      this.evm.impersonate(advisoryBoardMultisig),
      this.evm.setBalance(advisoryBoardMultisig, parseEther('1000')),
    ]);
    const multisigSigner = await getSigner(advisoryBoardMultisig);
    this.tempGovernance = this.tempGovernance.connect(multisigSigner);

    // add contracts to registry
    switchContractsToInternal.forEach(c => {
      const data = this.registry.interface.encodeFunctionData('addContract', [c.index, c.address, c.isProxy]);
      transactions.push({
        target: this.registry.target,
        value: 0n,
        data,
      });
    });

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

    // upgrade Master
    const masterUpgradeData = this.registryProxy.interface.encodeFunctionData('upgradeTo', [
      masterImplementation.target,
    ]);
    await this.tempGovernance.execute(this.master.target, 0n, masterUpgradeData, { gasLimit: 21e6 });

    // transfer ownership of registry proxy to governor
    const transferOwnershipData = this.registryProxy.interface.encodeFunctionData('transferProxyOwnership', [
      this.governor.target,
    ]);
    await this.tempGovernance.execute(this.master.target, 0n, transferOwnershipData, { gasLimit: 21e6 });
  });

  /*
   * Phase 2
   * - deploy new P1, SO, RA, ST, AS, CL implementations
   * - memberRoles.migrateMembers - called with any address (deployer for ex)
   * */

  it('should run phase 2', async function () {
    console.info('Snapshot ID Phase 2 start: ', await this.evm.snapshot());

    // skip phase 1 start
    // const REGISTRY_ADDRESS = '0xC3E28A37EEF2674175Fc37f28C4f33f9D8aF7E43';
    // this.registryProxy = await ethers.getContractAt('UpgradeableProxy', REGISTRY_ADDRESS);
    // // set temp governance and registry contracts
    // const governanceAddress = await this.master.getLatestAddress(toBytes2('GV'));
    // console.log('Governance address from master:', governanceAddress);

    // [this.tempGovernance, this.registry] = await Promise.all([
    //   ethers.getContractAt('TemporaryGovernance', governanceAddress),
    //   ethers.getContractAt('Registry', REGISTRY_ADDRESS),
    // ]);
    // skip phase 1 end

    const poolImplementation = await deployContract('Pool', [this.registry.target]);
    console.log('poolImplementation: ', poolImplementation.target);
    const swapOperatorImplementation = await deployContract('SwapOperator', [
      this.registry.target,
      Address.COWSWAP_SETTLEMENT,
      EnzymeAddress.ENZYMEV4_VAULT_PROXY_ADDRESS,
      EnzymeAddress.ENZYME_FUND_VALUE_CALCULATOR_ROUTER,
      Address.WETH_ADDRESS,
      '0x51ad1265C8702c9e96Ea61Fe4088C2e22eD4418e', // safe address
      this.tokenController.target, // SWAP_CONTROLLER
    ]);
    const rammImplementation = await deployContract('Ramm', [
      this.registry.target,
      parseEther('0.01'), // TODO: set correct value for initialSpotPriceB
    ]);
    const safeTrackerImplementation = await deployContract('SafeTracker', [
      this.registry.target,
      parseUnits('25000000', 6), // investmentLimit
      '0x51ad1265C8702c9e96Ea61Fe4088C2e22eD4418e', // safe address
      Address.USDC_ADDRESS,
      Address.DAI_ADDRESS,
      Address.WETH_ADDRESS,
      Address.AWETH_ADDRESS,
      '0x72E95b8931767C79bA4EeE721354d6E99a61D004', // VARIABLE_DEBT_USDC_ADDRESS
    ]);
    const assessmentImplementation = await deployContract('Assessment', [this.registry.target]);
    console.log('assessmentImplementation: ', assessmentImplementation.target);
    const claimsImplementation = await deployContract('Claims', [this.registry.target]);
    console.log('claimsImplementation: ', claimsImplementation.target);

    const contractUpgrade = [
      { index: ContractIndexes.C_POOL, address: poolImplementation.target },
      { index: ContractIndexes.C_SWAP_OPERATOR, address: swapOperatorImplementation.target },
      { index: ContractIndexes.C_RAMM, address: rammImplementation.target },
      { index: ContractIndexes.C_SAFE_TRACKER, address: safeTrackerImplementation.target },
      { index: ContractIndexes.C_ASSESSMENT, address: assessmentImplementation.target },
      { index: ContractIndexes.C_CLAIMS, address: claimsImplementation.target },
    ];

    const governorAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_GOVERNOR);
    const governorSigner = await ethers.getSigner(governorAddress);
    console.log('governorAddress: ', governorAddress);

    this.registry = await ethers.getContractAt('Registry', this.registry.target);
    await Promise.all(
      contractUpgrade.map(async c => {
        const tx = await this.registry.connect(governorSigner).upgradeContract(c.index, c.address, { gasLimit: 21e6 });
        return tx.wait();
      }),
    );
    console.log('contracts upgraded');

    const assessmentAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_ASSESSMENT);
    this.assessment = await ethers.getContractAt('Assessment', assessmentAddress);
    console.log('assessmentAddress: ', assessmentAddress);

    const assessmentProxy = await ethers.getContractAt('UpgradeableProxy', assessmentAddress);
    const currentImplementation = await assessmentProxy.implementation();
    console.log('Assessment proxy implementation:', currentImplementation);
    console.log('Expected implementation:', assessmentImplementation.target);
    console.log('Implementation matches:', currentImplementation === assessmentImplementation.target);

    console.log('Testing basic Assessment contract functions...');
    const currentGroupCount = await this.assessment.getGroupsCount();
    console.log('Current group count:', currentGroupCount.toString());
  });

  it('should migrate members', async function () {
    console.info('Snapshot ID migrate members start: ', await this.evm.snapshot());

    const membersToMigrate = [
      '0x5fa07227d05774c2ff11c2425919d14225a38dbb',
      '0x5929cc4d10b6a1acc5bf5d221889f10251c628a1',
      '0xf3bfac9e828bc904112e7bb516d4cd4e6468f785',
      '0xfec65468cf9ab04cea40b113bf679e82973bdb58',
      '0xa8c320bc7581ca1a24521a9e56a46553ad67e4b0',
    ];

    const memberCountBefore = await this.registry.getMemberCount();
    console.log('Member count before migration:', memberCountBefore.toString());

    await Promise.all([
      this.evm.impersonate(this.memberRoles.target),
      this.evm.setBalance(this.memberRoles.target, parseEther('1000')),
    ]);
    const memberRolesSigner = await getSigner(this.memberRoles.target);
    await this.registry.connect(memberRolesSigner).migrateMembers(membersToMigrate, { gasLimit: 21e6 });

    const memberCountAfter = await this.registry.getMemberCount();
    console.log('Member count after migration:', memberCountAfter.toString());

    // Verify some members were migrated
    await Promise.all(
      membersToMigrate.map(async member => {
        const memberId = await this.registry.getMemberId(member);
        console.log(`Member ${member} has ID: ${memberId.toString()}`);
      }),
    );
  });

  it('should run phase 3', async function () {
    console.info('Snapshot ID Phase 3 start: ', await this.evm.snapshot());
    const oldPoolAddress = this.pool.target;
    console.log('oldPoolAddress: ', oldPoolAddress);

    // TEST: skip phase 2 start
    // set temp governance and registry contracts
    // const REGISTRY_ADDRESS = '0xC3E28A37EEF2674175Fc37f28C4f33f9D8aF7E43';
    // const governanceAddress = await this.master.getLatestAddress(toBytes2('GV'));
    // console.log('Governance address from master:', governanceAddress);

    // [this.tempGovernance, this.registry] = await Promise.all([
    //   ethers.getContractAt('TemporaryGovernance', governanceAddress),
    //   ethers.getContractAt('Registry', REGISTRY_ADDRESS),
    // ]);
    // // TEST: skip to phase 2 starts

    // [this.registry, this.tempGovernance] = await Promise.all([
    //   ethers.getContractAt('Registry', REGISTRY_ADDRESS),
    //   ethers.getContractAt('TemporaryGovernance', this.tempGovernance.target),
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

    const newPoolAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_POOL);
    console.log('newPoolAddress: ', newPoolAddress);

    console.log('migrating pool');
    this.pool = await ethers.getContractAt('Pool', newPoolAddress);
    await this.pool.migrate(oldPoolAddress, this.mcr.target, { gasLimit: 21e6 });

    console.log('migrating master');
    this.master = await ethers.getContractAt('NXMaster', this.master.target);
    await this.tempGovernance.execute(
      this.master.target,
      0n,
      this.master.interface.encodeFunctionData('migrate', [this.registry.target]),
      { gasLimit: 21e6 },
    );

    // Check Pool has tokens
    console.log('checking pool balances');
    const poolAddr = newPoolAddress;
    const [usdcBal, cbBTCBal, rEthBal, stEthBal, awEthBal, enzymeBal] = await Promise.all([
      this.usdc.balanceOf(poolAddr),
      this.cbBTC.balanceOf(poolAddr),
      this.rEth.balanceOf(poolAddr),
      this.stEth.balanceOf(poolAddr),
      this.awEth.balanceOf(poolAddr),
      this.enzymeShares.balanceOf(poolAddr),
    ]);

    console.log('NEW POOL BALANCES:');
    console.log('USDC balance:', usdcBal.toString());
    console.log('cbBTC balance:', cbBTCBal.toString());
    console.log('rEth balance:', rEthBal.toString());
    console.log('stEth balance:', stEthBal.toString());
    console.log('awEth balance:', awEthBal.toString());
    console.log('enzymeShares balance:', enzymeBal.toString());

    // Check old pool balances to see if migration worked
    const [oldUsdcBal, oldCbBTCBal, oldREthBal, oldStEthBal, oldAwEthBal, oldEnzymeBal] = await Promise.all([
      this.usdc.balanceOf(oldPoolAddress),
      this.cbBTC.balanceOf(oldPoolAddress),
      this.rEth.balanceOf(oldPoolAddress),
      this.stEth.balanceOf(oldPoolAddress),
      this.awEth.balanceOf(oldPoolAddress),
      this.enzymeShares.balanceOf(oldPoolAddress),
    ]);

    console.log('OLD POOL BALANCES:');
    console.log('OLD USDC balance:', oldUsdcBal.toString());
    console.log('OLD cbBTC balance:', oldCbBTCBal.toString());
    console.log('OLD rEth balance:', oldREthBal.toString());
    console.log('OLD stEth balance:', oldStEthBal.toString());
    console.log('OLD awEth balance:', oldAwEthBal.toString());
    console.log('OLD enzymeShares balance:', oldEnzymeBal.toString());

    // TODO: fix old pool still has tokens
    // expect(usdcBal).to.not.equal(0n);
    // expect(cbBTCBal).to.not.equal(0n);
    // expect(rEthBal).to.not.equal(0n);
    // expect(stEthBal).to.not.equal(0n);
    // expect(awEthBal).to.not.equal(0n);
    // expect(enzymeBal).to.not.equal(0n);

    const assessmentAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_ASSESSMENT);
    this.assessment = await ethers.getContractAt('Assessment', assessmentAddress);
    console.log('assessmentAddress: ', assessmentAddress);

    const claimsAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_CLAIMS);
    this.claims = await ethers.getContractAt('Claims', claimsAddress);
    console.log('claimsAddress: ', claimsAddress);

    // TODO: set pool as old pool for now until its fixed

    console.log('Testing basic Assessment contract functions...');

    const currentGroupCount = await this.assessment.getGroupsCount();
    console.log('Current group count:', currentGroupCount.toString());
  });

  // Assessment and Claims
  require('./assessment-claims');
});

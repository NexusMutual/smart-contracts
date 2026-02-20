/* eslint-disable max-len */
const { ethers, network, nexus } = require('hardhat');
const { expect } = require('chai');
const { abis, addresses } = require('@nexusmutual/deployments');
const { takeSnapshot } = require('@nomicfoundation/hardhat-network-helpers');

const { revertToSnapshot, getSigner, setERC20Balance, executeGovernorProposal, getFundedSigner } = require('../utils');

const { parseEther, formatEther, toQuantity, deployContract } = ethers;
const { ContractIndexes } = nexus.constants;

/**
 * Helper to set balance, compatible with both hardhat and tenderly
 */
const setBalance = async (address, balance) => {
  const networkName = network.name === 'tenderly' ? 'tenderly' : 'hardhat';
  return ethers.provider.send(`${networkName}_setBalance`, [address, toQuantity(balance)]);
};

const ONE_DAY = 24n * 60n * 60n;
const EPOCH_DURATION = 70n * ONE_DAY;
const CHANGE_SLASH_RECEIVER_DELAY = 3n * ONE_DAY;

/**
 * Setup:
 *
 * network address == operator address == middleware address (SAFE multisig)
 * burnerRouter owner == burnerRouter receiver (SAFE multisig)
 *
 * 2 subnetworks, 1 operator, 4 vaults
 *
 * subnetwork1: vault1, vault2
 * subnetwork2: vault1, vault3, vault4
 */

// ADDRESSES

// mainnet
const SAFE_MULTISIG_NETWORK_OPERATOR_MIDDLEWARE = '0x51ad1265C8702c9e96Ea61Fe4088C2e22eD4418e';
// TODO: change to a different Safe Address + fix slash receive assertions in symbiotic-tests.js
const SAFE_MULTISIG_SLASH_RECEIVER = '0x51ad1265C8702c9e96Ea61Fe4088C2e22eD4418e';
const VAULT_CONFIGURATOR = '0x29300b1d3150B4E2b12fE80BE72f365E200441EC';
const WSTETH = '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0';
const OPERATOR_REGISTRY = '0xAd817a6Bc954F678451A71363f04150FDD81Af9F';
const NETWORK_REGISTRY = '0xC773b1011461e7314CF05f97d95aa8e92C1Fd8aA';
const OPERATOR_VAULT_OPTIN = '0xb361894bC06cbBA7Ea8098BF0e32EB1906A5F891';
const OPERATOR_NETWORK_OPTIN = '0x7133415b33B438843D581013f98A08704316633c';
const NETWORK_MIDDLEWARE_SERVICE = '0xD7dC9B366c027743D90761F71858BCa83C6899Ad';
const BURNER_ROUTER_FACTORY = '0x99F2B89fB3C363fBafD8d826E5AA77b28bAB70a0';
const SLASHER_HINTS_ADDR = '0x234148646D8C1762C793FD04385AfAD94998a4C7';

// ABIS
const VAULT_CONFIGURATOR_ABI = [
  'function create((uint64 version,address owner,bytes vaultParams,uint64 delegatorIndex,bytes delegatorParams,bool withSlasher,uint64 slasherIndex,bytes slasherParams) params) external returns (address vault,address delegator,address slasher)',
];

const VAULT_ABI = [
  'function owner() external view returns (address)',
  'function collateral() external view returns (address)',
  'function delegator() external view returns (address)',
  'function slasher() external view returns (address)',
  'function burner() external view returns (address)',
  'function activeStake() external view returns (uint256)',
  'function deposit(address onBehalfOf,uint256 amount) external returns (uint256 depositedAmount,uint256 mintedShares)',
  'function withdraw(address claimer,uint256 amount) external returns (uint256 burnedShares,uint256 mintedShares)',
  'function redeem(address claimer,uint256 shares) external returns (uint256 withdrawnAssets,uint256 mintedShares)',
  'function claim(address recipient,uint256 epoch) external returns (uint256 amount)',
  'function withdrawalsOf(uint256 epoch,address account) external view returns (uint256)',
  'function withdrawals(uint256 epoch) external view returns (uint256)',
  'function activeBalanceOf(address account) external view returns (uint256)',
  'function slashableBalanceOf(address account) external view returns (uint256)',
  'function totalStake() external view returns (uint256)',
  'function currentEpoch() external view returns (uint256)',
  'function currentEpochStart() public view returns (uint48)',
  'function nextEpochStart() public view returns (uint48)',
  'function epochDuration() external view returns (uint48)',
];

const NETWORK_REGISTRY_ABI = [
  'function registerNetwork() external',
  'function isEntity(address) external view returns (bool)',
];

const OPERATOR_REGISTRY_ABI = [
  'function registerOperator() external',
  'function isEntity(address) external view returns (bool)',
];

const DELEGATOR_ABI = [
  'function setMaxNetworkLimit(uint96 identifier,uint256 amount) external',
  'function setNetworkLimit(bytes32 subnetwork,uint256 amount) external',
  'function stake(bytes32 subnetwork,address operator) external view returns (uint256)',
  'function networkLimit(bytes32 subnetwork) public view returns (uint256)',
  'function maxNetworkLimit(bytes32 subnetwork) external view returns (uint256)',
];

const OPTIN_ABI = [
  'function optIn(address where) external',
  'function isOptedIn(address who,address where) external view returns (bool)',
];

const NETWORK_MIDDLEWARE_ABI = [
  'function setMiddleware(address middleware) external',
  'function middleware(address network) external view returns (address)',
];

const SLASHER_ABI = [
  'function slash(bytes32 subnetwork,address operator,uint256 amount,uint48 captureTimestamp,bytes hints) external',
  'function slashableStake(bytes32,address,uint48,bytes) external view returns (uint256)',
  'function vault() external view returns (address)',
];

const BURNER_ROUTER_FACTORY_ABI = [
  'function create((address owner, address collateral, uint48 delay, address globalReceiver, tuple(address network,address receiver)[] networkReceivers, tuple(address network,address operator,address receiver)[] operatorNetworkReceivers ) params) external returns (address)',
];

const BURNER_ROUTER_ABI = [
  'function triggerTransfer(address receiver) external returns (uint256 amount)',
  'function setGlobalReceiver(address receiver) external',
  'function setOperatorNetworkReceiver(address network,address operator,address receiver) external',
  'function operatorNetworkReceiver(address network, address operator) external view returns (address)',
  'function pendingOperatorNetworkReceiver(address network, address operator) external view returns (address, uint48)',
  'function acceptOperatorNetworkReceiver(address network, address operator) external',
  'function balanceOf(address receiver) external view returns (uint256)',
  'function lastBalance() external view returns (uint256)',
  'function onSlash(bytes32 subnetwork, address operator, uint256 amount, uint48 captureTimestamp) external',
];

const SLASHER_HINTS_ABI = [
  'function slashHints(address slasher, bytes32 subnetwork, address operator, uint48 captureTimestamp) external view returns (bytes)',
];

const WSTETH_ABI = [
  'function wrap(uint256 _stETHAmount) external returns (uint256)',
  'function balanceOf(address) external view returns (uint256)',
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function approve(address spender, uint256 amount) external returns (bool)',
];

const { defaultAbiCoder } = ethers.AbiCoder;

/**
 * Helper function to create vault init params
 */
function createVaultInitParams(burnerRouterAddr, admin) {
  return defaultAbiCoder().encode(
    [
      'tuple(address collateral,address burner,uint48 epochDuration,bool depositWhitelist,bool isDepositLimit,uint256 depositLimit,address defaultAdminRoleHolder,address depositWhitelistSetRoleHolder,address depositorWhitelistRoleHolder,address isDepositLimitSetRoleHolder,address depositLimitSetRoleHolder)',
    ],
    [
      [
        WSTETH,
        burnerRouterAddr,
        EPOCH_DURATION,
        false,
        false,
        0,
        admin,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
      ],
    ],
  );
}

/**
 * Helper function to create delegator init params for OperatorSpecificDelegator
 */
function createDelegatorInitParams(admin, operator) {
  return defaultAbiCoder().encode(
    [
      'tuple(tuple(address defaultAdminRoleHolder,address hook,address hookSetRoleHolder) baseParams,address[] networkLimitSetRoleHolders,address operator)',
    ],
    [[[admin, ethers.ZeroAddress, ethers.ZeroAddress], [admin], operator]],
  );
}

/**
 * Helper function to create slasher init params for instant slasher
 */
function createSlasherInitParams() {
  return defaultAbiCoder().encode(['tuple(bool isBurnerHook)'], [[true]]);
}

/**
 * Helper function to deploy a complete vault (vault + delegator + slasher)
 */
async function deployVault(vaultConfigurator, burnerRouterAddr, adminAddress, operator) {
  const vaultParams = {
    version: 1,
    owner: adminAddress,
    vaultParams: createVaultInitParams(burnerRouterAddr, adminAddress),
    delegatorIndex: 2, // OperatorSpecificDelegator (index 2)
    delegatorParams: createDelegatorInitParams(adminAddress, operator),
    withSlasher: true,
    slasherIndex: 0, // instant Slasher (index 0)
    slasherParams: createSlasherInitParams(),
  };

  const [vaultAddr, delegatorAddr, slasherAddr] = await vaultConfigurator.create.staticCall(vaultParams);
  await vaultConfigurator.create(vaultParams);

  const [vault, delegator, slasher] = await Promise.all([
    ethers.getContractAt(VAULT_ABI, vaultAddr),
    ethers.getContractAt(DELEGATOR_ABI, delegatorAddr),
    ethers.getContractAt(SLASHER_ABI, slasherAddr),
  ]);

  return { vault, delegator, slasher };
}

/**
 * Verifies that a deployed vault is wired to the expected owner, delegator, slasher and burner.
 */
async function verifyVaultDeployment(vaultNumber, vaultData, expectedOwner, expectedBurner) {
  const [ownerAddr, delegatorAddr, slasherAddr, burnerAddr] = await Promise.all([
    vaultData.vault.owner(),
    vaultData.vault.delegator(),
    vaultData.vault.slasher(),
    vaultData.vault.burner(),
  ]);

  expect(vaultData.vault.target).to.not.equal(ethers.ZeroAddress);
  expect(ownerAddr).to.equal(expectedOwner);
  expect(delegatorAddr).to.equal(vaultData.delegator.target);
  expect(slasherAddr).to.equal(vaultData.slasher.target);
  expect(burnerAddr).to.equal(expectedBurner);

  console.log(`Vault ${vaultNumber} deployed at:`, vaultData.vault.target);
  console.log(`Vault ${vaultNumber} slasher deployed at:`, vaultData.slasher.target);
  console.log(`Vault ${vaultNumber} delegator deployed at:`, vaultData.delegator.target);
  console.log(`Vault ${vaultNumber} burner set to:`, burnerAddr);
}

describe('Symbiotic Integration', function () {
  before(async function () {
    console.info('Network: ', network.name);
    if (network.name === 'tenderly') {
      const { TENDERLY_SNAPSHOT_ID } = process.env;
      if (TENDERLY_SNAPSHOT_ID) {
        console.info('Reverting to snapshot: ', TENDERLY_SNAPSHOT_ID);
        await revertToSnapshot(TENDERLY_SNAPSHOT_ID);
      } else {
        const { snapshotId } = await takeSnapshot();
        console.info('Snapshot ID: ', snapshotId);
      }
    }
  });

  it('load contracts', async function () {
    // nexus
    this.registry = await ethers.getContractAt(abis.Registry, addresses.Registry);
    this.governor = await ethers.getContractAt(abis.Governor, addresses.Governor);
    this.cover = await ethers.getContractAt(abis.Cover, addresses.Cover);
    // symbiotic
    this.vaultConfigurator = await ethers.getContractAt(VAULT_CONFIGURATOR_ABI, VAULT_CONFIGURATOR);
    this.operatorRegistry = await ethers.getContractAt(OPERATOR_REGISTRY_ABI, OPERATOR_REGISTRY);
    this.networkRegistry = await ethers.getContractAt(NETWORK_REGISTRY_ABI, NETWORK_REGISTRY);
    this.operatorVaultOptIn = await ethers.getContractAt(OPTIN_ABI, OPERATOR_VAULT_OPTIN);
    this.operatorNetworkOptIn = await ethers.getContractAt(OPTIN_ABI, OPERATOR_NETWORK_OPTIN);
    this.middlewareService = await ethers.getContractAt(NETWORK_MIDDLEWARE_ABI, NETWORK_MIDDLEWARE_SERVICE);
    this.burnerRouterFactory = await ethers.getContractAt(BURNER_ROUTER_FACTORY_ABI, BURNER_ROUTER_FACTORY);
    this.slasherHints = await ethers.getContractAt(SLASHER_HINTS_ABI, SLASHER_HINTS_ADDR);
    // erc20
    this.wstETH = await ethers.getContractAt(WSTETH_ABI, WSTETH);
  });

  it('load accounts and set balances', async function () {
    this.safeMultisigNetwork = await getSigner(SAFE_MULTISIG_NETWORK_OPERATOR_MIDDLEWARE);
    this.safeSlashReceiver = await getSigner(SAFE_MULTISIG_SLASH_RECEIVER);
    [this.staker1, this.staker2, this.staker3, this.staker4, this.staker5, this.staker6, this.staker7, this.staker8] =
      await ethers.getSigners();

    // tenderly bug workaround
    if (!this.staker1) {
      this.staker1 = await getSigner('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
    }
    if (!this.staker2) {
      this.staker2 = await getSigner('0x26e25C69035C31A1C81973f69c499986dC5e632D');
    }
    if (!this.staker3) {
      this.staker3 = await getSigner('0xbaE4E275515a76c6f365d776804256F65f1e9fCf');
    }
    if (!this.staker4) {
      this.staker4 = await getSigner('0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be');
    }
    if (!this.staker5) {
      this.staker5 = await getSigner('0x90f79bf6eb2c4f870365e785982e1f101e93b906');
    }
    if (!this.staker6) {
      this.staker6 = await getSigner('0x15d34aaf54267db7d7c367839aaf71a00a2c6a65');
    }
    if (!this.staker7) {
      this.staker7 = await getSigner('0x2F4A22a95e88D75eD7DC8FbEDc4EbD212A618CAb');
    }
    if (!this.staker8) {
      this.staker8 = await getSigner('0x4838B106FCe9647Bdf1E7877BF73cE8B0BAD5f97');
    }

    const stakers = [
      this.staker1,
      this.staker2,
      this.staker3,
      this.staker4,
      this.staker5,
      this.staker6,
      this.staker7,
      this.staker8,
    ];

    const stakerAmounts = [
      parseEther('20000'),
      parseEther('10000'),
      parseEther('10000'),
      parseEther('10000'),
      parseEther('10000'),
      parseEther('10000'),
      parseEther('10000'),
      parseEther('10000'),
    ];

    // Set ETH balances for gas
    await Promise.all([
      setBalance(SAFE_MULTISIG_NETWORK_OPERATOR_MIDDLEWARE, parseEther('10')),
      ...stakers.map(staker => setBalance(staker.address, parseEther('10'))),
    ]);

    // Set wstETH balances
    await Promise.all(stakers.map((staker, index) => setERC20Balance(WSTETH, staker.address, stakerAmounts[index])));

    const actualBalances = await Promise.all(stakers.map(staker => this.wstETH.balanceOf(staker.address)));

    stakers.forEach((staker, index) => {
      const expectedAmount = stakerAmounts[index];
      const actualAmount = actualBalances[index];
      expect(actualAmount).to.equal(expectedAmount);
      console.log(
        `Staker ${index + 1} wstETH balance: ${formatEther(actualAmount)} (expected: ${formatEther(expectedAmount)})`,
      );
    });
  });

  it('Impersonate AB members', async function () {
    const boardSeats = await this.registry.ADVISORY_BOARD_SEATS();
    this.abMembers = [];
    for (let i = 1; i <= boardSeats; i++) {
      const address = await this.registry.getMemberAddressBySeat(i);
      this.abMembers.push(await getFundedSigner(address));
    }
  });

  it('Upgrade Cover contract', async function () {
    const coverProxy = await ethers.getContractAt('UpgradeableProxy', addresses.Cover);
    const coverImplementationBefore = await coverProxy.implementation();

    const stakingPoolImplementation = '0xcafeade1872f14adc0a03Ec7b0088b61D76ec729';
    const coverImplementation = await deployContract('Cover', [
      this.registry.target,
      stakingPoolImplementation,
      coverProxy.target,
    ]);

    const coverAddress = await coverImplementation.getAddress();
    const transactions = [
      {
        target: this.registry,
        value: 0n,
        data: this.registry.interface.encodeFunctionData('upgradeContract', [ContractIndexes.C_COVER, coverAddress]),
      },
    ];

    await executeGovernorProposal(this.governor, this.abMembers, transactions);

    const coverImplementationAfter = await coverProxy.implementation();
    expect(coverImplementationAfter).to.not.equal(coverImplementationBefore);
    expect(coverImplementationAfter).to.equal(coverImplementation.target);
    console.log('Cover implementation upgraded to:', coverImplementation.target);

    const governorSigner = await getFundedSigner(addresses.Governor);

    // set RI rewards receiver for SYMBIOTIC_PROVIDER_ID
    const SYMBIOTIC_PROVIDER_ID = 1;
    await this.cover
      .connect(governorSigner)
      .setRiConfig(SYMBIOTIC_PROVIDER_ID, SAFE_MULTISIG_NETWORK_OPERATOR_MIDDLEWARE);
    console.log(`ProviderId ${SYMBIOTIC_PROVIDER_ID} rewards receiver:`, SAFE_MULTISIG_NETWORK_OPERATOR_MIDDLEWARE);

    // TODO:
    // set RI quote signer
    // const RI_QUOTE_SIGNER = '0x';
    // await this.cover.connect(governorSigner).setRiSigner(RI_QUOTE_SIGNER);
    // console.log(`ProviderId ${SYMBIOTIC_PROVIDER_ID} quote signer:`, RI_QUOTE_SIGNER);
  });

  it('deploy burner router', async function () {
    const initParams = {
      owner: SAFE_MULTISIG_NETWORK_OPERATOR_MIDDLEWARE, // this.burnerRouterOwner
      collateral: WSTETH,
      delay: CHANGE_SLASH_RECEIVER_DELAY,
      globalReceiver: SAFE_MULTISIG_SLASH_RECEIVER, // default receiver
      networkReceivers: [
        {
          network: SAFE_MULTISIG_NETWORK_OPERATOR_MIDDLEWARE, // Nexus network
          receiver: SAFE_MULTISIG_SLASH_RECEIVER, // Slash receiver
        },
      ],
      operatorNetworkReceivers: [
        {
          network: SAFE_MULTISIG_NETWORK_OPERATOR_MIDDLEWARE, // Nexus network
          operator: SAFE_MULTISIG_NETWORK_OPERATOR_MIDDLEWARE, // Nexus operator
          receiver: SAFE_MULTISIG_SLASH_RECEIVER, // Slash receiver
        },
      ],
    };
    this.burnerRouterAddr = await this.burnerRouterFactory.create.staticCall(initParams);
    await this.burnerRouterFactory.create(initParams);
    this.burnerRouterOwner = this.safeMultisigNetwork;

    this.burnerRouter = await ethers.getContractAt(BURNER_ROUTER_ABI, this.burnerRouterAddr, this.safeMultisigNetwork);

    console.log('BurnerRouter deployed at:', this.burnerRouter.target);
  });

  it('register network/operator and set middleware slasher of Network', async function () {
    // network == operator == middleware for MVP
    this.network = this.safeMultisigNetwork;
    this.operator1 = this.safeMultisigNetwork;
    this.middleware = this.safeMultisigNetwork;

    await Promise.all([
      this.networkRegistry.connect(this.network).registerNetwork(),
      this.operatorRegistry.connect(this.operator1).registerOperator(),
    ]);

    expect(await this.networkRegistry.isEntity(this.network.address)).to.equal(true);
    expect(await this.operatorRegistry.isEntity(this.operator1.address)).to.equal(true);

    // set middleware slasher of Network - needs to be called from registered Network address
    await this.middlewareService.connect(this.network).setMiddleware(this.middleware.address);

    expect(await this.middlewareService.middleware(this.network.address)).to.equal(this.middleware.address);
    console.log('Middleware slasher set to:', this.middleware.address);
  });

  /**
   * @see https://github.com/symbioticfi/core/blob/7cb06639c5cd656d1d212dafa2c270b5fde39306/src/contracts/libraries/Subnetwork.sol#L9
   */
  it('get subnetwork 1 and 2', async function () {
    this.subnetwork1Id = 1;
    this.subnetwork2Id = 2;
    this.subnetwork1 = ethers.solidityPacked(['address', 'uint96'], [this.network.address, this.subnetwork1Id]);
    this.subnetwork2 = ethers.solidityPacked(['address', 'uint96'], [this.network.address, this.subnetwork2Id]);
    console.log('Subnetwork 1:', this.subnetwork1);
    console.log('Subnetwork 2:', this.subnetwork2);
  });

  it('deploy all vaults successfully', async function () {
    const vaultAdmin = this.safeMultisigNetwork;
    const delegatorAdmin = this.safeMultisigNetwork;
    const operatorAddress = this.operator1.address;

    const deployedVault1 = await deployVault(
      this.vaultConfigurator,
      this.burnerRouterAddr,
      vaultAdmin.address,
      operatorAddress,
    );
    this.vault1 = { ...deployedVault1, admin: vaultAdmin, delegatorAdmin };
    await verifyVaultDeployment(1, this.vault1, vaultAdmin.address, this.burnerRouterAddr);
    console.log('Vault 1 operator:', operatorAddress);

    const deployedVault2 = await deployVault(
      this.vaultConfigurator,
      this.burnerRouterAddr,
      vaultAdmin.address,
      operatorAddress,
    );
    this.vault2 = { ...deployedVault2, admin: vaultAdmin, delegatorAdmin };
    await verifyVaultDeployment(2, this.vault2, vaultAdmin.address, this.burnerRouterAddr);
    console.log('Vault 2 operator:', operatorAddress);

    const deployedVault3 = await deployVault(
      this.vaultConfigurator,
      this.burnerRouterAddr,
      vaultAdmin.address,
      operatorAddress,
    );
    this.vault3 = { ...deployedVault3, admin: vaultAdmin, delegatorAdmin };
    await verifyVaultDeployment(3, this.vault3, vaultAdmin.address, this.burnerRouterAddr);
    console.log('Vault 3 operator:', operatorAddress);

    const deployedVault4 = await deployVault(
      this.vaultConfigurator,
      this.burnerRouterAddr,
      vaultAdmin.address,
      operatorAddress,
    );
    this.vault4 = { ...deployedVault4, admin: vaultAdmin, delegatorAdmin };
    await verifyVaultDeployment(4, this.vault4, vaultAdmin.address, this.burnerRouterAddr);
    console.log('Vault 4 operator:', operatorAddress);
  });

  it('stake in vaults - 2 stakers per vault', async function () {
    // Vault 1: staker1 (20000 wstETH), staker2 (10000 wstETH) = 30K total
    const staker1Vault1Amount = parseEther('20000');
    const staker2Vault1Amount = parseEther('10000');

    // Vault 2: staker3 (10000 wstETH), staker4 (10000 wstETH) = 20K total
    const staker3Vault2Amount = parseEther('10000');
    const staker4Vault2Amount = parseEther('10000');

    // Vault 3: staker5 (10000 wstETH), staker6 (10000 wstETH) = 20K total
    const staker5Vault3Amount = parseEther('10000');
    const staker6Vault3Amount = parseEther('10000');

    // Vault 4: staker7 (10000 wstETH), staker8 (10000 wstETH) = 20K total
    const staker7Vault4Amount = parseEther('10000');
    const staker8Vault4Amount = parseEther('10000');

    await Promise.all([
      this.wstETH.connect(this.staker1).approve(this.vault1.vault.target, staker1Vault1Amount),
      this.wstETH.connect(this.staker2).approve(this.vault1.vault.target, staker2Vault1Amount),
      this.wstETH.connect(this.staker3).approve(this.vault2.vault.target, staker3Vault2Amount),
      this.wstETH.connect(this.staker4).approve(this.vault2.vault.target, staker4Vault2Amount),
      this.wstETH.connect(this.staker5).approve(this.vault3.vault.target, staker5Vault3Amount),
      this.wstETH.connect(this.staker6).approve(this.vault3.vault.target, staker6Vault3Amount),
      this.wstETH.connect(this.staker7).approve(this.vault4.vault.target, staker7Vault4Amount),
      this.wstETH.connect(this.staker8).approve(this.vault4.vault.target, staker8Vault4Amount),
    ]);

    await Promise.all([
      this.vault1.vault.connect(this.staker1).deposit(this.staker1.address, staker1Vault1Amount), // vault 1 - staker 1 & 2
      this.vault1.vault.connect(this.staker2).deposit(this.staker2.address, staker2Vault1Amount), // vault 1 - staker 1 & 2
      this.vault2.vault.connect(this.staker3).deposit(this.staker3.address, staker3Vault2Amount), // vault 2 - staker 3 & 4
      this.vault2.vault.connect(this.staker4).deposit(this.staker4.address, staker4Vault2Amount), // vault 2 - staker 3 & 4
      this.vault3.vault.connect(this.staker5).deposit(this.staker5.address, staker5Vault3Amount), // vault 3 - staker 5 & 6
      this.vault3.vault.connect(this.staker6).deposit(this.staker6.address, staker6Vault3Amount), // vault 3 - staker 5 & 6
      this.vault4.vault.connect(this.staker7).deposit(this.staker7.address, staker7Vault4Amount), // vault 4 - staker 7 & 8
      this.vault4.vault.connect(this.staker8).deposit(this.staker8.address, staker8Vault4Amount), // vault 4 - staker 7 & 8
    ]);

    const [vault1ActiveStake, vault2ActiveStake, vault3ActiveStake, vault4ActiveStake] = await Promise.all([
      this.vault1.vault.activeStake(),
      this.vault2.vault.activeStake(),
      this.vault3.vault.activeStake(),
      this.vault4.vault.activeStake(),
    ]);

    expect(vault1ActiveStake).to.equal(staker1Vault1Amount + staker2Vault1Amount); // 30K
    expect(vault2ActiveStake).to.equal(staker3Vault2Amount + staker4Vault2Amount); // 20K
    expect(vault3ActiveStake).to.equal(staker5Vault3Amount + staker6Vault3Amount); // 20K
    expect(vault4ActiveStake).to.equal(staker7Vault4Amount + staker8Vault4Amount); // 20K

    console.log(`Vault 1 total stake: ${formatEther(vault1ActiveStake)} wstETH`);
    console.log(`  Staker 1: ${formatEther(staker1Vault1Amount)} wstETH`);
    console.log(`  Staker 2: ${formatEther(staker2Vault1Amount)} wstETH`);
    console.log(`Vault 2 total stake: ${formatEther(vault2ActiveStake)} wstETH`);
    console.log(`  Staker 3: ${formatEther(staker3Vault2Amount)} wstETH`);
    console.log(`  Staker 4: ${formatEther(staker4Vault2Amount)} wstETH`);
    console.log(`Vault 3 total stake: ${formatEther(vault3ActiveStake)} wstETH`);
    console.log(`  Staker 5: ${formatEther(staker5Vault3Amount)} wstETH`);
    console.log(`  Staker 6: ${formatEther(staker6Vault3Amount)} wstETH`);
    console.log(`Vault 4 total stake: ${formatEther(vault4ActiveStake)} wstETH`);
    console.log(`  Staker 7: ${formatEther(staker7Vault4Amount)} wstETH`);
    console.log(`  Staker 8: ${formatEther(staker8Vault4Amount)} wstETH`);
  });

  it('network, operator and vault opt ins', async function () {
    await Promise.all([
      this.operatorNetworkOptIn.connect(this.operator1).optIn(this.network.address),
      this.operatorVaultOptIn.connect(this.operator1).optIn(this.vault1.vault.target),
      this.operatorVaultOptIn.connect(this.operator1).optIn(this.vault2.vault.target),
      this.operatorVaultOptIn.connect(this.operator1).optIn(this.vault3.vault.target),
      this.operatorVaultOptIn.connect(this.operator1).optIn(this.vault4.vault.target),
    ]);

    expect(await this.operatorVaultOptIn.isOptedIn(this.operator1.address, this.vault1Addr)).to.equal(true);
    expect(await this.operatorVaultOptIn.isOptedIn(this.operator1.address, this.vault2Addr)).to.equal(true);
    expect(await this.operatorVaultOptIn.isOptedIn(this.operator1.address, this.vault3Addr)).to.equal(true);
    expect(await this.operatorVaultOptIn.isOptedIn(this.operator1.address, this.vault4Addr)).to.equal(true);
    expect(
      await this.operatorNetworkOptIn.isOptedIn(this.operator1.address, SAFE_MULTISIG_NETWORK_OPERATOR_MIDDLEWARE),
    ).to.equal(true);

    console.log('Operator 1 opted in vault 1, vault 2, vault 3 and vault 4');
  });

  it('subnetwork 1 - vault 1 and vault 2 allocation', async function () {
    // vault 1: setMaxNetworkLimit and setNetworkLimit (20K to subnetwork 1, 10K left for subnetwork 2)
    const vault1Subnetwork1Stake = parseEther('20000');
    await this.vault1.delegator.connect(this.network).setMaxNetworkLimit(this.subnetwork1Id, vault1Subnetwork1Stake);
    await this.vault1.delegator.connect(this.vault1.admin).setNetworkLimit(this.subnetwork1, vault1Subnetwork1Stake);

    // vault 2: setMaxNetworkLimit and setNetworkLimit (20K to subnetwork 1)
    const vault2TotalStake = parseEther('20000');
    await this.vault2.delegator.connect(this.network).setMaxNetworkLimit(this.subnetwork1Id, vault2TotalStake);
    await this.vault2.delegator.connect(this.vault2.admin).setNetworkLimit(this.subnetwork1, vault2TotalStake);

    // verify stakes for both vaults in subnetwork 1 (both use operator1)
    const [vault1Stake, vault2Stake] = await Promise.all([
      this.vault1.delegator.stake(this.subnetwork1, this.operator1.address),
      this.vault2.delegator.stake(this.subnetwork1, this.operator1.address),
    ]);

    expect(vault1Stake).to.be.equal(vault1Subnetwork1Stake);
    expect(vault2Stake).to.be.equal(vault2TotalStake);

    console.log(`Vault 1 delegated stake to subnetwork 1: ${formatEther(vault1Stake)} wstETH`);
    console.log(`Vault 2 delegated stake to subnetwork 1: ${formatEther(vault2Stake)} wstETH`);
  });

  it('subnetwork 2 - vault 1, vault 3 and vault 4 allocation', async function () {
    // vault 1: allocate additional 10K to subnetwork 2
    const vault1Subnetwork2Stake = parseEther('10000');
    await this.vault1.delegator.connect(this.network).setMaxNetworkLimit(this.subnetwork2Id, vault1Subnetwork2Stake);
    await this.vault1.delegator.connect(this.vault1.admin).setNetworkLimit(this.subnetwork2, vault1Subnetwork2Stake);

    // vault 3: setMaxNetworkLimit and setNetworkLimit (20K to subnetwork 2)
    const vault3TotalStake = parseEther('20000');
    await this.vault3.delegator.connect(this.network).setMaxNetworkLimit(this.subnetwork2Id, vault3TotalStake);
    await this.vault3.delegator.connect(this.vault3.admin).setNetworkLimit(this.subnetwork2, vault3TotalStake);

    // vault 4: setMaxNetworkLimit and setNetworkLimit (20K to subnetwork 2)
    const vault4TotalStake = parseEther('20000');
    await this.vault4.delegator.connect(this.network).setMaxNetworkLimit(this.subnetwork2Id, vault4TotalStake);
    await this.vault4.delegator.connect(this.vault4.admin).setNetworkLimit(this.subnetwork2, vault4TotalStake);

    // verify stakes for all vaults in subnetwork 2
    const [vault1StakeSubnetwork2, vault3Stake, vault4Stake] = await Promise.all([
      this.vault1.delegator.stake(this.subnetwork2, this.operator1.address),
      this.vault3.delegator.stake(this.subnetwork2, this.operator1.address),
      this.vault4.delegator.stake(this.subnetwork2, this.operator1.address),
    ]);

    expect(vault1StakeSubnetwork2).to.be.equal(vault1Subnetwork2Stake);
    expect(vault3Stake).to.be.equal(vault3TotalStake);
    expect(vault4Stake).to.be.equal(vault4TotalStake);

    console.log(`Vault 1 delegated stake to subnetwork 2: ${formatEther(vault1StakeSubnetwork2)} wstETH`);
    console.log(`Vault 3 delegated stake to subnetwork 2: ${formatEther(vault3Stake)} wstETH`);
    console.log(`Vault 4 delegated stake to subnetwork 2: ${formatEther(vault4Stake)} wstETH`);

    const { snapshotId } = await takeSnapshot();
    console.info('Symbiotic Setup Done Snapshot ID: ', snapshotId);
  });

  require('./symbiotic-tests');
});

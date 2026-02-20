const { ethers, network } = require('hardhat');
const { expect } = require('chai');
const { takeSnapshot } = require('@nomicfoundation/hardhat-network-helpers');

const { createSafeExecutor, revertToSnapshot } = require('../utils');

const SAFE_MULTISIG_NETWORK_OPERATOR_MIDDLEWARE = '0xF99aA6479Eb153dcA93fd243A06caCD11f3268f9';
const OPERATOR_REGISTRY = '0xAd817a6Bc954F678451A71363f04150FDD81Af9F';
const NETWORK_REGISTRY = '0xC773b1011461e7314CF05f97d95aa8e92C1Fd8aA';
const OPERATOR_NETWORK_OPTIN = '0x7133415b33B438843D581013f98A08704316633c';
const NETWORK_MIDDLEWARE_SERVICE = '0xD7dC9B366c027743D90761F71858BCa83C6899Ad';

const NETWORK_REGISTRY_ABI = [
  'function registerNetwork() external',
  'function isEntity(address) external view returns (bool)',
];
const OPERATOR_REGISTRY_ABI = [
  'function registerOperator() external',
  'function isEntity(address) external view returns (bool)',
];
const NETWORK_MIDDLEWARE_ABI = [
  'function setMiddleware(address middleware) external',
  'function middleware(address network) external view returns (address)',
];
const OPTIN_ABI = [
  'function optIn(address where) external',
  'function isOptedIn(address who,address where) external view returns (bool)',
];

describe('Symbiotic setup via Safe multisend', function () {
  before('Tenderly snapshot', async function () {
    console.info('Network:', network.name);
    if (network.name !== 'tenderly') {
      return;
    }

    const { TENDERLY_SNAPSHOT_ID } = process.env;
    if (TENDERLY_SNAPSHOT_ID) {
      console.info('Reverting to snapshot:', TENDERLY_SNAPSHOT_ID);
      await revertToSnapshot(TENDERLY_SNAPSHOT_ID);
      return;
    }

    const { snapshotId } = await takeSnapshot();
    console.info('Snapshot ID:', snapshotId);
  });

  before('Load contracts', async function () {
    this.networkRegistry = await ethers.getContractAt(NETWORK_REGISTRY_ABI, NETWORK_REGISTRY);
    this.operatorRegistry = await ethers.getContractAt(OPERATOR_REGISTRY_ABI, OPERATOR_REGISTRY);
    this.middlewareService = await ethers.getContractAt(NETWORK_MIDDLEWARE_ABI, NETWORK_MIDDLEWARE_SERVICE);
    this.operatorNetworkOptIn = await ethers.getContractAt(OPTIN_ABI, OPERATOR_NETWORK_OPTIN);
    this.executeSafeTransaction = await createSafeExecutor(SAFE_MULTISIG_NETWORK_OPERATOR_MIDDLEWARE);
  });

  it('executes register/setMiddleware/optIn through Safe in one multisend', async function () {
    if (!this.executeSafeTransaction) {
      console.info(`Skipping: SAFE not deployed at ${SAFE_MULTISIG_NETWORK_OPERATOR_MIDDLEWARE} on ${network.name}`);
      this.skip();
    }

    const registerNetworkData = this.networkRegistry.interface.encodeFunctionData('registerNetwork');
    const registerOperatorData = this.operatorRegistry.interface.encodeFunctionData('registerOperator');
    const setMiddlewareData = this.middlewareService.interface.encodeFunctionData('setMiddleware', [
      SAFE_MULTISIG_NETWORK_OPERATOR_MIDDLEWARE,
    ]);
    const operatorNetworkOptInData = this.operatorNetworkOptIn.interface.encodeFunctionData('optIn', [
      SAFE_MULTISIG_NETWORK_OPERATOR_MIDDLEWARE,
    ]);

    const safeInnerTxs = [
      { to: NETWORK_REGISTRY, data: registerNetworkData },
      { to: OPERATOR_REGISTRY, data: registerOperatorData },
      { to: NETWORK_MIDDLEWARE_SERVICE, data: setMiddlewareData },
      { to: OPERATOR_NETWORK_OPTIN, data: operatorNetworkOptInData },
    ];

    console.log('Safe inner txs:', safeInnerTxs);

    const safeTx = await this.executeSafeTransaction(safeInnerTxs);
    const safeReceipt = await safeTx.wait();
    expect(safeReceipt.status).to.equal(1n);
    console.log('Safe execution tx hash:', safeTx.hash);

    const middlewareAddress = await this.middlewareService.middleware(SAFE_MULTISIG_NETWORK_OPERATOR_MIDDLEWARE);
    const operator1Address = SAFE_MULTISIG_NETWORK_OPERATOR_MIDDLEWARE;
    const optedIn = await this.operatorNetworkOptIn.isOptedIn(
      operator1Address,
      SAFE_MULTISIG_NETWORK_OPERATOR_MIDDLEWARE,
    );

    expect(middlewareAddress).to.equal(SAFE_MULTISIG_NETWORK_OPERATOR_MIDDLEWARE);
    expect(optedIn).to.equal(true);
    expect(await this.networkRegistry.isEntity(SAFE_MULTISIG_NETWORK_OPERATOR_MIDDLEWARE)).to.equal(true);
    expect(await this.operatorRegistry.isEntity(SAFE_MULTISIG_NETWORK_OPERATOR_MIDDLEWARE)).to.equal(true);
  });
});

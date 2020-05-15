require('dotenv').config();

const HDWalletProvider = require('@truffle/hdwallet-provider');
const { ether } = require('@openzeppelin/test-helpers');
const { setupLoader } = require('@openzeppelin/contract-loader');

const { hex } = require('../test/utils/helpers');
const { ParamType, Role } = require('../test/utils/constants');

function getenv (key, fallback = false) {

  const value = process.env[key] || fallback;

  if (!value) {
    throw new Error(`Missing env var: ${key}`);
  }

  return value;
}

const init = async () => {

  const { NETWORK = 'KOVAN' } = process.env;
  console.log(`Using ${NETWORK} network`);

  const account = getenv(`${NETWORK}_ACCOUNT`);
  const mnemonic = getenv(`${NETWORK}_MNEMONIC`);
  const providerURL = getenv(`${NETWORK}_PROVIDER_URL`);

  const provider = new HDWalletProvider(mnemonic, providerURL);

  const loader = setupLoader({
    provider,
    defaultSender: account,
    defaultGas: 1e6, // 1 million
    defaultGasPrice: 5e9, // 5 gwei
  }).truffle;

  return { account, provider, loader };
};

const deploy = async (loader, contract) => {

  const Contract = loader.fromArtifact(contract);
  const gasEstimate = await Contract.new.estimateGas();
  const instance = await Contract.new({ gas: gasEstimate });

  console.log(`${contract} deployed at ${instance.address}`);

  return instance;
};

async function run () {

  const { account, loader } = await init();

  console.log('Deploying contracts');
  const master = await deploy(loader, 'MasterMock');
  const staking = await deploy(loader, 'PooledStaking');
  const token = await deploy(loader, 'TokenMock');
  const tokenController = await deploy(loader, 'TokenControllerMock');

  const mintAmount = '10000';
  console.log(`Minting ${mintAmount} NXM to ${account}`);
  await token.mint(account, ether(mintAmount));

  // set contract addresses
  console.log('Adding contracts to master');
  await master.setTokenAddress(token.address);
  await master.setLatestAddress(hex('TC'), tokenController.address);

  console.log('Enrolling addresses');
  await master.enrollInternal(staking.address);
  await master.enrollMember(account, Role.Owner);
  await master.enrollGovernance(account);

  // set master address
  console.log('Setting up contracts');
  await staking.changeMasterAddress(master.address);
  await tokenController.changeMasterAddress(master.address);
  await staking.changeDependentContractAddress();
  await tokenController.changeDependentContractAddress();

  // revert initialized values for unit tests
  console.log('Set pooled staking parameters');
  await staking.updateParameter(ParamType.MIN_ALLOCATION, 20);
  await staking.updateParameter(ParamType.MIN_ALLOWED_DEALLOCATION, 20);
  await staking.updateParameter(ParamType.MAX_LEVERAGE, 2);
  await staking.updateParameter(ParamType.DEALLOCATE_LOCK_TIME, 300); // 5 minutes
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('An unexpected error encountered:', error);
    process.exit(1);
  });

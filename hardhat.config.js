require('dotenv').config();
require('@nomiclabs/hardhat-web3');
require('@nomiclabs/hardhat-truffle5');
require('@nomiclabs/hardhat-etherscan');
require('@nomiclabs/hardhat-waffle');
require('solidity-coverage');
require('hardhat-contract-sizer');

const { task } = require('hardhat/config');
const ether = n => `${n}${'0'.repeat(18)}`;

task('test', async (_, hre, runSuper) => {
  hre.accounts = await hre.web3.eth.getAccounts();
  const testFiles = _.testFiles.length ? _.testFiles : ['./test/index.js'];
  await runSuper({ testFiles });
});

task('typechain', async (_, { config }) => {
  const { tsGenerator } = require('ts-generator');
  const { TypeChain } = require('typechain/dist/TypeChain');

  const cwd = process.cwd();
  const rawConfig = {
    files: `${config.paths.artifacts}/!(build-info|hardhat)/**/+([a-zA-Z0-9]).json`,
    outDir: 'types',
    target: 'truffle-v5',
  };

  await tsGenerator({ cwd }, new TypeChain({ cwd, rawConfig }));
});

const networks = {
  hardhat: {
    accounts: {
      count: 100,
      accountsBalance: ether(1000000000),
    },
    // TODO: fix tests with gasPrice = 0 and remove the hardfork param
    hardfork: 'berlin',
    allowUnlimitedContractSize: true,
    blockGasLimit: 12e6,
    gas: 12e6,
  },
  localhost: {
    blockGasLimit: 21e6,
    gas: 21e6,
  },
};

if (process.env.TEST_ENV_FORK) {
  networks.hardhat.forking = { url: process.env.TEST_ENV_FORK };
}

const getenv = (network, key, fallback, parser = i => i) => {
  const value = process.env[`${network}_${key}`];
  return value ? parser(value) : fallback;
};

for (const network of ['MAINNET', 'KOVAN', 'RINKEBY', 'TENDERLY', 'LOCALHOST']) {
  const url = getenv(network, 'PROVIDER_URL', false);
  if (!url) continue;
  const accounts = getenv(network, 'ACCOUNT_KEY', undefined, v => v.split(/[^0-9a-fx]+/i));
  const gasPrice = getenv(network, 'GAS_PRICE', undefined, v => parseInt(v, 10) * 1e9);
  const gas = getenv(network, 'GAS_LIMIT', undefined, v => parseInt(v, 10));
  networks[network.toLowerCase()] = { accounts, gasPrice, gas, url };
}

const compilerSettings = process.env.ENABLE_OPTIMIZER ? { optimizer: { enabled: true, runs: 200 } } : {};

module.exports = {
  contractSizer: {
    alphaSort: true,
    runOnCompile: false,
    disambiguatePaths: false,
  },

  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },

  mocha: {
    exit: true,
    bail: false,
    recursive: false,
    timeout: 60 * 60 * 60, // 1 hour
  },

  networks,

  solidity: {
    compilers: [
      { settings: compilerSettings, version: '0.5.17' }, // nexus mutual v1
      { settings: compilerSettings, version: '0.5.16' }, // uniswap v2 core
      { settings: compilerSettings, version: '0.6.6' }, // uniswap v2 peripherals,
      { settings: compilerSettings, version: '0.8.4' }, // nexus mutual v2
    ],
    overrides: {
      'contracts/modules/governance/Governance.sol': {
        settings: compilerSettings,
        version: '0.5.7',
      },
    },
  },
};

require('dotenv').config();
require('@typechain/hardhat');
require('@nomiclabs/hardhat-etherscan');
require('@nomicfoundation/hardhat-chai-matchers');
require('solidity-coverage');
require('hardhat-contract-sizer');
require('hardhat-tracer');
require('hardhat-ignore-warnings');

require('./tasks');

/** @type import('hardhat/config').HardhatUserConfig */
const config = {
  contractSizer: {
    alphaSort: true,
    runOnCompile: false,
    disambiguatePaths: false,
  },

  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },

  typechain: {
    target: 'ethers-v5',
    outDir: 'types',
    alwaysGenerateOverloads: false,
    dontOverrideCompile: true, // defaults to false
  },

  mocha: {
    exit: true,
    bail: false,
    recursive: false,
    timeout: 0,
    slow: 5000,
    jobs: Number(process.env.MOCHA_JOBS) || 3,
  },

  networks: require('./networks'),

  solidity: require('./solidity'),

  warnings: {
    '*': {
      'code-size': process.env.ENABLE_OPTIMIZER ? 'error' : 'warn',
      default: 'error',
    },
  },
};

if (process.env.ENABLE_TENDERLY) {
  const tenderly = require('@tenderly/hardhat-tenderly');
  tenderly.setup({ automaticVerifications: false });

  config.tenderly = {
    username: 'NexusMutual',
    project: 'nexusmutual',
    forkNetwork: 'mainnet',
    deploymentsDir: 'deployments',
    // privateVerification: false,
  };
}

module.exports = config;

const path = require('node:path');

// ensure .env is loaded even if cwd is not the project root
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

require('@nomicfoundation/hardhat-ethers');
require('@nomicfoundation/hardhat-chai-matchers');
require('@nomicfoundation/hardhat-verify');
require('@nomicfoundation/hardhat-network-helpers');
require('@typechain/hardhat');
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
    target: 'ethers-v6',
    outDir: 'types',
    alwaysGenerateOverloads: false,
    dontOverrideCompile: true, // defaults to false
  },

  mocha: {
    bail: false,
    exit: true,
    jobs: Number(process.env.MOCHA_JOBS) || undefined,
    parallel: true,
    slow: 5000,
    timeout: 0,
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
  // const tenderly = require('@tenderly/hardhat-tenderly');
  // tenderly.setup({ automaticVerifications: false });
  // config.tenderly = {
  //   username: 'NexusMutual',
  //   project: 'nexusmutual',
  //   forkNetwork: 'mainnet',
  //   deploymentsDir: 'deployments',
  //   // privateVerification: false,
  // };
}

module.exports = config;

require('@nomiclabs/hardhat-web3');
require('@nomiclabs/hardhat-truffle5');
require('hardhat-typechain');

const { task } = require('hardhat/config');
const { toWei } = require('web3').utils;

task('test', async (_, hre, runSuper) => {
  hre.accounts = await hre.web3.eth.getAccounts();
  const testFiles = _.testFiles.length ? _.testFiles : ['./test/index.js'];
  await runSuper({ testFiles });
});

const hardhatNetworkConfig = {
  accounts: {
    count: 100,
    accountsBalance: toWei('10000000000'),
  },
  allowUnlimitedContractSize: true,
  blockGasLimit: 12e9,
};

if (process.env.TEST_ENV_FORK) {
  hardhatNetworkConfig.forking = {
    url: process.env.TEST_ENV_FORK
  };
};

module.exports = {

  mocha: {
    exit: true,
    bail: true,
    recursive: false,
  },

  networks: {
    hardhat: hardhatNetworkConfig
  },

  solidity: {
    compilers: [
      { version: '0.5.17' }, // nexus mutual
      { version: '0.5.16' }, // uniswap v2 core
      { version: '0.6.6' }, // uniswap v2 peripherals
    ],
  },

  typechain: {
    outDir: 'types',
    target: 'truffle-v5',
  },

};

require('dotenv').config();

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

module.exports = {
  mocha: {
    exit: true,
    bail: true,
    recursive: false,
  },
  networks: {
    hardhat: {
      accounts: {
        count: 100,
        accountsBalance: toWei('100000'),
      },
      allowUnlimitedContractSize: true,
      blockGasLimit: 12e9,
    },
    mainnet: {
      accounts: [process.env.MAINNET_ACCOUNT_KEY],
      gasLimit: parseInt(process.env.MAINNET_GAS_LIMIT, 10),
      gasPrice: parseInt(process.env.MAINNET_GAS_PRICE, 10),
      url: process.env.MAINNET_PROVIDER_URL,
    },
    kovan: {
      accounts: [process.env.KOVAN_ACCOUNT_KEY],
      gasLimit: parseInt(process.env.KOVAN_GAS_LIMIT, 10),
      gasPrice: parseInt(process.env.KOVAN_GAS_PRICE, 10),
      url: process.env.KOVAN_PROVIDER_URL,
    },
  },
  solidity: {
    version: '0.5.17',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  typechain: {
    outDir: 'types',
    target: 'truffle-v5',
  },
};

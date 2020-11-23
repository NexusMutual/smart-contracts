require('@nomiclabs/hardhat-web3');
require('@nomiclabs/hardhat-truffle5');

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
        accountsBalance: ether(100000),
      },
      allowUnlimitedContractSize: true,
      blockGasLimit: 12e9,
    },
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

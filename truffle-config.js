const HDWalletProvider = require('truffle-hdwallet-provider');

var mnemonic = "grocery obvious wire insane limit weather parade parrot patrol stock blast ivory";

module.exports = {
  networks: {
    development: {
      host: 'localhost',
      port: 8545,
      network_id: '*', // eslint-disable-line camelcase
    },
    coverage: {
      host: 'localhost',
      network_id: '*', // eslint-disable-line camelcase
      port: 8555,
      gas: 0xfffffffffff,
      gasPrice: 0x01,
    },
    ganache: {
      host: 'localhost',
      port: 8545,
      network_id: '*', // eslint-disable-line camelcase
    }
  },
solc: {
optimizer: {
enabled: true,
runs: 200
    }
  },
};

const HDWalletProvider = require('truffle-hdwallet-provider');

var mnemonic = "grocery obvious wire insane limit weather parade parrot patrol stock blast ivory";

module.exports = {
  networks: {
    development: {
      host: '127.0.0.1',
      port: 7070,
      network_id: '5777', 
    },
    coverage: {
      host: '127.0.0.1',
      network_id: '5777', 
      port: 8555,
      gas: 0xfffffffffff,
      gasPrice: 0x01,
    },
    ganache: {
      host: '127.0.0.1',
      port: 7070,
      network_id: '5777',
    }
  },
  solc: {
    optimizer: {
  	enabled: true,
  	runs: 200
  	}
  },
};

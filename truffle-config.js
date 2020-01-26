module.exports = {
  networks: {
    development: {
      host: '127.0.0.1',
      port: 8545,
      gas: 8000000,
      network_id: '5777'
    },
    coverage: {
      host: '127.0.0.1',
      network_id: '5777',
      port: 8555,
      gas: 8000000,
      gasPrice: 0x01
    },
    ganache: {
      host: '127.0.0.1',
      port: 8545,
      gas: 8000000,
      network_id: '5777'
    }
  },
  compilers: {
    solc: {
      version: '0.5.7',
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    }
  }
};

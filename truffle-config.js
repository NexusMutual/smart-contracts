module.exports = {
  networks: {
    development: {
      host: '127.0.0.1',
      port: 8545,
      gas: 8000000,
      network_id: '5777'
    },
    mainnet: {
      host: 'parity.nexusmutual.io',
      port: 443,
      gas: 8000000,
      network_id: '1'
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
  },
  plugins: ['solidity-coverage', 'truffle-plugin-verify'],
  api_keys: { etherscan: process.env.ETHERSCAN_API_KEY }
};

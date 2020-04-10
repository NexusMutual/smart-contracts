require('dotenv').config();

const HDWalletProvider = require('@truffle/hdwallet-provider');
const kovanMnemonic = process.env.KOVAN_MNEMONIC;

module.exports = {
  networks: {
    mainnet: {
      protocol: 'https',
      host: 'parity.nexusmutual.io',
      port: 443,
      gas: 5000000,
      gasPrice: 5e9,
      networkId: 1,
    },
    kovan: {
      gasPrice: 5e9,
      networkId: 42,
      provider: () => new HDWalletProvider(kovanMnemonic, 'https://parity.govblocks.io'),
    },
    development: {
      protocol: 'http',
      host: 'localhost',
      port: 8545,
      gas: 5000000,
      gasPrice: 5e9,
      networkId: '*',
    },
  },
};

require('dotenv').config();

const HDWalletProvider = require('@truffle/hdwallet-provider');
const kovanMnemonic = process.env.KOVAN_MNEMONIC;
const kovanProviderURL = process.env.KOVAN_PROVIDER_URL;

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
      gasPrice: 1e9,
      networkId: 42,
      provider: () => new HDWalletProvider(kovanMnemonic, kovanProviderURL),
    },
    personal: {
      gasPrice: 1e9,
      networkId: 42,
      provider: () => new HDWalletProvider(kovanMnemonic, kovanProviderURL),
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

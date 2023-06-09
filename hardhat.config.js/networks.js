const ether = n => `${n}${'0'.repeat(18)}`;
const networks = {
  hardhat: {
    accounts: { count: 100, accountsBalance: ether(1000000000) },
    allowUnlimitedContractSize: true,
    blockGasLimit: 30e6,
    gas: 30e6,
  },
  localhost: { blockGasLimit: 30e6, gas: 30e6 },
};

if (process.env.TEST_ENV_FORK) {
  networks.hardhat.forking = { url: process.env.TEST_ENV_FORK };
  networks.hardhat.forking.blockNumber = 17224530;
}

const getenv = (network, key, fallback, parser = i => i) => {
  const value = process.env[`${network}_${key}`];
  return value ? parser(value) : fallback;
};

for (const network of ['MAINNET', 'GOERLI', 'KOVAN', 'RINKEBY', 'TENDERLY', 'LOCALHOST']) {
  const url = getenv(network, 'PROVIDER_URL', false);
  if (!url) {
    continue;
  }
  const accounts = getenv(network, 'ACCOUNT_KEY', undefined, v => v.split(/[^0-9a-fx]+/i));
  const gasPrice = getenv(network, 'GAS_PRICE', undefined, v => parseInt(v, 10) * 1e9);
  const gas = getenv(network, 'GAS_LIMIT', undefined, v => parseInt(v, 10));
  networks[network.toLowerCase()] = { accounts, gasPrice, gas, url };
}

module.exports = networks;

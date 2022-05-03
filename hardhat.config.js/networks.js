const ether = n => `${n}${'0'.repeat(18)}`;
const networks = {
  hardhat: {
    accounts: {
      count: 100,
      accountsBalance: ether(1000000000),
    },
    // TODO: fix tests with gasPrice = 0 and remove the hardfork param
    hardfork: 'berlin',
    allowUnlimitedContractSize: true,
    blockGasLimit: 15e6,
    gas: 15e6,
  },
  localhost: {
    blockGasLimit: 21e6,
    gas: 21e6,
  },
};

if (process.env.TEST_ENV_FORK) {
  networks.hardhat.forking = { url: process.env.TEST_ENV_FORK };
}

const getenv = (network, key, fallback, parser = i => i) => {
  const value = process.env[`${network}_${key}`];
  return value ? parser(value) : fallback;
};

for (const network of ['MAINNET', 'KOVAN', 'RINKEBY', 'TENDERLY', 'LOCALHOST']) {
  const url = getenv(network, 'PROVIDER_URL', false);
  if (!url) continue;
  const accounts = getenv(network, 'ACCOUNT_KEY', undefined, v => v.split(/[^0-9a-fx]+/i));
  const gasPrice = getenv(network, 'GAS_PRICE', undefined, v => parseInt(v, 10) * 1e9);
  const gas = getenv(network, 'GAS_LIMIT', undefined, v => parseInt(v, 10));
  networks[network.toLowerCase()] = { accounts, gasPrice, gas, url };
}

module.exports = networks;

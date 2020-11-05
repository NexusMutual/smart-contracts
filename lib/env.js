const HDWalletProvider = require('@truffle/hdwallet-provider');
const { setupLoader } = require('@openzeppelin/contract-loader');

function getenv (key, fallback = undefined) {

  const value = process.env[key] || fallback;

  if (typeof value === 'undefined') {
    throw new Error(`Missing env var: ${key}`);
  }

  return value;
}

const init = async () => {

  const network = getenv('NETWORK').toUpperCase();
  console.log(`Using ${network} network`);

  const account = getenv(`${network}_ACCOUNT`);
  const mnemonic = getenv(`${network}_MNEMONIC`);
  const providerURL = getenv(`${network}_PROVIDER_URL`);
  const defaultGas = getenv(`${network}_DEFAULT_GAS`, 10e6); // 10 million

  const gasPrice = getenv(`${network}_DEFAULT_GAS_PRICE`, '2');
  const defaultGasPrice = parseInt(gasPrice, 10) * 1e9;

  const provider = new HDWalletProvider(mnemonic, providerURL);

  const loader = setupLoader({
    provider,
    defaultSender: account,
    defaultGas,
    defaultGasPrice,
  }).truffle;

  return { account, provider, loader, network };
};

module.exports = {
  getenv,
  init,
};

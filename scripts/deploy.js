require('dotenv').config();

const HDWalletProvider = require('@truffle/hdwallet-provider');
const { ether } = require('@openzeppelin/test-helpers');
const { setupLoader } = require('@openzeppelin/contract-loader');

function getenv (key, fallback = false) {

  const value = process.env[key] || fallback;

  if (!value) {
    throw new Error(`Missing env var: ${key}`);
  }

  return value;
}

const init = async () => {

  const { NETWORK = 'KOVAN' } = process.env;
  console.log(`Using ${NETWORK} network`);

  const account = getenv(`${NETWORK}_ACCOUNT`);
  const mnemonic = getenv(`${NETWORK}_MNEMONIC`);
  const providerURL = getenv(`${NETWORK}_PROVIDER_URL`);

  const provider = new HDWalletProvider(mnemonic, providerURL);

  const loader = setupLoader({
    provider,
    defaultSender: account,
    defaultGas: 1e6, // 1 million
    defaultGasPrice: 5e9, // 5 gwei
  }).truffle;

  return { account, provider, loader };
};

async function run () {

  const { account, loader } = await init();

  const Token = loader.fromArtifact('TokenMock');
  const gasEstimate = await Token.new.estimateGas();
  console.log(`TokenMock deploy gas estimate: ${gasEstimate}`);

  const token = await Token.new({ gas: gasEstimate });
  console.log(`TokenMock deployed at ${token.address}`);

  await token.mint(account, ether('1000000'));
  const balance = await token.balanceOf(account);
  console.log(`Account balance: ${balance} NXM`);
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('An unexpected error encountered:', error);
    process.exit(1);
  });

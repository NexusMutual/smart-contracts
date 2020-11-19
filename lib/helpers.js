const { web3 } = require('hardhat');
const readline = require('readline');

const { BN, toWei } = web3.utils;

const ether = n => new BN(toWei(n, 'ether'));
const hex = string => '0x' + Buffer.from(string).toString('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const formatJSON = json => JSON.stringify(json, null, 2);

function getEnv (key, fallback = undefined) {

  const value = process.env[key] || fallback;

  if (typeof value === 'undefined') {
    throw new Error(`Missing env var: ${key}`);
  }

  return value;
}

async function getNetwork () {

  const chainId = await web3.eth.getChainId();
  const networks = {
    1: 'mainnet',
    42: 'kovan',
    31337: 'hardhat',
  };

  if (!networks[chainId]) {
    throw new Error(`Unknown network with id ${chainId}`);
  }

  return networks[chainId];
}

const filterArgsKeys = args => {
  const params = {};
  for (const key of Object.keys(args)) {
    if (isNaN(key) && key !== '__length__') {
      const value = args[key];
      params[key] = BN.isBN(value) ? value.toString() : value;
    }
  }
  return params;
};

const logEvents = receipt => receipt.logs.forEach(log => {
  const { event, args } = log;
  const params = filterArgsKeys(args);
  console.log(`Event emitted: ${event}(${formatJSON(params)}`);
});

const to = promise => new Promise(resolve => {
  promise
    .then(r => resolve([r, null]))
    .catch(e => resolve([null, e]));
});

function waitForInput (query) {

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

module.exports = {
  ether,
  filterArgsKeys,
  getEnv,
  getNetwork,
  hex,
  logEvents,
  sleep,
  to,
  waitForInput,
};

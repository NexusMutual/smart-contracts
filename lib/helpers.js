const assert = require('assert');
const exec = require('child_process').execSync;

const { network, web3 } = require('hardhat');
const readline = require('readline');

const { BN, toBN } = web3.utils;

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

/**
 * Export tx to tenderly. Accepts a tx hash string or a promise that resolves to a receipt.
 * Returns the receipt if a promise was passed.
 * @param {string|Promise} txPromise
 * @return {function((string|Promise)): Promise<(undefined|{})>}
 */
const tenderly = async txPromise => {

  let tx = txPromise;
  let receipt;

  if (typeof txPromise !== 'string') {
    const [ok, err] = await to(txPromise);
    receipt = (ok || err);
    tx = receipt.tx;
  }

  assert(network.name !== 'hardhat', 'Tenderly: network provider required to export tx');
  const providerURL = network.config.url.replace(/^http:\/\//, '');
  const cmd = `tenderly export ${tx} --rpc ${providerURL} --debug`;

  console.log(`Executing: ${cmd}`);
  await exec(cmd, { stdio: 'inherit' });

  return receipt;
};

const logEvents = receipt => {
  receipt.logs.forEach(log => {
    const { event, args } = log;
    const params = filterArgsKeys(args);
    console.log(`Event emitted: ${event}(${formatJSON(params)}`);
  });
  return receipt;
};

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

function bnEqual (actual, expected, message) {

  const actualBN = toBN(actual);
  const expectedBN = toBN(expected);
  const error = message || `expected ${actualBN.toString()} to equal ${expectedBN.toString()}`;

  if (actualBN.eq(expectedBN)) {
    return;
  }

  throw new assert.AssertionError({
    message: error,
    actual: actualBN.toString(),
    expected: expectedBN.toString(),
    operator: 'bnEqual',
  });
}

module.exports = {
  bnEqual,
  filterArgsKeys,
  getEnv,
  getNetwork,
  hex,
  logEvents,
  sleep,
  to,
  tenderly,
  waitForInput,
};

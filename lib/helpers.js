const assert = require('assert');
const readline = require('readline');
const { BN, toBN } = require('web3').utils;

const hex = string => '0x' + Buffer.from(string).toString('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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

  // TODO: use ethers BigNumber
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

function zeroPadRight (bytes, length) {
  return new Uint8Array(length).fill(0).map((x, i) => bytes[i] || x);
}

module.exports = {
  bnEqual,
  filterArgsKeys,
  hex,
  sleep,
  to,
  waitForInput,
  zeroPadRight,
};

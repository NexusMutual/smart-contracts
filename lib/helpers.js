const { assert } = require('chai');
const { BN, toWei } = require('web3').utils;

const ether = n => new BN(toWei(n, 'ether'));
const hex = string => '0x' + Buffer.from(string).toString('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const formatJSON = json => JSON.stringify(json, null, 2);

const expectRevert = async function (promise, reason) {

  if (!reason) {
    throw Error(
      `No revert reason specified: call expectRevert with the reason string, ` +
      `or use expectRevert.unspecified if your 'require' statement doesn't have one.`,
    );
  }

  const [, error] = await to(promise);

  if (!error) {
    assert.fail('Expected an exception but none was received');
  }

  const expectedError = reason.replace(/\.+$/, '');
  const prefix = /((Returned error|Error): )?VM Exception while processing transaction: (revert )?/;
  const actualError = error.message.replace(prefix, '');

  assert.strictEqual(actualError, expectedError, 'Wrong kind of exception received');
};

expectRevert.unspecified = async function (promise) {

  const [, error] = await to(promise);

  if (!error) {
    assert.fail('Expected an exception but none was received');
  }
};

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

module.exports = {
  ether,
  expectRevert,
  filterArgsKeys,
  hex,
  logEvents,
  sleep,
  to,
};

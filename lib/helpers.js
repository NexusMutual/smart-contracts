const { assert } = require('chai');
const { BN, toWei } = require('web3').utils;
const exec = require('child_process').execSync;

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

/**
 * Export tx to tenderly. Accepts a tx hash string or a promise that resolves to a receipt.
 * Returns the receipt if a promise was passed.
 * @param web3
 * @return {function((string|Promise)): Promise<(undefined|{})>}
 */
const tenderlyFactory = web3 => async txPromise => {

  let tx = txPromise;
  let receipt;

  if (typeof txPromise !== 'string') {
    const [ok, err] = await to(txPromise);
    receipt = (ok || err);
    tx = receipt.tx;
  }

  const provider = web3.currentProvider;
  const providerURL = provider.wrappedProvider.host.replace(/^http:\/\//, '');
  const cmd = `tenderly export ${tx} --rpc ${providerURL} --debug`;

  console.log(`Executing: ${cmd}`);
  await exec(cmd, { stdio: 'inherit' });

  return receipt;
};

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
  tenderlyFactory,
  to,
};

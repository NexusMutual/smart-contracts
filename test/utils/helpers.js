const BN = require('bn.js');
const util = require('util');
const { web3 } = require('@openzeppelin/test-environment');
const exec = require('child_process').execSync;

const hex = string => '0x' + Buffer.from(string).toString('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const formatJSON = json => JSON.stringify(json, null, 2);
const logEvents = async call => parseLogs(await call);

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

const parseLogs = tx => tx.logs.map(log => {
  const { event, args } = log;
  const params = filterArgsKeys(args);
  console.log(`Event emitted: ${event}(${formatJSON(params)}`);
  return log;
});

const tenderly = async tx => {
  const provider = web3.currentProvider;
  const providerURL = provider.wrappedProvider.host.replace(/^http:\/\//, '');
  await exec(`tenderly export ${tx} --rpc ${providerURL} --debug`);
};

const to = promise => new Promise(resolve => {
  promise
    .then(r => resolve([r, null]))
    .catch(e => resolve([null, e]));
});

module.exports = {
  filterArgsKeys,
  hex,
  logEvents,
  sleep,
  parseLogs,
  tenderly,
  to,
};
